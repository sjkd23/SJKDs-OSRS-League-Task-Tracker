import type { RichPart } from './richPart';

// Re-export so the broader app only needs to import from task.ts.
export type { RichPart } from './richPart';

// ─── Tier ─────────────────────────────────────────────────────────────────────

export type Tier = 'Easy' | 'Medium' | 'Hard' | 'Elite' | 'Master';

// Alias kept so any remaining Difficulty references still compile
export type Difficulty = Tier;

// ─── App Task Model ───────────────────────────────────────────────────────────

/**
 * The normalised, app-facing representation of a single league task.
 *
 * This is what every UI component consumes. It is derived from scraper data
 * via `mapScraperTask` and must never contain user-interaction state.
 * User state (completed / todo / favourite) lives in TaskUserState.
 */
export interface AppTask {
  /** Stable id: `task-${structId}-${sortId}` */
  id: string;
  /** Numeric struct ID from scraper output */
  structId: number;
  /** Numeric sort index from scraper output */
  sortId: number;

  /** Display area / region, e.g. "Global", "Morytania", "Varlamore" */
  area: string;
  /** Short task name, e.g. "Chop Some Logs" */
  name: string;
  /** Full task instruction shown in the Task column, e.g. "Chop any kind of logs" */
  description: string;
  /** Broad category, e.g. "Skilling", "Combat", "Questing" */
  category: string;
  /** Primary skill tag, e.g. "Woodcutting", "General" */
  skill: string;

  /** Difficulty tier */
  tier: Tier;
  /**
   * Display tier name — mirrors `tier` but kept as a separate string field
   * so scraper tierName overrides are preserved if they ever diverge.
   */
  tierName: string;
  /** League points awarded for completing this task */
  points: number;

  /** Global completion percentage from scraper (0–100). Not displayed yet. */
  completionPercent: number;
  /** All skills relevant to this task (may be empty array) */
  skills: string[];
  /** Raw notes from the wiki page */
  wikiNotes: string;

  // ─── Derived display fields ──────────────────────────────────────────────

  /**
   * Display-ready requirements string shown in the Requirements column.
   * Derived from wikiNotes → skills → "—" in that priority order.
   */
  requirementsText: string;
  /**
   * Display-ready points label shown in the Pts column, e.g. "Easy – 10".
   * Structured so numeric points can be swapped later without touching UI.
   */
  ptsLabel: string;
  /** Full wiki URL, e.g. "https://oldschool.runescape.wiki/w/Chop_Some_Logs" */
  wikiUrl?: string;

  // ─── Rich-text rendering fields (additive) ──────────────────────────────

  /**
   * Rich-text parts for the task name, when available from the enriched
   * scraper output. Render with `<RichText>`. Falls back to `name`.
   */
  nameParts?: RichPart[];
  /**
   * Rich-text parts for the task description, when available.
   * Falls back to `description`.
   */
  descriptionParts?: RichPart[];
  /**
   * Rich-text parts for the requirements cell, when available.
   * Falls back to the existing `requirementsText` / skill-icon parsing.
   */
  requirementsParts?: RichPart[];
}

// ─── User Interaction State ───────────────────────────────────────────────────

/**
 * Per-task state owned by the local user. Stored and persisted separately
 * from task content so task data can be refreshed from the scraper without
 * losing user progress.
 */
export interface TaskUserState {
  completed: boolean;
  isTodo: boolean;
}

export const DEFAULT_USER_STATE: Readonly<TaskUserState> = {
  completed: false,
  isTodo: false,
};

/**
 * Convenience merged shape used only in the presentation layer.
 * The store produces TaskView[] by merging AppTask + TaskUserState.
 */
export type TaskView = AppTask & TaskUserState;

// ─── Filter State ─────────────────────────────────────────────────────────────

export interface TaskFilters {
  /** Selected difficulty tiers — empty array means "all" */
  tiers: Tier[];
  /** Selected skill names — empty array means "all" */
  skills: string[];
  /** Selected area/region names — empty array means "all" */
  areas: string[];
  showCompleted: boolean;
  showOnlyCompleted: boolean;
  showTodoOnly: boolean;
}

// ─── Sort State ───────────────────────────────────────────────────────────────

export type SortField = 'name' | 'tier' | 'skill' | 'area' | 'points' | 'description' | 'completionPercent' | 'isTodo';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}
