import type { AppTask } from '@/types/task';

// ─── Plugin export types ───────────────────────────────────────────────────────

/**
 * A single task entry in the plugin export `tasks` map.
 *
 * The map key is the string representation of the task's `id` param (not the
 * structId). Only tasks with at least one non-default field are included by
 * the plugin; absent tasks were never interacted with.
 */
export interface PluginTaskSave {
  /** OSRS struct ID for this task. May be absent on very old exports. */
  structId?: number | null;
  /** Epoch milliseconds when completed; 0 or absent means not completed. */
  completed?: number | null;
  /** Epoch milliseconds when tracked; 0 or absent means not tracked. */
  tracked?: number | null;
  /** Epoch milliseconds when ignored; 0 or absent means not ignored. */
  ignored?: number | null;
  /** User-written note for this task, if any. */
  note?: string | null;
}

/**
 * Top-level shape of the Tasks Tracker plugin export JSON.
 *
 * Only the fields relevant to import are typed here. Additional metadata
 * fields (displayName, timestamp, varbits, varps, quests, diaries, etc.)
 * are intentionally omitted — they are not needed for task-state import.
 */
export interface PluginExport {
  /**
   * Task type identifier written by the plugin, e.g. "LEAGUE_5".
   * Matches TaskTypeDefinition.taskJsonName in the plugin's data store.
   */
  taskType?: string | null;
  /**
   * Map of string(idParam) → task save data.
   * Only tasks with at least one non-default field are included.
   */
  tasks?: Record<string, PluginTaskSave> | null;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  /** Site task IDs where the plugin entry has completed > 0. */
  matchedCompleted: string[];
  /** Site task IDs where the plugin entry has tracked > 0 (maps to site To-Do). */
  matchedTodos: string[];
  /**
   * structIds from the export where completed > 0 or tracked > 0 but no
   * matching site task was found. Useful for diagnosing scraper/cache mismatches.
   */
  unmatchedStructIds: number[];
  /** Total number of task entries in the export with completed > 0. */
  totalCompleted: number;
  /** Total number of task entries in the export with tracked > 0. */
  totalTracked: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Parse a raw (already JSON.parse'd) plugin export value and return the set of
 * site task IDs that correspond to completed plugin tasks, plus diagnostic info.
 *
 * Matching is performed by `structId`. Only entries where `completed > 0` are
 * considered completed.
 *
 * @param raw              The result of JSON.parse on the export file contents.
 * @param tasks            The current site task list used for structId lookup.
 * @param expectedTaskType When provided, the export's `taskType` field must
 *                         match exactly or an error is thrown. Pass
 *                         `CURRENT_LEAGUE.pluginTaskType` at the call site.
 *
 * @throws {Error} If the top-level shape is invalid, if `taskType` does not
 *                 match `expectedTaskType`, or if the `tasks` field is absent
 *                 or malformed.
 */
export function parsePluginExport(
  raw: unknown,
  tasks: AppTask[],
  expectedTaskType?: string,
): ImportResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid export: expected a JSON object at the top level.');
  }

  const data = raw as PluginExport;

  if (expectedTaskType != null) {
    if (data.taskType !== expectedTaskType) {
      throw new Error(
        `Wrong task type: export contains "${data.taskType ?? '(none)'}" but expected "${expectedTaskType}". ` +
          `Make sure you exported from the correct league tab in the plugin.`,
      );
    }
  }

  if (data.tasks == null || typeof data.tasks !== 'object' || Array.isArray(data.tasks)) {
    throw new Error('Invalid export: missing or malformed "tasks" field.');
  }

  // Build structId → site task id lookup from the current task dataset.
  const byStructId = new Map<number, string>();
  for (const task of tasks) {
    byStructId.set(task.structId, task.id);
  }

  const matchedCompleted: string[] = [];
  const matchedTodos: string[] = [];
  const unmatchedStructIds: number[] = [];
  let totalCompleted = 0;
  let totalTracked = 0;

  for (const save of Object.values(data.tasks)) {
    const isCompleted = !!save.completed;
    const isTodo = !!save.tracked;

    // Skip entries where neither state is set.
    if (!isCompleted && !isTodo) continue;

    if (isCompleted) totalCompleted++;
    if (isTodo) totalTracked++;

    if (save.structId == null) {
      // State exists but no structId — nothing to match against.
      continue;
    }

    const taskId = byStructId.get(save.structId);
    if (taskId !== undefined) {
      if (isCompleted) matchedCompleted.push(taskId);
      if (isTodo) matchedTodos.push(taskId);
    } else {
      // Add once even if both completed and tracked are set.
      unmatchedStructIds.push(save.structId);
    }
  }

  return { matchedCompleted, matchedTodos, unmatchedStructIds, totalCompleted, totalTracked };
}
