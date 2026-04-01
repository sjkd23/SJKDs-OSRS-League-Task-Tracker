/**
 * leagueConfig.ts
 *
 * Single source of truth for the current league identity on the client.
 *
 * When the next league arrives (Demonic Pacts or later), update
 * CURRENT_LEAGUE here and the rest of the app picks it up automatically —
 * the page title, WikiSync target URL, and data file are all derived here.
 */

export interface LeagueConfig {
  /** Numeric league edition, e.g. 5 for Raging Echoes */
  id: number;
  /** Display name shown in page headings */
  name: string;
  /** URL-safe slug, e.g. "raging-echoes" */
  slug: string;
  /**
   * Full URL of the OSRS Wiki league tasks page.
   * Used as the target for WikiSync automation.
   */
  wikiTasksUrl: string;
  /**
   * Filename of the task dataset under client/public/data/.
   * Passed to the server so it knows which JSON to resolve IDs against.
   */
  dataFile: string;
}

// ── Current league ────────────────────────────────────────────────────────────
//
// Update this object when a new league launches.
// Swap id, name, slug, wikiTasksUrl, and dataFile together.

export const CURRENT_LEAGUE: LeagueConfig = {
  id:           5,
  name:         'Raging Echoes',
  slug:         'raging-echoes',
  wikiTasksUrl: 'https://oldschool.runescape.wiki/w/Leagues_V:_Raging_Echoes/Tasks',
  dataFile:     'LEAGUE_5.full.json',
};
