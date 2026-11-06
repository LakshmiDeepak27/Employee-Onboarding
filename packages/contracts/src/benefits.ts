import { z } from 'zod';

// ============================================================================
// Enums & Vocabulary (Closed sets conforming to V8 Closed Vocabulary Guardrail)
// ============================================================================
export const BenefitCategoryEnum = z.enum([
  'HEALTH',
  'DENTAL',
  'VISION',
  'RETIREMENT',
  'LIFE_DISABILITY',
  'FLEX_WELLNESS',
]);
export type BenefitCategory = z.infer<typeof BenefitCategoryEnum>;

export const CoverageTierEnum = z.enum([
  'EMPLOYEE_ONLY',
  'EMPLOYEE_PLUS_SPOUSE',
  'EMPLOYEE_PLUS_FAMILY',
]);
export type CoverageTier = z.infer<typeof CoverageTierEnum>;

export const EnrollmentStatusEnum = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'ELECTED',
  'WAIVED',
  'EXPIRED',
]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusEnum>;

export const DependentRelationEnum = z.enum([
  'SPOUSE',
  'DOMESTIC_PARTNER',
  'CHILD',
  'LEGAL_DEPENDENT',
]);
export type DependentRelation = z.infer<typeof DependentRelationEnum>;

// ============================================================================
// Shared Sub-Schemas
// ============================================================================
export const DependentSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().min(1, 'Dependent full name is required'),
  relationship: DependentRelationEnum,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  sinOrTaxIdLast4: z.string().length(4).optional(),
});
export type Dependent = z.infer<typeof DependentSchema>;

export const BenefitCitationSchema = z.object({
  clauseId: z.string().min(1),
  documentTitle: z.string().min(1),
  isMock: z.boolean().default(true),
  quotedText: z.string().min(1),
  quoteMatch: z.number().min(0).max(1),
  retrievalRank: z.number().int().positive().optional(),
});
export type BenefitCitation = z.infer<typeof BenefitCitationSchema>;

export const ConfidenceBreakdownSchema = z.object({
  citationQuoteMatch: z.number().min(0).max(1),
  retrievalScore: z.number().min(0).max(1),
  templateCorroboration: z.number().min(0).max(1),
  validatorCleanRate: z.number().min(0).max(1),
  schemaFirstPass: z.number().min(0).max(1),
});
export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;

// ============================================================================
// Benefit Plan
// ============================================================================
export const BenefitPlanTierCostSchema = z.object({
  tier: CoverageTierEnum,
  monthlyEmployeeCost: z.number().nonnegative(),
  monthlyEmployerCost: z.number().nonnegative(),
});
export type BenefitPlanTierCost = z.infer<typeof BenefitPlanTierCostSchema>;

export const BenefitPlanSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1), // e.g. 'CA-ON-HLTH-STD'
  name: z.string().min(1),
  category: BenefitCategoryEnum,
  jurisdictionCode: z.string(), // 'CA-ON', 'GB', 'US-CA'
  tierCosts: z.array(BenefitPlanTierCostSchema),
  payrollDeductionPreTax: z.boolean().default(true),
  description: z.string(),
  keyHighlights: z.array(z.string()).default([]),
  policyClauseId: z.string().nullable().optional(),
  isDefaultRecommended: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type BenefitPlan = z.infer<typeof BenefitPlanSchema>;

// ============================================================================
// Benefit Enrollment (1:1 Detail off PlanTask)
// ============================================================================
export const AIBenefitAdviceSummarySchema = z.object({
  recommendedPlanId: z.string().uuid(),
  recommendedPlanCode: z.string(),
  recommendedTier: CoverageTierEnum,
  estimatedMonthlyDeduction: z.number().nonnegative(),
  estimatedAnnualTaxSavings: z.number().nonnegative(),
  rationale: z.string(),
  statutoryNotes: z.string(),
  confidence: z.number().min(0).max(1),
  confidenceBreakdown: ConfidenceBreakdownSchema,
  citations: z.array(BenefitCitationSchema),
});
export type AIBenefitAdviceSummary = z.infer<typeof AIBenefitAdviceSummarySchema>;

export const BenefitEnrollmentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(), // Spine: references plan_tasks.id
  employeeId: z.string().uuid(),
  employeeName: z.string().optional(),
  jurisdictionCode: z.string(),
  status: EnrollmentStatusEnum,
  enrolmentWindowStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enrolmentWindowEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysRemaining: z.number().int(),
  isAtRisk: z.boolean().default(false),
  riskReason: z.string().nullable().optional(),
  electedPlanId: z.string().uuid().nullable().optional(),
  electedPlan: BenefitPlanSchema.nullable().optional(),
  coverageTier: CoverageTierEnum.nullable().optional(),
  dependents: z.array(DependentSchema).default([]),
  monthlyEmployeeCost: z.number().nullable().optional(),
  monthlyEmployerCost: z.number().nullable().optional(),
  waived: z.boolean().default(false),
  waiveReason: z.string().nullable().optional(),
  decisionDate: z.string().nullable().optional(),
  payrollDeductionConfirmed: z.boolean().default(false),
  citations: z.array(BenefitCitationSchema).default([]),
  aiGuidance: AIBenefitAdviceSummarySchema.nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type BenefitEnrollment = z.infer<typeof BenefitEnrollmentSchema>;

// ============================================================================
// Request & Response Schemas
// ============================================================================
export const ElectBenefitRequestSchema = z.object({
  action: z.enum(['ELECT', 'WAIVE']),
  planId: z.string().uuid().optional(),
  coverageTier: CoverageTierEnum.optional(),
  dependents: z.array(DependentSchema).optional(),
  waiveReason: z.string().max(500).optional(),
  preTaxDeductionAcknowledged: z.boolean().default(false),
  actor: z.string().min(1, 'Actor is required for audit trail'),
}).refine(
  (data) => {
    if (data.action === 'ELECT') {
      return !!data.planId && !!data.coverageTier && data.preTaxDeductionAcknowledged === true;
    }
    if (data.action === 'WAIVE') {
      return !!data.waiveReason && data.waiveReason.trim().length > 0;
    }
    return false;
  },
  {
    message:
      'For ELECT, planId, coverageTier and preTaxDeductionAcknowledged are required. For WAIVE, a waiveReason is required.',
  }
);
export type ElectBenefitRequest = z.infer<typeof ElectBenefitRequestSchema>;

export const PageMetaSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

export const BenefitEnrollmentListResponseSchema = z.object({
  items: z.array(BenefitEnrollmentSchema),
  meta: PageMetaSchema,
});
export type BenefitEnrollmentListResponse = z.infer<typeof BenefitEnrollmentListResponseSchema>;

export const BenefitPlanListResponseSchema = z.object({
  items: z.array(BenefitPlanSchema),
  meta: PageMetaSchema,
});
export type BenefitPlanListResponse = z.infer<typeof BenefitPlanListResponseSchema>;

export const RequestBenefitAdviceSchema = z.object({
  coveragePreference: z.enum(['LOW_COST', 'STANDARD', 'MAXIMUM_COVERAGE']).default('STANDARD'),
  familyStatus: z.enum(['SINGLE', 'COUPLE', 'FAMILY']).default('SINGLE'),
  dependentsCount: z.number().int().min(0).default(0),
  userPromptNotes: z.string().max(1000).optional(), // untrusted text
});
export type RequestBenefitAdvice = z.infer<typeof RequestBenefitAdviceSchema>;
