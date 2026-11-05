import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  ChangePasswordRequestSchema,
} from '@eo/contracts';
import { validate } from '../middleware/validate.js';
import { authenticate, requireAuth } from '../middleware/authenticate.js';
import { unauthenticated } from '../lib/errors.js';
import { isProd } from '../config/env.js';
import * as auth from './service.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'eo_refresh';

function meta(req: Request): auth.RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.header('user-agent'),
  };
}

/** Brute-force protection, on top of the per-account lockout in the service. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '')}`,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Try again in a few minutes.',
    },
  },
});

function setRefreshCookie(res: Parameters<Parameters<typeof authRouter.post>[1]>[1], token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------
authRouter.post(
  '/login',
  loginLimiter,
  validate({ body: LoginRequestSchema }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const session = await auth.login(email, password, meta(req));
      setRefreshCookie(res, session.refreshToken);
      res.status(200).json(session);
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/auth/refresh
// ---------------------------------------------------------------------------
authRouter.post('/refresh', validate({ body: RefreshRequestSchema }), async (req, res, next) => {
  try {
    const fromBody = (req.body as { refreshToken?: string }).refreshToken;
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const token = fromBody ?? fromCookie;
    if (!token) throw unauthenticated('No refresh token supplied', 'TOKEN_INVALID');

    const tokens = await auth.refresh(token, meta(req));
    setRefreshCookie(res, tokens.refreshToken);
    res.status(200).json(tokens);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------
authRouter.post(
  '/logout',
  authenticate,
  validate({ body: LogoutRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
      const { allDevices } = req.body as { allDevices: boolean };
      await auth.logout(actor.userId, fromCookie, allDevices, meta(req));
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      res.status(200).json({ message: allDevices ? 'Signed out everywhere' : 'Signed out' });
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const actor = requireAuth(req);
    res.status(200).json(await auth.getMe(actor.userId));
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/change-password
// ---------------------------------------------------------------------------
authRouter.post(
  '/change-password',
  authenticate,
  validate({ body: ChangePasswordRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      await auth.changePassword(actor.userId, currentPassword, newPassword, meta(req));
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      res
        .status(200)
        .json({ message: 'Password changed. All other sessions have been signed out.' });
    } catch (e) {
      next(e);
    }
  },
);
