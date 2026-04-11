/**
 * Route export schema.
 * Shaped to match the OSRS League task tracker plugin JSON format.
 *
 * Phase 2+: build export, import, multi-section editing, and per-item notes
 * on top of these types without changing the core shape.
 */

/** A single task reference within a route section. */
export interface RouteItem {
  /**
   * Stable task id from AppTask.id for real tasks.
   * For custom tasks (isCustom === true) this is a locally-generated UUID
   * used purely as a stable dnd-kit / React key — it has no game meaning.
   */
  taskId: string;
  /** Optional annotation visible in the plugin. Phase 2+. */
  note?: string;
  /**
   * Source section name preserved during import.
   * Used only as display metadata for section header rows in the planner UI.
   * All items remain in sections[0] internally for simplified DnD management.
   */
  sectionName?: string;

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
