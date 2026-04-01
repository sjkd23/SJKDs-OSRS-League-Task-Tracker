import type { RichPart } from './richPart';

// Re-export so callers that only touch the scraper types can still reach it.
export type { RichPart } from './richPart';

/**
 * Raw task shape as output by the full-task-scraper (*.full.json).
 *
 * This type exists only at the data-import boundary and must not be used
 * directly in UI components. Call `mapScraperTask` to convert to AppTask.
 *
 * Matches the enriched ITaskFull shape produced by the local scraper fork.
 * Plain-text fields (`name`, `description`, `wikiNotes`) are always present.
 * Rich-text `*Parts` fields are additive — absent on older scraper output.
 */
export interface ScraperTask {
  structId: number;
  sortId: number;
  name: string;
  description: string;
  area: string;
  category: string;
  /**
   * League skill category, e.g. "All", "Combat", "Artisan", "Gathering",
   * "Support", "Unlocked". May be null when not set in the game cache.
   * This is NOT an individual OSRS skill — it is a high-level task grouping.
   */
  skill: string | null;
  /** Numeric tier: 1 = Easy, 2 = Medium, 3 = Hard, 4 = Elite, 5 = Master */
  tier: number;
  /** String version of the tier, e.g. "Easy". Preferred over numeric tier. */
  tierName: string;
  /** Global completion percentage (0–100). Optional — may be absent. */
  completionPercent?: number;
  /**
   * Prerequisite skills as objects from the scraper.
   * Each entry has an UPPERCASE skill name and a required level.
   * e.g. { skill: "DEFENCE", level: 40 }
   * Optional — absent on tasks with no skill requirements.
   */
  skills?: { skill: string; level: number }[];
  /** Raw requirement notes from the wiki page. Optional. */
  wikiNotes?: string;
  /** Full wiki URL if available in the scraper output */
  wikiUrl?: string;

  // ─── Enriched rich-text fields (additive, scraper fork output) ──────────

  /**
   * Rich-text decomposition of the task name from the wiki HTML.
   * Absent when not produced by the enriched scraper.
   */
  nameParts?: RichPart[];
  /**
   * Rich-text decomposition of the task description from the wiki HTML.
   * Absent when not produced by the enriched scraper.
   */
  descriptionParts?: RichPart[];
  /**
   * Rich-text decomposition of the requirements cell from the wiki HTML.
   * Absent when not produced by the enriched scraper, or when there are no
   * requirements.
   */
  requirementsParts?: RichPart[];
}

/**
 * Shape of the leagues.json index file that lists available league datasets.
 * To be fetched at app startup once real data is available.
 */
export interface LeagueEntry {
  id: number;
  name: string;
  /** URL-safe slug, e.g. "demonic-pacts" */
  slug: string;
  /** Filename of the full task JSON, e.g. "league6.full.json" */
  dataFile: string;
}
