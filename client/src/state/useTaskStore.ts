import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type {
  AppTask,
  TaskUserState,
  TaskView,
  TaskFilters,
  SortConfig,
} from '@/types/task';
import type { ScraperTask } from '@/types/scraperTask';
import { mapScraperTasks } from '@/lib/mapScraperTask';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import { filterTasks, sortTasks } from '@/utils/taskFilters';
import { loadFromStorage, saveToStorage } from '@/utils/storage';

// ─── Utilities ───────────────────────────────────────────────────────────────

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  completed: 'osrs-lt:completed',
  todos: 'osrs-lt:todos',
} as const;

/**
 * Load persisted user-state IDs from localStorage and return a Map keyed by
 * task id. Only ids that exist in the current task list are retained, so stale
 * data from removed tasks doesn't accumulate indefinitely.
 *
 * Migration: when the dataset changes (e.g. League 6 final IDs replacing the
 * transitional set), stored task IDs may no longer directly match the current
 * task list. If a stored ID is of the form `task-{structId}-{sortId}` and the
 * structId resolves to a task in the current dataset (even with a different
 * sortId), the stored entry is remapped to the current task ID transparently.
 * The remapped IDs are written back to storage so subsequent loads are instant.
 */
function hydrateUserState(tasks: AppTask[]): Map<string, TaskUserState> {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  // structId → current task ID (for remapping when sortId changed between dataset versions)
  const taskIdByStructId = new Map(tasks.map((t) => [t.structId, t.id]));

  const rawCompleted = loadFromStorage<string[]>(STORAGE_KEYS.completed, []);
  const rawTodos    = loadFromStorage<string[]>(STORAGE_KEYS.todos,     []);

  /**
   * Remap a single stored task ID to its current counterpart.
   * 1. If the ID directly matches the current task list, keep it as-is.
   * 2. If the ID matches `task-{structId}-{oldSortId}` and the structId
   *    exists in the new dataset (possibly with a different sortId), remap it.
   * 3. Otherwise drop it (task was removed from the dataset).
   */
  function remapId(storedId: string): string | null {
    if (taskById.has(storedId)) return storedId;
    const m = storedId.match(/^task-(\d+)-\d+$/);
    if (!m) return null;
    return taskIdByStructId.get(parseInt(m[1], 10)) ?? null;
  }

  let anythingRemapped = false;
  const completedIds: string[] = [];
  const todoIds: string[] = [];

  for (const raw of rawCompleted) {
    const current = remapId(raw);
    if (current) {
      completedIds.push(current);
      if (current !== raw) anythingRemapped = true;
    } else {
      anythingRemapped = true; // dropped entry
    }
  }
  for (const raw of rawTodos) {
    const current = remapId(raw);
    if (current) {
      todoIds.push(current);
      if (current !== raw) anythingRemapped = true;
    } else {
      anythingRemapped = true; // dropped entry
    }
  }

  // Persist remapped IDs so subsequent loads don't need to remap again.
  if (anythingRemapped) {
    saveToStorage(STORAGE_KEYS.completed, completedIds);
    saveToStorage(STORAGE_KEYS.todos,    todoIds);
  }

  const completed = new Set(completedIds);
  const todos     = new Set(todoIds);

  const map = new Map<string, TaskUserState>();
  for (const id of new Set([...completed, ...todos])) {
    map.set(id, {
      completed: completed.has(id),
      isTodo:    todos.has(id),
    });
  }
  return map;
}

