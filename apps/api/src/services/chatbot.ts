import type { ChatResponse, ActionProposal } from '@eo/contracts';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';
import type { AuthContext } from '../middleware/authenticate.js';
import { fallback, parseProviderOutput } from './chatbot-logic.js';
import { GoogleGenAI } from '@google/genai';

export function inferActionProposal(message: string, answer: string): ActionProposal | null {
  const msg = message.toLowerCase();
  const combined = (message + ' ' + answer).toLowerCase();

  // 1. Dayforce & General Onboarding Journeys
  if (/\b(dayforce|ceridian|hcm|onboard|workflow|journey|process|how it works)\b/i.test(msg)) {
    return {
      type: 'DOCUMENTS',
      title: 'Employee Onboarding Pipelines',
      description: 'Review active candidate-to-hire onboarding workflows and role-based milestones.',
      actionLabel: 'View Onboarding Documents',
      route: '/documents',
    };
  }

  // 2. Documents & Right-to-Work / Statutory Compliance
  if (/\b(doc|document|id proof|passport|address proof|tax|td1|i-9|upload|identity|verification|statutory|posh|gratuity|pf|provident)\b/i.test(msg)) {
    return {
      type: 'DOCUMENTS',
      title: 'Identity & Statutory Compliance Documents',
      description: 'Review statutory identification, tax withholding forms, and compliance acknowledgments.',
      actionLabel: 'Review Documents',
      route: '/documents',
    };
  }

  // 3. Manager Tasks & Buddy Setup
  if (/\b(manager|buddy|agenda|day 1|day one|first day|david chen|1-on-1|1:1|check-in|reporting)\b/i.test(msg)) {
    return {
      type: 'MANAGER',
      title: 'Manager Workspace & Buddy Setup',
      description: 'Assign onboarding peer buddy and review first-week orientation schedule.',
      actionLabel: 'Open Manager Tasks',
      route: '/managing',
    };
  }

  // 4. Equipment & IT
  if (/\b(equipment|laptop|macbook|thinkpad|monitor|hardware|badge|keyboard|dispatch|shipment|mouse|headset)\b/i.test(msg)) {
    return {
      type: 'EQUIPMENT',
      title: 'Hardware & IT Equipment',
      description: 'Review workstation provisioning status, hardware tracking, or request accessories.',
      actionLabel: 'View Equipment',
      route: '/equipment',
    };
  }

  // 5. Payroll & Compensation
  if (/\b(payroll|salary|bank|direct deposit|account|withholding|compensation|paycheck|direct-deposit)\b/i.test(msg)) {
    return {
      type: 'PAYROLL',
      title: 'Payroll & Direct Deposit Setup',
      description: 'Confirm direct deposit banking information and review statutory withholdings.',
      actionLabel: 'Verify Payroll',
      route: '/payroll',
    };
  }

  // 6. Roles & Permissions
  if (/\b(role|roles|permission|permissions|access|rbac|who can|authority)\b/i.test(msg)) {
    return {
      type: 'DOCUMENTS',
      title: 'Role-Based Access Control (RBAC)',
      description: 'Review granted system permissions, departmental scopes, and separation of duties.',
      actionLabel: 'View Effective Permissions',
      route: '/settings',
    };
  }

  // 7. Benefits & Health / Dental (ONLY if user explicitly asks)
  if (/\b(benefit|insurance|medical|health|dental|pension|vision|retirement|401k|wellness)\b/i.test(msg)) {
    return {
      type: 'BENEFITS',
      title: 'Statutory & Voluntary Benefits',
      description: 'Enroll in company medical, health insurance, and workplace pension plans.',
      actionLabel: 'Elect Benefits',
      route: '/benefits',
    };
  }

  // 8. Training & Compliance
  if (/\b(training|course|learning|l&d|ohs|security|compliance|mandatory|safety)\b/i.test(msg)) {
    return {
      type: 'TRAINING',
      title: 'Statutory Compliance Training',
      description: 'Access occupational health, data protection, and info security training modules.',
      actionLabel: 'Start Training',
      route: '/training',
    };
  }

  return null;
}

type RetrievedPolicyClause = {
  id: string;
  heading: string | null;
  body: string;
  document: { title: string; sourceUri: string };
};

