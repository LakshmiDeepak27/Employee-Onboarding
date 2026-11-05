import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/client.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, devAuthBypass: env.DEV_AUTH_BYPASS },
    `API listening on http://localhost:${env.PORT}  (docs: /docs)`,
  );
  if (env.DEV_AUTH_BYPASS) {
    logger.warn('DEV_AUTH_BYPASS is ON - send "x-dev-user: <email>" to skip login');
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
