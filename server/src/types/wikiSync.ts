// ─── WikiSync API types ────────────────────────────────────────────────────────
//
// These types describe what the server accepts and returns for the
// POST /api/wikisync/lookup endpoint.  They are NOT the same as the standalone
// PoC types in tools/wikisync/src/types.ts — this is a trimmed, API-focused
// version that the client can import/mirror easily.

// ── Request ───────────────────────────────────────────────────────────────────

export interface WikiSyncLookupRequest {
  /** OSRS player name to look up. */
  username: string;
  /**
   * Full wiki URL of the league tasks page to scrape.
   * If omitted the server falls back to the configured default.
   */
  wikiUrl?: string;
  /**
   * When true, emit extra diagnostic logging server-side.
   * Never changes the response shape – only adds stdout output.
   */
  debug?: boolean;
  /**
   * When true, launch Chromium in a visible window instead of headless.
   * For local debugging only; ignored when running in production.
   */
  headed?: boolean;
}

// ── Response ──────────────────────────────────────────────────────────────────

export interface WikiSyncImportResult {
  /** The username that was looked up. */
  username: string;
  /** Full wiki URL that was scraped. */
  sourcePage: string;
  /** ISO 8601 timestamp of when the scrape completed. */
  syncedAt: string;
  /**
   * Whether the overall operation succeeded enough to trust the data.
   * false if the page could not be loaded, the input was not found, or
   * personalisation timed out completely.
   */
  success: boolean;
  /** Whether the wiki's WikiSync gadget appeared to activate for this username. */
  personalisationSucceeded: boolean;
  /** Human-readable explanation of the personalisation outcome. */
  personalisationNote: string;
  /**
   * Which DOM strategy was used to identify completed tasks.
   * e.g. "CSS class .wikisync-complete on <tr> elements"
   */
  completionDetectionMethod: string;
  /** Overall completion percentage as shown on the wiki page, or null if not found. */
  completionPercent: number | null;
  /** Raw text of the completion element for debugging. */
  completionPercentRaw: string | null;
  /**
   * App task IDs (task-<structId>-<sortId>) that were marked complete on the wiki.
   * These map directly into the client's task store.
   */
  completedTaskIds: string[];
  /**
   * Plain names of all completed tasks (for UI display and debugging).
   */
  completedTaskNames: string[];
  /**
   * Plain names of completed tasks that could not be matched to a local app ID.
   * Non-empty means the wiki and local dataset diverged — watch these on release day.
   */
  completedUnmatchedNames: string[];
  /**
   * Unlocked region/area names if the wiki surfaced them.
   * Expected to be [] — the task-list page does not expose this data.
   */
  unlockedAreas: string[];
  /** Informational notes collected during the scrape. */
  notes: string[];
  /** Aggregate counts for the UI summary display. */
  summary: {
    totalTasksFound: number;
    completedTasksFound: number;
    matchedToAppId: number;
    unmatchedNames: number;
  };
  /** Extra diagnostic key–value pairs. Always present but may be empty. */
  rawExtra: Record<string, unknown>;
}
