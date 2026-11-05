/**
 * THE MODEL'S OUTPUT CONTRACT.
 *
 * This is deliberately separate from, and narrower than, the API contract.
 * It is handed to Ollama as a JSON Schema for constrained decoding AND
 * re-parsed with Zod afterwards, because "rare" is not "never".
 *
 * Three structural guardrails are built into the shape itself:
 *
 *   V8  Closed vocabulary — taskType, ownerRole and service are enums. An
 *       injected instruction cannot invent a task type, because anything
 *       outside the enum fails to parse.
 *
 *   V2  Mandatory citation — every proposed task MUST carry a clauseId and
 *       the span it relies on, so a task can always be traced or rejected.
 *
 *   V6  No date field — the model is never given the chance to compute a
 *       deadline. It proposes a *rule*; the deadline engine computes the date
 *       from the jurisdiction business-day calendar.
 */

import {
  z,
  ClauseId,
  TaskTypeEnum,
  ServiceAreaEnum,
  OwnerRoleEnum,
  AuthorityClassEnum,
  DeadlineAnchorEnumValues,
} from './common.js';

export const ProposedCitationSchema = z.object({
  clauseId: ClauseId,
  /** Must actually occur in the clause body. Verified by V2. */
  quotedText: z.string().min(10).max(600),
});

export const ProposedTaskSchema = z.object({
  taskType: TaskTypeEnum,
  service: ServiceAreaEnum,
  title: z.string().min(3).max(140),
  description: z.string().max(600).optional(),
  ownerRole: OwnerRoleEnum,
  authorityClass: AuthorityClassEnum,
  /** Deadline RULE, not a date. V6 turns this into an actual due date. */
  deadlineAnchor: z.enum(DeadlineAnchorEnumValues),
  deadlineOffsetDays: z.number().int().min(-365).max(365),
  /** Other taskTypes in this same proposal that must finish first. */
  dependsOnTypes: z.array(TaskTypeEnum).max(8).default([]),
  /** At least one. A task with no citation cannot be grounded. */
  citations: z.array(ProposedCitationSchema).min(1).max(3),
});

export const PlanProposalSchema = z.object({
  /**
   * The model's escape hatch. If the supplied clauses do not cover this
   * worker profile, it must say so here instead of inventing tasks.
   */
  unsupported: z.boolean().default(false),
  unsupportedReason: z.string().max(500).optional(),
  tasks: z.array(ProposedTaskSchema).max(60).default([]),
  /**
   * Free-text rationale. Logged for debugging, NEVER shown as fact to a user
   * and never used in any control-flow decision.
   */
  reasoning: z.string().max(2000).optional(),
});

export type ProposedTask = z.infer<typeof ProposedTaskSchema>;
export type PlanProposal = z.infer<typeof PlanProposalSchema>;

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const RetrievedClauseSchema = z.object({
  clauseId: ClauseId,
  heading: z.string().nullable(),
  body: z.string(),
  jurisdictionCode: z.string().nullable(),
  topics: z.array(z.string()),
  /** Cosine similarity from pgvector, 0..1. Feeds composite confidence. */
  score: z.number().min(0).max(1),
  rank: z.number().int().min(1),
});

export type RetrievedClause = z.infer<typeof RetrievedClauseSchema>;

// ---------------------------------------------------------------------------
// Prompt input — the structured payload the template is rendered from.
// `notes` and clause bodies are UNTRUSTED and are rendered inside delimited
// data blocks that the system prompt declares to be reference material only.
// ---------------------------------------------------------------------------

export const PromptInputSchema = z.object({
  promptVersion: z.string().openapi({ example: 'plan-proposal@v3' }),
  profile: z.object({
    jurisdictionCode: z.string(),
    jurisdictionName: z.string(),
    employmentType: z.string(),
    workMode: z.string(),
    roleFamily: z.string(),
    jobTitle: z.string(),
    unionMember: z.boolean(),
    /** UNTRUSTED free text. */
    notes: z.string().nullable(),
  }),
  clauses: z.array(RetrievedClauseSchema),
  allowedTaskTypes: z.array(TaskTypeEnum),
});

export type PromptInput = z.infer<typeof PromptInputSchema>;
