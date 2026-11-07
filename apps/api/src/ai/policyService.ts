import { prisma } from "../db/client.js";
import type { ProcessedProfile } from "../orchestration/profileProcessor.js";

export interface RetrievedClause {
  clauseId: string;
  heading: string | null;
  body: string;
  jurisdictionCode: string | null;
  topics: string[];
  score: number; // 0..1 similarity score
  rank: number;
}

export interface CitationVerificationResult {
  valid: boolean;
  clauseExists: boolean;
  quoteMatch: number;
  reason?: string;
  clause?: {
    id: string;
    heading: string | null;
    body: string;
    documentTitle: string;
    isMock: boolean;
    jurisdictionCode?: string | null;
  };
}

/**
 * Calculates string similarity between quoted text and clause body
 */
export function calculateQuoteSimilarity(quoted: string, body: string): number {
  const cleanQuoted = quoted.toLowerCase().trim().replace(/\s+/g, " ");
  const cleanBody = body.toLowerCase().trim().replace(/\s+/g, " ");

  // Direct substring match is 100%
  if (cleanBody.includes(cleanQuoted)) {
    return 1.0;
  }

  // Token-based Jaccard similarity for near-verbatim quotes
  const quotedTokens = new Set(
    cleanQuoted.split(" ").filter((w) => w.length > 2),
  );
  if (quotedTokens.size === 0) return 0;

  const bodyTokens = new Set(cleanBody.split(" ").filter((w) => w.length > 2));
  let intersection = 0;

  for (const token of quotedTokens) {
    if (bodyTokens.has(token)) {
      intersection += 1;
    }
  }

  return Math.min(1.0, intersection / quotedTokens.size);
}