const PRIVATE_QUERY =
  /\b(salary|payroll|bank|account number|national id|ssn|phone|personal email|medical|private|another employee|coworker|direct report)\b/i;

const GREETING_QUERY =
  /^\s*(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+is\s+this|what\s+is\s+clyora|what\s+can\s+you\s+do|help|about\s+clyora)\b/i;

const DAYFORCE_QUERY =
  /\b(dayforce|ceridian|hcm|workday|peoplesoft|interview|preparation)\b/i;

const MANAGER_QUERY =
  /\b(manager|managers|buddy|buddies|agenda|day 1|day one|first day|david chen|1-on-1|1:1|check-in)\b/i;

const REJECTION_QUERY =
  /\b(reject|rejects|rejected|rejection|change|changes|edit.*plan|what if.*reject|modify.*plan|custom task|hr.*change)\b/i;

const ROLES_QUERY =
  /\b(role|roles|permission|permissions|access|rbac|persona|personas)\b/i;

const STATUTORY_QUERY =
  /\b(statutory|compliance|posh|provident fund|epf|gratuity|tax|td1|i-9|right to work|jurisdiction|india|karnataka|ontario|uk)\b/i;

const EQUIPMENT_QUERY =
  /\b(equipment|laptop|laptops|macbook|thinkpad|hardware|monitor|monitors|shipment|dispatch|it setup)\b/i;

const PAYROLL_QUERY =
  /\b(payroll|salary|direct deposit|bank account|withholding|compensation|paycheck)\b/i;

const BENEFITS_QUERY =
  /\b(dental|teeth|medical|health insurance|health plan|benefits|vision|pension|401k|wellness)\b/i;

const ONBOARDING_PROCESS_QUERY =
  /\b(onboard|onboarding|clyora|workflow|workflow process|how does this work|how it works|steps)\b/i;

const STOP_WORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'does',
  'do',
  'how',
  'can',
  'the',
  'and',
  'for',
  'with',
  'about',
  'tell',
  'please',
  'are',
  'is',
]);

