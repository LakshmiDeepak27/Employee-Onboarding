import { Router } from 'express';
import client from 'prom-client';
import { prisma } from '../db/client.js';
import { env } from '../config/env.js';

export const opsRouter = Router();

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'eo_' });

export const metrics = {
  planGenerations: new client.Counter({
    name: 'eo_plan_generations_total',
    help: 'Plan generations by mode',
    labelNames: ['mode'] as const,
    registers: [registry],
  }),
  validatorFindings: new client.Counter({
    name: 'eo_validator_findings_total',
    help: 'Validator findings by validator and action',
    labelNames: ['validator', 'action'] as const,
    registers: [registry],
  }),
  authEvents: new client.Counter({
    name: 'eo_auth_events_total',
    help: 'Authentication events by type and outcome',
    labelNames: ['type', 'success'] as const,
    registers: [registry],
  }),
  authzDenials: new client.Counter({
    name: 'eo_authz_denials_total',
    help: 'Authorization denials by permission and reason',
    labelNames: ['permission', 'reason'] as const,
    registers: [registry],
  }),
};

opsRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

/**
 * Database and LLM are reported SEPARATELY and on purpose. `llm: down` with
 * `database: up` is exactly the state in which plan generation falls back to
 * BASELINE_FALLBACK. Stopping Ollama and hitting this endpoint is the demo of
 * the degraded path.
 */
opsRouter.get('/readyz', async (_req, res) => {
  let database: 'up' | 'down' = 'down';
  let llm: 'up' | 'down' = 'down';

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch {
    database = 'down';
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    llm = r.ok ? 'up' : 'down';
  } catch {
    llm = 'down';
  }

  const status = database === 'down' ? 'unavailable' : llm === 'down' ? 'degraded' : 'ready';
  res.status(database === 'down' ? 503 : 200).json({ status, checks: { database, llm } });
});

opsRouter.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
