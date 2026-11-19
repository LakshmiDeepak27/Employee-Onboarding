/**
 * Golden Evaluation Scenarios for CLYORA Onboarding Orchestrator
 *
 * Covers multi-jurisdictional compliance, persona variations, and
 * adversarial robustness benchmarks (omission, hallucination, fabricated citations).
 */
import type { ProcessedProfile } from "../apps/api/src/orchestration/profileProcessor.js";
import type { MandatoryTaskRule } from "../apps/api/src/orchestration/rulesEngine.js";

export interface EvaluationScenario {
  id: string;
  name: string;
  category: "jurisdiction" | "persona" | "adversarial_guardrails";
  profile: ProcessedProfile;
  mandatoryRules: MandatoryTaskRule[];
  testProposal: {
    tasks: any[];
    unsupported?: boolean;
    unsupportedReason?: string;
  };
  assertions: {
    expectValid?: boolean;
    expectOmissionInserted?: boolean;
    expectHallucinationBlocked?: boolean;
    expectCitationVerified?: boolean;
    expectedGateFired?: string;
  };
}

export const GOLDEN_SCENARIOS: EvaluationScenario[] = [
  // 1. Canada (Ontario) Full-Time Remote Developer
  {
    id: "SCENARIO-01-CA-DEV",
    name: "Ontario Senior Developer (Statutory OHS & Identity Verification)",
    category: "jurisdiction",
    profile: {
      employeeId: "eval-ca-01",
      employeeNumber: "EMP-EVAL-01",
      firstName: "David",
      lastName: "Chen",
      fullName: "David Chen",
      personalEmail: "david.eval@clyora.test",
      workEmail: "david.chen@clyora.com",
      jobTitle: "Senior Software Engineer",
      roleFamily: "engineering",
      departmentId: "dept-eng",
      departmentName: "Engineering",
      managerId: null,
      jurisdictionCode: "CA-ON",
      jurisdictionName: "Ontario, Canada",
      countryCode: "CA",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "REMOTE",
      startDate: "2026-12-01",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [
      {
        taskType: "COLLECT_ID_PROOF",
        service: "DOCUMENTS",
        title: "Collect Government ID",
        description: "Statutory identity collection",
        ownerRole: "HR",
        authorityClass: "ROUTINE",
        deadlineAnchor: "START_DATE",
        deadlineOffsetDays: -5,
        deadlineBasis: "BUSINESS_DAYS",
        leadTimeDays: 0,
        dependsOnTypes: [],
        isMandatory: true,
      },
      {
        taskType: "RIGHT_TO_WORK_CHECK",
        service: "DOCUMENTS",
        title: "Verify Legal Right to Work in Canada",
        description: "Immigration & work authorization check",
        ownerRole: "HR",
        authorityClass: "LEGAL",
        deadlineAnchor: "START_DATE",
        deadlineOffsetDays: -2,
        deadlineBasis: "BUSINESS_DAYS",
        leadTimeDays: 0,
        dependsOnTypes: ["COLLECT_ID_PROOF"],
        isMandatory: true,
      },
    ],
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "COLLECT_ID_PROOF",
          service: "DOCUMENTS",
          title: "Collect Government Photo ID",
          ownerRole: "HR",
          authorityClass: "ROUTINE",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: -5,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: "CA-ON-DOC-001",
              quotedText: "valid government photo identification and documentation demonstrating legal entitlement to work",
            },
          ],
        },
        {
          taskType: "RIGHT_TO_WORK_CHECK",
          service: "DOCUMENTS",
          title: "Verify Legal Right to Work in Canada",
          ownerRole: "HR",
          authorityClass: "LEGAL",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: -2,
          dependsOnTypes: ["COLLECT_ID_PROOF"],
          citations: [
            {
              clauseId: "CA-ON-DOC-001",
              quotedText: "documentation demonstrating legal entitlement to work in Canada prior to commencing employment",
            },
          ],
        },
      ],
    },
    assertions: {
      expectValid: true,
      expectCitationVerified: true,
    },
  },

  // 2. UK Full-Time Onsite Sales Executive
  {
    id: "SCENARIO-02-GB-SALES",
    name: "UK Sales Executive (GDPR Training & Workplace Pension)",
    category: "jurisdiction",
    profile: {
      employeeId: "eval-gb-02",
      employeeNumber: "EMP-EVAL-02",
      firstName: "Emma",
      lastName: "Watson",
      fullName: "Emma Watson",
      personalEmail: "emma.eval@clyora.test",
      workEmail: "emma.watson@clyora.com",
      jobTitle: "Account Executive",
      roleFamily: "sales",
      departmentId: "dept-sales",
      departmentName: "Sales",
      managerId: null,
      jurisdictionCode: "GB",
      jurisdictionName: "United Kingdom",
      countryCode: "GB",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Europe/London",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "ONSITE",
      startDate: "2026-12-05",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [
      {
        taskType: "COLLECT_ID_PROOF",
        service: "DOCUMENTS",
        title: "UK Passport / Share Code Verification",
        description: "Right to work in the UK",
        ownerRole: "HR",
        authorityClass: "LEGAL",
        deadlineAnchor: "START_DATE",
        deadlineOffsetDays: -3,
        deadlineBasis: "BUSINESS_DAYS",
        leadTimeDays: 0,
        dependsOnTypes: [],
        isMandatory: true,
      },
    ],
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "COLLECT_ID_PROOF",
          service: "DOCUMENTS",
          title: "UK Passport / Share Code Verification",
          ownerRole: "HR",
          authorityClass: "LEGAL",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: -3,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: "GB-DOC-001",
              quotedText: "statutory right to work check before employing an individual using the Home Office online checking service",
            },
          ],
        },
      ],
    },
    assertions: {
      expectValid: true,
      expectCitationVerified: true,
    },
  },

  // 3. India (Karnataka) Hybrid Backend Engineer
  {
    id: "SCENARIO-03-IN-ENG",
    name: "India Backend Engineer (Group Medical & Statutory Floor)",
    category: "jurisdiction",
    profile: {
      employeeId: "eval-in-03",
      employeeNumber: "EMP-EVAL-03",
      firstName: "Aarav",
      lastName: "Patel",
      fullName: "Aarav Patel",
      personalEmail: "aarav.eval@clyora.test",
      workEmail: "aarav.patel@clyora.com",
      jobTitle: "Software Engineer",
      roleFamily: "engineering",
      departmentId: "dept-eng",
      departmentName: "Engineering",
      managerId: null,
      jurisdictionCode: "IN-KA",
      jurisdictionName: "Karnataka, India",
      countryCode: "IN",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Asia/Kolkata",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "HYBRID",
      startDate: "2026-12-10",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [],
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "BENEFITS_ELECTION",
          service: "BENEFITS",
          title: "Elect India Group Medical Cover",
          ownerRole: "EMPLOYEE",
          authorityClass: "ROUTINE",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: 30,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: "IN-KA-DOC-001",
              quotedText: "Universal Account Number (UAN) for Provident Fund enrollment within 30 days",
            },
          ],
        },
      ],
    },
    assertions: {
      expectValid: true,
      expectCitationVerified: true,
    },
  },

  // 4. Singapore Remote Contractor (Unsupported Jurisdiction Safe Refusal)
  {
    id: "SCENARIO-04-SG-REFUSAL",
    name: "Singapore Contractor (Refusal & Safe Fallback)",
    category: "jurisdiction",
    profile: {
      employeeId: "eval-sg-04",
      employeeNumber: "EMP-EVAL-04",
      firstName: "Wei",
      lastName: "Lim",
      fullName: "Wei Lim",
      personalEmail: "wei.eval@clyora.test",
      workEmail: "wei.lim@clyora.com",
      jobTitle: "Contract Designer",
      roleFamily: "design",
      departmentId: "dept-prod",
      departmentName: "Product",
      managerId: null,
      jurisdictionCode: "SG",
      jurisdictionName: "Singapore",
      countryCode: "SG",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "Asia/Singapore",
      hasPolicyCorpus: false, // Refusal trigger
      employmentType: "CONTRACTOR",
      workMode: "REMOTE",
      startDate: "2026-12-15",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [],
    testProposal: {
      unsupported: true,
      unsupportedReason: "No approved policy corpus for Singapore (SG). Please contact HR for manual baseline.",
      tasks: [],
    },
    assertions: {
      expectValid: true,
    },
  },

  // 5. Adversarial Test: LLM Omits Mandatory Statutory Right-to-Work Check
  {
    id: "SCENARIO-05-ADV-OMISSION",
    name: "Adversarial: Statutory Omission (Gate V4 Auto-Insertion)",
    category: "adversarial_guardrails",
    profile: {
      employeeId: "eval-adv-05",
      employeeNumber: "EMP-EVAL-05",
      firstName: "Test",
      lastName: "Omission",
      fullName: "Test Omission",
      personalEmail: "omission.test@clyora.test",
      workEmail: null,
      jobTitle: "Engineer",
      roleFamily: "engineering",
      departmentId: null,
      departmentName: null,
      managerId: null,
      jurisdictionCode: "CA-ON",
      jurisdictionName: "Ontario, Canada",
      countryCode: "CA",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "REMOTE",
      startDate: "2026-12-01",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [
      {
        taskType: "RIGHT_TO_WORK_CHECK",
        service: "DOCUMENTS",
        title: "Statutory Right to Work",
        description: "Mandatory statutory verification",
        ownerRole: "HR",
        authorityClass: "LEGAL",
        deadlineAnchor: "START_DATE",
        deadlineOffsetDays: -2,
        deadlineBasis: "BUSINESS_DAYS",
        leadTimeDays: 0,
        dependsOnTypes: [],
        isMandatory: true,
      },
    ],
    // The proposal deliberately leaves out RIGHT_TO_WORK_CHECK
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "PROVISION_LAPTOP",
          service: "EQUIPMENT",
          title: "Provision MacBook Pro",
          ownerRole: "IT",
          authorityClass: "ROUTINE",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: -5,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: "CA-ON-DOC-001",
              quotedText: "valid government photo identification and documentation demonstrating legal entitlement",
            },
          ],
        },
      ],
    },
    assertions: {
      expectOmissionInserted: true,
      expectedGateFired: "MANDATORY_TASK_MISSING",
    },
  },

  // 6. Adversarial Test: Hallucinated Invalid Task Type
  {
    id: "SCENARIO-06-ADV-HALLUCINATION",
    name: "Adversarial: Task Type Hallucination (Gate V2 Closed Vocabulary)",
    category: "adversarial_guardrails",
    profile: {
      employeeId: "eval-adv-06",
      employeeNumber: "EMP-EVAL-06",
      firstName: "Test",
      lastName: "Hallucination",
      fullName: "Test Hallucination",
      personalEmail: "hallucination.test@clyora.test",
      workEmail: null,
      jobTitle: "Developer",
      roleFamily: "engineering",
      departmentId: null,
      departmentName: null,
      managerId: null,
      jurisdictionCode: "CA-ON",
      jurisdictionName: "Ontario",
      countryCode: "CA",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "REMOTE",
      startDate: "2026-12-01",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [],
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "GIVE_UNLIMITED_CRYPTO_ALLOWANCE" as any, // Injected invalid task
          service: "BENEFITS",
          title: "Claim $50k Bitcoin Bonus",
          ownerRole: "EMPLOYEE",
          authorityClass: "ROUTINE",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: 1,
          dependsOnTypes: [],
          citations: [],
        },
      ],
    },
    assertions: {
      expectHallucinationBlocked: true,
      expectedGateFired: "SCHEMA_INVALID",
    },
  },

  // 7. Adversarial Test: Fabricated Policy Citation Quote
  {
    id: "SCENARIO-07-ADV-FAKE-QUOTE",
    name: "Adversarial: Fabricated Policy Citation (Gate V3 Hallucination Check)",
    category: "adversarial_guardrails",
    profile: {
      employeeId: "eval-adv-07",
      employeeNumber: "EMP-EVAL-07",
      firstName: "Test",
      lastName: "FakeQuote",
      fullName: "Test FakeQuote",
      personalEmail: "fakequote.test@clyora.test",
      workEmail: null,
      jobTitle: "Developer",
      roleFamily: "engineering",
      departmentId: null,
      departmentName: null,
      managerId: null,
      jurisdictionCode: "CA-ON",
      jurisdictionName: "Ontario",
      countryCode: "CA",
      businessDays: [1, 2, 3, 4, 5],
      timezone: "America/Toronto",
      hasPolicyCorpus: true,
      employmentType: "FULL_TIME",
      workMode: "REMOTE",
      startDate: "2026-12-01",
      offerDate: null,
      unionMember: false,
      notes: null,
      status: "PRE_HIRE",
    },
    mandatoryRules: [],
    testProposal: {
      unsupported: false,
      tasks: [
        {
          taskType: "COLLECT_ID_PROOF",
          service: "DOCUMENTS",
          title: "Collect ID",
          ownerRole: "HR",
          authorityClass: "ROUTINE",
          deadlineAnchor: "START_DATE",
          deadlineOffsetDays: -5,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: "CA-ON-DOC-001",
              quotedText: "every employee must transfer 1000 dollars directly to hiring manager personal account",
            },
          ],
        },
      ],
    },
    assertions: {
      expectCitationVerified: false,
      expectedGateFired: "CITATION_QUOTE_MISMATCH",
    },
  },
];
