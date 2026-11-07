import type { ChatResponse } from '@eo/contracts';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import type { AuthContext } from '../middleware/authenticate.js';
import { fallback, parseProviderOutput } from './chatbot-logic.js';

type RetrievedPolicyClause = {
  id: string;
  heading: string | null;
  body: string;
  document: { title: string; sourceUri: string };
};

const PRIVATE_QUERY =
  /\b(salary|payroll|bank|account number|national id|ssn|phone|personal email|medical|private|another employee|coworker|direct report)\b/i;
const STOP_WORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'does',
  'do',
  'how',
  'can',
  'the',
  'and',
  'for',
  'with',
  'about',
  'tell',
  'please',
  'are',
  'is',
]);

function queryTokens(message: string): string[] {
  return [
    ...new Set(
      message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ].slice(0, 8);
}

function sourceAnswer(
  clauses: Array<{
    id: string;
    heading: string | null;
    body: string;
    document: { title: string; sourceUri: string };
  }>,
): ChatResponse {
  return {
    answer:
      'I found these approved policy sources relevant to your question:\n\n' +
      clauses.map((clause) => `${clause.heading ?? clause.document.title}: ${clause.body}`).join('\n\n'),
    citations: clauses.map((clause) => ({
      clauseId: clause.id,
      heading: clause.heading,
      quotedText: clause.body.slice(0, 600),
      sourceUri: clause.document.sourceUri,
    })),
    grounded: true,
    provider: 'fallback',
    refusal: null,
  };
}

export async function answerChat(
  auth: AuthContext,
  message: string,
  targetEmployeeId?: string,
): Promise<ChatResponse> {
  if (PRIVATE_QUERY.test(message) && !targetEmployeeId) {
    return fallback(
      'I cannot provide private employee information or confirm another person’s data.',
      'unsupported',
    );
  }

  const tokens = queryTokens(message);
  if (tokens.length === 0) {
    return fallback('Please ask a specific HR or onboarding policy question.', 'unsupported');
  }

  let retrievalTimer: ReturnType<typeof setTimeout> | undefined;
  let clauses: RetrievedPolicyClause[];
  try {
    clauses = (await Promise.race([
      prisma.policyClause.findMany({
        where: {
          OR: tokens.flatMap((token) => [
            { body: { contains: token, mode: 'insensitive' as const } },
            { heading: { contains: token, mode: 'insensitive' as const } },
            { topics: { has: token } },
          ]),
        },
        select: {
          id: true,
          heading: true,
          body: true,
          document: { select: { title: true, sourceUri: true } },
        },
        take: 3,
      }),
      new Promise<never>((_, reject) => {
        retrievalTimer = setTimeout(() => reject(new Error('Policy lookup timed out')), 2500);
      }),
    ])) as RetrievedPolicyClause[];
  } catch {
    return fallback('Policy lookup is taking longer than usual. Please try again in a moment.', 'provider_unavailable');
  } finally {
    if (retrievalTimer) clearTimeout(retrievalTimer);
  }

  if (clauses.length === 0) {
    return fallback(
      'I could not find an approved policy source that addresses that question.',
      'no_source',
    );
  }

  const clauseIds = new Set(clauses.map((clause) => clause.id));
  if (env.LLM_PROVIDER === 'disabled' || env.LLM_PROVIDER === 'gemini') {
    return sourceAnswer(clauses);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.CHAT_PROVIDER_TIMEOUT_MS, 3500));
  try {
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.LLM_MODEL,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'system',
            content:
              'Answer only from SOURCES. Never invent policy clauses, dates, permissions, workflow status, employee data, or completed actions. Return JSON matching: {"answer":string,"citations":[{"clauseId":string,"heading":string|null,"quotedText":string,"sourceUri":string}],"grounded":true,"provider":"ollama","refusal":null}. Use only supplied clause IDs and source text.',
          },
          {
            role: 'user',
            content: [
              `Role context: ${auth.roles.join(', ') || 'authenticated user'}`,
              `Policy scope: ${auth.permissions.get('policy.read') ?? 'SELF'}`,
              targetEmployeeId ? 'The user is asking about an authorized employee context.' : '',
              `QUESTION:\n${message}`,
              `SOURCES:\n${clauses.map((clause) => `[${clause.id}] ${clause.heading ?? ''}\n${clause.body}`).join('\n\n')}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) return sourceAnswer(clauses);
    const payload = (await response.json()) as { message?: { content?: string } };
    if (!payload.message?.content) return fallback('The assistant returned no usable answer.', 'invalid_output');

    let decoded: unknown;
    try {
      decoded = JSON.parse(payload.message.content);
    } catch {
      return fallback('The assistant returned an invalid answer.', 'invalid_output');
    }

    const parsed = parseProviderOutput(decoded, clauseIds);
    return parsed ?? fallback('The assistant returned an invalid or ungrounded answer.', 'invalid_output');
  } catch {
    return sourceAnswer(clauses);
  } finally {
    clearTimeout(timeout);
  }
}
