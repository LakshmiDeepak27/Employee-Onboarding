import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// One .env at the repository root is the single source of configuration for
// the whole workspace. Loaded explicitly by path so it works regardless of
// which directory the process was started from.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});

/**
 * Environment is validated at boot. The process refuses to start on a bad
 * config rather than failing at the first request — a missing JWT secret in
 * production must never be discoverable by a user.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    JWT_ISSUER: z.string().default('employee-onboarding'),
    JWT_AUDIENCE: z.string().default('employee-onboarding-api'),

    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
    MAX_FAILED_LOGINS: z.coerce.number().int().min(1).default(5),
    LOCKOUT_MINUTES: z.coerce.number().int().min(1).default(15),

    /**
     * Lets teammates build routes before login exists:
     *   curl -H "x-dev-user: hr.admin@demo.io" localhost:4000/api/v1/employees
     * Hard-refused outside development, so it cannot be left on by accident.
     */
    DEV_AUTH_BYPASS: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),

    OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
    LLM_MODEL: z.string().default('qwen2.5:7b-instruct'),
    EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.DEV_AUTH_BYPASS && cfg.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_AUTH_BYPASS'],
        message: 'DEV_AUTH_BYPASS must be false unless NODE_ENV=development',
      });
    }
    if (cfg.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (cfg[key].includes('change-me')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} still holds the development placeholder`,
          });
        }
      }
    }
    if (cfg.JWT_ACCESS_SECRET === cfg.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'access and refresh secrets must differ',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = load();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
