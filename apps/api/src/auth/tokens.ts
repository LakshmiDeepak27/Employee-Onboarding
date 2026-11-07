import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError, unauthenticated } from "../lib/errors.js";

export interface AccessClaims {
  sub: string;
  email: string;
  eid: string | null;
  roles: string[];
  /** Must match users.token_version, else the token is dead. */
  tv: number;
  typ: "access";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface RefreshClaims {
  sub: string;
  /** Rotation family. Reuse of a rotated token kills the whole family. */
  fam: string;
  typ: "refresh";
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const base: SignOptions = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  algorithm: "HS256",
};

export function signAccessToken(input: {
  userId: string;
  email: string;
  employeeId: string | null;
  roles: string[];
  tokenVersion: number;
}): { token: string; jti: string; expiresInSeconds: number } {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      email: input.email,
      eid: input.employeeId,
      roles: input.roles,
      tv: input.tokenVersion,
      typ: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      ...base,
      subject: input.userId,
      jwtid: jti,
      expiresIn: env.JWT_ACCESS_TTL,
    } as SignOptions,
  );
  const decoded = jwt.decode(token) as { exp: number; iat: number };
  return { token, jti, expiresInSeconds: decoded.exp - decoded.iat };
}

export function signRefreshToken(input: { userId: string; familyId: string }): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { fam: input.familyId, typ: "refresh" },
    env.JWT_REFRESH_SECRET,
    {
      ...base,
      subject: input.userId,
      jwtid: jti,
      expiresIn: env.JWT_REFRESH_TTL,
    } as SignOptions,
  );
  const decoded = jwt.decode(token) as { exp: number };
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

function verify<T>(
  token: string,
  secret: string,
  expectedType: "access" | "refresh",
): T {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) {
      throw unauthenticated("Token has expired", "TOKEN_EXPIRED");
    }
    throw unauthenticated("Token is invalid", "TOKEN_INVALID");
  }
  const claims = payload as { typ?: string };
  if (claims.typ !== expectedType) {
    // Stops a refresh token being presented as a bearer token and vice versa.
    throw unauthenticated(`Expected a ${expectedType} token`, "TOKEN_INVALID");
  }
  return payload as T;
}

export const verifyAccessToken = (t: string) =>
  verify<AccessClaims>(t, env.JWT_ACCESS_SECRET, "access");
export const verifyRefreshToken = (t: string) =>
  verify<RefreshClaims>(t, env.JWT_REFRESH_SECRET, "refresh");

/**
 * Refresh tokens are stored only as a hash, so a database leak does not hand
 * an attacker usable sessions.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newFamilyId(): string {
  return crypto.randomUUID();
}

export function assertNotExpired(expiresAt: Date): void {
  if (expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "TOKEN_EXPIRED", "Refresh token has expired");
  }
}
