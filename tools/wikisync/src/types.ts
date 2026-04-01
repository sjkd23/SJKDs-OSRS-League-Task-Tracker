// ─── WikiSync scraper output types ───────────────────────────────────────────
//
// These types describe the JSON this tool produces from a single scrape run.
// They are NOT the app's internal task/user-state types — see the mapper stub
// (mapToTracker.ts) for how to convert from here to tracker state.

// ── Per-task entry, as extracted from the rendered wiki page ─────────────────

export interface WikiSyncTask {
  /**
   * Task name as it appears in the wiki table cell (plain text).
   * Trimmed of whitespace. This is the primary identifier when no id attr exists.
   */
  name: string;

  /**
   * Resolved app task id ("task-<structId>-<sortId>").
   * Present only when the task name could be matched against the local dataset.
   * null means no match was found — the name may be slightly different on the wiki.
   */
  appId: string | null;

  /**
   * Raw structId from local dataset (if matched). Useful for direct lookups.
   */
  structId: number | null;

  /**
   * Whether WikiSync marked this task as completed for the given username.
   */
  completed: boolean;

  /**
   * The tier/difficulty string as read from the wiki row, e.g. "Easy", "Hard".
   * May be null if the column was not found.
   */
  tier: string | null;

  /**
   * The region/area string as read from the wiki row, e.g. "Asgarnia".
   * May be null if the column was not found.
   */
  area: string | null;

  /**
   * All raw class names found on the <tr> element for this task row.
   * Included so you can inspect what DOM markers were actually present.
   */
  rowClasses: string[];

  /**
   * Raw inline style on the <tr>, if any. e.g. "background-color: #d4efdf"
   * Included for debugging — colour-based completion is fragile.
   */
  rowStyle: string | null;
}

// ── Top-level import produced by one scrape run ───────────────────────────────

export interface WikiSyncImport {
  /** The username that was searched. */
  username: string;

  /** The full wiki URL that was scraped. */
  sourcePage: string;

  /** ISO timestamp of when the scrape completed. */
  syncedAt: string;

  /**
   * Whether the WikiSync personalisation UI appeared to activate for this username.
   * false means the scraper timed out waiting for it, or the search box was not found.
   */
  personalisationSucceeded: boolean;

  /**
   * Reason personalisation is considered to have failed or succeeded.
   * Always set; gives a one-line explanation of the confidence level.
   */
  personalisationNote: string;

  /**
   * The DOM selector or attribute strategy that was used to detect completed tasks.
   * Included so you know exactly how brittle this is.
   */
  completionDetectionMethod: string;

  /**
   * Overall completion percentage as displayed on the wiki page.
   * null if the element was not found or could not be parsed.
   */
  completionPercent: number | null;

  /**
   * Raw text of the completion percentage element, for debugging.
   */
  completionPercentRaw: string | null;

  /**
   * Unlocked areas/regions, if visible on the page after personalisation.
   * Empty array if not found — the wiki may not expose this in the task list DOM.
   */
  unlockedAreas: string[];

  /**
   * All task rows found in the table, with their completion state.
   */
  tasks: WikiSyncTask[];

  /**
   * task.appId values for every task where completed === true and appId is not null.
   * Convenience set for the mapper / storage import.
   */
  completedTaskIds: string[];

  /**
   * Names of completed tasks where no appId match was found.
   * Useful to diagnose name-mismatch issues.
   */
  completedUnmatchedNames: string[];

  /**
   * Miscellaneous summary stats.
   */
  summary: {
    totalTasksFound: number;
    completedTasksFound: number;
    matchedToAppId: number;
    unmatchedNames: number;
  };

  /**
   * Any extra key–value data that didn't fit a typed field.
   * Added during discovery runs or future schema additions.
   */
  rawExtra: Record<string, unknown>;
}

// ── Local dataset task record (minimal shape used by the mapper) ──────────────

export interface LocalTask {
  structId: number;
  sortId: number;
  name: string;
  area: string;
  tierName: string;
}
