/**
 * Seeds reference data, the RBAC catalog and three demo accounts.
 *
 * Idempotent: safe to run repeatedly. The RBAC section is the important part
 * — roles and permissions come from packages/contracts/src/rbac.ts, which is
 * the single source of truth. Change the catalog there, re-run this, done.
 *
 *   npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, type EmploymentType } from '@prisma/client';
import { PERMISSIONS, ROLES } from '../../../packages/contracts/dist/rbac.js';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Onboard!ng2026';

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
      // Deliberately left WITHOUT a policy corpus so the refusal path can be
      // demonstrated: generating a plan here must refuse and escalate.
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
}

/**
 * Three demo accounts, one per role, so the whole team can sign in and the
 * scope rules are visible immediately:
 *   hr.admin@demo.io  sees everything
 *   manager@demo.io   sees only priya (their direct report)
 *   priya@demo.io     sees only herself
 */
async function seedDemoUsers() {
  console.log('  demo users and employees...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  async function makeUser(email: string, roleKey: string) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, status: 'ACTIVE', mustChangePassword: false },
      update: { passwordHash, status: 'ACTIVE', mustChangePassword: false },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    return user;
  }

  const hrUser = await makeUser('hr.admin@demo.io', 'hr_admin');
  const mgrUser = await makeUser('manager@demo.io', 'manager');
  const empUser = await makeUser('priya@demo.io', 'employee');

  const eng = await prisma.department.findUniqueOrThrow({ where: { code: 'ENG' } });

  async function makeEmployee(input: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    personalEmail: string;
    userId?: string;
    managerId?: string;
    jurisdictionCode: string;
    employmentType: EmploymentType;
    startInDays: number;
    jobTitle: string;
  }) {
    return prisma.employee.upsert({
      where: { employeeNumber: input.employeeNumber },
      create: {
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        lastName: input.lastName,
        personalEmail: input.personalEmail,
        jobTitle: input.jobTitle,
        roleFamily: 'engineering',
        departmentId: eng.id,
        jurisdictionCode: input.jurisdictionCode,
        employmentType: input.employmentType,
        workMode: 'HYBRID',
        startDate: daysFromNow(input.startInDays),
        status: 'ONBOARDING',
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.managerId ? { managerId: input.managerId } : {}),
      },
      update: {
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.managerId ? { managerId: input.managerId } : {}),
        startDate: daysFromNow(input.startInDays),
      },
    });
  }

  const hrEmp = await makeEmployee({
    employeeNumber: 'EMP-0001',
    firstName: 'Asha',
    lastName: 'Rao',
    personalEmail: 'asha@demo.io',
    userId: hrUser.id,
    jurisdictionCode: 'IN-KA',
    employmentType: 'FULL_TIME',
    startInDays: -400,
    jobTitle: 'HR Lead',
  });

  const mgrEmp = await makeEmployee({
    employeeNumber: 'EMP-0002',
    firstName: 'David',
    lastName: 'Chen',
    personalEmail: 'david@demo.io',
    userId: mgrUser.id,
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    startInDays: -300,
    jobTitle: 'Engineering Manager',
  });

  // Priya reports to David. This pair is what proves REPORTS scope works.
  await makeEmployee({
    employeeNumber: 'EMP-0003',
    firstName: 'Priya',
    lastName: 'Nair',
    personalEmail: 'priya@demo.io',
    userId: empUser.id,
    managerId: mgrEmp.id,
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    startInDays: 10,
    jobTitle: 'Software Engineer',
  });

  // Not David's report. Manager scope must NOT reach this one.
  await makeEmployee({
    employeeNumber: 'EMP-0004',
    firstName: 'Tom',
    lastName: 'Webb',
    personalEmail: 'tom@demo.io',
    managerId: hrEmp.id,
    jurisdictionCode: 'GB',
    employmentType: 'FULL_TIME',
    startInDays: 14,
    jobTitle: 'Software Engineer',
  });

  // Singapore contractor: no policy corpus, so plan generation must REFUSE.
  await makeEmployee({
    employeeNumber: 'EMP-0005',
    firstName: 'Wei',
    lastName: 'Lim',
    personalEmail: 'wei@demo.io',
    jurisdictionCode: 'SG',
    employmentType: 'CONTRACTOR',
    startInDays: 21,
    jobTitle: 'Contract Designer',
  });
}

async function main() {
  console.log('\nSeeding Employee Onboarding database\n');
  await seedRbac();
  await seedJurisdictions();
  await seedDepartments();
  await seedCatalogs();
  await seedDemoUsers();

  const counts = {
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    grants: await prisma.rolePermission.count(),
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
    jurisdictions: await prisma.jurisdiction.count(),
  };

  console.log('\nDone.');
  console.table(counts);
  console.log(`
Demo accounts (password for all three: ${DEMO_PASSWORD})

  hr.admin@demo.io   hr_admin  ORG      sees all 5 employees
  manager@demo.io    manager   REPORTS  sees only Priya (EMP-0003)
  priya@demo.io      employee  SELF     sees only herself

Try the scope rule:
  1. sign in as manager@demo.io
  2. GET /api/v1/employees          -> returns Priya only
  3. GET /api/v1/employees/<Tom id> -> 404, not 403 (existence is not leaked)
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
