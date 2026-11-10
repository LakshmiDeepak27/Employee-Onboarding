/**
 * Seeds the RBAC catalog and foundational reference records (jurisdictions and departments).
 *
 * Idempotent: safe to run repeatedly on both fresh and existing databases.
 * The RBAC section ensures roles and permissions come from packages/contracts/src/rbac.ts,
 * which is the single source of truth.
 *
 * Required reference records (locations & departments) are always initialized before
 * presentation or demo user accounts so foreign key relationships are reliably satisfied.
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../../.env' });

import { PrismaClient, type EmploymentType } from '@prisma/client';
import { PERMISSIONS, ROLES } from '../../../packages/contracts/dist/rbac.js';
import { policyService } from '../src/ai/policyService.js';

const prisma = new PrismaClient();

function assertLocalPresentationReset() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || process.env.NODE_ENV === 'production') {
    throw new Error('Presentation cleanup is local-development only. Refusing to modify this database.');
  }
  const host = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error(`Presentation cleanup requires a localhost database; refusing host ${host}.`);
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function seedRbac() {
  console.log('  roles and permissions...');

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, resource: p.resource, action: p.action, description: p.description },
      update: { resource: p.resource, action: p.action, description: p.description },
    });
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, description: r.description, isSystem: r.isSystem },
      update: { name: r.name, description: r.description, isSystem: r.isSystem },
    });

    // Replace grants wholesale so a removed grant in the catalog is actually
    // removed from the database. Authorization must never drift from source.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });

    const entries = Object.entries(r.grants);
    const perms = await prisma.permission.findMany({
      where: { key: { in: entries.map(([k]) => k) } },
      select: { id: true, key: true },
    });
    const byKey = new Map(perms.map((p) => [p.key, p.id]));

    await prisma.rolePermission.createMany({
      data: entries.map(([key, scope]) => ({
        roleId: role.id,
        permissionId: byKey.get(key)!,
        scope,
      })),
      skipDuplicates: true,
    });

    console.log(`    ${r.key.padEnd(10)} ${entries.length} permissions`);
  }
}

async function seedJurisdictions() {
  console.log('  jurisdictions...');
  const data = [
    {
      code: 'CA-ON',
      displayName: 'Ontario, Canada',
      countryCode: 'CA',
      businessDays: [1, 2, 3, 4, 5],
      timezone: 'America/Toronto',
    },
    {
      code: 'GB',
      displayName: 'United Kingdom',
      countryCode: 'GB',
      businessDays: [1, 2, 3, 4, 5],
      timezone: 'Europe/London',
    },
    {
      code: 'IN-KA',
      displayName: 'Karnataka, India',
      countryCode: 'IN',
      businessDays: [1, 2, 3, 4, 5],
      timezone: 'Asia/Kolkata',
    },
    {
      // Deliberately left without a policy corpus so the safe internal-only
      // onboarding fallback can be demonstrated.
      code: 'SG',
      displayName: 'Singapore',
      countryCode: 'SG',
      businessDays: [1, 2, 3, 4, 5],
      timezone: 'Asia/Singapore',
    },
  ];
  for (const j of data) {
    await prisma.jurisdiction.upsert({ where: { code: j.code }, create: j, update: j });
  }
}

async function seedDepartments() {
  console.log('  departments...');
  const data = [
    { code: 'ENG', name: 'Engineering' },
    { code: 'SALES', name: 'Sales' },
    { code: 'HR', name: 'People Operations' },
    { code: 'FIN', name: 'Finance' },
  ];
  for (const d of data) {
    await prisma.department.upsert({ where: { code: d.code }, create: d, update: d });
  }
}

async function seedCatalogs() {
  console.log('  equipment, benefits, training catalogs...');

  const equipment = [
    { sku: 'LAPTOP-MBP14', name: 'MacBook Pro 14"', category: 'laptop', leadTimeDays: 5 },
    { sku: 'LAPTOP-TPX1', name: 'ThinkPad X1 Carbon', category: 'laptop', leadTimeDays: 3 },
    { sku: 'MON-27-4K', name: '27-inch 4K Monitor', category: 'peripheral', leadTimeDays: 2 },
    { sku: 'BADGE-STD', name: 'Office Access Badge', category: 'access', leadTimeDays: 1 },
    { sku: 'PHONE-STD', name: 'Company Mobile', category: 'mobile', leadTimeDays: 4 },
  ];
  for (const e of equipment) {
    await prisma.equipmentCatalog.upsert({ where: { sku: e.sku }, create: e, update: e });
  }

  const benefits = [
    {
      code: 'CA-MED-STD',
      name: 'Ontario Standard Medical',
      type: 'MEDICAL' as const,
      jurisdictionCode: 'CA-ON',
      enrollmentWindowDays: 31,
      isAutoEnrol: false,
    },
    {
      code: 'GB-PENSION-AE',
      name: 'UK Workplace Pension (auto-enrolment)',
      type: 'PENSION' as const,
      jurisdictionCode: 'GB',
      enrollmentWindowDays: 30,
      isAutoEnrol: true,
    },
    {
      code: 'IN-MED-GRP',
      name: 'India Group Medical Cover',
      type: 'MEDICAL' as const,
      jurisdictionCode: 'IN-KA',
      enrollmentWindowDays: 30,
      isAutoEnrol: false,
    },
    {
      code: 'SG-STARTER-OPTIONS',
      name: 'Singapore Benefits Options',
      type: 'WELLNESS' as const,
      jurisdictionCode: 'SG',
      enrollmentWindowDays: 30,
      isAutoEnrol: false,
      description: 'Starter options for presentation only. HR must confirm current company benefits and eligibility before use.',
    },
  ];
  for (const b of benefits) {
    await prisma.benefitPlan.upsert({ where: { code: b.code }, create: b, update: b });
  }

  const courses = [
    {
      code: 'OHS-ON-101',
      title: 'Ontario Occupational Health & Safety Awareness',
      provider: 'Internal',
      durationMinutes: 60,
      mandatoryForJurisdictions: ['CA-ON'],
      mandatoryForRoles: [],
      statutoryDeadlineDays: 7,
    },
    {
      code: 'UK-DP-101',
      title: 'UK Data Protection Essentials',
      provider: 'Internal',
      durationMinutes: 45,
      mandatoryForJurisdictions: ['GB'],
      mandatoryForRoles: [],
      statutoryDeadlineDays: 30,
    },
    {
      code: 'SEC-ALL-101',
      title: 'Information Security Fundamentals',
      provider: 'Internal',
      durationMinutes: 30,
      mandatoryForJurisdictions: [],
      mandatoryForRoles: [],
      statutoryDeadlineDays: 14,
    },
  ];
  for (const c of courses) {
    await prisma.trainingCourse.upsert({ where: { code: c.code }, create: c, update: c });
  }

  console.log('  policy documents and clauses...');
  await policyService.ensureDemoCorpusSeeded();
}

/** Remove local presentation data, while retaining only the two staff users.
 * Their Keycloak identities are not deleted here; the separate, localhost-only
 * Keycloak cleaner handles those after a dry run.
 */
