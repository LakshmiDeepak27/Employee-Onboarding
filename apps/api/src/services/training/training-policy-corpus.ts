/**
 * Approved Knowledge Corpus for Training & Statutory Compliance
 *
 * Grounding source for L&D training assignments, statutory deadlines,
 * and Validator V2 citation integrity.
 *
 * Honesty flag: isMock = true (displayed during demos).
 */

export interface TrainingPolicyClause {
  id: string;
  documentTitle: string;
  jurisdiction: string; // 'CA-ON', 'GB', 'US-CA', or 'GLOBAL'
  heading: string;
  body: string;
  statutoryDeadlineDays: number | null;
  isMandatory: boolean;
  applicableRoles: string[]; // empty means all roles
  isMock: boolean;
}

export const TRAINING_POLICY_CORPUS: Record<string, TrainingPolicyClause> = {
  'CA-ON-TRN-001': {
    id: 'CA-ON-TRN-001',
    documentTitle: 'Ontario Occupational Health and Safety Compliance Policy',
    jurisdiction: 'CA-ON',
    heading: 'Mandatory Worker Health & Safety Awareness in 4 Steps',
    body: 'Under Ontario Regulation 297/13 of the Occupational Health and Safety Act (OHSA), all new employees must complete basic health and safety awareness training within seven (7) calendar days of starting work. Failure to complete this training is a regulatory compliance breach.',
    statutoryDeadlineDays: 7,
    isMandatory: true,
    applicableRoles: [],
    isMock: true,
  },
  'GB-TRN-001': {
    id: 'GB-TRN-001',
    documentTitle: 'United Kingdom Data Protection & Privacy Training Standard',
    jurisdiction: 'GB',
    heading: 'Statutory Data Protection & UK GDPR Awareness',
    body: 'Pursuant to the Data Protection Act 2018 and UK GDPR Article 39, staff processing personal data must receive formal data protection instruction within thirty (30) days of commencement. This module is mandatory for all UK personnel.',
    statutoryDeadlineDays: 30,
    isMandatory: true,
    applicableRoles: [],
    isMock: true,
  },
  'SEC-SOC2-001': {
    id: 'SEC-SOC2-001',
    documentTitle: 'Enterprise Information Security & SOC2 Governance Policy',
    jurisdiction: 'GLOBAL',
    heading: 'SOC2 Compliance & Information Security Fundamentals',
    body: 'In accordance with SOC2 Type II Trust Services Criteria CC6.1, all personnel must successfully complete information security, access control, and data classification training within fourteen (14) calendar days of hire date.',
    statutoryDeadlineDays: 14,
    isMandatory: true,
    applicableRoles: [],
    isMock: true,
  },
  'ENG-TOOL-001': {
    id: 'ENG-TOOL-001',
    documentTitle: 'Engineering Access Governance & SDLC Policy',
    jurisdiction: 'GLOBAL',
    heading: 'Engineering Toolchain: GitHub, CI/CD, and AWS Security',
    body: 'All technical employees assigned to engineering, DevOps, or QA role families must complete the Engineering Toolchain training module before production repository or cloud infrastructure access is provisioned.',
    statutoryDeadlineDays: null,
    isMandatory: true,
    applicableRoles: ['engineering', 'devops', 'qa'],
    isMock: true,
  },
  'CUL-ALL-001': {
    id: 'CUL-ALL-001',
    documentTitle: 'Dayforce Culture & Collaborative Leadership Framework',
    jurisdiction: 'GLOBAL',
    heading: 'Dayforce Culture & Collaborative Leadership',
    body: 'Elective foundational module designed for rapid immersion into enterprise cultural values, communication cadences, and cross-functional leadership principles.',
    statutoryDeadlineDays: null,
    isMandatory: false,
    applicableRoles: [],
    isMock: true,
  },
};

/**
 * Search training policy clauses by jurisdiction and role
 */
export function searchTrainingClauses(
  jurisdictionCode: string,
  roleFamily?: string
): TrainingPolicyClause[] {
  return Object.values(TRAINING_POLICY_CORPUS).filter((clause) => {
    // Jurisdiction match (either matching or global)
    const matchesJurisdiction =
      clause.jurisdiction === 'GLOBAL' || clause.jurisdiction === jurisdictionCode;
    if (!matchesJurisdiction) return false;

    // Role match
    if (clause.applicableRoles.length > 0 && roleFamily) {
      return clause.applicableRoles.includes(roleFamily.toLowerCase());
    }

    return true;
  });
}
