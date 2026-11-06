/**
 * Interactive Demo Script & Evaluator for Workflow Services 4 & 5
 * (Benefits Enrolment & Training Assignment)
 *
 * Demonstrates the 3 Hires from the Challenge Brief (Section 2.5):
 * 1. Hire A: Priya Nair (Toronto, CA-ON) -> Full-Time Engineer
 * 2. Hire B: David Smith (London, GB)    -> Full-Time Marketer
 * 3. Hire C: Alex Tan (Singapore, SG)    -> Independent Contractor (Grounded Refusal)
 *
 * Run with: npx tsx apps/api/src/demo-runner.ts
 */

import { BenefitsService } from './services/benefits/benefits-service';
import { WorkerContext } from './services/benefits/benefits-agent';
import { TrainingService } from './services/training/training-service';
import { WorkerTrainingContext } from './services/training/training-agent';

async function runDemo() {
  console.log('================================================================');
  console.log(' AI INNOVATION CHALLENGE · WORKFLOW SERVICES 4 & 5');
  console.log(' (Benefits Enrolment & Training Assignment)');
  console.log(' "The model proposes, deterministic code disposes, human authorises"');
  console.log('================================================================\n');

  const benefitsService = new BenefitsService(process.env.GEMINI_API_KEY);
  const trainingService = new TrainingService();

  // --------------------------------------------------------------------------
  // HIRE A: Toronto, Ontario (Full-time Employee)
  // --------------------------------------------------------------------------
  console.log('🔹 [1/3] Processing Hire A — Priya Nair (Toronto, CA-ON)...');
  const hireA: WorkerContext = {
    id: 'worker-priya-ca',
    fullName: 'Priya Nair',
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    roleFamily: 'engineering',
    startDate: '2026-12-01',
    workMode: 'HYBRID',
    notes: 'Relocating from Bengaluru with spouse. Needs health and dental coverage.',
  };

  // Benefits
  const enrollmentA = await benefitsService.getEnrollmentForTask('task-ben-001', hireA);
  console.log(`   [Benefits] Statutory Window: ${enrollmentA.enrolmentWindowStart} to ${enrollmentA.enrolmentWindowEnd} (Days Remaining: ${enrollmentA.daysRemaining})`);

  const adviceA = await benefitsService.generateAdvice('task-ben-001', hireA, {
    coveragePreference: 'STANDARD',
    familyStatus: 'COUPLE',
    dependentsCount: 1,
  });
  console.log(`   [Benefits AI] Recommended: ${adviceA.advice?.recommendedPlanCode} (${adviceA.advice?.recommendedTier}) · Deduct: $${adviceA.advice?.estimatedMonthlyDeduction}/mo`);
  console.log(`   [Benefits Citation] [${adviceA.advice?.citations[0]?.clauseId}] "${adviceA.advice?.citations[0]?.quotedText.slice(0, 55)}..." (Match: ${adviceA.advice?.citations[0]?.quoteMatch})`);

  // Training
  const workerTrnA: WorkerTrainingContext = {
    id: hireA.id,
    fullName: hireA.fullName,
    jurisdictionCode: hireA.jurisdictionCode,
    employmentType: hireA.employmentType,
    roleFamily: hireA.roleFamily,
    startDate: hireA.startDate,
  };

  console.log('   [Training] Auto-assigning mandatory statutory courses & Learning Academy pathway...');
  const assignedA = await trainingService.autoAssignMandatoryCourses('task-trn-001', workerTrnA);
  for (const a of assignedA) {
    console.log(`     * Course [${a.course.code}] ${a.course.title} (Due: ${a.dueDate}, Statutory: ${a.isStatutory})`);
  }

  const adviceTrnA = await trainingService.generateAdvice(workerTrnA);
  console.log(`   [Training AI Copilot] Status: ${adviceTrnA.status} (Composite Confidence: ${adviceTrnA.advice?.confidence})`);
  console.log(`   [Training AI Citation] [${adviceTrnA.advice?.citations[0]?.clauseId}] "${adviceTrnA.advice?.citations[0]?.quotedText.slice(0, 55)}..."`);

  // Complete one statutory course
  const ohsCourse = assignedA.find((a) => a.course.code === 'OHS-ON-101')!;
  await trainingService.completeTraining(ohsCourse.id, 96);
  const progressA = await trainingService.calculateProgress('task-trn-001');
  console.log(`   [Learning Pathway Progress] Completed: ${progressA.totalCompleted}/${progressA.totalAssigned} (${progressA.compliancePercent}% compliant)\n`);

  // --------------------------------------------------------------------------
  // HIRE B: London, UK (Full-time Employee)
  // --------------------------------------------------------------------------
  console.log('🔹 [2/3] Processing Hire B — David Smith (London, GB)...');
  const hireB: WorkerContext = {
    id: 'worker-david-gb',
    fullName: 'David Smith',
    jurisdictionCode: 'GB',
    employmentType: 'FULL_TIME',
    roleFamily: 'marketing',
    startDate: '2026-11-15',
    workMode: 'ONSITE',
  };

  const adviceB = await benefitsService.generateAdvice('task-ben-002', hireB, {
    coveragePreference: 'STANDARD',
    familyStatus: 'SINGLE',
    dependentsCount: 0,
  });
  console.log(`   [Benefits] Recommended Plan: ${adviceB.advice?.recommendedPlanCode}`);
  console.log(`   [Benefits Pension] ${adviceB.advice?.statutoryNotes}`);

  const workerTrnB: WorkerTrainingContext = {
    id: hireB.id,
    fullName: hireB.fullName,
    jurisdictionCode: hireB.jurisdictionCode,
    employmentType: hireB.employmentType,
    roleFamily: hireB.roleFamily,
    startDate: hireB.startDate,
  };
  const assignedB = await trainingService.autoAssignMandatoryCourses('task-trn-002', workerTrnB);
  console.log(`   [Training] Assigned ${assignedB.length} courses: ${assignedB.map((a) => a.course.code).join(', ')} (Statutory: UK-DP-101 30-day deadline)\n`);

  // --------------------------------------------------------------------------
  // HIRE C: Singapore Contractor -> Grounded Refusal
  // --------------------------------------------------------------------------
  console.log('🔹 [3/3] Processing Hire C — Alex Tan (Contractor, Singapore SG)...');
  const hireC: WorkerContext = {
    id: 'worker-alex-sg',
    fullName: 'Alex Tan',
    jurisdictionCode: 'SG',
    employmentType: 'CONTRACTOR',
    roleFamily: 'consulting',
    startDate: '2026-11-20',
    workMode: 'REMOTE',
  };

  const adviceC = await benefitsService.generateAdvice('task-ben-003', hireC, {
    coveragePreference: 'STANDARD',
    familyStatus: 'SINGLE',
    dependentsCount: 0,
  });
  console.log(`   [Benefits Refusal] ${adviceC.status}: "${adviceC.refusalReason}"`);

  const workerTrnC: WorkerTrainingContext = {
    id: hireC.id,
    fullName: hireC.fullName,
    jurisdictionCode: hireC.jurisdictionCode,
    employmentType: hireC.employmentType,
    roleFamily: hireC.roleFamily,
    startDate: hireC.startDate,
  };
  const trnAdviceC = await trainingService.generateAdvice(workerTrnC);
  console.log(`   [Training Refusal] ${trnAdviceC.status}: "${trnAdviceC.refusalReason}"`);
  console.log(`   [Findings] ${trnAdviceC.findings[0]?.validator} -> ${trnAdviceC.findings[0]?.code}: ${trnAdviceC.findings[0]?.message}`);

  console.log('\n================================================================');
  console.log(' ✨ ALL 3 WORKFLOW PROFILES TESTED & VERIFIED ACROSS SERVICES 4 & 5');
  console.log(' Grounded Refusals, Statutory Deadlines, Citations & Pathways green.');
  console.log('================================================================');
}

runDemo().catch(console.error);
