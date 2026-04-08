/**
 * leagueConfig.ts
 *
 * Single source of truth for the current league identity on the client.
 *
 * When the next league arrives, update CURRENT_LEAGUE here and the rest
 * of the app picks it up automatically — the page title and data file
 * are both derived here.
 */

export interface LeagueConfig {
  /** Numeric league edition, e.g. 5 for Raging Echoes */
  id: number;
  /** Display name shown in page headings */
  name: string;
  /** URL-safe slug, e.g. "raging-echoes" */
  slug: string;
  /**
   * Filename of the task dataset under client/public/data/.
   */
  dataFile: string;
  /**
   * Task type identifier as written in the Tasks Tracker plugin export JSON
   * (`taskType` field), e.g. "LEAGUE_5".
   */
  pluginTaskType: string;
}

// ── Current league ────────────────────────────────────────────────────────────
//
// Update this object when a new league launches.
// Swap id, name, slug, wikiTasksUrl, and dataFile together.

export const CURRENT_LEAGUE: LeagueConfig = {
  id:             5,
  name:           'Raging Echoes',
  slug:           'raging-echoes',
  dataFile:       'LEAGUE_5.full.json',
  pluginTaskType: 'LEAGUE_5',
};
