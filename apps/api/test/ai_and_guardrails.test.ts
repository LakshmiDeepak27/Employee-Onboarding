import { describe, it, expect, vi } from 'vitest';
import { calculateQuoteSimilarity } from '../src/ai/policyService.js';
import { ValidatorChain } from '../src/ai/validatorChain.js';
import type { ProcessedProfile } from '../src/orchestration/profileProcessor.js';
import type { MandatoryTaskRule } from '../src/orchestration/rulesEngine.js';

describe('AI Guardrails & Validator Chain (V1 - V8)', () => {
  const dummyProfile: ProcessedProfile = {
    employeeId: 'emp-ca-01',
    employeeNumber: 'EMP-01',
    firstName: 'Alice',
    lastName: 'Smith',
    fullName: 'Alice Smith',
    personalEmail: 'alice@demo.io',
    workEmail: null,
    jobTitle: 'Developer',
    roleFamily: 'engineering',
    departmentId: null,
    departmentName: null,
    managerId: null,
    jurisdictionCode: 'CA-ON',
    jurisdictionName: 'Ontario',
    countryCode: 'CA',
    businessDays: [1, 2, 3, 4, 5],
    timezone: 'America/Toronto',
    hasPolicyCorpus: true,
    employmentType: 'FULL_TIME',
    workMode: 'REMOTE',
    startDate: '2026-12-01',
    offerDate: null,
    unionMember: false,
    notes: null,
    status: 'PRE_HIRE',
  };

  const mandatoryRules: MandatoryTaskRule[] = [
    {
      taskType: 'COLLECT_ID_PROOF',
      service: 'DOCUMENTS',
      title: 'Collect ID Proof',
      description: 'Collect ID',
      ownerRole: 'HR',
      authorityClass: 'ROUTINE',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: -7,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 0,
      dependsOnTypes: [],
      isMandatory: true,
    },
    {
      taskType: 'RIGHT_TO_WORK_CHECK',
      service: 'DOCUMENTS',
      title: 'Right to Work',
      description: 'Legal check',
      ownerRole: 'HR',
      authorityClass: 'LEGAL',
      deadlineAnchor: 'START_DATE',
      deadlineOffsetDays: -3,
      deadlineBasis: 'BUSINESS_DAYS',
      leadTimeDays: 0,
      dependsOnTypes: ['COLLECT_ID_PROOF'],
      isMandatory: true,
    },
  ];

  it('verifies quote similarity with high accuracy', () => {
    const clauseBody =
      'All employees performing work in Ontario must present valid government photo identification prior to commencing work.';
    const exactQuote = 'valid government photo identification prior to commencing work';
    expect(calculateQuoteSimilarity(exactQuote, clauseBody)).toBe(1.0);

    const partialQuote = 'employees performing work must show photo identification';
    const similarity = calculateQuoteSimilarity(partialQuote, clauseBody);
    expect(similarity).toBeGreaterThan(0.6);

    const fabricatedQuote = 'employees must pay a thousand dollars entrance fee';
    expect(calculateQuoteSimilarity(fabricatedQuote, clauseBody)).toBeLessThan(0.3);
  });

  it('Gate V1: rejects malformed JSON or invalid schema', async () => {
    const chain = new ValidatorChain();
    const result = await chain.validate({ tasks: 'INVALID_NOT_AN_ARRAY' }, dummyProfile, mandatoryRules);
    expect(result.isValid).toBe(false);
    expect(result.findings.some((f) => f.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('Gate V4: inserts mandatory statutory tasks omitted by LLM proposal', async () => {
    const chain = new ValidatorChain();
    // LLM proposal only proposed COLLECT_ID_PROOF, omitting mandatory RIGHT_TO_WORK_CHECK
    const proposalWithOmission = {
      tasks: [
        {
          taskType: 'COLLECT_ID_PROOF',
          service: 'DOCUMENTS',
          title: 'Collect ID Proof',
          description: 'Provided by LLM',
          ownerRole: 'HR',
          authorityClass: 'ROUTINE',
          deadlineAnchor: 'START_DATE',
          deadlineOffsetDays: -7,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: 'CA-ON-DOC-001',
              quotedText: 'valid government photo identification',
            },
          ],
        },
      ],
      unsupported: false,
    };

    const result = await chain.validate(proposalWithOmission, dummyProfile, mandatoryRules);

    // Finding records that RIGHT_TO_WORK_CHECK was inserted
    const insertedFinding = result.findings.find((f) => f.code === 'MANDATORY_TASK_MISSING');
    expect(insertedFinding).toBeDefined();
    expect(insertedFinding?.action).toBe('INSERTED');
    expect(insertedFinding?.taskTitle).toBe('Right to Work');
  });

  it('Gate V7: flags sensitive PAY_AFFECTING or LEGAL tasks for human review', async () => {
    const chain = new ValidatorChain();
    const proposal = {
      tasks: [
        {
          taskType: 'RIGHT_TO_WORK_CHECK',
          service: 'DOCUMENTS',
          title: 'Legal Right to Work',
          description: 'Verification',
          ownerRole: 'HR',
          authorityClass: 'LEGAL',
          deadlineAnchor: 'START_DATE',
          deadlineOffsetDays: -3,
          dependsOnTypes: [],
          citations: [
            {
              clauseId: 'CA-ON-DOC-001',
              quotedText: 'valid government photo identification',
            },
          ],
        },
      ],
      unsupported: false,
    };

    const result = await chain.validate(proposal, dummyProfile, mandatoryRules);
    const authorityFinding = result.findings.find((f) => f.code === 'AUTHORITY_GUARD_APPLIED');
    expect(authorityFinding).toBeDefined();
    expect(authorityFinding?.action).toBe('FLAGGED');
  });
});

vi.mock('../src/db/client.js', () => ({ prisma: { policyClause: { findUnique: vi.fn(async ({ where }) => where.id === 'CA-ON-DOC-001' ? {
 id: where.id, heading: 'Identity', jurisdictionCode: 'CA-ON',
 body: 'All employees performing work in Ontario must present valid government photo identification and documentation demonstrating legal entitlement to work in Canada prior to commencing employment duties.',
 document: { title: 'Test fixture', isMock: true }
} : null) } } }));
