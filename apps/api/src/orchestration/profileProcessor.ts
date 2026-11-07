import { prisma } from "../db/client.js";
import { notFound, conflict } from "../lib/errors.js";

export interface ProcessedProfile {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  personalEmail: string;
  workEmail: string | null;
  jobTitle: string;
  roleFamily: string;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  jurisdictionCode: string;
  jurisdictionName: string;
  countryCode: string;
  businessDays: number[];
  timezone: string;
  hasPolicyCorpus: boolean;
  employmentType: string;
  workMode: string;
  startDate: string; // YYYY-MM-DD
  offerDate: string | null;
  unionMember: boolean;
  notes: string | null;
  status: string;
}

export interface EligibilityResult {
  eligible: boolean;
  refusalReason?: string;
  profile: ProcessedProfile;
}

/**
 * Loads employee profile and verifies onboarding eligibility
 */
export async function processEmployeeProfile(
  employeeId: string,
): Promise<EligibilityResult> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      department: true,
      jurisdiction: {
        include: {
          _count: {
            select: { policyClauses: true },
          },
        },
      },
    },
  });

  if (!employee) {
    throw notFound(`Employee with ID ${employeeId}`);
  }

  const jurisdiction = employee.jurisdiction;
  const hasPolicyCorpus = jurisdiction._count.policyClauses > 0;
  const startDateStr = employee.startDate.toISOString().slice(0, 10);
  const offerDateStr = employee.offerDate
    ? employee.offerDate.toISOString().slice(0, 10)
    : null;

  const profile: ProcessedProfile = {
    employeeId: employee.id,
    employeeNumber: employee.employeeNumber,
    firstName: employee.firstName,
    lastName: employee.lastName,
    fullName: `${employee.firstName} ${employee.lastName}`.trim(),
    personalEmail: employee.personalEmail,
    workEmail: employee.workEmail,
    jobTitle: employee.jobTitle,
    roleFamily: employee.roleFamily,
    departmentId: employee.departmentId,
    departmentName: employee.department?.name ?? null,
    managerId: employee.managerId,
    jurisdictionCode: employee.jurisdictionCode,
    jurisdictionName: jurisdiction.displayName,
    countryCode: jurisdiction.countryCode,
    businessDays:
      jurisdiction.businessDays.length > 0
        ? jurisdiction.businessDays
        : [1, 2, 3, 4, 5],
    timezone: jurisdiction.timezone,
    hasPolicyCorpus,
    employmentType: employee.employmentType,
    workMode: employee.workMode,
    startDate: startDateStr,
    offerDate: offerDateStr,
    unionMember: employee.unionMember,
    notes: employee.notes,
    status: employee.status,
  };

  // If jurisdiction does not have an approved policy corpus, the system must REFUSE rather
  // than hallucinate statutory tasks (API Contract: UNSUPPORTED_JURISDICTION)
  if (!hasPolicyCorpus) {
    return {
      eligible: false,
      refusalReason: `No approved policy corpus covers ${profile.employmentType} onboarding in ${profile.jurisdictionCode} (${profile.jurisdictionName}). Refusal is required by system governance.`,
      profile,
    };
  }

  return {
    eligible: true,
    profile,
  };
}
