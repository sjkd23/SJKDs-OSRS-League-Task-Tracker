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
  /**
   * Area/region the task belongs to, e.g. "Global", "Morytania", "Varlamore".
   * May be null on unmatched placeholder entries produced by the merge pipeline
   * (`_enrichmentStatus: "unmatched"`). mapScraperTasks filters these out before
   * they reach the app, so UI code can always assume a non-null string.
   */
  area: string | null;
  /**
   * Broad task category. In older scraper output this is a string (e.g. "Combat", "Skill",
   * "Quest") or null. In League 6+ scraper output this is a numeric enum value — use the
   * companion `categoryName` string field when present.
   * Normalised to "Other" by mapScraperTask when null or unresolvable.
   */
  category: string | number | null;
  /**
   * Human-readable category name corresponding to the numeric `category` enum.
   * Present in League 6+ scraper output, e.g. "Skill", "Combat", "Quest".
   * Takes precedence over numeric `category` in mapScraperTask.
   */
  categoryName?: string;
  /**
   * League skill category, e.g. "All", "Combat", "Artisan", "Gathering",
   * "Support", "Unlocked". May be null when not set in the game cache.
   * This is NOT an individual OSRS skill — it is a high-level task grouping.
   */
  skill: string | null;
  /**
   * Wiki-derived stable fallback key, present in transitional League 6 data.
   * Format: "wiki:fallback:{sortId}:{slug}", e.g. "wiki:fallback:0:defeat-a-troll-in-asgarnia".
   * Acts as a cross-site interoperability anchor that does not depend on
   * the final official struct IDs. Absent in League 5 and earlier data.
   *
   * Migration seam: on release day, the official struct IDs replace the temporary ones;
   * taskKey survives as a stable mapping key between old routes and new IDs.
   */
  taskKey?: string;
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
