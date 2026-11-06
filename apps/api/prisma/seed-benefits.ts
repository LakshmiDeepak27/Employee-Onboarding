/**
 * Benefits Enrolment Seed Script
 *
 * Idempotent seed data for Benefits workflow service:
 * - Benefit plans across jurisdictions (CA-ON, GB, US-CA)
 * - Approved policy clauses with stable IDs for citation integrity
 *
 * Can be run standalone or imported into `apps/api/prisma/seed.ts`.
 */

import { SEED_BENEFIT_PLANS } from '../src/services/benefits/benefits-service';
import { BENEFITS_POLICY_CORPUS } from '../src/services/benefits/benefits-policy-corpus';

export async function seedBenefits(prisma?: any) {
  console.log('🌱 Seeding Benefits workflow service data...');

  console.log(`✅ Loaded ${SEED_BENEFIT_PLANS.length} Benefit Plans across CA-ON, GB, US-CA.`);
  for (const plan of SEED_BENEFIT_PLANS) {
    console.log(`   - [${plan.jurisdictionCode}] ${plan.code}: ${plan.name}`);
  }

  const clauseCount = Object.keys(BENEFITS_POLICY_CORPUS).length;
  console.log(`✅ Loaded ${clauseCount} Approved Policy Clauses for citation grounding.`);
  for (const [id, clause] of Object.entries(BENEFITS_POLICY_CORPUS)) {
    console.log(`   - [${clause.jurisdiction}] ${id}: ${clause.heading}`);
  }

  if (prisma) {
    // If Prisma client is passed, upsert into PostgreSQL
    for (const plan of SEED_BENEFIT_PLANS) {
      await prisma.benefitPlan.upsert({
        where: { code: plan.code },
        update: {
          name: plan.name,
          tierCosts: plan.tierCosts,
          payrollDeductionPreTax: plan.payrollDeductionPreTax,
          description: plan.description,
          keyHighlights: plan.keyHighlights,
          policyClauseId: plan.policyClauseId,
        },
        create: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          category: plan.category,
          jurisdictionCode: plan.jurisdictionCode,
          tierCosts: plan.tierCosts,
          payrollDeductionPreTax: plan.payrollDeductionPreTax,
          description: plan.description,
          keyHighlights: plan.keyHighlights,
          policyClauseId: plan.policyClauseId,
          isDefaultRecommended: plan.isDefaultRecommended,
          isActive: plan.isActive,
        },
      });
    }
  }

  console.log('✨ Benefits seed completed successfully.');
}

if (process.argv[1].endsWith('seed-benefits.ts')) {
  seedBenefits().catch(console.error);
}
