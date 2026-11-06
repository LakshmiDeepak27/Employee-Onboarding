import { z } from 'zod';
import { TrainingStatusEnum } from './common.js';

// ============================================================================
// Enums & Vocabulary (Closed sets conforming to V8 Closed Vocabulary Guardrail)
// ============================================================================
export const CourseCategoryEnum = z.enum([
  'STATUTORY_HEALTH_SAFETY',
  'INFORMATION_SECURITY_SOC2',
  'DATA_PROTECTION_GDPR',
  'ENGINEERING_TOOLCHAIN',
  'CULTURE_LEADERSHIP',
]);
export type CourseCategory = z.infer<typeof CourseCategoryEnum>;

export { TrainingStatusEnum };
export type TrainingStatus = z.infer<typeof TrainingStatusEnum>;

// ============================================================================
// Shared Sub-Schemas (Citations & Composite Confidence)
// ============================================================================
export const TrainingCitationSchema = z.object({
  clauseId: z.string().min(1),
  documentTitle: z.string().min(1),
  isMock: z.boolean().default(true),
  quotedText: z.string().min(1),
  quoteMatch: z.number().min(0).max(1),
  retrievalRank: z.number().int().positive().optional(),
});
export type TrainingCitation = z.infer<typeof TrainingCitationSchema>;

export const TrainingConfidenceBreakdownSchema = z.object({
  citationQuoteMatch: z.number().min(0).max(1),
  retrievalScore: z.number().min(0).max(1),
  templateCorroboration: z.number().min(0).max(1),
  validatorCleanRate: z.number().min(0).max(1),
  schemaFirstPass: z.number().min(0).max(1),
});
export type TrainingConfidenceBreakdown = z.infer<typeof TrainingConfidenceBreakdownSchema>;

// ============================================================================
// AI Advisor Request & Response Schemas
// ============================================================================
export const TrainingAdvisorRequestSchema = z.object({
  taskId: z.string().uuid(),
  employeeId: z.string().uuid(),
  jurisdictionCode: z.string(), // 'CA-ON', 'GB', 'US-CA', etc.
  roleFamily: z.string().default('engineering'),
  userPrompt: z.string().min(1, 'Prompt cannot be empty'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
});
export type TrainingAdvisorRequest = z.infer<typeof TrainingAdvisorRequestSchema>;

export const TrainingAdvisorResponseSchema = z.object({
  status: z.enum(['SUCCESS', 'REFUSAL', 'DEGRADED_FALLBACK']),
  summary: z.string(),
  mandatoryCourses: z.array(z.object({
    code: z.string(),
    title: z.string(),
    durationMinutes: z.number(),
    statutoryDays: z.number().nullable(),
    reason: z.string(),
  })),
  electiveCourses: z.array(z.object({
    code: z.string(),
    title: z.string(),
    durationMinutes: z.number(),
    reason: z.string(),
  })),
  citations: z.array(TrainingCitationSchema),
  confidence: z.number().min(0).max(1),
  confidenceBreakdown: TrainingConfidenceBreakdownSchema,
  refusalReason: z.string().nullable().optional(),
  jurisdictionBoundaryViolated: z.boolean().default(false),
  isMock: z.boolean().default(true),
});
export type TrainingAdvisorResponse = z.infer<typeof TrainingAdvisorResponseSchema>;

// ============================================================================
// Compliance & Learning Academy Pathways
// ============================================================================
export const LearningPathwayProgressSchema = z.object({
  totalAssigned: z.number().int().nonnegative(),
  totalCompleted: z.number().int().nonnegative(),
  mandatoryCompleted: z.number().int().nonnegative(),
  mandatoryTotal: z.number().int().nonnegative(),
  statutoryPending: z.number().int().nonnegative(),
  compliancePercent: z.number().min(0).max(100),
  isCompliant: z.boolean(),
  atRiskCount: z.number().int().nonnegative(),
});
export type LearningPathwayProgress = z.infer<typeof LearningPathwayProgressSchema>;
