import { useState, useCallback, useMemo } from 'react';
import {
  loadFromStorage,
  saveToStorage,
  backupRouteToStorage,
  backupStorageKeyOnce,
} from '@/utils/storage';
import type { Route, RouteItem, RouteLocation, RouteSection } from '@/types/route';

// ─── Storage ──────────────────────────────────────────────────────────────────

export const ROUTE_STORAGE_KEY_LEGACY = 'osrs-lt:route';
export const ROUTE_STORAGE_KEY = 'osrs-lt:route:v2';
/** Backup key — written before every destructive route replacement. */
export const ROUTE_BACKUP_KEY = 'osrs-lt:route:backup';
/** One-time snapshot of legacy route data before v2 copy-forward migration. */
export const ROUTE_LEGACY_SNAPSHOT_KEY = 'osrs-lt:route:pre-v2-backup';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createDefaultRoute(): Route {
  return {
    id: crypto.randomUUID(),
    name: 'New Route',
    taskType: 'league',
    author: '',
    description: '',
    completed: false,
    sections: [
      {
        id: crypto.randomUUID(),
        name: 'Main',
        description: '',
        items: [],
      },
    ],
  };
}

/**
 * Ensures every RouteItem has a routeItemId. Safe no-op when all items already
 * have one. Applied after any structural migration so the DnD layer always has
 * a stable per-entry identity that is independent of taskId.
 */
function ensureRouteItemIds(route: Route): Route {
  let anyMissing = false;
  const sections = route.sections.map((s) => {
    const items = s.items.map((i) => {
      if (i.routeItemId) return i;
      anyMissing = true;
      return { ...i, routeItemId: crypto.randomUUID() };
    });
    return anyMissing ? { ...s, items } : s;
  });
  return anyMissing ? { ...route, sections } : route;
}

/**
 * Migrates old flat-section format (all items in sections[0] with sectionName
 * metadata) to the current proper multi-section format. Safe no-op if the route
 * is already in the current format.
 */
function migrateRoute(route: Route): Route {
  if (
    route.sections.length === 1 &&
    route.sections[0].items.some((i) => i.sectionName != null)
  ) {
    const flat = route.sections[0].items;
    const sectionOrder: string[] = [];
    const sectionMap = new Map<string, RouteItem[]>();

    for (const item of flat) {
      const key = item.sectionName ?? route.sections[0].name ?? 'Main';
      if (!sectionMap.has(key)) {
        sectionMap.set(key, []);
        sectionOrder.push(key);
      }
      // Strip sectionName from items — section membership comes from position.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { sectionName: _sn, ...cleanItem } = item;
      sectionMap.get(key)!.push(cleanItem as RouteItem);
    }

    return {
      ...route,
      sections: sectionOrder.map((name) => ({
        id: crypto.randomUUID(),
        name,
        description: '',
        items: sectionMap.get(name) ?? [],
      })),
    };
  }
  return route;
}

/**
 * Returns true when a route contains at least one item in any section.
 * Used to guard destructive replacements that should only prompt when the user
 * has real content to lose.
 */
export function isMeaningfulRoute(route: Route): boolean {
  return route.sections.some((s) => s.items.length > 0);
}

/**
 * Apply structural migrations and fill in missing routeItemIds.
 * Safe to call on any route object — both operations are no-ops if not needed.
 * Exported so callers that load routes from named save slots can normalize them
 * before use without duplicating migration logic.
 */
export function normalizeRoute(route: Route): Route {
  return ensureRouteItemIds(migrateRoute(route));
}

function parseStoredRoute(value: unknown): Route | null {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Route).id === 'string' &&
    Array.isArray((value as Route).sections)
  ) {
    return normalizeRoute(value as Route);
  }
  return null;
}

