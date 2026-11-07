import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { badRequest, zodFieldErrors } from "../lib/errors.js";

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Parses and REPLACES req.body / req.query / req.params with the parsed value,
 * so handlers receive coerced, defaulted, typed data rather than raw strings.
 * This is the same Zod schema the OpenAPI document is generated from, so the
 * published contract and the runtime check can never disagree.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ["params", "query", "body"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(
          badRequest(
            `Request ${key} failed validation`,
            zodFieldErrors(result.error),
          ),
        );
      }
      Object.defineProperty(req, key, {
        value: result.data,
        writable: true,
        configurable: true,
      });
    }
    next();
  };
}

/** Typed helpers so handlers can read parsed values without casting. */
export const body = <T extends z.ZodTypeAny>(req: Request): z.infer<T> =>
  req.body;
export const query = <T extends z.ZodTypeAny>(req: Request): z.infer<T> =>
  req.query as z.infer<T>;
