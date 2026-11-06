/**
 * Training Courses Seed Script
 *
 * Idempotent seed data for Training workflow service (L&D):
 * - Course catalog across compliance, security, technical, and culture
 * - Mandatory jurisdiction and role assignments
 * - Statutory deadlines (7 days for OHSA, 30 days for GDPR, 14 days for SOC2)
 *
 * Can be run standalone or imported into `apps/api/prisma/seed.ts`.
 */

import { SEED_TRAINING_COURSES } from '../src/services/training/training-service';
import { TRAINING_POLICY_CORPUS } from '../src/services/training/training-policy-corpus';

export async function seedTraining(prisma?: any) {
  console.log('🌱 Seeding Training workflow service data...');

  console.log(`✅ Loaded ${SEED_TRAINING_COURSES.length} Training Courses.`);
  for (const course of SEED_TRAINING_COURSES) {
    console.log(`   - [${course.code}] ${course.title} (Statutory: ${course.statutoryDeadlineDays ?? 'None'} days)`);
  }

  const clauseCount = Object.keys(TRAINING_POLICY_CORPUS).length;
  console.log(`✅ Loaded ${clauseCount} Approved Training Policy Clauses for citation grounding.`);
  for (const [id, clause] of Object.entries(TRAINING_POLICY_CORPUS)) {
    console.log(`   - [${clause.jurisdiction}] ${id}: ${clause.heading}`);
  }

  if (prisma) {
    for (const course of SEED_TRAINING_COURSES) {
      await prisma.trainingCourse.upsert({
        where: { code: course.code },
        update: {
          title: course.title,
          provider: course.provider,
          durationMinutes: course.durationMinutes,
          mandatoryForJurisdictions: course.mandatoryForJurisdictions,
          mandatoryForRoles: course.mandatoryForRoles,
          statutoryDeadlineDays: course.statutoryDeadlineDays,
          isActive: true,
        },
        create: {
          id: course.id,
          code: course.code,
          title: course.title,
          provider: course.provider,
          durationMinutes: course.durationMinutes,
          mandatoryForJurisdictions: course.mandatoryForJurisdictions,
          mandatoryForRoles: course.mandatoryForRoles,
          statutoryDeadlineDays: course.statutoryDeadlineDays,
          isActive: true,
        },
      });
    }
  }

  console.log('✨ Training seed completed successfully.');
}

if (process.argv[1]?.endsWith('seed-training.ts')) {
  seedTraining().catch(console.error);
}
