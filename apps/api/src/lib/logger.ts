import pino from "pino";
import { env, isProd } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isProd
    ? {}
    : { transport: { target: "pino/file", options: { destination: 1 } } }),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.newPassword",
      "req.body.currentPassword",
      "req.body.refreshToken",
      "req.body.bankAccountNumber",
      "req.body.nationalId",
      "req.body.contentBase64",
      'res.headers["set-cookie"]',
    ],
    censor: "[redacted]",
  },
  base: { service: "eo-api" },
});
