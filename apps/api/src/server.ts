import express from 'express';
import cors from 'cors';
import { benefitsRouter } from './routes/benefits.js';
import { trainingRouter } from './routes/training.js';

const app = express();
app.use(cors());
app.use(express.json());

// Mount Workflow Services routes (Services 4 & 5)
app.use('/api/v1', benefitsRouter);
app.use('/api/v1', trainingRouter);

// Operational endpoints
app.get('/healthz', (_req, res) =>
  res.json({ status: 'OK', services: ['benefits-workflow', 'training-workflow'] })
);
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
    console.log(`🚀 Workflow Services running at http://localhost:${PORT}`);
    console.log(`📋 Benefits Plans: GET http://localhost:${PORT}/api/v1/benefits/plans`);
    console.log(`📚 Training Courses: GET http://localhost:${PORT}/api/v1/training/courses`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
