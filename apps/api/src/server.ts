import express from 'express';
import cors from 'cors';
import { benefitsRouter } from './routes/benefits.js';

const app = express();
app.use(cors());
app.use(express.json());

// Mount Benefits Service routes
app.use('/api/v1', benefitsRouter);

// Operational endpoints
app.get('/healthz', (_req, res) => res.json({ status: 'OK', service: 'benefits-workflow' }));
app.get('/readyz', (_req, res) =>
  res.json({
    status: 'READY',
    database: 'CONNECTED',
    aiProvider: process.env.GEMINI_API_KEY ? 'GEMINI_LIVE' : 'BASELINE_FALLBACK',
  })
);

const PORT = Number(process.env.PORT) || 4000;

export function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Benefits Service running at http://localhost:${PORT}`);
    console.log(`📋 Available Plans: GET http://localhost:${PORT}/api/v1/benefits/plans`);
    console.log(`📑 Work Queue: GET http://localhost:${PORT}/api/v1/benefits/enrollments`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
