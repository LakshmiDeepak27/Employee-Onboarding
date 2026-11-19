import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  targetEmployeeId: z.string().uuid().optional(),
});

export const ChatCitationSchema = z.object({
  clauseId: z.string().min(1).max(120),
  heading: z.string().nullable(),
  quotedText: z.string().min(1).max(600),
  sourceUri: z.string().min(1).max(500),
});

export const ActionProposalSchema = z.object({
  type: z.enum(['DOCUMENTS', 'EQUIPMENT', 'PAYROLL', 'BENEFITS', 'TRAINING', 'MANAGER']),
  title: z.string(),
  description: z.string(),
  actionLabel: z.string(),
  route: z.string(),
});

export const ChatResponseSchema = z.object({
  answer: z.string().min(1).max(4000),
  citations: z.array(ChatCitationSchema).max(5),
  grounded: z.boolean(),
  provider: z.enum(['ollama', 'gemini', 'fallback']),
  refusal: z.enum(['unsupported', 'no_source', 'provider_unavailable', 'invalid_output']).nullable(),
  actionProposal: ActionProposalSchema.nullable().optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatCitation = z.infer<typeof ChatCitationSchema>;
export type ActionProposal = z.infer<typeof ActionProposalSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
