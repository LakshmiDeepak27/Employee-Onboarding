import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma, isDatabaseConnectivityError, databaseUnavailableError } from "../db/client.js";
import { AppError, zodFieldErrors } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { isProd } from "../config/env.js";

/** Translates anything thrown in a handler into the standard error envelope. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(
      400,
      "VALIDATION_FAILED",
      "Request failed validation",
      {
        fields: zodFieldErrors(err),
      },
    );
  } else if (isDatabaseConnectivityError(err)) {
    appError = databaseUnavailableError(err);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        const target =
          (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
        appError = new AppError(
          409,
          "CONFLICT",
          `A record with that ${target} already exists`,
        );
        break;
      }
      case "P2025":
        appError = new AppError(404, "NOT_FOUND", "Resource not found");
        break;
      case "P2003":
        appError = new AppError(
          409,
          "CONFLICT",
          "Referenced record does not exist",
        );
        break;
      default:
        appError = new AppError(500, "INTERNAL_ERROR", "Database error", {
          cause: err,
          expose: false,
        });
    }
  } else {
    appError = new AppError(500, "INTERNAL_ERROR", "Something went wrong", {
      cause: err,
      expose: false,
    });
  }

  const log = logger.child({
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });
  if (appError.status >= 500) {
    log.error({ err, code: appError.code }, appError.message);
  } else {
    log.warn({ code: appError.code }, appError.message);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message:
        appError.expose || !isProd ? appError.message : "Something went wrong",
      ...(appError.fields ? { fields: appError.fields } : {}),
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

/** 404 fall-through for unmatched routes. */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}