async function resetPresentationWorkspace() {
  console.log('  clearing old local workflow data...');
  await prisma.$transaction([
    prisma.backgroundJob.deleteMany(),
    prisma.escalation.deleteMany(),
    prisma.llmCall.deleteMany(),
    prisma.validationFinding.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.authEvent.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.policyClause.deleteMany(),
    prisma.policyDocument.deleteMany(),
    prisma.user.deleteMany({
      where: { email: { notIn: ['asha.hr@clyora', 'david.manager@clyora'] } },
    }),
  ]);
}

/** Seed the HR and manager staff identities used in the walkthrough.
 * The new employee is created from the HR screen so the end-to-end flow starts
 * with a genuinely fresh PRE_HIRE record and invitation.
 */
async function seedPresentationUsers() {
  console.log('  HR and manager identity profiles...');

  // Ensure required departments and jurisdictions exist before querying them
  await seedJurisdictions();
  await seedDepartments();

  async function makeUser(email: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash: null, authProvider: 'oidc', status: 'ACTIVE', mustChangePassword: false },
      update: { passwordHash: null, authProvider: 'oidc', status: 'ACTIVE', mustChangePassword: false, tokenVersion: { increment: 1 } },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    return user;
  }

  const hrUser = await makeUser('asha.hr@clyora', 'hr_admin');
  const mgrUser = await makeUser('david.manager@clyora', 'manager');

  const eng = await prisma.department.findUniqueOrThrow({ where: { code: 'ENG' } });
  const peopleOps = await prisma.department.findUniqueOrThrow({ where: { code: 'HR' } });

  async function makeEmployee(input: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    personalEmail: string;
    workEmail?: string;
    userId?: string;
    managerId?: string;
    jurisdictionCode: string;
    employmentType: EmploymentType;
    startInDays: number;
    jobTitle: string;
    roleFamily: string;
    workMode: 'REMOTE' | 'ONSITE' | 'HYBRID';
    departmentId?: string;
  }) {
    return prisma.employee.upsert({
      where: { employeeNumber: input.employeeNumber },
      create: {
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        personalEmail: input.personalEmail,
        workEmail: input.workEmail ?? null,
        departmentId: input.departmentId ?? eng.id,
        jobTitle: input.jobTitle,
        roleFamily: input.roleFamily,
        jurisdictionCode: input.jurisdictionCode,
        employmentType: input.employmentType,
        workMode: input.workMode,
        startDate: daysFromNow(input.startInDays),
        status: 'ACTIVE',
        managerId: input.managerId ?? null,
        ...(input.userId ? { userId: input.userId } : {}),
      },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        personalEmail: input.personalEmail,
        workEmail: input.workEmail ?? null,
        departmentId: input.departmentId ?? eng.id,
        jobTitle: input.jobTitle,
        roleFamily: input.roleFamily,
        workMode: input.workMode,
        jurisdictionCode: input.jurisdictionCode,
        employmentType: input.employmentType,
        status: 'ACTIVE',
        managerId: input.managerId ?? null,
        ...(input.userId ? { userId: input.userId } : {}),
        startDate: daysFromNow(input.startInDays),
      },
    });
  }

  // HR staff are employees too. Linking Asha's profile keeps the people
  // directory complete and allows HR to be selected as a reporting manager.
  await makeEmployee({
    employeeNumber: 'EMP-0001',
    firstName: 'Asha',
    lastName: 'Rao',
    personalEmail: 'asha.hr@example.invalid',
    workEmail: 'asha.hr@clyora',
    userId: hrUser.id,
    jurisdictionCode: 'IN-KA',
    employmentType: 'FULL_TIME',
    startInDays: -300,
    jobTitle: 'HR Administrator',
    roleFamily: 'people-operations',
    workMode: 'HYBRID',
    departmentId: peopleOps.id,
  });

  // David needs an employee profile because manager permissions are scoped to
  // direct reports.
  await makeEmployee({
    employeeNumber: 'EMP-0002',
    firstName: 'David',
    lastName: 'Chen',
    personalEmail: 'david@clyora.com',
    workEmail: 'david.manager@clyora',
    userId: mgrUser.id,
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    startInDays: -300,
    jobTitle: 'Engineering Manager',
    roleFamily: 'engineering',
    workMode: 'HYBRID',
  });

  if (process.env.SEED_PRESENTATION_USERS === 'true') {
    const [userCount, employeeCount] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
    ]);
    if (userCount !== 2 || employeeCount !== 2) {
      throw new Error(`Presentation setup expected 2 staff accounts and their 2 linked employee profiles; found ${userCount} accounts and ${employeeCount} employee profiles.`);
    }
  }

}

