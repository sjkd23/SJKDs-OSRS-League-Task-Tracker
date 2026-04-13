/**
 * Route export schema.
 * Shaped to match the OSRS League task tracker plugin JSON format.
 *
 * Phase 2+: build export, import, multi-section editing, and per-item notes
 * on top of these types without changing the core shape.
 */

/**
 * World-map coordinates for a route step.
 * Stored on RouteItem and preserved across plugin import/export and share links.
 */
export interface RouteLocation {
  x: number;
  y: number;
  plane: number;
}

/** A single task reference within a route section. */
export interface RouteItem {
  /**
   * Stable task id from AppTask.id for real tasks.
   * Format: "task-{structId}-{sortId}" — the structId and sortId are always
   * recoverable from this string even if the task no longer resolves.
   * For custom tasks (isCustom === true) this is a locally-generated UUID
   * used purely as a stable dnd-kit / React key — it has no game meaning.
   */
  taskId: string;
  /**
   * Stable per-entry identity used for DnD ordering and future map-marker sync.
   * Distinct from taskId — allows the same task to appear more than once in a
   * route (future feature) and gives map pins a stable anchor.
   * Always present after the migration pass in useRouteStore; assigned by every
   * store mutation and import parser that creates new RouteItems.
   */
  routeItemId: string;
  /** Optional annotation visible in the plugin. */
  note?: string;
  /**
   * Source section name preserved during import.
   * Used only as display metadata for section header rows in the planner UI.
   * All items remain in sections[0] internally for simplified DnD management.
   */
  sectionName?: string;
  /**
   * Optional world-map location for this route step.
   * Preserved across plugin import/export and share encode/decode (v3+).
   * Map UI (Phase 2+): full pin editing on top of this stored coordinate.
   */
  location?: RouteLocation;

  // ─── Identity snapshot (migration seam) ────────────────────────────────
  /**
   * Snapshot of task identity at the time the item was added to the route.
   * Present on real (non-custom) tasks when populated by the caller.
   *
   * Purpose: preserves enough context to:
   *   1. Display a meaningful fallback row if the task no longer resolves
   *      (e.g. cross-league routes, incomplete transitional datasets).
   *   2. Map old temporary League 6 struct IDs → official IDs on release day
   *      using the taskKey field.
   *
   * Do NOT depend on this field being present — it is additive and may be absent
   * on items created before this field was introduced.
   */
  _snap?: {
    /** Display name at time of creation — used in unresolved fallback rows. */
    name: string;
    /** structId at time of creation. May be temporary (League 6 transitional). */
    structId: number;
    /** sortId at time of creation. Stable within a single league dataset. */
    sortId: number;
    /**
     * Wiki-fallback stable key (League 6+). Absent for earlier leagues.
     * Release-day migration: use this key to map old route items to official IDs.
     */
    taskKey?: string;
  };

  // ─── Custom task fields ─────────────────────────────────────────────────
  /**
   * Present only for custom tasks — entries that are not in the standard
   * game task dataset but were created or imported from a plugin route.
   * When true, customName must be present; customDescription is optional.
   */
  isCustom?: true;
  /** Display name shown in the Name column for custom tasks. */
  customName?: string;
  /** Display description shown in the Task column for custom tasks. */
  customDescription?: string;
  /**
   * Optional icon identifier for custom tasks.
   * Sourced from the plugin export's `customItem.icon` field.
   * Preserved across import/export and share encode/decode (v3+).
   */
  customIcon?: string;
}

/**
 * A logical grouping of tasks within the route.
 * MVP uses a single default section ("Main"). Multi-section editing is Phase 2+.
 */
export interface RouteSection {
  id: string;
  name: string;
  description?: string;
  items: RouteItem[];
}

/**
 * Top-level route structure — matches the plugin JSON export format:
 * { id, name, taskType, author, description, completed, sections }
 *
 * Phase 2+: export this to a downloadable JSON file.
 */
export interface Route {
  id: string;
  name: string;
  /** Task source identifier — "league" for Raging Echoes league tasks. */
  taskType: string;
  author: string;
  description: string;
  /** Whether this route has been completed/retired. */
  completed: boolean;
  sections: RouteSection[];
}
