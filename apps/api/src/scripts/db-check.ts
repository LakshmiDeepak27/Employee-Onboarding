/**
 * Database smoke test.  `npm run db:check -w @eo/api`
 *
 * Confirms the connection works, the schema is applied, the seed has run and
 * the auth tables are actually recording activity. Run this first whenever
 * something looks wrong — it tells you in five seconds whether the problem is
 * your environment or your code.
 */
import { prisma } from '../db/client.js';

async function main() {
  console.log('\nChecking database...\n');

  const [
    roles,
    permissions,
    grants,
    users,
    employees,
    jurisdictions,
    plans,
    tokensIssued,
    tokensRevoked,
  ] = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    prisma.user.count(),
    prisma.employee.count(),
    prisma.jurisdiction.count(),
    prisma.onboardingPlan.count(),
    prisma.refreshToken.count(),
    prisma.refreshToken.count({ where: { revokedAt: { not: null } } }),
  ]);

  console.table({
    roles,
    permissions,
    grants,
    users,
    employees,
    jurisdictions,
    plans,
  });

  const authEvents = await prisma.authEvent.groupBy({
    by: ['type', 'success'],
    _count: true,
  });

  if (authEvents.length) {
    console.log('Auth events recorded:');
    for (const e of authEvents) {
      console.log(
        `   ${e.type.padEnd(22)} success=${String(e.success).padEnd(6)} x${e._count}`,
      );
    }
  } else {
    console.log('Auth events recorded: none yet (nobody has signed in)');
  }

  console.log(`\nRefresh tokens: ${tokensIssued} issued, ${tokensRevoked} revoked`);

  const scope = await prisma.rolePermission.groupBy({
    by: ['scope'],
    _count: true,
  });
  console.log(
    '\nGrants by scope:',
    scope.map((s) => `${s.scope}=${s._count}`).join('  '),
  );

  // The fixture that makes the REPORTS scope demonstrable.
  const manager = await prisma.employee.findFirst({
    where: { user: { email: 'manager@demo.io' } },
    select: { firstName: true, reports: { select: { firstName: true } } },
  });
  if (manager) {
    console.log(
      `\nScope fixture: ${manager.firstName} manages [${manager.reports
        .map((r) => r.firstName)
        .join(', ')}]`,
    );
  }

  const problems: string[] = [];
  if (roles !== 3) problems.push(`expected 3 roles, found ${roles}`);
  if (permissions === 0) problems.push('no permissions seeded');
  if (employees === 0) problems.push('no employees seeded - run npm run db:seed');

  if (problems.length) {
    console.error('\nPROBLEMS:');
    problems.forEach((p) => console.error('  -', p));
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.\n');
  }
}

main()
  .catch((e) => {
    console.error('\nDatabase check FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
