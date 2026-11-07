/**
 * Deterministic Rules & Statutory Deadline Engine for Training (L&D)
 *
 * Implements deadline arithmetic (V6), mandatory training resolution (V4),
 * and role/jurisdiction-based course assignments.
 */

export interface TrainingDeadlineResult {
  dueDate: string;       // YYYY-MM-DD
  daysRemaining: number;
  isAtRisk: boolean;
  isOverdue: boolean;
  riskReason: string | null;
}

/**
 * Deterministically compute the statutory due date for a course.
 * Code wins over any model-suggested date (V6).
 */
export function computeTrainingDueDate(
  startDateStr: string,
  statutoryDays: number | null,
  currentDate: Date = new Date()
): TrainingDeadlineResult {
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date: ${startDateStr}`);
  }

  // Default to 14 days if not statutory
  const days = statutoryDays ?? 14;

  const due = new Date(startDate);
  due.setDate(due.getDate() + days);

  const dueDateStr = due.toISOString().split('T')[0] ?? '';

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffTime = due.getTime() - currentDate.getTime();
  const daysRemaining = Math.ceil(diffTime / msPerDay);

  const isOverdue = daysRemaining < 0;
  let isAtRisk = false;
  let riskReason: string | null = null;

  if (isOverdue) {
    isAtRisk = true;
    riskReason = `Statutory training deadline passed on ${dueDateStr}. Regulatory compliance escalation required.`;
  } else if (daysRemaining <= 3) {
    isAtRisk = true;
    riskReason = `Mandatory statutory training deadline expires in ${daysRemaining} day(s) on ${dueDateStr}.`;
  }

  return {
    dueDate: dueDateStr,
    daysRemaining: Math.max(0, daysRemaining),
    isAtRisk,
    isOverdue,
    riskReason,
  };
}

/**
 * Determine mandatory course codes for a given jurisdiction and role (V4 Mandatory Coverage)
 */
export function resolveMandatoryCourses(
  jurisdictionCode: string,
  roleFamily: string
): string[] {
  const mandatoryCodes: string[] = [];

  // Global mandatory baseline
  mandatoryCodes.push('SEC-ALL-101'); // SOC2 Information Security

  // Jurisdiction-specific statutory courses
  if (jurisdictionCode === 'CA-ON') {
    mandatoryCodes.push('OHS-ON-101'); // Ontario Occupational Health & Safety (7 days)
  } else if (jurisdictionCode === 'GB') {
    mandatoryCodes.push('UK-DP-101'); // UK Data Protection / GDPR (30 days)
  }

  // Role-specific mandatory courses
  const technicalRoles = ['engineering', 'devops', 'qa', 'infrastructure'];
  if (technicalRoles.includes(roleFamily.toLowerCase())) {
    mandatoryCodes.push('ENG-TOOL-101'); // Engineering Toolchain
  }

  return mandatoryCodes;
}
