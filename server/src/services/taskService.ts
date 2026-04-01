import type { Task } from '../types/task';

/**
 * Task service — currently returns a static list.
 * Replace with database / wiki-sync logic in a later iteration.
 */

const TASKS: Task[] = [
  {
    id: 'task-001',
    name: 'Catch a trout',
    description: 'Catch a trout.',
    difficulty: 'Easy',
    skill: 'Fishing',
    regions: ['Kandarin'],
    points: 10,
    wikiSlug: 'Trout',
  },
  {
    id: 'task-002',
    name: 'Complete a Slayer task',
    description: 'Complete any Slayer assignment.',
    difficulty: 'Easy',
    skill: 'Slayer',
    regions: ['Global'],
    points: 10,
    wikiSlug: 'Slayer',
  },
];

export function getAllTasks(): Task[] {
  return TASKS;
}
