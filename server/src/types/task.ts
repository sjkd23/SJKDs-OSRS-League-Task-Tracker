/**
 * Shared Task type for the server layer.
 * Mirrors the client-side Task model — keep in sync manually
 * until a shared package is introduced.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Elite' | 'Master';
export type Region = string;
export type Skill = string;

export interface Task {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  skill: Skill;
  regions: Region[];
  points: number;
  wikiSlug?: string;
}
