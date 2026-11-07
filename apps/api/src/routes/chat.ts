import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ChatRequestSchema } from '@eo/contracts';
import { authenticate, requireAuth } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { answerChat } from '../services/chatbot.js';
import { isEmployeeInScope } from '../rbac/scope.js';

export const chatRouter = Router();

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

chatRouter.post(
  '/chat',
  authenticate,
  chatLimiter,
  requirePermission('policy.read'),
  validate({ body: ChatRequestSchema }),
  async (req, res, next) => {
    try {
      const auth = requireAuth(req);
      const { message, targetEmployeeId } = req.body as {
        message: string;
        targetEmployeeId?: string;
      };
      if (targetEmployeeId) {
        const employeeScope = auth.permissions.get('employee.read');
        if (!employeeScope || !(await isEmployeeInScope(auth, employeeScope, targetEmployeeId))) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
          return;
        }
      }
      res.json(await answerChat(auth, message, targetEmployeeId));
    } catch (error) {
      next(error);
    }
  },
);
