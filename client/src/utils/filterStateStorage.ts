/**
 * Persistent filter state storage for the OSRS League Task Tracker.
 *
 * Saves and restores filter/sort state across page loads using a single
 * versioned localStorage document. Write safety (quota / unavailability
 * handling and failure events) is delegated to the existing saveToStorage
 * helper in storage.ts.
 *
 * Storage key:  osrs-lt:filter-state:v1
 * Schema:       PersistedFilterStateV1 (defined below)
 */
import type { TaskFilters, SortConfig, SortField, Tier } from '@/types/task';
import { saveToStorage } from '@/utils/storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'osrs-lt:filter-state:v1';
const STORAGE_VERSION = 1 as const;

const VALID_SORT_FIELDS: ReadonlySet<string> = new Set<SortField>(
  ['name', 'tier', 'skill', 'area', 'points', 'description', 'completionPercent', 'isTodo'],
);

const VALID_TIERS: ReadonlySet<string> = new Set<Tier>([
  'Easy', 'Medium', 'Hard', 'Elite', 'Master',
]);

// ─── Schema Types ─────────────────────────────────────────────────────────────

/** Minimum shape needed by the planner visibility helpers. */
export interface RouteTaskListVisibilityLike {
  showTasksInRoute: boolean;
  showOnlyTasksInRoute: boolean;
}

type PersistedFilterStateV1 = {
  version: 1;
  taskList?: {
    filters?: {
      tiers?: string[];
      skills?: string[];
      areas?: string[];
      categories?: string[];
      searchQuery?: string;
      showCompleted?: boolean;
      showOnlyCompleted?: boolean;
      showTodoOnly?: boolean;
      hideIgnored?: boolean;
      applyFilterToRoute?: boolean;
    };
    sort?: {
      field?: string;
      direction?: string;
    };
  };
  planner?: {
    routeTaskListVisibility?: {
      showTasksInRoute?: boolean;
      showOnlyTasksInRoute?: boolean;
    };
  };
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Read and lightly validate the persisted document from localStorage.
 * Returns null when nothing is stored, storage is unavailable, the JSON is
 * malformed, or the version does not match.  Never throws.
 */
function readDoc(): PersistedFilterStateV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const doc = parsed as Record<string, unknown>;
    if (doc['version'] !== STORAGE_VERSION) return null;
    return doc as unknown as PersistedFilterStateV1;
  } catch {
    return null;
  }
}

function writeDoc(doc: PersistedFilterStateV1): void {
  saveToStorage(STORAGE_KEY, doc);
}

/**
 * Coerce an unknown value to a deduplicated string array.
 * Returns undefined when the value is not an array (signals "use default").
 * Non-string entries are silently dropped.
 */
function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') result.push(item);
  }
  return [...new Set(result)];
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load persisted task filters merged with the given defaults.
 *
 * Returns defaults when nothing is stored, storage is unavailable, or the
 * stored document is invalid/versioned differently.  Never throws.
 *
 * Invariant: if showOnlyCompleted is true, showCompleted is forced true.
 */
export function getPersistedTaskFilters(defaultFilters: TaskFilters): TaskFilters {
  const doc = readDoc();
  const f = doc?.taskList?.filters;
  if (!f) return defaultFilters;

  const rawTiers = toStringArray(f.tiers) ?? (defaultFilters.tiers as string[]);
  const tiers = rawTiers.filter((t): t is Tier => VALID_TIERS.has(t));
  const skills = toStringArray(f.skills) ?? defaultFilters.skills;
  const areas = toStringArray(f.areas) ?? defaultFilters.areas;
  const categories = toStringArray(f.categories) ?? defaultFilters.categories;
  const searchQuery =
    typeof f.searchQuery === 'string' ? f.searchQuery : defaultFilters.searchQuery;
  const showCompleted = toBool(f.showCompleted, defaultFilters.showCompleted);
  const showOnlyCompleted = toBool(f.showOnlyCompleted, defaultFilters.showOnlyCompleted);
  const showTodoOnly = toBool(f.showTodoOnly, defaultFilters.showTodoOnly);
  const hideIgnored = toBool(f.hideIgnored, defaultFilters.hideIgnored);
  const applyFilterToRoute = toBool(f.applyFilterToRoute, defaultFilters.applyFilterToRoute);

  // Invariant: showOnlyCompleted implies showCompleted
  const resolvedShowCompleted = showOnlyCompleted ? true : showCompleted;

  return {
    tiers,
    skills,
    areas,
    categories,
    searchQuery,
    showCompleted: resolvedShowCompleted,
    showOnlyCompleted,
    showTodoOnly,
    hideIgnored,
    applyFilterToRoute,
  };
}

