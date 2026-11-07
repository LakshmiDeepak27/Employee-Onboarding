import { prisma, isDatabaseOnline, setDatabaseOnline } from "../db/client.js";
import type { ProcessedProfile } from "./profileProcessor.js";
import type { DeadlineAnchor, DeadlineBasis } from "./deadlineEngine.js";

export interface MandatoryTaskRule {
  taskType: string;
  service:
    "DOCUMENTS" | "EQUIPMENT" | "PAYROLL" | "BENEFITS" | "TRAINING" | "MANAGER";
  title: string;
  description: string;
  ownerRole:
    "HR" | "IT" | "FINANCE" | "MANAGER" | "EMPLOYEE" | "LND" | "COMPLIANCE";
  authorityClass: "ROUTINE" | "PAY_AFFECTING" | "LEGAL";
  deadlineAnchor: DeadlineAnchor;
  deadlineOffsetDays: number;
  deadlineBasis: DeadlineBasis;
  leadTimeDays: number;
  dependsOnTypes: string[];
  sourceClauseId?: string | null;
  isMandatory: boolean;
}

/** Built-in statutory catalog ensuring a zero-hallucination baseline even if DB templates are unseeded */
const BUILT_IN_STATUTORY_FLOOR: MandatoryTaskRule[] = [
  {
    taskType: "COLLECT_ID_PROOF",
    service: "DOCUMENTS",
    title: "Collect Government Photo ID Proof",
    description:
      "Collect valid government photo identity document (passport or national ID card).",
    ownerRole: "HR",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -7,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "COLLECT_ADDRESS_PROOF",
    service: "DOCUMENTS",
    title: "Collect Proof of Residential Address",
    description:
      "Collect utility bill, lease agreement or official bank statement showing current address.",
    ownerRole: "HR",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -7,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "RIGHT_TO_WORK_CHECK",
    service: "DOCUMENTS",
    title: "Statutory Right to Work Verification",
    description:
      "Verify employee has legal authorization to work in the hiring jurisdiction prior to day one.",
    ownerRole: "HR",
    authorityClass: "LEGAL",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -3,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["COLLECT_ID_PROOF"],
    isMandatory: true,
  },
  {
    taskType: "SIGN_EMPLOYMENT_CONTRACT",
    service: "DOCUMENTS",
    title: "Sign Employment Agreement & Terms",
    description:
      "Ensure executed employment agreement with confirmed start date and terms is on file.",
    ownerRole: "HR",
    authorityClass: "LEGAL",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -5,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "SIGN_NDA",
    service: "DOCUMENTS",
    title: "Sign Confidentiality & Non-Disclosure Agreement",
    description:
      "Standard intellectual property assignment and confidentiality covenants.",
    ownerRole: "HR",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -3,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["SIGN_EMPLOYMENT_CONTRACT"],
    isMandatory: true,
  },
  {
    taskType: "PROVISION_LAPTOP",
    service: "EQUIPMENT",
    title: "Provision & Configure Work Laptop",
    description:
      "Procure, image, and configure corporate standard laptop with security encryption.",
    ownerRole: "IT",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -1,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 5,
    dependsOnTypes: ["SIGN_EMPLOYMENT_CONTRACT"],
    isMandatory: true,
  },
  {
    taskType: "CREATE_SYSTEM_ACCOUNTS",
    service: "EQUIPMENT",
    title: "Provision Identity & System Accounts",
    description:
      "Create directory user, corporate email, SSO identity and multi-factor authentication.",
    ownerRole: "IT",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -1,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 1,
    dependsOnTypes: ["SIGN_EMPLOYMENT_CONTRACT"],
    isMandatory: true,
  },
  {
    taskType: "COLLECT_TAX_DECLARATION",
    service: "PAYROLL",
    title: "Collect Statutory Tax Declaration Form",
    description:
      "Collect jurisdiction withholding tax declaration (e.g. TD1, P45/Starter Checklist, Form 12BB).",
    ownerRole: "FINANCE",
    authorityClass: "PAY_AFFECTING",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -2,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["COLLECT_ID_PROOF"],
    isMandatory: true,
  },
  {
    taskType: "COLLECT_BANK_DETAILS",
    service: "PAYROLL",
    title: "Collect Direct Deposit Bank Details",
    description:
      "Collect verified banking transit and account details for payroll disbursement.",
    ownerRole: "FINANCE",
    authorityClass: "PAY_AFFECTING",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -2,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "PAYROLL_PROFILE_SETUP",
    service: "PAYROLL",
    title: "Set Up Payroll Profile & Pay Group",
    description:
      "Configure new employee record in payroll system ahead of the first pay period cutoff.",
    ownerRole: "FINANCE",
    authorityClass: "PAY_AFFECTING",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: 0,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["COLLECT_TAX_DECLARATION", "COLLECT_BANK_DETAILS"],
    isMandatory: true,
  },
  {
    taskType: "MANDATORY_COMPLIANCE_TRAINING",
    service: "TRAINING",
    title: "Complete Mandatory Corporate Compliance Training",
    description:
      "Complete code of conduct, anti-harassment, and information security policy training.",
    ownerRole: "LND",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: 14,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["CREATE_SYSTEM_ACCOUNTS"],
    isMandatory: true,
  },
  {
    taskType: "PREPARE_DAY_ONE_AGENDA",
    service: "MANAGER",
    title: "Prepare Day One Schedule & Team Welcome",
    description:
      "Prepare detailed day-one welcome schedule, first week goals, and team introduction time.",
    ownerRole: "MANAGER",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -2,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "ASSIGN_BUDDY",
    service: "MANAGER",
    title: "Assign Peer Onboarding Buddy",
    description:
      "Assign a designated team buddy to assist with culture, tooling, and day-to-day questions.",
    ownerRole: "MANAGER",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: -3,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
  {
    taskType: "SCHEDULE_INTRO_MEETINGS",
    service: "MANAGER",
    title: "Schedule Key Stakeholder & Team 1:1s",
    description:
      "Schedule introductory 1:1 meetings with immediate team members and key cross-functional partners.",
    ownerRole: "MANAGER",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: 3,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: ["PREPARE_DAY_ONE_AGENDA"],
    isMandatory: true,
  },
  {
    taskType: "SET_PROBATION_GOALS",
    service: "MANAGER",
    title: "Establish 30-60-90 Day Probation Goals",
    description:
      "Document and review clear performance expectations and probation success criteria.",
    ownerRole: "MANAGER",
    authorityClass: "ROUTINE",
    deadlineAnchor: "START_DATE",
    deadlineOffsetDays: 30,
    deadlineBasis: "BUSINESS_DAYS",
    leadTimeDays: 0,
    dependsOnTypes: [],
    isMandatory: true,
  },
];

/**
 * Evaluates profile against deterministic business rules and returns mandatory tasks
 */
export async function evaluateRules(
  profile: ProcessedProfile,
): Promise<MandatoryTaskRule[]> {
  // 1. Try to load configured templates from DB for this jurisdiction or global
  let dbTemplates: any[] = [];
  if (isDatabaseOnline()) {
    try {
      dbTemplates = await prisma.taskTemplate.findMany({
        where: {
          OR: [
            { jurisdictionCode: profile.jurisdictionCode },
            { jurisdictionCode: null },
          ],
          isMandatory: true,
        },
      });
    } catch {
      setDatabaseOnline(false);
    }
  }

  const rules: MandatoryTaskRule[] = [];
  const addedTypes = new Set<string>();

  // If templates exist in DB, map them
  if (dbTemplates.length > 0) {
    for (const t of dbTemplates) {
      // Check employment type filter
      if (
        t.employmentTypes.length > 0 &&
        !t.employmentTypes.includes(profile.employmentType as any)
      ) {
        continue;
      }
      // Check role family filter
      if (
        t.roleFamilies.length > 0 &&
        !t.roleFamilies.includes(profile.roleFamily)
      ) {
        continue;
      }

      rules.push({
        taskType: t.taskType,
        service: t.service,
        title: t.title,
        description: t.description ?? "",
        ownerRole: t.defaultOwnerRole,
        authorityClass: t.authorityClass,
        deadlineAnchor: t.deadlineAnchor as DeadlineAnchor,
        deadlineOffsetDays: t.deadlineOffsetDays,
        deadlineBasis: t.deadlineBasis as DeadlineBasis,
        leadTimeDays: t.leadTimeDays,
        dependsOnTypes: t.dependsOnTypes,
        sourceClauseId: t.sourceClauseId,
        isMandatory: t.isMandatory,
      });
      addedTypes.add(t.taskType);
    }
  }

  // 2. Fill the non-legal operational floor only. Legal, payroll, benefits, and
  // compliance obligations must come from approved organization policy/templates.
  const safeOperationalTypes = new Set([
    "PROVISION_LAPTOP",
    "CREATE_SYSTEM_ACCOUNTS",
    "PREPARE_DAY_ONE_AGENDA",
    "ASSIGN_BUDDY",
    "SCHEDULE_INTRO_MEETINGS",
    "SET_PROBATION_GOALS",
  ]);
  for (const b of BUILT_IN_STATUTORY_FLOOR) {
    if (!safeOperationalTypes.has(b.taskType)) continue;
    if (!addedTypes.has(b.taskType)) {
      rules.push(b);
      addedTypes.add(b.taskType);
    }
  }

  return rules;
}
