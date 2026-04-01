import express from 'express';
import cors from 'cors';
import { tasksRouter } from './routes/tasks';
import { wikiSyncRouter } from './routes/wikiSync';

export function createApp() {
  const app = express();

  app.use(cors({ origin: 'http://localhost:5173' }));
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/tasks', tasksRouter);
  app.use('/api/wikisync', wikiSyncRouter);

  return app;
}
