import { Router, Request, Response } from 'express';
import { getAllTasks } from '../services/taskService';

export const tasksRouter = Router();

/**
 * GET /api/tasks
 * Returns all known tasks.
 * Query params:
 *   difficulty?: string
 *   skill?: string
 *   region?: string
 */
tasksRouter.get('/', (_req: Request, res: Response) => {
  const tasks = getAllTasks();
  res.json(tasks);
});

/**
 * GET /api/tasks/:id
 */
tasksRouter.get('/:id', (req: Request, res: Response) => {
  const tasks = getAllTasks();
  const task = tasks.find((t) => t.id === req.params['id']);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});
