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
  /** Numeric league edition, e.g. 5 for Raging Echoes, 6 for Demonic Pacts */
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
   * (`taskType` field), e.g. "LEAGUE_5", "LEAGUE_6".
   */
  pluginTaskType: string;
  /**
   * Whether this league's dataset uses temporary/community struct IDs rather
   * than official cache-backed identities.
   *
   * When true:
   *   - the `structId` values in the dataset are transitional and MAY change on
   *     release day when the official cache data becomes available.
   *   - the `taskKey` field on each task is the stable cross-site identity anchor.
   *   - route items, shares, and plugin exports should be treated as transitional:
   *     valid now, migratable later using taskKey.
   *
   * Set to false (or omit) once official IDs are confirmed.
   */
  transitional?: boolean;
}

// ── Current league ────────────────────────────────────────────────────────────
//
// LEAGUE 6 TRANSITIONAL MODE
// This dataset uses temporary/community struct IDs scraped from the wiki before
// the official game cache data is available. These IDs are stable for now and
// are used by other community sites too — do NOT remap them.
//
// Release-day migration: when official IDs are confirmed:
//   1. Replace LEAGUE_6.full.json with the official scraper output.
//   2. Set transitional: false (or remove the flag).
//   3. Use the taskKey field on each task to map old route items → new IDs.
//   4. Update pluginTaskType if the plugin uses a different string.
//
// To switch leagues: update id, name, slug, dataFile, and pluginTaskType together.

export const CURRENT_LEAGUE: LeagueConfig = {
  id:             6,
  name:           'Demonic Pacts',
  slug:           'demonic-pacts',
  dataFile:       'LEAGUE_6.full.json',
  pluginTaskType: 'LEAGUE_6',
  transitional:   true,
};

/**
 * Previous league — kept as a reference so backwards-compat code can check
 * whether a route's taskType belongs to the previous season.
 */
export const PREVIOUS_LEAGUE: LeagueConfig = {
  id:             5,
  name:           'Raging Echoes',
  slug:           'raging-echoes',
  dataFile:       'LEAGUE_5.full.json',
  pluginTaskType: 'LEAGUE_5',
};
