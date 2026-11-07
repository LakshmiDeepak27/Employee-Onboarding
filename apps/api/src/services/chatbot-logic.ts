import type { ChatResponse } from '@eo/contracts';
import { ChatResponseSchema } from '@eo/contracts';

export function fallback(
  answer: string,
  refusal: ChatResponse['refusal'],
): ChatResponse {
  return {
    answer: `${answer} This is grounded policy retrieval, not a generated answer. Please contact HR for a definitive answer.`,
    citations: [],
    grounded: false,
    provider: 'fallback',
    refusal,
  };
}

export function parseProviderOutput(value: unknown, clauseIds: Set<string>): ChatResponse | null {
  const parsed = ChatResponseSchema.safeParse(value);
  if (!parsed.success || !parsed.data.grounded || parsed.data.refusal) return null;
  if (parsed.data.citations.some((citation) => !clauseIds.has(citation.clauseId))) return null;
  return parsed.data;
}