function queryTokens(message: string): string[] {
  return [
    ...new Set(
      message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ].slice(0, 8);
}

function cleanAssistantText(text: string): string {
  return text
    .replace(/^[\t ]*[*+-][\t ]+/gm, '• ')
    .replace(/\*{1,2}|_{1,2}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient) {
    const key = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (key) {
      geminiClient = new GoogleGenAI({ apiKey: key });
    }
  }
  return geminiClient;
}

export async function answerChat(
  auth: AuthContext,
  message: string,
  targetEmployeeId?: string,
): Promise<ChatResponse> {
  const cleanMsg = message.trim();

  // 1. Sensitive private queries regarding individual personal identifiers
  if (PRIVATE_QUERY.test(cleanMsg) && !targetEmployeeId && !auth.roles.includes('hr_admin')) {
    return fallback(
      'I cannot provide private financial information, personal identifiers, or another coworker’s data. Please check your personal profile or contact HR.',
      'unsupported',
    );
  }

  // 2. Fetch real-time system stats for company context
  let empCount = 0;
  let activePlansCount = 0;
  let deptNames = 'Engineering, Product, People Operations, IT, Finance';
  try {
    const [eCount, pCount, depts] = await Promise.all([
      prisma.employee.count(),
      prisma.onboardingPlan.count({
        where: {
          status: { in: ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'AWAITING_COMPLETION_APPROVAL'] },
        },
      }),
      prisma.department.findMany({ select: { name: true }, take: 10 }),
    ]);
    empCount = eCount;
    activePlansCount = pCount;
    if (depts.length > 0) {
      deptNames = depts.map((d) => d.name).join(', ');
    }
  } catch {
    // ignore
  }

  // 3. Headcount / Organizational Queries
  const HEADCOUNT_QUERY =
    /\b(headcount|how many employees|employee count|total employees|number of employees|how many people|total staff|team size)\b/i;

  if (HEADCOUNT_QUERY.test(cleanMsg)) {
    return {
      answer: `CLYORA currently manages **${empCount} registered employees** across ${deptNames}, with **${activePlansCount} active onboarding journeys** in flight. You can inspect individual employee profiles and progress under the Employees workspace.`,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Employee Directory',
        description: 'Browse active employee rosters and progress.',
        actionLabel: 'View Employees',
        route: '/employees',
      },
    };
  }

  // 4. Dayforce HCM & Enterprise Onboarding Queries
  if (DAYFORCE_QUERY.test(cleanMsg)) {
    const dayforceAnswer = `In enterprise Human Capital Management (HCM) like **Dayforce (Ceridian)**, employee onboarding bridges talent acquisition, core HR, and payroll into a unified continuous journey:

• **Candidate-to-Hire Transition**: Seamless conversion of applicant records into active employee profiles without duplicate data entry.
• **Statutory Compliance Engines**: Automated collection of Form I-9 / Right to Work verification, Form W-4 / Form 12BB / TD1 tax withholding, and direct deposit banking.
• **Manager & Team Enablement**: Automated checklists for reporting managers to assign an onboarding buddy (e.g. David Chen), schedule Day 1 welcome agendas, and plan 30-60-90 day milestones.
• **Cross-Department Workflow Routing**: Simultaneous task dispatch to IT (hardware provisioning), Finance (tax setup), and HR (document audit).
• **Continuous Payroll Integration**: Zero-sync latency where new hire earnings, benefits, and tax deductions feed directly into the payroll engine.

**CLYORA implements these Dayforce standards** using an **8-Gate Safety DAG**, deterministic business calendars, Indian/Canadian/UK statutory floors, and multi-department separation of duties.`;

    return {
      answer: dayforceAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Enterprise Onboarding Workflows',
        description: 'Review Dayforce-aligned onboarding journeys.',
        actionLabel: 'View Onboarding Plans',
        route: '/employees',
      },
    };
  }

  // 5. Manager Tasks & Buddy Setup
  if (MANAGER_QUERY.test(cleanMsg)) {
    const managerAnswer = `In CLYORA, **Manager Setup** empowers reporting managers to prepare new hires for success from Day One:

• **Assign an Onboarding Buddy**: Pair the new hire with a senior teammate (such as **David Chen**) for cultural alignment and technical mentoring.
• **Day One Welcome Schedule**: Create a structured itinerary (e.g., 09:00 Welcome & IT check, 11:00 Pod introductions, 14:00 Buddy sync).
• **Check-ins & Goals**: Schedule 30-day, 60-day, and 90-day progress check-ins.
• **Separation of Duties**: Managers focus strictly on team enablement; they cannot approve payroll, tax documents, or legal certifications.`;

    return {
      answer: managerAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'MANAGER',
        title: 'Manager Workspace',
        description: 'Configure buddy pairings and welcome schedules.',
        actionLabel: 'Open Manager Tasks',
        route: '/managing',
      },
    };
  }

  // 7. HR Authority, Plan Customization & Rejection
  if (REJECTION_QUERY.test(cleanMsg)) {
    const rejectionAnswer = `In CLYORA, HR retains complete authority over the onboarding plan:

• **Editing & Custom Milestones**: HR can edit task descriptions, deadlines, and owners, or click **"Add Custom Onboarding Task"** to add company-specific requirements with 1-click Quick Templates (Security Badge & RFID, Parking Permit, Tooling Licenses).
• **Draft Plan Rejection**: If an AI-generated draft does not meet standards, HR can reject it with review notes or click **"Regenerate onboarding plan"**.
• **Zero-AI Statutory Fallback**: HR can check *"Use policy templates only (skip AI)"* to generate statutory compliance plans instantly without AI.
• **Active Workflow Protection**: Once approved and dispatched into **IN_PROGRESS**, plans cannot be overwritten, protecting active IT and Finance tasks from accidental disruption.`;

    return {
      answer: rejectionAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Onboarding Governance',
        description: 'Review and approve onboarding plans.',
        actionLabel: 'Review Plans',
        route: '/plans',
      },
    };
  }

  // 8. System Roles & RBAC Matrix
  if (ROLES_QUERY.test(cleanMsg)) {
    const rolesAnswer = `CLYORA enforces Role-Based Access Control (RBAC) across **4 enterprise roles**:

• **HR Administrator (e.g. Asha Rao)**: Enterprise-wide authority to create employee profiles, generate onboarding plans, audit statutory compliance, and approve workflow dispatch.
• **Reporting Manager (e.g. David Chen)**: Scoped access to direct reports to assign onboarding buddies and build Day 1 welcome agendas.
• **IT Administrator (e.g. Vikram Malhotra)**: Responsible for laptop hardware imaging, software license assignment, and office badge access.
• **Employee / New Hire (e.g. J Neelavathi, Priya Sharma)**: Access to the self-service employee portal to upload identity documents, complete compliance courses, and elect benefits.`;

    return {
      answer: rolesAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Effective Permissions',
        description: 'Inspect permissions and scope distributions.',
        actionLabel: 'View Effective Permissions',
        route: '/settings',
      },
    };
  }

  // 9. Statutory Documents & Multi-Jurisdiction Rules
  if (STATUTORY_QUERY.test(cleanMsg)) {
    const statutoryAnswer = `CLYORA enforces automated statutory compliance floors tailored to the employee’s jurisdiction:

• **India (IN-KA — Karnataka)**:
  • Employees' Provident Fund (EPF) declaration & UAN capture
  • Payment of Gratuity Act nomination (Form F)
  • Prevention of Sexual Harassment (POSH) mandatory awareness training (within 14 days)
  • PAN and Aadhaar identity & address verification
  • Karnataka Workplace Compliance & Labor Standards
• **Canada (CA-ON — Ontario)**:
  • Federal & Provincial Form TD1 (Personal Tax Credits Return)
  • Occupational Health and Safety Act (OHSA) awareness training (within 7 days)
  • Legal Right to Work & Identity verification
• **United Kingdom (GB)**:
  • Home Office Statutory Right to Work verification
  • UK Data Protection Act / GDPR essentials training
  • Workplace Pension auto-enrolment`;

    return {
      answer: statutoryAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Statutory Documentation',
        description: 'Review mandatory tax and compliance forms.',
        actionLabel: 'Review Documents',
        route: '/documents',
      },
    };
  }

  // 10. IT Equipment & Hardware Provisioning
  if (EQUIPMENT_QUERY.test(cleanMsg)) {
    const equipAnswer = `CLYORA automates IT workstation provisioning with defined lead-time SLAs:

• **Hardware Catalog**: Standard workstations include **MacBook Pro 14"** (5-day lead time) and **ThinkPad X1 Carbon** (3-day lead time), with 27" 4K external monitors and security badges.
• **Imaging & Dispatch**: IT prepares and ships hardware to arrive 3–5 business days before the employee's start date.
• **Access Credentials**: Corporate SSO, email, and internal communication channels are pre-provisioned.`;

    return {
      answer: equipAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'EQUIPMENT',
        title: 'Hardware Provisioning',
        description: 'Track equipment assignment and shipment.',
        actionLabel: 'View Equipment',
        route: '/equipment',
      },
    };
  }

  // 11. Payroll & Direct Deposit
  if (PAYROLL_QUERY.test(cleanMsg)) {
    const payrollAnswer = `In CLYORA, payroll onboarding is tightly integrated to guarantee zero pay-cycle delays:

• **Direct Deposit Banking**: Employees provide direct deposit account numbers and void checks through the secure portal.
• **Tax Withholding**: Statutory withholding declarations (Form 12BB for India, Form TD1 for Canada) must be verified by Finance.
• **Separation of Duties**: Finance must review and lock payroll setups prior to the first payroll run; managers cannot modify payroll data.`;

    return {
      answer: payrollAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'PAYROLL',
        title: 'Payroll Verification',
        description: 'Review banking and withholding setups.',
        actionLabel: 'Verify Payroll',
        route: '/payroll',
      },
    };
  }

  // 12. Benefits & Healthcare (ONLY when user explicitly asks)
  if (BENEFITS_QUERY.test(cleanMsg)) {
    const benefitsAnswer = `Full-time employees are eligible for comprehensive medical, dental, and retirement benefits:

• **Enrollment Window**: Elections must be submitted within **30 calendar days** of the employee's official start date.
• **Healthcare Coverage**: Comprehensive group health coverage, preventative dental cleanings, prescription drugs, and vision care.
• **Retirement & Pension**: Statutory workplace pensions (UK Auto-Enrolment / India EPF) and voluntary retirement options.`;

    return {
      answer: benefitsAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'BENEFITS',
        title: 'Benefits Enrollment',
        description: 'Elect medical, dental and pension coverage.',
        actionLabel: 'Elect Benefits',
        route: '/benefits',
      },
    };
  }

  // 13. General Onboarding Process & Workflow Architecture
  if (ONBOARDING_PROCESS_QUERY.test(cleanMsg)) {
    const processAnswer = `Employee Onboarding in **CLYORA** follows a four-stage enterprise workflow:

• **1. Profile Initialization**: HR creates a candidate profile with role, start date, and statutory jurisdiction (e.g. **IN-KA** for India, **CA-ON** for Canada, **GB** for the UK).
• **2. Intelligent Plan Synthesis**: AI analyzes the role and jurisdiction to generate tailored tasks, while our **8-Gate Safety DAG** auto-inserts mandatory statutory compliance tasks (Provident Fund, POSH training, OHS) and calendar-computed SLAs.
• **3. HR Review & Sovereign Customization**: Before dispatch, HR can edit any task, add custom milestones using **1-Click Quick Templates** (Security Badge, Parking), or reject/regenerate the plan.
• **4. Cross-Department Execution**: Workflows dispatch simultaneously to **HR, Manager, IT, Finance, and Employee** with strict separation of duties.`;

    return {
      answer: processAnswer,
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: {
        type: 'DOCUMENTS',
        title: 'Onboarding Journeys',
        description: 'Inspect active employee onboarding plans.',
        actionLabel: 'View Plans',
        route: '/plans',
      },
    };
  }

  // 14. Friendly Conversational Greeting
  if (GREETING_QUERY.test(cleanMsg) && cleanMsg.split(/\s+/).length <= 8) {
    return {
      answer: "Hi! I’m **CLYORA**, your enterprise Intelligent Employee Onboarding Assistant. I can assist with Dayforce-aligned onboarding workflows, statutory document verification (India PF/POSH, Canada TD1, UK RTW), manager buddy assignments, IT equipment provisioning, and system permissions. How can I help you today?",
      citations: [],
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: inferActionProposal(cleanMsg, ''),
    };
  }

  // 14. Intelligent Clause Retrieval (Intent-Filtered: exclude dental unless query asks for benefits/dental)
  const isAskingBenefits = BENEFITS_QUERY.test(cleanMsg);
  const tokens = queryTokens(cleanMsg);
  let clauses: RetrievedPolicyClause[] = [];

  if (tokens.length > 0) {
    try {
      const candidateClauses = (await prisma.policyClause.findMany({
        where: {
          OR: tokens.flatMap((token) => [
            { body: { contains: token, mode: 'insensitive' as const } },
            { heading: { contains: token, mode: 'insensitive' as const } },
            { topics: { has: token } },
          ]),
        },
        select: {
          id: true,
          heading: true,
          body: true,
          document: { select: { title: true, sourceUri: true } },
        },
        take: 6,
      })) as RetrievedPolicyClause[];

      // Filter out dental/medical clauses if user is NOT asking about dental/benefits
      clauses = candidateClauses.filter((c) => {
        const isDentalClause =
          c.id === 'CA-ON-BEN-004' ||
          /dental|teeth|health insurance|medical plan/i.test(c.heading || '') ||
          /dental|cleanings/i.test(c.body);
        if (isDentalClause && !isAskingBenefits) {
          return false;
        }
        return true;
      }).slice(0, 3);
    } catch {
      clauses = [];
    }
  }

  // 15. Gemini Answer Generation (if configured)
  const client = getGeminiClient();
  if (client) {
    try {
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const orgContext = `REAL-TIME ORGANIZATION & ENTERPRISE HCM CONTEXT:
- Total registered employees in system: ${empCount}
- Active onboarding journeys: ${activePlansCount}
- Company departments: ${deptNames}
- HR Administrator: Asha Rao (asha.hr@clyora)
- Engineering Manager: David Chen (david.manager@clyora)
- Core System Principles: Dayforce HCM candidate-to-hire workflows, 8-Gate Safety DAG (zero hallucinated dates or tasks), Indian statutory floor (PF, Gratuity, POSH), Canadian statutory floor (TD1, OHS), UK statutory floor (RTW, GDPR).`;

      const prompt = `You are CLYORA, an enterprise Intelligent Employee Onboarding Assistant for Clyora.
User role: ${auth.roles.join(', ') || 'Employee'}
User question: "${cleanMsg}"

${orgContext}

${
  clauses.length > 0
    ? `OFFICIAL COMPANY POLICY SOURCES:
${clauses.map((c) => `[ID: ${c.id}] ${c.heading || c.document.title}:\n${c.body}`).join('\n\n')}

INSTRUCTIONS:
1. Answer the user's question directly, clearly, warmly, and professionally.
2. If asked about Dayforce, explain Dayforce HCM onboarding principles (candidate-to-hire transition, automated compliance, manager enablement, continuous payroll) and how CLYORA orchestrates these workflows.
3. If asked about employee headcount, use the exact REAL-TIME ORGANIZATION DATA above (${empCount} employees, ${activePlansCount} active onboarding plans).
4. CRITICAL: NEVER mention dental or health insurance coverage unless the user specifically asked about dental or healthcare benefits!
5. FORMATTING: Use clean bullet points (•) and bold titles. Do not output raw asterisk bullets (*).`
    : `INSTRUCTIONS:
1. Answer the user's question directly, clearly, and warmly with enterprise HR expertise.
2. If asked about Dayforce, explain Dayforce HCM onboarding principles (candidate-to-hire transition, automated compliance, manager enablement, continuous payroll) and how CLYORA orchestrates these workflows.
3. If asked about employee headcount, use the exact REAL-TIME ORGANIZATION DATA above (${empCount} employees, ${activePlansCount} active onboarding plans).
4. CRITICAL: NEVER mention dental or health insurance coverage unless the user specifically asked about dental or healthcare benefits!
5. FORMATTING: Use clean bullet points (•) and bold titles. Do not output raw asterisk bullets (*).`
}

Provide a direct, helpful, and beautifully formatted answer.`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 4500),
      );

      const res = await Promise.race([
        client.models.generateContent({
          model,
          contents: prompt,
        }),
        timeoutPromise,
      ]);

      const rawText = res.text?.trim();
      if (rawText) {
        const answerText = cleanAssistantText(rawText);
        return {
          answer: answerText,
          citations: clauses.map((c) => ({
            clauseId: c.id,
            heading: c.heading,
            quotedText: c.body.slice(0, 300),
            sourceUri: c.document.sourceUri,
          })),
          grounded: clauses.length > 0,
          provider: 'gemini',
          refusal: null,
          actionProposal: inferActionProposal(cleanMsg, answerText),
        };
      }
    } catch (e: any) {
      console.warn('Gemini chat error or timeout, falling back gracefully:', e?.message);
    }
  }

  // 16. Fallback if relevant clauses exist (and not unwanted dental)
  if (clauses.length > 0) {
    const excerpt = (body: string) => (body.length > 220 ? `${body.slice(0, 217).trimEnd()}…` : body);
    const answer =
      'Company policy specifies:\n' +
      clauses.map((clause) => `• **${clause.heading ?? clause.document.title}**: ${excerpt(clause.body)}`).join('\n');

    return {
      answer,
      citations: clauses.map((clause) => ({
        clauseId: clause.id,
        heading: clause.heading,
        quotedText: excerpt(clause.body),
        sourceUri: clause.document.sourceUri,
      })),
      grounded: true,
      provider: 'fallback',
      refusal: null,
      actionProposal: inferActionProposal(cleanMsg, answer),
    };
  }

  // 17. Default Enterprise Guidance (Clean, Professional, No Random Dental)
  const defaultGuidance = `Here is enterprise onboarding guidance regarding **"${cleanMsg}"**:

• **HR & Statutory Documentation**: Complete identity verification, statutory tax forms (Form 12BB for India / Form TD1 for Canada), and emergency contacts.
• **Manager & Team Enablement**: Your reporting manager will schedule your Day One welcome agenda and assign an onboarding buddy.
• **Equipment & IT Setup**: Workstations (MacBook / ThinkPad) are imaged and dispatched 3–5 business days before start date.
• **Statutory Compliance**: Complete mandatory training (POSH awareness, Occupational Health & Safety) within your first 14 days.

For specialized policy inquiries, contact HR administration at **asha.hr@clyora**.`;

  return {
    answer: defaultGuidance,
    citations: [],
    grounded: true,
    provider: 'fallback',
    refusal: null,
    actionProposal: inferActionProposal(cleanMsg, defaultGuidance),
  };
}
