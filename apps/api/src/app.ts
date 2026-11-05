import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '@eo/contracts';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './auth/routes.js';
import { opsRouter } from './routes/ops.js';
import { adminRouter } from './routes/admin.js';
import { referenceRouter } from './routes/reference.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    helmet({
      // Swagger UI needs inline styles.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as express.Request).requestId,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/metrics' },
    }),
  );

  // --- operations (unauthenticated) ---------------------------------------
  app.use('/', opsRouter);

  // --- API documentation ---------------------------------------------------
  const openApiDocument = buildOpenApiDocument();
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Employee Onboarding API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true },
    }),
  );

  // --- API v1 --------------------------------------------------------------
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1', referenceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
