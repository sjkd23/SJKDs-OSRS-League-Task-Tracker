import { useState, useCallback, useMemo } from 'react';
import { loadFromStorage, saveToStorage } from '@/utils/storage';
import type { Route, RouteItem, RouteSection } from '@/types/route';

// ─── Storage ──────────────────────────────────────────────────────────────────

const ROUTE_STORAGE_KEY = 'osrs-lt:route';

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

function loadRoute(): Route {
  const saved = loadFromStorage<unknown>(ROUTE_STORAGE_KEY, null);
  if (
    saved !== null &&
    typeof saved === 'object' &&
    !Array.isArray(saved) &&
    typeof (saved as Route).id === 'string' &&
    Array.isArray((saved as Route).sections)
  ) {
    return migrateRoute(saved as Route);
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

  // Stable Set of ALL task IDs across all sections — memoized so the reference
  // only changes when items actually change, preserving TaskTable memoization.
  const taskIdsInRoute = useMemo(
    () => new Set(route.sections.flatMap((s) => s.items.map((i) => i.taskId))),
    [route.sections],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Add a task to the end of the first section. Deduplicates silently. */
  const addTaskToRoute = useCallback((taskId: string) => {
    setRoute((prev) => {
      const alreadyIn = prev.sections.some((s) => s.items.some((i) => i.taskId === taskId));
      if (alreadyIn) return prev;
      const sections = [...prev.sections];
      if (sections.length === 0) {
        sections.push({ id: crypto.randomUUID(), name: 'Main', description: '', items: [] });
      }
      const first: RouteSection = { ...sections[0], items: [...sections[0].items, { taskId }] };
      const next: Route = { ...prev, sections: [first, ...sections.slice(1)] };
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

  /** Add a custom task to a specific section. */
  const addCustomTask = useCallback((sectionId: string, name: string) => {
    setRoute((prev) => {
      const trimmed = name.trim();
      if (!trimmed) return prev;
      const newItem: RouteItem = {
        taskId: crypto.randomUUID(),
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

  /** Edit an existing custom task's label or description independently. */
  const editCustomTask = useCallback(
    (taskId: string, field: 'label' | 'description', value: string) => {
      setRoute((prev) => {
        const trimmed = value.trim();
        if (!trimmed) return prev;
        const sections = prev.sections.map((s) => ({
          ...s,
          items: s.items.map((i) =>
            i.taskId === taskId && i.isCustom
              ? {
                  ...i,
                  ...(field === 'label'
                    ? { customName: trimmed }
                    : { customDescription: trimmed }),
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
    saveToStorage(ROUTE_STORAGE_KEY, newRoute);
    setRoute(newRoute);
  }, []);

  return {
    route,
    taskIdsInRoute,
    addTaskToRoute,
    removeTaskFromRoute,
    moveTaskInRoute,
    reorderItems,
    reorderSections,
    resetRoute,
    updateRouteName,
    replaceRoute,
    addCustomTask,
    editCustomTask,
    addSection,
    renameSection,
    removeSection,
  };
}
