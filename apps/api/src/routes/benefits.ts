import { Router, Request, Response, NextFunction } from 'express';
import {
  BenefitElectionRequestSchema,
  RequestBenefitAdviceSchema,
} from '@eo/contracts';
import { BenefitsService } from '../services/benefits/benefits-service.js';
import { WorkerContext } from '../services/benefits/benefits-agent.js';

export const defaultBenefitsService = new BenefitsService(process.env.GEMINI_API_KEY);

export const MOCK_WORKERS: Record<string, WorkerContext> = {
  'worker-olivia-rhye': {
    id: 'worker-olivia-rhye',
    fullName: 'Olivia Rhye',
    jurisdictionCode: 'US-CA',
    employmentType: 'FULL_TIME',
    roleFamily: 'design',
    startDate: '2026-11-12',
    workMode: 'HYBRID',
    notes: 'Lead Product Designer. Health, dental, vision & 401(k) election due Nov 10.',
  },
  'worker-priya-ca': {
    id: 'worker-priya-ca',
    fullName: 'Priya Nair',
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    roleFamily: 'engineering',
    startDate: '2026-12-01',
    workMode: 'HYBRID',
    notes: 'Relocating from Bengaluru. Prefers dental and health coverage for spouse.',
  },
  'worker-david-gb': {
    id: 'worker-david-gb',
    fullName: 'David Smith',
    jurisdictionCode: 'GB',
    employmentType: 'FULL_TIME',
    roleFamily: 'marketing',
    startDate: '2026-11-15',
    workMode: 'ONSITE',
    notes: 'Inquiring about NHS top-up and pension auto-enrolment rules.',
  },
  'worker-contractor-sg': {
    id: 'worker-contractor-sg',
    fullName: 'Alex Tan',
    jurisdictionCode: 'SG',
    employmentType: 'CONTRACTOR',
    roleFamily: 'consulting',
    startDate: '2026-11-20',
    workMode: 'REMOTE',
    notes: 'Independent contractor.',
  },
};

function getWorkerId(req: Request): string {
  const auth = (req as any).auth;
  if (auth?.email) {
    const em = auth.email.toLowerCase();
    if (em.includes('priya')) return 'worker-priya-ca';
    if (em.includes('david')) return 'worker-david-gb';
    if (em.includes('olivia')) return 'worker-olivia-rhye';
    if (em.includes('alex')) return 'worker-contractor-sg';
  }
  if (auth?.employeeId) {
    return auth.employeeId;
  }
  const header = req.headers['x-worker-id'];
  if (Array.isArray(header)) return header[0] || 'worker-olivia-rhye';
  if (typeof header === 'string' && header.trim()) return header.trim();
  return 'worker-olivia-rhye';
}

/**
 * Express Router for mounting directly into the team app:
 * `app.use('/api/v1', benefitsRouter);`
 */
export const benefitsRouter = Router();

// 1. GET /api/v1/benefits/plans
benefitsRouter.get('/benefits/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jurisdictionCode, category } = req.query as { jurisdictionCode?: string; category?: string };
    const result = await defaultBenefitsService.getPlans(jurisdictionCode, category);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/benefits/enrollments
benefitsRouter.get('/benefits/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, jurisdiction, atRiskOnly } = req.query as {
      status?: string;
      jurisdiction?: string;
      atRiskOnly?: string;
    };
    const queue = await defaultBenefitsService.getWorkQueue({
      status,
      jurisdiction,
      atRiskOnly: atRiskOnly === 'true',
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/v1/tasks/:taskId/benefit-enrollment
benefitsRouter.get('/tasks/:taskId/benefit-enrollment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const workerId = getWorkerId(req);
    const worker = MOCK_WORKERS[workerId] || MOCK_WORKERS['worker-olivia-rhye']!;
    const enrollment = await defaultBenefitsService.getEnrollmentForTask(taskId, worker);
    res.json(enrollment);
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/tasks/:taskId/benefit-enrollment
benefitsRouter.post('/tasks/:taskId/benefit-enrollment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const parseResult = BenefitElectionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation',
          fields: parseResult.error.errors,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const workerId = getWorkerId(req);
    const worker = MOCK_WORKERS[workerId] || MOCK_WORKERS['worker-olivia-rhye']!;

    const result = await defaultBenefitsService.electOrWaive(taskId, worker, parseResult.data);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({
      error: {
        code: 'ELECTION_FAILED',
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// 5. POST /api/v1/tasks/:taskId/benefit-advice (Copilot recommendation)
benefitsRouter.post('/tasks/:taskId/benefit-advice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const parseResult = RequestBenefitAdviceSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid advice request payload',
          fields: parseResult.error.errors,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const workerId = getWorkerId(req);
    const worker = MOCK_WORKERS[workerId] || MOCK_WORKERS['worker-olivia-rhye']!;

    const result = await defaultBenefitsService.generateAdvice(taskId, worker, parseResult.data);
    if (result.status === 'REFUSED') {
      return res.status(409).json({
        error: {
          code: 'UNSUPPORTED_JURISDICTION',
          message: result.refusalReason,
          findings: result.findings,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.json(result);
  } catch (err: any) {
    next(err);
  }
});

export default benefitsRouter;
