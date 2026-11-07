import rateLimit from "express-rate-limit";

function limiter(limit: number, windowMs: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message,
          timestamp: new Date().toISOString(),
        },
      });
    },
  });
}

export const authRateLimit = limiter(
  120,
  15 * 60_000,
  "Too many authentication requests. Wait a few minutes and try again.",
);

export const inviteRateLimit = limiter(
  12,
  60 * 60_000,
  "Too many invitations were requested. Try again later.",
);

export const planGenerationRateLimit = limiter(
  10,
  15 * 60_000,
  "Too many plan generations were requested. Wait a few minutes and try again.",
);

export const uploadRateLimit = limiter(
  30,
  15 * 60_000,
  "Too many document uploads were requested. Wait a few minutes and try again.",
);