/**
 * Load persisted sort config merged with the given defaults.
 * Returns defaults when nothing is stored or the stored values are invalid.
 * Never throws.
 */
export function getPersistedSort(defaultSort: SortConfig): SortConfig {
  const doc = readDoc();
  const s = doc?.taskList?.sort;
  if (!s) return defaultSort;

  const field: SortField = VALID_SORT_FIELDS.has(s.field ?? '')
    ? (s.field as SortField)
    : defaultSort.field;

  const direction: 'asc' | 'desc' =
    s.direction === 'asc' || s.direction === 'desc' ? s.direction : defaultSort.direction;

  return { field, direction };
}

/**
 * Load persisted planner route-list visibility merged with the given defaults.
 * Returns defaults when nothing is stored or the stored values are invalid.
 * Never throws.
 *
 * Invariant: if showOnlyTasksInRoute is true, showTasksInRoute is forced true.
 */
export function getPersistedRouteTaskListVisibility<T extends RouteTaskListVisibilityLike>(
  defaultValue: T,
): T {
  const doc = readDoc();
  const v = doc?.planner?.routeTaskListVisibility;
  if (!v) return defaultValue;

  const showOnlyTasksInRoute = toBool(v.showOnlyTasksInRoute, defaultValue.showOnlyTasksInRoute);
  // Invariant: showOnlyTasksInRoute implies showTasksInRoute
  const showTasksInRoute = showOnlyTasksInRoute
    ? true
    : toBool(v.showTasksInRoute, defaultValue.showTasksInRoute);

  return { ...defaultValue, showTasksInRoute, showOnlyTasksInRoute };
}

/**
 * Save task filter + sort state to localStorage.
 * Reads the existing document first so the planner section is preserved.
 * Never throws.
 */
export function saveTaskFilterState(filters: TaskFilters, sort: SortConfig): void {
  const existing = readDoc();
  writeDoc({
    version: STORAGE_VERSION,
    planner: existing?.planner,
    taskList: {
      filters: {
        tiers: filters.tiers,
        skills: filters.skills,
        areas: filters.areas,
        categories: filters.categories,
        searchQuery: filters.searchQuery,
        showCompleted: filters.showCompleted,
        showOnlyCompleted: filters.showOnlyCompleted,
        showTodoOnly: filters.showTodoOnly,
        hideIgnored: filters.hideIgnored,
        applyFilterToRoute: filters.applyFilterToRoute,
      },
      sort: {
        field: sort.field,
        direction: sort.direction,
      },
    },
  });
}

/**
 * Save planner route-list visibility state to localStorage.
 * Reads the existing document first so the taskList section is preserved.
 * Never throws.
 */
export function savePlannerFilterState(visibility: RouteTaskListVisibilityLike): void {
  const existing = readDoc();
  writeDoc({
    version: STORAGE_VERSION,
    taskList: existing?.taskList,
    planner: {
      routeTaskListVisibility: {
        showTasksInRoute: visibility.showTasksInRoute,
        showOnlyTasksInRoute: visibility.showOnlyTasksInRoute,
      },
    },
  });
}

/**
 * Sanitize filter arrays by removing values that are not present in the
 * current task dataset.  Call once after tasks finish loading to prune stale
 * values from previous league seasons or data changes.
 *
 * Returns the same object reference when nothing changed so callers can use
 * a strict identity check (`sanitized === current`) before calling setState.
 */
export function sanitizeTaskFiltersAgainstAvailableOptions(
  filters: TaskFilters,
  validOptions: {
    tiers: ReadonlySet<string>;
    skills: ReadonlySet<string>;
    areas: ReadonlySet<string>;
    categories: ReadonlySet<string>;
  },
): TaskFilters {
  const tiers = filters.tiers.filter((t) => validOptions.tiers.has(t));
  const skills = filters.skills.filter((s) => validOptions.skills.has(s));
  const areas = filters.areas.filter((a) => validOptions.areas.has(a));
  const categories = filters.categories.filter((c) => validOptions.categories.has(c));

  const changed =
    tiers.length !== filters.tiers.length ||
    skills.length !== filters.skills.length ||
    areas.length !== filters.areas.length ||
    categories.length !== filters.categories.length;

  return changed ? { ...filters, tiers, skills, areas, categories } : filters;
}
