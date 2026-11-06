import { Router, type Request } from 'express';
import {
  z,
  Uuid,
  UpsertPayrollSetupRequestSchema,
  VerifyPayrollRequestSchema,
} from '@eo/contracts';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { employeeIdForTask } from '../rbac/scope.js';
import { getPayroll, maskPayrollInput, savePayroll, verifyPayroll } from '../payroll/service.js';

export const payrollRouter = Router();
const params = z.object({ taskId: Uuid });
const target = (req: Request) => employeeIdForTask(req.params.taskId!);
const path = '/tasks/:taskId/payroll';

payrollRouter.get(
  path,
  authenticate,
  validate({ params }),
  requirePermission('payroll.read', { target }),
  async (req, res, next) => {
    try {
      res.json(await getPayroll(req, req.params.taskId!));
    } catch (error) {
      next(error);
    }
  },
);

payrollRouter.put(
  path,
  authenticate,
  validate({ params }),
  requirePermission('payroll.write', { target }),
  validate({ body: UpsertPayrollSetupRequestSchema }),
  async (req, res, next) => {
    try {
      const safe = maskPayrollInput(req.body);
      // Drop raw write-only values before the first asynchronous operation.
      req.body = {};
      res.json(await savePayroll(req, req.params.taskId!, safe));
    } catch (error) {
      next(error);
    }
  },
);

payrollRouter.post(
  `${path}/verification`,
  authenticate,
  validate({ params }),
  requirePermission('payroll.verify', { target }),
  validate({ body: VerifyPayrollRequestSchema }),
  async (req, res, next) => {
    try {
      req.body = {};
      res.json(await verifyPayroll(req, req.params.taskId!));
    } catch (error) {
      next(error);
    }
  },
);
