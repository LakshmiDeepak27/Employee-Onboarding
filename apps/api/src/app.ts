import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { prisma, setDatabaseOnline } from "./db/client.js";
import { AppError } from "./lib/errors.js";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "@eo/contracts";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./auth/routes.js";
import { opsRouter } from "./routes/ops.js";
import { adminRouter } from "./routes/admin.js";
import { referenceRouter } from "./routes/reference.js";
import { employeesRouter } from "./routes/employees.js";
import { jobsRouter } from "./routes/jobs.js";
import { plansRouter } from "./routes/plans.js";
import { tasksRouter } from "./routes/tasks.js";
import { policiesRouter, clausesRouter } from "./routes/policies.js";
import { escalationsRouter } from "./routes/escalations.js";
import { workflowRouter } from "./routes/workflowServices.js";
import { chatRouter } from "./routes/chat.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    helmet({
      // Swagger UI needs inline styles.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
      exposedHeaders: ["x-request-id"],
    }),
  );
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as express.Request).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: {
        ignore: (req) => req.url === "/healthz" || req.url === "/metrics",
      },
    }),
  );
  app.use("/", opsRouter);
  const openApiDocument = buildOpenApiDocument();
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "Employee Onboarding API",
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
      },
    }),
  );
  // Fail closed: API requests require durable storage, never synthetic fallback records.
  app.use("/api/v1", async (_req, _res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      setDatabaseOnline(true);
      next();
    } catch {
      next(
        new AppError(
          503,
          "UPSTREAM_UNAVAILABLE",
          "Database unavailable. Please retry when the service is restored.",
          { expose: true },
        ),
      );
    }
  });
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/employees", employeesRouter);
  app.use("/api/v1/jobs", jobsRouter);
  app.use("/api/v1/plans", plansRouter);
  app.use("/api/v1/tasks", tasksRouter);
  app.use("/api/v1/policies", policiesRouter);
  app.use("/api/v1/clauses", clausesRouter);
  app.use("/api/v1/escalations", escalationsRouter);
  app.use("/api/v1", workflowRouter);
  app.use("/api/v1", referenceRouter);
  app.use("/api/v1", chatRouter);
  const webDistPath = fs.existsSync(path.resolve(process.cwd(), "apps/web/dist"))
    ? path.resolve(process.cwd(), "apps/web/dist")
    : path.resolve(process.cwd(), "../web/dist");
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get("*", (req, res, next) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/docs") ||
        req.path === "/openapi.json" ||
        req.path === "/healthz" ||
        req.path === "/metrics"
      ) {
        return next();
      }
      res.sendFile(path.join(webDistPath, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