function persistUserState(userState: Map<string, TaskUserState>): void {
  const entries = [...userState.entries()];
  saveToStorage(
    STORAGE_KEYS.completed,
    entries.filter(([, s]) => s.completed).map(([id]) => id),
  );
  saveToStorage(
    STORAGE_KEYS.todos,
    entries.filter(([, s]) => s.isTodo).map(([id]) => id),
  );
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_USER_STATE: TaskUserState = {
  completed: false,
  isTodo: false,
};

const DEFAULT_FILTERS: TaskFilters = {
  tiers: [],
  skills: [],
  areas: [],
  categories: [],
  searchQuery: '',
  showCompleted: true,
  showOnlyCompleted: false,
  showTodoOnly: false,
  applyFilterToRoute: false,
};

const DEFAULT_SORT: SortConfig = {
  field: 'tier',
  direction: 'asc',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Local enriched dataset served statically by Vite from /public/data/.
 * Derived from CURRENT_LEAGUE so updating leagueConfig.ts is the only
 * change needed when a new league dataset is added.
 *
 * The JSON must conform to `ScraperTask[]`. The optional `*Parts` fields
 * (nameParts, descriptionParts, requirementsParts) are consumed when present.
 */
const DEV_DATA_URL = `/data/${CURRENT_LEAGUE.dataFile}`;

/** URL for the preliminary→real structId mappings file, or null when not configured. */
const MAPPINGS_URL = CURRENT_LEAGUE.mappingsFile
  ? `/data/${CURRENT_LEAGUE.mappingsFile}`
  : null;

/**
 * Build a Map<preliminaryStructId, realStructId> from the raw mappings JSON.
 *
 * Accepts an array of { league_6_preliminary_id, league_6_real_structId } objects.
 * Values that are not numbers are silently skipped so malformed entries are
 * non-fatal.
 */
function buildMappingFromRaw(raw: unknown): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (typeof entry !== 'object' || !entry) continue;
    const e = entry as Record<string, unknown>;
    const prelim = e.league_6_preliminary_id ?? e.preliminaryId ?? e.from;
    const real   = e.league_6_real_structId  ?? e.realStructId  ?? e.to;
    if (typeof prelim === 'number' && typeof real === 'number') {
      map.set(prelim, real);
    }
  }
  return map;
}

/**
 * Apply an in-memory structId upgrade to raw scraper tasks.
 *
 * Replaces preliminary struct IDs with their real counterparts where mappings
 * exist. This is a no-op when either the mapping is empty or the task already
 * has a real ID. Safe to call even when the upgrade script has already been run.
 */
function applyStructIdUpgrade(raw: ScraperTask[], mapping: Map<number, number>): ScraperTask[] {
  if (mapping.size === 0) return raw;
  return raw.map((task) => {
    const realId = mapping.get(task.structId);
    if (realId === undefined || realId === task.structId) return task;
    return { ...task, structId: realId };
  });
}

