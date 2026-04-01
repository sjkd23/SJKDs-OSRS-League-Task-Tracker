import { useState, useCallback, useMemo, useEffect } from 'react';
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
  showCompleted: true,
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
   * Apply a WikiSync import result to the current user state.
   *
   * Merge behaviour — only marks the supplied IDs as completed.
   * Does NOT un-complete tasks that are absent from the import list,
   * and does NOT clear todo/favourite flags.
   * Silently skips IDs that are not in the current task list.
   */
  const importCompletedTasks = useCallback(
    (completedIds: string[]) => {
      const knownIds = new Set(tasks.map(t => t.id));
      setUserState((prev) => {
        const next = new Map(prev);
        for (const id of completedIds) {
          if (!knownIds.has(id)) continue;
          const current = next.get(id) ?? { ...EMPTY_USER_STATE };
          next.set(id, { ...current, completed: true });
        }
        persistUserState(next);
        return next;
      });
    },
    [tasks],
  );

  return {
    /** Whether task data is still being loaded from JSON */
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
    /** Apply WikiSync import: marks supplied task IDs as completed (merge, never clears). */
    importCompletedTasks,
  };
}

