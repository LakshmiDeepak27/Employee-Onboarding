/**
 * Approved Knowledge Corpus for Benefits Enrolment
 *
 * Grounding source for RAG and Validator V2 Citation Integrity.
 * Every clause has a stable, human-meaningful ID (e.g. CA-ON-BEN-004)
 * that is citable as a primary key.
 *
 * Honesty flag: isMock = true (displayed on screen during demos).
 */

export interface PolicyClauseItem {
  id: string;
  documentTitle: string;
  jurisdiction: string;
  heading: string;
  body: string;
  topics: string[];
  isMock: boolean;
}

export const BENEFITS_POLICY_CORPUS: Record<string, PolicyClauseItem> = {
  'CA-ON-BEN-001': {
    id: 'CA-ON-BEN-001',
    documentTitle: 'Ontario Employee Benefits & Health Care Standards',
    jurisdiction: 'CA-ON',
    heading: 'Extended Health Care & Prescription Drug Benefit',
    body: 'Full-time permanent employees residing in Ontario are provided supplementary health insurance complementing OHIP, including 80% prescription drug coverage and up to $1,000 annually for paramedical practitioners.',
    topics: ['health', 'prescription', 'ohip', 'medical'],
    isMock: true,
  },
  'CA-ON-BEN-002': {
    id: 'CA-ON-BEN-002',
    documentTitle: 'Ontario Employee Benefits & Health Care Standards',
    jurisdiction: 'CA-ON',
    heading: 'Comprehensive Dental and Vision Care Schedule',
    body: 'Dental coverage provides 80% reimbursement for preventative cleanings and 50% for major restorative treatments up to $2,000 per calendar year. Vision care provides $400 every 24 months for corrective lenses.',
    topics: ['dental', 'vision', 'preventative'],
    isMock: true,
  },
  'CA-ON-BEN-003': {
    id: 'CA-ON-BEN-003',
    documentTitle: 'Ontario Retirement & Wealth Accumulation Policy',
    jurisdiction: 'CA-ON',
    heading: 'Group RRSP Employer Contribution Matching',
    body: 'Employees may elect payroll deductions into the Group RRSP. The company matches voluntary contributions dollar-for-dollar up to 4% of base salary, immediately vested upon contribution.',
    topics: ['rrsp', 'retirement', 'pension', 'payroll_deduction'],
    isMock: true,
  },
  'CA-ON-BEN-004': {
    id: 'CA-ON-BEN-004',
    documentTitle: 'Ontario Employee Benefits & Health Care Standards',
    jurisdiction: 'CA-ON',
    heading: 'Initial Enrolment Window & Late Applicant Restrictions',
    body: 'Employees must complete their benefit plan elections within thirty-one (31) calendar days of their official start date. Failure to enrol within this statutory window classifies the worker as a late applicant requiring Medical Evidence of Insurability (EOI).',
    topics: ['deadline', 'statutory_window', 'eoi', 'eligibility'],
    isMock: true,
  },

  'GB-BEN-001': {
    id: 'GB-BEN-001',
    documentTitle: 'United Kingdom Corporate Benefits Policy',
    jurisdiction: 'GB',
    heading: 'Private Medical Insurance (PMI) Scheme',
    body: 'All UK-based full-time staff are eligible for private healthcare coverage through AXA Health, covering private hospital consultations, day-case treatment, and comprehensive mental health pathway support.',
    topics: ['health', 'pmi', 'medical'],
    isMock: true,
  },
  'GB-BEN-002': {
    id: 'GB-BEN-002',
    documentTitle: 'United Kingdom Pension Auto-Enrolment Policy',
    jurisdiction: 'GB',
    heading: 'Workplace Pension Auto-Enrolment & Postponement Notice',
    body: 'Pursuant to the Pensions Act 2008, all eligible jobholders are automatically enrolled into the company pension scheme with a 5% employee contribution and 4% employer contribution. Postponement applies for up to 30 days from employment commencement.',
    topics: ['pension', 'auto_enrolment', 'postponement', 'legal'],
    isMock: true,
  },

  'US-CA-BEN-001': {
    id: 'US-CA-BEN-001',
    documentTitle: 'California Section 125 Cafeteria Benefits Plan',
    jurisdiction: 'US-CA',
    heading: 'Pre-Tax Health, Dental, and Vision Options',
    body: 'Eligible employees may choose between Kaiser HMO and Anthem PPO plans under IRS Section 125 with pre-tax payroll deductions. Dependent coverage extends to spouses and children up to age 26.',
    topics: ['health', 'section_125', 'pre_tax', 'ppo', 'hmo'],
    isMock: true,
  },
  'US-CA-BEN-002': {
    id: 'US-CA-BEN-002',
    documentTitle: 'United States 401(k) Retirement Plan',
    jurisdiction: 'US-CA',
    heading: '401(k) Safe Harbor Match & Automatic Enrolment',
    body: 'Employees are automatically enrolled at a 3% pre-tax contribution rate with 100% employer match up to 4% of compensation, eligible for opt-out or tier escalation within thirty (30) days of hire date.',
    topics: ['401k', 'retirement', 'safe_harbor', 'payroll_deduction'],
    isMock: true,
  },
};

/**
 * Find relevant clauses by jurisdiction and query terms (Hybrid metadata + keyword search)
 */
export function searchPolicyClauses(
  jurisdiction: string,
  topics: string[] = []
): PolicyClauseItem[] {
  const allInJurisdiction = Object.values(BENEFITS_POLICY_CORPUS).filter(
    (clause) => clause.jurisdiction === jurisdiction
  );

  if (topics.length === 0) {
    return allInJurisdiction;
  }

  return allInJurisdiction.sort((a, b) => {
    const aMatch = a.topics.filter((t) => topics.includes(t)).length;
    const bMatch = b.topics.filter((t) => topics.includes(t)).length;
    return bMatch - aMatch;
  });
}
