import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma, checkDatabaseConnection } from "./db/client.js";

const require = createRequire(import.meta.url);

async function ensureDatabaseInitialized() {
  if (!process.env.DATABASE_URL) return;

  let tablesExist = false;
  try {
    await prisma.$queryRaw`SELECT 1 FROM users LIMIT 1`;
    tablesExist = true;
    logger.info("Database schema verified: core tables are present.");
  } catch (err: any) {
    logger.warn("Core database tables not found. Automatically deploying Prisma migrations...");
  }

  if (!tablesExist) {
    try {
      const prismaBin = require.resolve("prisma/build/index.js");
      const schemaPath = fs.existsSync(path.resolve(process.cwd(), "apps/api/prisma/schema.prisma"))
        ? path.resolve(process.cwd(), "apps/api/prisma/schema.prisma")
        : path.resolve(process.cwd(), "prisma/schema.prisma");

      const migResult = spawnSync(process.execPath, [prismaBin, "migrate", "deploy", `--schema=${schemaPath}`], {
        stdio: "inherit",
        env: process.env,
      });

      if (migResult.status === 0) {
        logger.info("Prisma migrations applied successfully.");
        tablesExist = true;
      } else {
        logger.error({ status: migResult.status }, "Prisma migration deploy failed with non-zero exit code.");
      }
    } catch (e) {
      logger.error({ err: e }, "Failed to execute Prisma migrate deploy.");
    }
  }

  if (tablesExist) {
    try {
      const asha = await prisma.user.findUnique({
        where: { email: "asha.hr@clyora" },
        select: { id: true },
      });

      if (!asha) {
        logger.info("Demo user 'asha.hr@clyora' missing. Automatically seeding database...");
        const tsxBin = require.resolve("tsx/cli");
        const seedPath = fs.existsSync(path.resolve(process.cwd(), "apps/api/prisma/seed.ts"))
          ? path.resolve(process.cwd(), "apps/api/prisma/seed.ts")
          : path.resolve(process.cwd(), "prisma/seed.ts");

        const seedResult = spawnSync(process.execPath, [tsxBin, seedPath], {
          stdio: "inherit",
          env: {
            ...process.env,
            SEED_REFERENCE_DATA: "true",
            SEED_DEMO_DATA: "true",
          },
        });
        logger.info({ status: seedResult.status }, "Database seeding completed.");
      }
    } catch (seedErr) {
      logger.warn({ err: seedErr }, "Database verification/seed probe skipped.");
    }
  }
}

const app = createApp();

const server = app.listen(env.PORT, async () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, devAuthBypass: env.DEV_AUTH_BYPASS },
    `API listening on http://localhost:${env.PORT}  (docs: /docs)`,
  );

  const dbOnline = await checkDatabaseConnection();
  if (dbOnline) {
    logger.info(
      "Database connected: PostgreSQL at " +
        (process.env.DATABASE_URL
          ? new URL(process.env.DATABASE_URL).host
          : "localhost:5432"),
    );
    await ensureDatabaseInitialized();
  } else {
    logger.warn(
      "Database unavailable. API requests will fail closed until connectivity is restored.",
    );
  }

  if (env.DEV_AUTH_BYPASS) {
    logger.warn(
      'DEV_AUTH_BYPASS is ON - send "x-dev-user: <email>" to skip login',
    );
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
