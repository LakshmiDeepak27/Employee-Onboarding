import { Router, type Request } from "express";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import rateLimit from "express-rate-limit";
import {
  LoginRequestSchema,
  AcceptInviteRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  ChangePasswordRequestSchema,
} from "@eo/contracts";
import { validate } from "../middleware/validate.js";
import { authenticate, requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";
import { AppError, unauthenticated } from "../lib/errors.js";
import { env, isProd } from "../config/env.js";
import * as auth from "./service.js";

export const authRouter = Router();

const REFRESH_COOKIE = "eo_refresh";
const OIDC_STATE_COOKIE = "eo_oidc_state";

function meta(req: Request): auth.RequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.header("user-agent"),
  };
}

/** Brute-force protection, on top of the per-account lockout in the service. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${req.ip}:${String((req.body as { email?: string })?.email ?? "")}`,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Try again in a few minutes.",
    },
  },
});

function setRefreshCookie(
  res: Parameters<Parameters<typeof authRouter.post>[1]>[1],
  token: string,
) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function oidcConfigured() {
  return Boolean(
    env.OIDC_ISSUER_URL &&
      env.OIDC_CLIENT_ID &&
      env.OIDC_CLIENT_SECRET &&
      env.OIDC_REDIRECT_URI,
  );
}

async function oidcDiscovery() {
  if (!env.OIDC_ISSUER_URL) throw unauthenticated("SSO is not configured");
  const response = await fetch(
    `${env.OIDC_ISSUER_URL.replace(/\/$/, "")}/.well-known/openid-configuration`,
  );
  if (!response.ok) throw unauthenticated("SSO provider is unavailable");
  return (await response.json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    issuer: string;
  };
}

authRouter.get("/oidc/start", async (_req, res, next) => {
  try {
    if (!oidcConfigured()) throw unauthenticated("Organization SSO is not configured");
    const discovery = await oidcDiscovery();
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    res.cookie(OIDC_STATE_COOKIE, JSON.stringify({ state, nonce, verifier }), {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 10 * 60 * 1000,
    });
    const params = new URLSearchParams({
      client_id: env.OIDC_CLIENT_ID!,
      redirect_uri: env.OIDC_REDIRECT_URI!,
      response_type: "code",
      scope: env.OIDC_SCOPES,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    res.redirect(`${discovery.authorization_endpoint}?${params}`);
  } catch (e) {
    next(e);
  }
});

authRouter.get("/oidc/callback", async (req, res, next) => {
  try {
    if (!oidcConfigured()) throw unauthenticated("Organization SSO is not configured");
    const storedRaw = (req.cookies as Record<string, string> | undefined)?.[OIDC_STATE_COOKIE];
    const stored = storedRaw
      ? (JSON.parse(storedRaw) as { state: string; nonce: string; verifier: string })
      : null;
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    if (!stored || !code || !state || state !== stored.state) {
      throw unauthenticated("Invalid SSO callback", "TOKEN_INVALID");
    }
    const discovery = await oidcDiscovery();
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.OIDC_REDIRECT_URI!,
        client_id: env.OIDC_CLIENT_ID!,
        client_secret: env.OIDC_CLIENT_SECRET!,
        code_verifier: stored.verifier,
      }),
    });
    if (!tokenResponse.ok) throw unauthenticated("SSO token exchange failed");
    const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
    if (!tokenPayload.id_token) throw unauthenticated("SSO provider returned no identity token");
    const verified = await jwtVerify(tokenPayload.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), {
      issuer: discovery.issuer,
      audience: env.OIDC_CLIENT_ID,
    });
    if (verified.payload.nonce !== stored.nonce) {
      throw unauthenticated("Invalid SSO nonce", "TOKEN_INVALID");
    }
    if (verified.payload.email_verified !== true) {
      throw unauthenticated("Your identity provider must verify your email address");
    }
    const email = typeof verified.payload.email === "string" ? verified.payload.email.toLowerCase() : null;
    const subject = verified.payload.sub;
    if (!email || !subject) throw unauthenticated("SSO identity has no usable email");
    const session = await auth.loginWithOidc(subject, email, meta(req));
    setRefreshCookie(res, session.refreshToken);
    res.clearCookie(OIDC_STATE_COOKIE, { path: "/api/v1/auth" });
    res.redirect(`${env.CORS_ORIGIN.split(",")[0]!.trim()}/?sso=success`);
  } catch (e) {
    next(e);
  }
});
authRouter.post(
  "/accept-invite",
  validate({ body: AcceptInviteRequestSchema }),
  async (req, res, next) => {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };
      const session = await auth.acceptInvite(token, newPassword, meta(req));
      setRefreshCookie(res, session.refreshToken);
      res.status(200).json(session);
    } catch (e) { next(e); }
  },
);
// POST /api/v1/auth/signup
authRouter.post("/signup", (_req, res) => {
  res.status(403).json({ error: { code: "FORBIDDEN", message: "Self-service signup is disabled. Ask your organization administrator for an invitation." } });
});
// POST /api/v1/auth/forgot-password
authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const email = (req.body?.email || "").toLowerCase().trim();
    res.status(200).json({
      success: true,
      message: `Password reset instructions have been dispatched to ${email || "your email"}.`,
      demoNote: "For instant demo evaluation, you can sign in with password 'Onboard!ng2026'.",
    });
  } catch (e) {
    next(e);
  }
});
// POST /api/v1/auth/login
authRouter.post(
  "/login",
  loginLimiter,
  validate({ body: LoginRequestSchema }),
  async (req, res, next) => {
    try {
      if (isProd) throw unauthenticated("Use organization SSO to sign in");
      const { email, password } = req.body as {
        email: string;
        password: string;
      };
      const session = await auth.login(email, password, meta(req));
      setRefreshCookie(res, session.refreshToken);
      res.status(200).json(session);
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/auth/refresh
authRouter.post(
  "/refresh",
  validate({ body: RefreshRequestSchema }),
  async (req, res, next) => {
    try {
      const fromBody = (req.body as { refreshToken?: string }).refreshToken;
      const fromCookie = (req.cookies as Record<string, string> | undefined)?.[
        REFRESH_COOKIE
      ];
      const token = fromBody ?? fromCookie;
      if (!token)
        throw unauthenticated("No refresh token supplied", "TOKEN_INVALID");

      const tokens = await auth.refresh(token, meta(req));
      setRefreshCookie(res, tokens.refreshToken);
      res.status(200).json(tokens);
    } catch (e) {
      next(e);
    }
  },
);
// POST /api/v1/auth/logout
authRouter.post(
  "/logout",
  authenticate,
  validate({ body: LogoutRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const fromCookie = (req.cookies as Record<string, string> | undefined)?.[
        REFRESH_COOKIE
      ];
      const { allDevices } = req.body as { allDevices: boolean };
      await auth.logout(actor.userId, fromCookie, allDevices, meta(req));
      res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      res
        .status(200)
        .json({ message: allDevices ? "Signed out everywhere" : "Signed out" });
    } catch (e) {
      next(e);
    }
  },
);
// GET /api/v1/auth/me
authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const actor = requireAuth(req);
    res.status(200).json(await auth.getMe(actor.userId));
  } catch (e) {
    next(e);
  }
});
// POST /api/v1/auth/change-password
authRouter.post(
  "/change-password",
  authenticate,
  validate({ body: ChangePasswordRequestSchema }),
  async (req, res, next) => {
    try {
      const actor = requireAuth(req);
      const { currentPassword, newPassword } = req.body as {
        currentPassword: string;
        newPassword: string;
      };
      await auth.changePassword(
        actor.userId,
        currentPassword,
        newPassword,
        meta(req),
      );
      res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
      res
        .status(200)
        .json({
          message: "Password changed. All other sessions have been signed out.",
        });
    } catch (e) {
      next(e);
    }
  },
);
