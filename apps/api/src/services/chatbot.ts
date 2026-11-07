import type { ChatResponse } from '@eo/contracts';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import type { AuthContext } from '../middleware/authenticate.js';
import { fallback, parseProviderOutput } from './chatbot-logic.js';
import { GoogleGenAI } from '@google/genai';

type RetrievedPolicyClause = {
  id: string;
  heading: string | null;
  body: string;
  document: { title: string; sourceUri: string };
};

const PRIVATE_QUERY =
  /\b(salary|payroll|bank|account number|national id|ssn|phone|personal email|medical|private|another employee|coworker|direct report)\b/i;

const GREETING_QUERY =
  /^\s*(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+is\s+this|what\s+is\s+clyora|what\s+can\s+you\s+do|how\s+does\s+this\s+work|help|explain\s+this|about\s+clyora)\b/i;

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
  const excerpt = (body: string) => (body.length > 220 ? `${body.slice(0, 217).trimEnd()}…` : body);
  return {
    answer:
      'Company policy says:\n' +
      clauses.slice(0, 2).map((clause) => `• ${clause.heading ?? clause.document.title}: ${excerpt(clause.body)}`).join('\n'),
    citations: clauses.map((clause) => ({
      clauseId: clause.id,
      heading: clause.heading,
      quotedText: excerpt(clause.body),
      sourceUri: clause.document.sourceUri,
    })),
    grounded: true,
    provider: 'fallback',
    refusal: null,
  };
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/^[\t ]*[*+-][\t ]+/gm, '• ')
    .replace(/\*{1,2}|_{1,2}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (key) {
      geminiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return geminiClient;
}

export async function answerChat(
  auth: AuthContext,
  message: string,
  targetEmployeeId?: string,
): Promise<ChatResponse> {
  const cleanMsg = message.trim();

  // 1. Check for sensitive private queries regarding other employees
  if (PRIVATE_QUERY.test(cleanMsg) && !targetEmployeeId && !auth.roles.includes('hr_admin')) {
    return fallback(
      'I cannot provide private financial information, personal identifiers, or another coworker’s data. Please check your personal profile or contact HR.',
      'unsupported',
    );
  }

  // 2. Fetch real-time system stats for company context
  let empCount = 0;
  let activePlansCount = 0;
  let deptNames = 'Engineering, Product, People Operations';
  try {
    const [eCount, pCount, depts] = await Promise.all([
      prisma.employee.count(),
      prisma.onboardingPlan.count({
        where: {
          status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'AWAITING_COMPLETION_APPROVAL'] },
        },
      }),
      prisma.department.findMany({ select: { name: true }, take: 10 }),
    ]);
    empCount = eCount;
    activePlansCount = pCount;
    if (depts.length > 0) {
      deptNames = depts.map((d) => d.name).join(', ');
    }
  } catch {
    // ignore
  }

  // 3. Headcount / Organizational Queries
  const HEADCOUNT_QUERY =
    /\b(headcount|how many employees|employee count|total employees|number of employees|how many people|total staff|team size)\b/i;

  if (HEADCOUNT_QUERY.test(cleanMsg)) {
    return {
      answer: `CLYORA has ${empCount} employee profiles and ${activePlansCount} active onboarding journeys. Open Employees to view the people and their progress.`,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
    };
  }

  // 4. Friendly Conversational Greeting & Overview
  if (GREETING_QUERY.test(cleanMsg) && cleanMsg.split(/\s+/).length <= 8) {
    return {
      answer: "Hi, I’m CLYORA, your employee onboarding assistant. I can help with documents, equipment, payroll, benefits, training, manager tasks, and company policies. What do you need help with?",
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
    };
  }

  // 5. Extract tokens & retrieve relevant policy clauses
  const tokens = queryTokens(cleanMsg);
  let clauses: RetrievedPolicyClause[] = [];

  if (tokens.length > 0) {
    try {
      clauses = (await prisma.policyClause.findMany({
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
      })) as RetrievedPolicyClause[];
    } catch {
      clauses = [];
    }
  }

  // 6. Gemini Answer Generation (if configured)
  const client = getGeminiClient();
  if (client) {
    try {
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const orgContext = `REAL-TIME ORGANIZATION DATA:
- Total registered employees in system: ${empCount}
- Active onboarding journeys: ${activePlansCount}
- Company departments: ${deptNames}
- HR Administrator: Asha Rao (asha.hr@clyora)
- Engineering Manager: David Chen (david.manager@clyora)`;

      const prompt = `You are CLYORA, an enterprise Intelligent Employee Onboarding Assistant for Clyora.
User role: ${auth.roles.join(', ') || 'Employee'}
User question: "${cleanMsg}"

${orgContext}

${
  clauses.length > 0
    ? `OFFICIAL COMPANY POLICY SOURCES:
${clauses.map((c) => `[ID: ${c.id}] ${c.heading || c.document.title}:\n${c.body}`).join('\n\n')}

INSTRUCTIONS:
1. Answer the user's question directly, clearly, warmly, and professionally using the policy sources or organization data.
2. If the user asks about employee count, headcount, company structure, or team stats, use the REAL-TIME ORGANIZATION DATA above to give the exact number and details.
3. Keep the tone helpful, concise, executive-ready, and natural.
4. FORMATTING: Use clean bullet points (•) and bold titles. Do not output raw asterisk bullets (*).`
    : `INSTRUCTIONS:
1. Answer the user's question directly, clearly, and warmly.
2. If the user asks about employee count, headcount, company structure, or onboarding stats, use the REAL-TIME ORGANIZATION DATA above to give the exact number and details.
3. Keep the tone helpful, executive-ready, and natural.
4. FORMATTING: Use clean bullet points (•) and bold titles. Do not output raw asterisk bullets (*).`
}

Provide a direct, helpful, and beautifully formatted answer.`;

      // 4.5-second timeout so the chatbot NEVER hangs or gets stuck
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 4500),
      );

      const res = await Promise.race([
        client.models.generateContent({
          model,
          contents: prompt,
        }),
        timeoutPromise,
      ]);

      const rawText = res.text?.trim();
      if (rawText) {
        const answerText = cleanAssistantText(rawText);
        return {
          answer: answerText,
          citations: clauses.map((c) => ({
            clauseId: c.id,
            heading: c.heading,
            quotedText: c.body.slice(0, 300),
            sourceUri: c.document.sourceUri,
          })),
          grounded: clauses.length > 0,
          provider: 'gemini',
          refusal: null,
        };
      }
    } catch (e: any) {
      console.warn('Gemini chat error or timeout, falling back gracefully:', e?.message);
    }
  }

  // 7. Fallback if clauses exist
  if (clauses.length > 0) {
    return sourceAnswer(clauses);
  }

  // 8. Helpful Onboarding Domain Guidance if no exact clause matched
  return {
    answer: `Here is guidance regarding your question about **"${cleanMsg}"**:

• **HR & Documentation**: Complete identity verification, statutory tax forms (Form 12BB / TD1), and emergency contacts in the employee portal.
• **Equipment & IT**: Laptops are imaged and dispatched 3–5 business days before start date.
• **Benefits & Healthcare**: Health, dental, and retirement elections can be submitted within your 30-day enrollment window.
• **Manager & Team**: Your reporting manager will schedule your first 1:1 meeting and team onboarding buddy.

For custom policy inquiries, contact your HR administrator at **asha.hr@clyora**.`,
    citations: [],
    grounded: true,
    provider: 'fallback',
    refusal: null,
  };
}