export function useTaskStore() {
  // Task content is loaded asynchronously from the scraped JSON
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Preliminary→real structId mapping (empty when league is not transitional).
  // Exported so callers (App.tsx) can pass it to route/import reconciliation.
  const [structIdMappings, setStructIdMappings] = useState<Map<number, number>>(
    () => new Map(),
  );

  // User state is mutable and persisted
  const [userState, setUserState] = useState<Map<string, TaskUserState>>(
    () => new Map(),
  );

  // Snapshot for single-level import revert
  const preImportSnapshot = useRef<Map<string, TaskUserState> | null>(null);
  const [canRevert, setCanRevert] = useState(false);

  // Load task data on mount and rehydrate persisted user state
  useEffect(() => {
    const taskFetch = fetch(DEV_DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load task data: ${r.status}`);
        return r.json() as Promise<ScraperTask[]>;
      });

    const mappingFetch: Promise<Map<number, number>> = MAPPINGS_URL
      ? fetch(MAPPINGS_URL)
          .then((r) => (r.ok ? r.json() : []))
          .then(buildMappingFromRaw)
          .catch(() => new Map<number, number>())
      : Promise.resolve(new Map<number, number>());

    Promise.all([taskFetch, mappingFetch])
      .then(([raw, mapping]) => {
        // Apply in-memory struct ID upgrade so the app always works with real IDs
        // even if the upgrade script has not been run yet.
        const upgraded = applyStructIdUpgrade(raw, mapping);
        const loaded = mapScraperTasks(upgraded);
        setTasks(loaded);
        setStructIdMappings(mapping);
        // Rehydrate after tasks are known so IDs can be validated
        setUserState(hydrateUserState(loaded));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Could not load task data:', err);
        setLoading(false);
      });
  }, []);

  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);

  // ── Merge content + user state for rendering ────────────────────────────

  const taskViews: TaskView[] = useMemo(
    () =>
      tasks.map((t) => ({
        ...t,
        ...(userState.get(t.id) ?? EMPTY_USER_STATE),
      })),
    [tasks, userState],
  );

  const visibleTasks: TaskView[] = useMemo(
    () => sortTasks(filterTasks(taskViews, filters), sort),
    [taskViews, filters, sort],
  );

  // ── Derived point totals ────────────────────────────────────────────────

  /** Total league points across all currently visible tasks. */
  const visiblePointsTotal = useMemo(
    () => visibleTasks.reduce((sum, t) => sum + t.points, 0),
    [visibleTasks],
  );

  /**
   * Total league points for visible tasks that are NOT yet completed.
   * Useful as a "remaining points" indicator for the current filter view.
   */
  const visiblePointsExcludingCompleted = useMemo(
    () => visibleTasks.filter((t) => !t.completed).reduce((sum, t) => sum + t.points, 0),
    [visibleTasks],
  );

  /**
   * Total league points earned from ALL completed tasks across the full
   * dataset — unaffected by any active filters.
   */
  const totalAcquiredPoints = useMemo(
    () => taskViews.reduce((sum, t) => sum + (t.completed ? t.points : 0), 0),
    [taskViews],
  );

  /** Count of ALL completed tasks across the full dataset — unaffected by filters. */
  const totalCompletedCount = useMemo(
    () => taskViews.filter((t) => t.completed).length,
    [taskViews],
  );

  // ── User state mutation ─────────────────────────────────────────────────

  const patchUserState = useCallback(
    (id: string, patch: Partial<TaskUserState>) => {
      setUserState((prev) => {
        const current = prev.get(id) ?? { ...EMPTY_USER_STATE };
        const next = new Map(prev);
        next.set(id, { ...current, ...patch });
        persistUserState(next);
        return next;
      });
    },
    [],
  );

  const toggleCompleted = useCallback(
    (id: string) => {
      const current = userState.get(id) ?? EMPTY_USER_STATE;
      patchUserState(id, { completed: !current.completed });
    },
    [userState, patchUserState],
  );

  const toggleTodo = useCallback(
    (id: string) => {
      const current = userState.get(id) ?? EMPTY_USER_STATE;
      patchUserState(id, { isTodo: !current.isTodo });
    },
    [userState, patchUserState],
  );

  /**
   * Mark a batch of task IDs as completed. IDs that are already completed
   * are left unchanged. Persists to localStorage after the update.
   */
  const importCompleted = useCallback((ids: string[]) => {
    setUserState((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const current = prev.get(id) ?? { ...EMPTY_USER_STATE };
        if (!current.completed) {
          next.set(id, { ...current, completed: true });
        }
      }
      persistUserState(next);
      return next;
    });
  }, []);

  /**
   * Replace the completed state for all known tasks with exactly the provided
   * set of IDs. Tasks in `ids` are marked completed; all other tasks are
   * cleared. To-do state is preserved unchanged for all tasks.
   *
   * This is the intended action for a full plugin-export import.
   */
  const replaceCompleted = useCallback(
    (ids: string[]) => {
      const completedSet = new Set(ids);
      setUserState((prev) => {
        const next = new Map(prev);
        for (const task of tasks) {
          const current = prev.get(task.id);
          const shouldBeCompleted = completedSet.has(task.id);
          if ((current?.completed ?? false) !== shouldBeCompleted) {
            next.set(task.id, {
              ...(current ?? { ...EMPTY_USER_STATE }),
              completed: shouldBeCompleted,
            });
          }
        }
        persistUserState(next);
        return next;
      });
    },
    [tasks],
  );

  /**
   * Replace both completed and To-Do state for all known tasks using the
   * two provided ID sets. This is the full plugin-export import action.
   *
   * - Tasks in `completedIds` are marked completed; all others are cleared.
   * - Tasks in `todoIds` are marked as To-Do; all others are cleared.
   * Both states are updated atomically in a single setUserState call.
   * Saves a snapshot of prior user state for single-level revert support.
   */
  const replaceFromPlugin = useCallback(
    (completedIds: string[], todoIds: string[], replaceTodos = true) => {
      const completedSet = new Set(completedIds);
      const todoSet = new Set(todoIds);
      setUserState((prev) => {
        // Capture snapshot before applying so revert can restore it
        preImportSnapshot.current = new Map(prev);
        const next = new Map(prev);
        for (const task of tasks) {
          const current = prev.get(task.id);
          const shouldBeCompleted = completedSet.has(task.id);
          // When replaceTodos is false, preserve the existing isTodo state unchanged.
          const shouldBeTodo = replaceTodos ? todoSet.has(task.id) : (current?.isTodo ?? false);
          const currentCompleted = current?.completed ?? false;
          const currentTodo = current?.isTodo ?? false;
          if (currentCompleted !== shouldBeCompleted || currentTodo !== shouldBeTodo) {
            next.set(task.id, {
              completed: shouldBeCompleted,
              isTodo: shouldBeTodo,
            });
          }
        }
        persistUserState(next);
        return next;
      });
      setCanRevert(true);
    },
    [tasks],
  );

  /**
   * Restore the user state snapshot taken before the most recent import.
   * Clears `canRevert` after use — only supports single-level undo.
   */
  const revertImport = useCallback(() => {
    if (!preImportSnapshot.current) return;
    const snapshot = preImportSnapshot.current;
    preImportSnapshot.current = null;
    setCanRevert(false);
    setUserState(() => {
      persistUserState(snapshot);
      return snapshot;
    });
  }, []);

  /**
   * Returns true if applying the given completedIds and todoIds would produce
   * no change to the current user state (i.e., the import is a no-op).
   */
  const isNoOpImport = useCallback(
    (completedIds: string[], todoIds: string[], replaceTodos = true): boolean => {
      const currentCompSet = new Set<string>();
      const currentTodoSet = new Set<string>();
      for (const [id, state] of userState) {
        if (state.completed) currentCompSet.add(id);
        if (state.isTodo) currentTodoSet.add(id);
      }
      if (!replaceTodos) {
        return setsEqual(currentCompSet, new Set(completedIds));
      }
      return (
        setsEqual(currentCompSet, new Set(completedIds)) &&
        setsEqual(currentTodoSet, new Set(todoIds))
      );
    },
    [userState],
  );

  return {
    loading,
    /** All tasks (content only, no user state) — use for deriving filter options */
    tasks,
    /** Preliminary → real structId mapping loaded from the league mappings file. Empty map when not transitional. */
    structIdMappings,
    /** All tasks with user state merged, unfiltered — use for route planner and similar needs */
    allTaskViews: taskViews,
    /** Tasks merged with user state, filtered and sorted for display */
    visibleTasks,
    /** Total league points for currently visible tasks */
    visiblePointsTotal,
    /** Total league points for visible tasks that are not yet completed */
    visiblePointsExcludingCompleted,
    /** Total league points earned from all completed tasks (ignores filters) */
    totalAcquiredPoints,
    /** Count of all completed tasks (ignores filters) */
    totalCompletedCount,
    filters,
    sort,
    setFilters,
    setSort,
    toggleCompleted,
    toggleTodo,
    importCompleted,
    replaceCompleted,
    replaceFromPlugin,
    isNoOpImport,
    canRevert,
    revertImport,
  };
}

