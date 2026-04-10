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
 */
function hydrateUserState(tasks: AppTask[]): Map<string, TaskUserState> {
  const taskIds = new Set(tasks.map((t) => t.id));
  const completed = new Set<string>(loadFromStorage<string[]>(STORAGE_KEYS.completed, []));
  const todos = new Set<string>(loadFromStorage<string[]>(STORAGE_KEYS.todos, []));

  const map = new Map<string, TaskUserState>();
  for (const id of taskIds) {
    if (completed.has(id) || todos.has(id)) {
      map.set(id, {
        completed: completed.has(id),
        isTodo: todos.has(id),
      });
    }
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

export function useTaskStore() {
  // Task content is loaded asynchronously from the scraped JSON
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);

  // User state is mutable and persisted
  const [userState, setUserState] = useState<Map<string, TaskUserState>>(
    () => new Map(),
  );

  // Snapshot for single-level import revert
  const preImportSnapshot = useRef<Map<string, TaskUserState> | null>(null);
  const [canRevert, setCanRevert] = useState(false);

  // Load task data on mount and rehydrate persisted user state
  useEffect(() => {
    fetch(DEV_DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load task data: ${r.status}`);
        return r.json() as Promise<ScraperTask[]>;
      })
      .then((raw) => {
        const loaded = mapScraperTasks(raw);
        setTasks(loaded);
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
    (completedIds: string[], todoIds: string[]) => {
      const completedSet = new Set(completedIds);
      const todoSet = new Set(todoIds);
      setUserState((prev) => {
        // Capture snapshot before applying so revert can restore it
        preImportSnapshot.current = new Map(prev);
        const next = new Map(prev);
        for (const task of tasks) {
          const current = prev.get(task.id);
          const shouldBeCompleted = completedSet.has(task.id);
          const shouldBeTodo = todoSet.has(task.id);
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
    (completedIds: string[], todoIds: string[]): boolean => {
      const currentCompSet = new Set<string>();
      const currentTodoSet = new Set<string>();
      for (const [id, state] of userState) {
        if (state.completed) currentCompSet.add(id);
        if (state.isTodo) currentTodoSet.add(id);
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
    /** Tasks merged with user state, filtered and sorted for display */
    visibleTasks,
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

