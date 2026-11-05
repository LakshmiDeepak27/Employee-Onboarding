/**
 * Prisma client singleton.
 *
 * Lives inside the API because the API is the only thing that talks to the
 * database. Nothing else in the workspace imports it.
 *
 * The globalThis cache stops `tsx watch` from opening a new connection pool
 * on every hot reload.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
