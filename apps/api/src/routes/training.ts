import { Router, Request, Response, NextFunction } from 'express';
import {
  CreateTrainingAssignmentRequestSchema,
  CompleteTrainingRequestSchema,
} from '@eo/contracts';
import { TrainingService } from '../services/training/training-service.js';
import { WorkerTrainingContext } from '../services/training/training-agent.js';
import { MOCK_WORKERS } from './benefits.js';

export const defaultTrainingService = new TrainingService();

function getWorkerContext(req: Request): WorkerTrainingContext {
  const auth = (req as any).auth;
  let workerId = 'worker-priya-ca';

  if (auth?.email) {
    const em = auth.email.toLowerCase();
    if (em.includes('priya')) workerId = 'worker-priya-ca';
    else if (em.includes('david')) workerId = 'worker-david-gb';
    else if (em.includes('olivia')) workerId = 'worker-olivia-rhye';
    else if (em.includes('alex')) workerId = 'worker-contractor-sg';
  } else if (auth?.employeeId) {
    workerId = auth.employeeId;
  } else {
    const header = req.headers['x-worker-id'];
    workerId = (Array.isArray(header) ? header[0] : header) || 'worker-priya-ca';
  }

  const matched = MOCK_WORKERS[workerId];
  if (matched) {
    return {
      id: matched.id,
      fullName: matched.fullName,
      jurisdictionCode: matched.jurisdictionCode,
      employmentType: matched.employmentType,
      roleFamily: matched.roleFamily,
      startDate: matched.startDate,
      notes: matched.notes,
    };
  }

  return {
    id: workerId,
    fullName: 'Priya Nair',
    jurisdictionCode: 'CA-ON',
    employmentType: 'FULL_TIME',
    roleFamily: 'engineering',
    startDate: '2026-12-01',
    notes: 'Senior Software Engineer, Dayforce Platform.',
  };
}

/**
 * Express Router for mounting directly into the team app:
 * `app.use('/api/v1', trainingRouter);`
 */
export const trainingRouter = Router();

// 1. GET /api/v1/training/courses
trainingRouter.get('/training/courses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jurisdictionCode, roleFamily } = req.query as {
      jurisdictionCode?: string;
      roleFamily?: string;
    };
    const courses = await defaultTrainingService.getCourses(jurisdictionCode, roleFamily);
    res.json(courses);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/tasks/:taskId/training
trainingRouter.get('/tasks/:taskId/training', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const assignments = await defaultTrainingService.getAssignmentsByTask(taskId);
    const pathway = await defaultTrainingService.calculateProgress(taskId);
    res.json({
      taskId,
      assignments,
      pathway,
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/v1/tasks/:taskId/training
trainingRouter.post('/tasks/:taskId/training', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const parsed = CreateTrainingAssignmentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', details: parsed.error.issues });
    }

    const worker = getWorkerContext(req);
    const assignment = await defaultTrainingService.assignCourse(
      taskId,
      parsed.data.courseId,
      worker.startDate,
      parsed.data.dueDate,
      worker.id
    );

    res.status(201).json(assignment);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: 'COURSE_NOT_FOUND', message: err.message });
    }
    next(err);
  }
});

// 4. POST /api/v1/tasks/:taskId/training/auto-assign
trainingRouter.post('/tasks/:taskId/training/auto-assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const worker = getWorkerContext(req);
    const assignments = await defaultTrainingService.autoAssignMandatoryCourses(
      taskId,
      worker,
      worker.id
    );
    const pathway = await defaultTrainingService.calculateProgress(taskId);

    res.status(201).json({
      taskId,
      assignedCount: assignments.length,
      assignments,
      pathway,
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /api/v1/tasks/:taskId/training/:assignmentId/complete
trainingRouter.post(
  '/tasks/:taskId/training/:assignmentId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignmentId = String(req.params.assignmentId);
      const parsed = CompleteTrainingRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', details: parsed.error.issues });
      }

      const worker = getWorkerContext(req);
      const updated = await defaultTrainingService.completeTraining(
        assignmentId,
        parsed.data.scorePercent ?? 100,
        parsed.data.completedAt,
        worker.id
      );

      const pathway = await defaultTrainingService.calculateProgress(updated.taskId);

      res.json({
        assignment: updated,
        pathway,
      });
    } catch (err: any) {
      if (err.message && err.message.includes('not found')) {
        return res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND', message: err.message });
      }
      next(err);
    }
  }
);

// 6. POST /api/v1/tasks/:taskId/training/advice
trainingRouter.post('/tasks/:taskId/training/advice', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const worker = getWorkerContext(req);
    const userPrompt = req.body?.prompt || 'Please recommend required statutory and technical onboarding training.';
    const result = await defaultTrainingService.generateAdvice(worker, userPrompt);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/v1/tasks/:taskId/training/audit
trainingRouter.get('/tasks/:taskId/training/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = String(req.params.taskId);
    const trail = defaultTrainingService.getAuditTrail(taskId);
    res.json(trail);
  } catch (err) {
    next(err);
  }
});