export class PolicyService {
  /**
   * Retrieves relevant, approved policy clauses for worker profile
   */
  async retrieveClauses(
    profile: ProcessedProfile,
    limit = 15,
  ): Promise<RetrievedClause[]> {
    const clauses = await prisma.policyClause.findMany({
      where: {
        OR: [
          { jurisdictionCode: profile.jurisdictionCode },
          { jurisdictionCode: null },
        ],
      },
      include: {
        document: { select: { title: true, category: true, isMock: true } },
      },
      orderBy: { id: "asc" },
      take: 100,
    });

    // 2. Rank clauses based on relevance to role family and employment type
    const queryContext =
      `${profile.jurisdictionName} ${profile.roleFamily} ${profile.employmentType} ${profile.jobTitle} ${profile.workMode}`.toLowerCase();
    const queryTokens = new Set(
      queryContext.split(" ").filter((w) => w.length > 2),
    );

    const scored = clauses.map((c) => {
      let score = 0.7; // baseline approved clause relevance
      const text =
        `${c.heading ?? ""} ${c.body} ${c.topics.join(" ")}`.toLowerCase();

      for (const token of queryTokens) {
        if (text.includes(token)) {
          score += 0.05;
        }
      }

      if (c.jurisdictionCode === profile.jurisdictionCode) {
        score += 0.1; // boost jurisdiction-specific
      }

      return {
        clauseId: c.id,
        heading: c.heading,
        body: c.body,
        jurisdictionCode: c.jurisdictionCode,
        topics: c.topics,
        score: Math.min(0.99, score),
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((c, idx) => ({
      ...c,
      rank: idx + 1,
    }));
  }

  /**
   * Verifies that a citation references a real clause and contains a genuine quote
   * (Guardrail V2: Citation Integrity)
   */
  async verifyCitation(
    clauseId: string,
    quotedText: string,
  ): Promise<CitationVerificationResult> {
    const clause = await prisma.policyClause.findUnique({
      where: { id: clauseId },
      include: { document: { select: { title: true, isMock: true } } },
    });

    if (!clause) {
      return {
        valid: false,
        clauseExists: false,
        quoteMatch: 0,
        reason: `Clause ID '${clauseId}' does not exist in the policy database.`,
      };
    }

    const normalizedQuote = quotedText.trim().replace(/\s+/g, " ");
    const match =
      normalizedQuote.length >= 10 &&
      clause.body.replace(/\s+/g, " ").includes(normalizedQuote)
        ? 1
        : 0;

    if (match < 0.7) {
      return {
        valid: false,
        clauseExists: true,
        quoteMatch: match,
        reason: `Quoted text does not match clause body (similarity ${Math.round(match * 100)}% is below 70% threshold).`,
        clause: {
          id: clause.id,
          heading: clause.heading,
          body: clause.body,
          documentTitle: clause.document.title,
          isMock: clause.document.isMock,
          jurisdictionCode: clause.jurisdictionCode,
        },
      };
    }

    return {
      valid: true,
      clauseExists: true,
      quoteMatch: match,
      clause: {
        id: clause.id,
        heading: clause.heading,
        body: clause.body,
        documentTitle: clause.document.title,
        isMock: clause.document.isMock,
        jurisdictionCode: clause.jurisdictionCode,
      },
    };
  }

  /**
   * Seeds demo policy documents and clauses if the database has none
   */
  async ensureDemoCorpusSeeded(): Promise<void> {
    const count = await prisma.policyClause.count();
    if (count > 0) return;

    // Seed CA-ON policy
    const caDoc = await prisma.policyDocument.create({
      data: {
        title: "Ontario Employment & Onboarding Standards",
        category: "compliance",
        jurisdictionCode: "CA-ON",
        sourceUri: "https://demo.internal.policies/ca-on/onboarding-2026",
        version: "2026.1",
        effectiveFrom: new Date("2026-01-01"),
        isMock: true,
      },
    });

    await prisma.policyClause.createMany({
      data: [
        {
          id: "CA-ON-DOC-001",
          documentId: caDoc.id,
          jurisdictionCode: "CA-ON",
          heading: "Right to Work & Identity Verification",
          body: "All employees performing work in Ontario must present valid government photo identification and documentation demonstrating legal entitlement to work in Canada prior to commencing employment duties.",
          topics: ["DOCUMENTS", "RIGHT_TO_WORK"],
        },
        {
          id: "CA-ON-TAX-002",
          documentId: caDoc.id,
          jurisdictionCode: "CA-ON",
          heading: "TD1 Personal Tax Credits Return",
          body: "Employees must complete Federal and Provincial Form TD1 (Personal Tax Credits Return) prior to their first payroll cycle to determine statutory payroll withholding amounts.",
          topics: ["PAYROLL", "TAX"],
        },
        {
          id: "CA-ON-OHS-001",
          documentId: caDoc.id,
          jurisdictionCode: "CA-ON",
          heading: "Occupational Health and Safety Awareness",
          body: "Under the Occupational Health and Safety Act, employers must ensure all new workers complete basic occupational health and safety awareness training within their first seven calendar days.",
          topics: ["TRAINING", "SAFETY"],
        },
        {
          id: "CA-ON-BEN-004",
          documentId: caDoc.id,
          jurisdictionCode: "CA-ON",
          heading: "Group Health and Dental Coverage Enrolment",
          body: "Full-time permanent employees are eligible to enrol in the comprehensive group health, dental, and life insurance plan. Enrolment elections must be submitted within thirty calendar days of the hire date.",
          topics: ["BENEFITS", "HEALTH"],
        },
      ],
    });

    // Seed GB policy
    const gbDoc = await prisma.policyDocument.create({
      data: {
        title: "UK Statutory Employment Onboarding Policy",
        category: "compliance",
        jurisdictionCode: "GB",
        sourceUri: "https://demo.internal.policies/gb/onboarding-2026",
        version: "2026.1",
        effectiveFrom: new Date("2026-01-01"),
        isMock: true,
      },
    });

    await prisma.policyClause.createMany({
      data: [
        {
          id: "GB-RTW-001",
          documentId: gbDoc.id,
          jurisdictionCode: "GB",
          heading: "Statutory Right to Work Check",
          body: "Employers must conduct a compliant Right to Work check before the employee begins work to obtain a statutory excuse against civil penalties.",
          topics: ["DOCUMENTS", "RIGHT_TO_WORK"],
        },
        {
          id: "GB-PEN-001",
          documentId: gbDoc.id,
          jurisdictionCode: "GB",
          heading: "Workplace Pension Auto-Enrolment",
          body: "Eligible workers must be automatically enrolled into an authorized qualifying workplace pension scheme within statutory enrolment notification windows.",
          topics: ["BENEFITS", "PENSION"],
        },
        {
          id: "GB-DP-001",
          documentId: gbDoc.id,
          jurisdictionCode: "GB",
          heading: "UK GDPR and Employee Data Protection",
          body: "All staff with access to computer networks must complete data protection essentials covering UK GDPR and handling of confidential business data within thirty days.",
          topics: ["TRAINING", "GDPR"],
        },
      ],
    });

    // Seed IN-KA policy
    const inDoc = await prisma.policyDocument.create({
      data: {
        title: "India Karnataka Employment Compliance Framework",
        category: "compliance",
        jurisdictionCode: "IN-KA",
        sourceUri: "https://demo.internal.policies/in-ka/onboarding-2026",
        version: "2026.1",
        effectiveFrom: new Date("2026-01-01"),
        isMock: true,
      },
    });

    await prisma.policyClause.createMany({
      data: [
        {
          id: "IN-KA-DOC-001",
          documentId: inDoc.id,
          jurisdictionCode: "IN-KA",
          heading: "Identity and Permanent Account Verification",
          body: "New hires must provide verified Permanent Account Number (PAN) and identity proof for statutory provident fund registration and tax reporting.",
          topics: ["DOCUMENTS", "PAN"],
        },
        {
          id: "IN-KA-TAX-001",
          documentId: inDoc.id,
          jurisdictionCode: "IN-KA",
          heading: "Form 12BB Income Tax Declaration",
          body: "Employees must submit Form 12BB tax regime declarations and bank account details prior to the initial monthly payroll disbursement run.",
          topics: ["PAYROLL", "TAX"],
        },
        {
          id: "IN-KA-POSH-001",
          documentId: inDoc.id,
          jurisdictionCode: "IN-KA",
          heading: "POSH Act Compliance Training",
          body: "Mandatory awareness training regarding the Prevention of Sexual Harassment of Women at Workplace (POSH) Act must be completed within fourteen days of joining.",
          topics: ["TRAINING", "COMPLIANCE"],
        },
      ],
    });
  }
}

export const policyService = new PolicyService();