/** Explicit one-time/bootstrap identity; role assignment is database-side. */
async function seedBootstrapHr() {
  const email = process.env.BOOTSTRAP_HR_EMAIL?.trim().toLowerCase();
  if (!email) return;
  if (!/^[a-z0-9][a-z0-9._-]*\.hr@clyora$/.test(email)) {
    throw new Error('BOOTSTRAP_HR_EMAIL must use <username>.hr@clyora');
  }
  const hrRole = await prisma.role.findUniqueOrThrow({ where: { key: 'hr_admin' } });
  const existing = await prisma.user.findUnique({
    where: { email },
    include: { userRoles: { include: { role: true } } },
  });
  if (existing) {
    if (!existing.userRoles.some((entry) => entry.role.key === 'hr_admin')) {
      throw new Error(`Account ${email} already exists without hr_admin; refusing to elevate it during bootstrap`);
    }
    console.log(`  bootstrap HR account already provisioned: ${email}`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      status: 'INVITED',
      mustChangePassword: false,
      authProvider: 'oidc',
      userRoles: { create: [{ roleId: hrRole.id }] },
    },
  });
  console.log(`  provisioned initial HR OIDC account: ${email}`);
}

async function main() {
  console.log('\nSeeding Employee Onboarding database\n');
  if (process.env.SEED_PRESENTATION_USERS === 'true') {
    assertLocalPresentationReset();
    await resetPresentationWorkspace();
  }
  // 1. Roles and permissions (RBAC)
  await seedRbac();

  // 2. Foundational reference records: jurisdictions (locations) & departments
  // Initialized before presentation users, bootstrap HR, or any employees are created.
  await seedJurisdictions();
  await seedDepartments();

  // 3. Catalogs: equipment, benefits, training, and policy documents
  if (
    process.env.SEED_REFERENCE_DATA === 'true' ||
    process.env.SEED_DEMO_DATA === 'true' ||
    process.env.SEED_PRESENTATION_USERS === 'true' ||
    process.argv.includes('--reference') ||
    process.env.SEED_REFERENCE_DATA !== 'false'
  ) {
    await seedCatalogs();
  } else {
    console.log('  starter reference catalog records skipped');
  }

  // 4. Presentation & demo identities (Asha HR & David Manager)
  if (process.env.SEED_DEMO_DATA === 'true' || process.env.SEED_PRESENTATION_USERS === 'true') {
    await seedPresentationUsers();
  } else {
    console.log('  presentation identities skipped');
  }

  // 5. Bootstrap HR account (if configured and not presentation mode)
  if (process.env.SEED_PRESENTATION_USERS !== 'true') {
    await seedBootstrapHr();
  }

  const counts = {
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    grants: await prisma.rolePermission.count(),
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
    jurisdictions: await prisma.jurisdiction.count(),
    departments: await prisma.department.count(),
    policyDocuments: await prisma.policyDocument.count(),
    policyClauses: await prisma.policyClause.count(),
  };

  console.log('\nDone.');
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
