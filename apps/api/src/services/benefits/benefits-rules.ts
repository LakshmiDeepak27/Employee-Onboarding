/**
 * Deterministic Rules & Window Computation for Benefits Enrolment
 *
 * Implements deterministic deadline arithmetic (V6), statutory window enforcement,
 * and jurisdiction-specific rules as required by the AI Innovation Challenge rubric.
 *
 * Rule: "The model proposes, deterministic code disposes, and a human authorises."
 */

export interface WindowCalculationResult {
  windowStart: string; // YYYY-MM-DD
  windowEnd: string;   // YYYY-MM-DD
  daysRemaining: number;
  isAtRisk: boolean;
  riskReason: string | null;
  isExpired: boolean;
}

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
  refusalCode?: 'UNSUPPORTED_JURISDICTION' | 'CONTRACTOR_INELIGIBLE' | 'NO_POLICY_CORPUS';
}

/**
 * Check if the worker profile is eligible for benefits under jurisdiction rules.
 */
export function checkBenefitsEligibility(
  jurisdictionCode: string,
  employmentType: string
): EligibilityResult {
  // Contractors are not eligible for employee statutory/group benefits
  if (employmentType.toUpperCase() === 'CONTRACTOR' || employmentType.toUpperCase() === 'INDEPENDENT_CONTRACTOR') {
    return {
      isEligible: false,
      reason: `Independent contractors are not eligible for group benefit plans under ${jurisdictionCode} labor regulations.`,
      refusalCode: 'CONTRACTOR_INELIGIBLE',
    };
  }

  // Supported jurisdictions with approved corpus
  const supportedJurisdictions = ['CA-ON', 'GB', 'US-CA'];
  if (!supportedJurisdictions.includes(jurisdictionCode)) {
    return {
      isEligible: false,
      reason: `No approved policy source covers benefits onboarding in jurisdiction ${jurisdictionCode}. Escalated to HR compliance.`,
      refusalCode: 'UNSUPPORTED_JURISDICTION',
    };
  }

  return { isEligible: true };
}

/**
 * Recomputes the enrolment window deterministically in code (V6 Compliance).
 *
 * @param startDateStr Worker start date in YYYY-MM-DD
 * @param jurisdictionCode 'CA-ON' | 'GB' | 'US-CA'
 * @param currentDate Optional reference date (defaults to today)
 */
export function computeEnrolmentWindow(
  startDateStr: string,
  jurisdictionCode: string,
  currentDate: Date = new Date()
): WindowCalculationResult {
  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date: ${startDateStr}`);
  }

  // Statutory window length in days per jurisdiction
  let windowDurationDays = 30; // standard default
  if (jurisdictionCode === 'CA-ON') {
    windowDurationDays = 31; // Ontario Group Benefits statutory initial window
  } else if (jurisdictionCode === 'GB') {
    windowDurationDays = 30; // UK Pension / Private Health election period
  } else if (jurisdictionCode === 'US-CA') {
    windowDurationDays = 30; // Section 125 Qualifying Initial Enrolment Period
  }

  const windowStart = new Date(startDate);
  const windowEnd = new Date(startDate);
  windowEnd.setDate(windowEnd.getDate() + windowDurationDays);

  const startIso = windowStart.toISOString().split('T')[0] ?? '';
  const endIso = windowEnd.toISOString().split('T')[0] ?? '';

  // Calculate days remaining relative to currentDate
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffTime = windowEnd.getTime() - currentDate.getTime();
  const daysRemaining = Math.ceil(diffTime / msPerDay);

  const isExpired = daysRemaining < 0;
  let isAtRisk = false;
  let riskReason: string | null = null;

  if (isExpired) {
    isAtRisk = true;
    riskReason = `Enrolment window closed on ${endIso}. Late submission requires Medical Evidence of Insurability (EOI) and HR review.`;
  } else if (daysRemaining <= 5) {
    isAtRisk = true;
    riskReason = `Statutory enrolment window expires in ${daysRemaining} day(s) on ${endIso}. Employee may lose coverage until next open enrolment.`;
  }

  return {
    windowStart: startIso,
    windowEnd: endIso,
    daysRemaining: Math.max(0, daysRemaining),
    isAtRisk,
    riskReason,
    isExpired,
  };
}

/**
 * Calculate payroll deduction impact
 */
export function computePayrollImpact(
  monthlyEmployeeCost: number,
  isPreTax: boolean,
  estimatedTaxBracket: number = 0.30 // 30% average marginal rate
) {
  const annualDeduction = monthlyEmployeeCost * 12;
  const estimatedAnnualTaxSavings = isPreTax ? annualDeduction * estimatedTaxBracket : 0;
  const netMonthlyCost = isPreTax ? monthlyEmployeeCost * (1 - estimatedTaxBracket) : monthlyEmployeeCost;

  return {
    monthlyEmployeeCost,
    annualDeduction: Number(annualDeduction.toFixed(2)),
    estimatedAnnualTaxSavings: Number(estimatedAnnualTaxSavings.toFixed(2)),
    netMonthlyCost: Number(netMonthlyCost.toFixed(2)),
  };
}