function loadRoute(): Route {
  const versioned = parseStoredRoute(loadFromStorage<unknown>(ROUTE_STORAGE_KEY, null));
  if (versioned) {
    return versioned;
  }

  const legacy = parseStoredRoute(loadFromStorage<unknown>(ROUTE_STORAGE_KEY_LEGACY, null));
  if (legacy) {
    // Keep a one-time raw snapshot of the legacy key for emergency recovery.
    backupStorageKeyOnce(ROUTE_STORAGE_KEY_LEGACY, ROUTE_LEGACY_SNAPSHOT_KEY);
    // Copy-forward only; never mutate or delete the legacy key.
    saveToStorage(ROUTE_STORAGE_KEY, legacy);
    return legacy;
  }

  return createDefaultRoute();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Isolated store for Route Planner mode.
 * Does not share or mutate any state from useTaskStore.
 *
 * Routes are stored as proper multi-section structures. All CRUD operations
 * (add/edit custom tasks, add/rename/remove sections) work directly on the
 * sections array. DnD reordering uses a flat-index model that distributes
 * items back to sections by their original section sizes.
 */
export function useRouteStore() {
  const [route, setRoute] = useState<Route>(() => loadRoute());
  const [isRunMode, setIsRunMode] = useState(false);

  // Stable Set of ALL task IDs across all sections — memoized so the reference
  // only changes when items actually change, preserving TaskTable memoization.
  const taskIdsInRoute = useMemo(
    () => new Set(route.sections.flatMap((s) => s.items.map((i) => i.taskId))),
    [route.sections],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Add a task to the end of the last section. Deduplicates silently. */
  const addTaskToRoute = useCallback((taskId: string) => {
    setRoute((prev) => {
      const alreadyIn = prev.sections.some((s) => s.items.some((i) => i.taskId === taskId));
      if (alreadyIn) return prev;
      const sections = [...prev.sections];
      if (sections.length === 0) {
        sections.push({ id: crypto.randomUUID(), name: 'Main', description: '', items: [] });
      }
      const lastIdx = sections.length - 1;
      const lastSection: RouteSection = { ...sections[lastIdx], items: [...sections[lastIdx].items, { taskId, routeItemId: crypto.randomUUID() }] };
      const next: Route = { ...prev, sections: [...sections.slice(0, lastIdx), lastSection] };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Remove a task from any section it appears in. */
  const removeTaskFromRoute = useCallback((taskId: string) => {
    setRoute((prev) => {
      const next: Route = {
        ...prev,
        sections: prev.sections.map((s) => ({
          ...s,
          items: s.items.filter((i) => i.taskId !== taskId),
        })),
      };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Move a task up or down within its section (legacy helper). */
  const moveTaskInRoute = useCallback((taskId: string, direction: 'up' | 'down') => {
    setRoute((prev) => {
      const sections = prev.sections.map((s) => {
        const idx = s.items.findIndex((i) => i.taskId === taskId);
        if (idx === -1) return s;
        const items = [...s.items];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= items.length) return s;
        [items[idx], items[swapIdx]] = [items[swapIdx], items[idx]];
        return { ...s, items };
      });
      const next = { ...prev, sections };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Rename the current route. */
  const updateRouteName = useCallback((name: string) => {
    setRoute((prev) => {
      const next = { ...prev, name };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Reorder items using flat indices across all sections.
   * Supports cross-section drag-and-drop: items at section boundaries shift
   * to maintain each section's original item count.
   *
   * NOTE: This flat-index redistribution is semantically correct only for
   * same-section reorders. For cross-section moves use `moveItem` instead.
   * This function is kept for the map-list DnD panel which operates on a
   * global flat list and expects flat-index semantics.
   */
  const reorderItems = useCallback((fromFlat: number, toFlat: number) => {
    setRoute((prev) => {
      // Flatten all items, arrayMove, then re-distribute by original section sizes.
      const all = prev.sections.flatMap((s) => s.items);
      const result = [...all];
      const [moved] = result.splice(fromFlat, 1);
      result.splice(toFlat, 0, moved);

      let offset = 0;
      const newSections = prev.sections.map((s) => {
        const items = result.slice(offset, offset + s.items.length);
        offset += s.items.length;
        return { ...s, items };
      });

      const next: Route = { ...prev, sections: newSections };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Move a single route item to an explicit destination section + index.
   *
   * Handles three cases correctly:
   *   1. Same-section reorder: remove then insert at destIndex (= arrayMove semantics).
   *   2. Cross-section move: remove from source section, insert at destIndex in dest.
   *   3. Empty-section drop: destIndex of 0 inserts as the first item.
   *
   * This is the correct DnD handler for the main route planner DnD context.
   */
  const moveItem = useCallback(
    (routeItemId: string, destSectionId: string, destIndex: number) => {
      setRoute((prev) => {
        // Locate the item and its current section.
        let movedItem: RouteItem | null = null;
        let sourceSectionId: string | null = null;

        for (const s of prev.sections) {
          const idx = s.items.findIndex((i) => i.routeItemId === routeItemId);
          if (idx !== -1) {
            movedItem = s.items[idx];
            sourceSectionId = s.id;
            break;
          }
        }

        if (!movedItem || !sourceSectionId) return prev;

        if (sourceSectionId === destSectionId) {
          // Same section: remove then splice at destIndex.
          // This is equivalent to arrayMove for all orderings.
          const sections = prev.sections.map((s) => {
            if (s.id !== sourceSectionId) return s;
            const items = [...s.items];
            const fromIdx = items.findIndex((i) => i.routeItemId === routeItemId);
            items.splice(fromIdx, 1);
            items.splice(destIndex, 0, movedItem!);
            return { ...s, items };
          });
          const next: Route = { ...prev, sections };
          saveToStorage(ROUTE_STORAGE_KEY, next);
          return next;
        } else {
          // Cross-section: remove from source, insert at destIndex in dest.
          const captured = movedItem;
          const sections = prev.sections.map((s) => {
            if (s.id === sourceSectionId) {
              return { ...s, items: s.items.filter((i) => i.routeItemId !== routeItemId) };
            }
            if (s.id === destSectionId) {
              const items = [...s.items];
              items.splice(destIndex, 0, captured);
              return { ...s, items };
            }
            return s;
          });
          const next: Route = { ...prev, sections };
          saveToStorage(ROUTE_STORAGE_KEY, next);
          return next;
        }
      });
    },
    [],
  );

  /** Add a custom task to a specific section. */
  const addCustomTask = useCallback((sectionId: string, name: string) => {
    setRoute((prev) => {
      const trimmed = name.trim();
      if (!trimmed) return prev;
      const newItem: RouteItem = {
        taskId: crypto.randomUUID(),
        routeItemId: crypto.randomUUID(),
        isCustom: true,
        customName: trimmed,
        customDescription: trimmed,
      };
      const sections = prev.sections.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, newItem] } : s,
      );
      const next: Route = { ...prev, sections };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Edit an existing custom task's label, description or note independently. */
  const editCustomTask = useCallback(
    (taskId: string, field: 'label' | 'description' | 'note', value: string) => {
      setRoute((prev) => {
        const trimmed = value.trim();
        // Disallow empty labels, allowing them for others
        if (field === 'label' && !trimmed) return prev;
        
        const sections = prev.sections.map((s) => ({
          ...s,
          items: s.items.map((i) =>
            i.taskId === taskId && i.isCustom
              ? {
                  ...i,
                  ...(field === 'label'
                    ? { customName: trimmed }
                    : field === 'description'
                    ? { customDescription: trimmed }
                    : { note: trimmed }),
                }
              : i,
          ),
        }));
        const next: Route = { ...prev, sections };
        saveToStorage(ROUTE_STORAGE_KEY, next);
        return next;
      });
    },
    [],
  );

  /** Reorder sections by swapping two indices. */
  const reorderSections = useCallback((fromIdx: number, toIdx: number) => {
    setRoute((prev) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return prev;
      const sections = [...prev.sections];
      const [moved] = sections.splice(fromIdx, 1);
      sections.splice(toIdx, 0, moved);
      const next: Route = { ...prev, sections };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Reset the route back to factory default (one empty 'Main' section). */
  const resetRoute = useCallback(() => {
    const fresh = createDefaultRoute();
    saveToStorage(ROUTE_STORAGE_KEY, fresh);
    setRoute(fresh);
  }, []);

  /** Add a new named section to the end of the route. */
  const addSection = useCallback((name: string) => {
    setRoute((prev) => {
      const next: Route = {
        ...prev,
        sections: [
          ...prev.sections,
          {
            id: crypto.randomUUID(),
            name: name.trim() || 'New Section',
            description: '',
            items: [],
          },
        ],
      };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Rename an existing section. */
  const renameSection = useCallback((sectionId: string, name: string) => {
    setRoute((prev) => {
      const next: Route = {
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, name: name.trim() || s.name } : s,
        ),
      };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Remove a section and all its items.
   * Always keeps at least one section (recreates a blank "Main" when removing the last).
   */
  const removeSection = useCallback((sectionId: string) => {
    setRoute((prev) => {
      const remaining = prev.sections.filter((s) => s.id !== sectionId);
      const next: Route = {
        ...prev,
        sections:
          remaining.length > 0
            ? remaining
            : [{ id: crypto.randomUUID(), name: 'Main', description: '', items: [] }],
      };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /** Replaces the current route wholesale. Used by the import flow. */
  const replaceRoute = useCallback((newRoute: Route) => {
    // Back up the current active route before replacing it, so the user can
    // recover from accidental imports/overwrites. Failure is non-fatal.
    backupRouteToStorage(ROUTE_STORAGE_KEY, ROUTE_BACKUP_KEY);
    saveToStorage(ROUTE_STORAGE_KEY, newRoute);
    setRoute(newRoute);
  }, []);

  /** Set or clear a manual map location for a single route item entry. */
  const setRouteItemLocation = useCallback((routeItemId: string, location: RouteLocation | null) => {
    setRoute((prev) => {
      let changed = false;
      const sections = prev.sections.map((s) => {
        let sectionChanged = false;
        const items = s.items.map((i) => {
          if (i.routeItemId !== routeItemId) return i;

          sectionChanged = true;
          changed = true;

          if (location === null) {
            if (!i.location) {
              sectionChanged = false;
              changed = false;
              return i;
            }
            const { location: _removedLocation, ...rest } = i;
            return rest;
          }

          if (
            i.location &&
            i.location.x === location.x &&
            i.location.y === location.y &&
            i.location.plane === location.plane
          ) {
            sectionChanged = false;
            changed = false;
            return i;
          }

          return { ...i, location };
        });
        return sectionChanged ? { ...s, items } : s;
      });

      if (!changed) return prev;

      const next: Route = { ...prev, sections };
      saveToStorage(ROUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return {
    route,
    isRunMode,
    setIsRunMode,
    taskIdsInRoute,
    addTaskToRoute,
    removeTaskFromRoute,
    moveTaskInRoute,
    reorderItems,
    moveItem,
    reorderSections,
    resetRoute,
    updateRouteName,
    replaceRoute,
    addCustomTask,
    editCustomTask,
    addSection,
    renameSection,
    removeSection,
    setRouteItemLocation,
  };
}
