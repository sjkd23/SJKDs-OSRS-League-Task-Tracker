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
  /**
   * Filename of the preliminary→real structId mappings file under client/public/data/.
   * Only present when `transitional` is true. When set, the app loads this file
   * at startup and uses it to remap stored preliminary struct IDs to official ones
   * in route items, tracker state, and plugin imports.
   */
  mappingsFile?: string;
}

// ── Current league ────────────────────────────────────────────────────────────
//
// LEAGUE 6 — FINAL DATASET
// LEAGUE_6.full.json is the merged final dataset produced after the real struct
// IDs were confirmed from the game cache.  The merged file contains 1592 tasks
// (area-specific + global), all with official struct IDs in the 6807–15403
// range.  Preliminary/community IDs are no longer used.
//
// Stored user state from the transitional 689-task dataset is automatically
// remapped at startup via struct-ID lookup (same structIds, new sortIds).
// No manual storage clearing is required.
//
// To switch leagues: update id, name, slug, dataFile, and pluginTaskType together.

export const CURRENT_LEAGUE: LeagueConfig = {
  id:             6,
  name:           'Demonic Pacts',
  slug:           'demonic-pacts',
  dataFile:       'LEAGUE_6.full.json',
  pluginTaskType: 'LEAGUE_6',
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
