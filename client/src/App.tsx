import { useState, useEffect, useRef, useMemo, memo, useCallback, startTransition } from 'react';
import { flushSync } from 'react-dom';
import { useTaskStore } from '@/state/useTaskStore';
import { useRouteStore, isMeaningfulRoute } from '@/state/useRouteStore';
import { useTheme } from '@/hooks/useTheme';
import { useLayoutMode } from '@/hooks/useLayoutMode';
import { TaskTable } from '@/components/TaskTable/TaskTable';
import { MobileTaskList } from '@/components/TaskTable/MobileTaskList';
import { TaskFiltersBar } from '@/components/TaskFilters/TaskFiltersBar';
import { MobileFilterSortBar } from '@/components/TaskFilters/MobileFilterSortBar';
import { TaskSummary } from '@/components/TaskSummary/TaskSummary';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ImportButton } from '@/components/ImportButton/ImportButton';
import type { ImportStatus } from '@/components/ImportButton/ImportButton';
import { RoutePlannerPanel } from '@/components/RoutePlanner/RoutePlannerPanel';
import type { RouteTaskListVisibilityFilters } from '@/components/TaskFilters/TaskFiltersBar';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import { getShareParam, decodeSharedRoute, clearShareParam, isShortShareId, loadSharedRouteFromApi } from '@/utils/routeShare';
import { loadFromStorage, saveToStorage, storageErrorEvent } from '@/utils/storage';
import { getPersistedRouteTaskListVisibility, savePlannerFilterState } from '@/utils/filterStateStorage';
import type { SortField } from '@/types/task';
import type { Route } from '@/types/route';

// Memoize TaskTable to prevent rerenders when только showFilters changes
const MemoizedTaskTable = memo(TaskTable);
const MemoizedMobileTaskList = memo(MobileTaskList);

const DEFAULT_ROUTE_TASK_LIST_VISIBILITY: RouteTaskListVisibilityFilters = {
  showTasksInRoute: true,
  showOnlyTasksInRoute: false,
};

export default function App() {
  const {
    loading, tasks, allTaskViews, visibleTasks,
    visiblePointsTotal, visiblePointsExcludingCompleted, totalAcquiredPoints, totalCompletedCount,
    filters, sort, setFilters, setSort,
    toggleCompleted, toggleTodo, toggleIgnored, replaceFromPlugin, isNoOpImport, canRevert, revertImport,
    structIdMappings,
  } = useTaskStore();
  const { theme, toggleTheme } = useTheme();
  const layoutMode = useLayoutMode();

  // ── Route Planner state (isolated from task tracker state) ────────────────
  const {
    route, isRunMode, setIsRunMode, taskIdsInRoute, addTaskToRoute, removeTaskFromRoute,
    moveItem,
    reorderSections, resetRoute,
    updateRouteName, replaceRoute, remapRouteTaskIds, addCustomTask, editCustomTask,
    addSection, renameSection, removeSection, setRouteItemLocation,
    toggleItemRunComplete,
  } = useRouteStore();
  // Captured once at mount so the share-param hydration effect can check whether
  // the user already has meaningful route content without a stale-closure risk.
  const routeIsMeaningfulAtMount = useRef(isMeaningfulRoute(route));

  // ── ID remap: apply once when tasks first load ─────────────────────────────
  // When the dataset switches from preliminary to real struct IDs, route items
  // stored with old taskIds (task-${oldStructId}-${sortId}) are remapped to the
  // current dataset's IDs via sortId. Safe no-op if all IDs already resolve.
  const routeRemapApplied = useRef(false);
  useEffect(() => {
    if (routeRemapApplied.current || tasks.length === 0) return;
    routeRemapApplied.current = true;
    remapRouteTaskIds(tasks, structIdMappings);
  }, [tasks, structIdMappings, remapRouteTaskIds]);

  // Memoized lookup map (taskId → task) for building _snap on route item creation.
  const taskViewById = useMemo(
    () => new Map(allTaskViews.map((t) => [t.id, t])),
    [allTaskViews],
  );

  /**
   * Adds a task to the route, recording an identity snapshot (_snap) so the
   * item can survive a preliminary→real struct ID migration via taskKey/sortId.
   */
  const addTaskToRouteWithSnap = useCallback(
    (taskId: string) => {
      const task = taskViewById.get(taskId);
      addTaskToRoute(
        taskId,
        task
          ? {
              name: task.name,
              structId: task.structId,
              sortId: task.sortId,
              ...(task.taskKey ? { taskKey: task.taskKey } : {}),
            }
          : undefined,
      );
    },
    [addTaskToRoute, taskViewById],
  );
  // Current app mode. 'tracker' is the default on load — Route Planner is opt-in.
  // If a shared route param (?r=) is present in the URL, start directly in planner mode
  // so the planner panel is visible as soon as the shared route is consumed.
  const [appMode, setAppMode] = useState<'tracker' | 'planner'>(() =>
    new URLSearchParams(window.location.search).has('r') ? 'planner' : 'tracker',
  );

  // ── Keep-alive: track which modes have been visited so their UI trees ─────
  // stay mounted after the first visit (hidden instead of unmounted).
  const [visitedTracker, setVisitedTracker] = useState(
    () => !new URLSearchParams(window.location.search).has('r'),
  );
  const [visitedPlanner, setVisitedPlanner] = useState(
    () => new URLSearchParams(window.location.search).has('r'),
  );

  /**
   * Switches app mode, marks the target mode as visited, and wraps the whole
   * update in startTransition so React treats it as a non-urgent render.
   * The To-do filter is reset when entering the planner (it has no meaning there).
   */
  const switchMode = useCallback((mode: 'tracker' | 'planner') => {
    startTransition(() => {
      setAppMode(mode);
      if (mode === 'tracker') {
        setVisitedTracker(true);
      } else {
        setVisitedPlanner(true);
        setFilters((prev) => (prev.showTodoOnly ? { ...prev, showTodoOnly: false } : prev));
      }
    });
  }, [setFilters]);

  const [plannerWide, setPlannerWide] = useState(() =>
    loadFromStorage<boolean>('osrs-lt:planner-wide', false),
  );
  const [routeTaskListVisibility, setRouteTaskListVisibility] = useState<RouteTaskListVisibilityFilters>(
    () => getPersistedRouteTaskListVisibility(DEFAULT_ROUTE_TASK_LIST_VISIBILITY),
  );
  const togglePlannerWide = useCallback(() => {
    setPlannerWide((w) => {
      const next = !w;
      saveToStorage('osrs-lt:planner-wide', next);
      return next;
    });
  }, []);

  // ── Shared-route hydration (from URL ?r= param) ───────────────────────────────
  const [sharedRouteError, setSharedRouteError] = useState<string | null>(null);
  /** Decoded shared route awaiting user confirmation before replacing the active route. */
  const [pendingSharedRoute, setPendingSharedRoute] = useState<Route | null>(null);
  /** True when a saveToStorage call failed (e.g. quota exceeded). */
  const [showSaveError, setShowSaveError] = useState(false);
  const hasConsumedSharedRoute = useRef(false);
  // Capture the raw ?r= param once on render (before clearShareParam removes it).
  // Stored in a ref so the effect below can access it without re-running on change.
  const pendingShareParam = useRef<string | null>(getShareParam());

  // Decodes the compact v2 share payload once tasks have finished loading.
  // Tasks must be loaded first because the v2 format references tasks by sortId,
  // which requires a sortId→taskId lookup against the live task dataset.
  // The URL param is cleared immediately so it doesn’t linger in the address bar.
  useEffect(() => {
    if (hasConsumedSharedRoute.current) return;
    if (!pendingShareParam.current) {
      hasConsumedSharedRoute.current = true; // no share param — nothing to do
      return;
    }
    if (loading || tasks.length === 0) return; // wait for tasks to finish loading

    hasConsumedSharedRoute.current = true;
    const encoded = pendingShareParam.current;
    pendingShareParam.current = null;

    clearShareParam();

    const loader = isShortShareId(encoded)
      ? loadSharedRouteFromApi(encoded, tasks)
      : decodeSharedRoute(encoded, tasks);

    void loader.then((result) => {
      if (!result.ok) {
        setSharedRouteError(result.error);
        return;
      }
      if (routeIsMeaningfulAtMount.current) {
        // User has an existing route — show a confirmation banner instead of silently overwriting.
        setPendingSharedRoute(result.route);
      } else {
        replaceRoute(result.route);
        // appMode is already initialised to 'planner' when ?r= is present
      }
    });
  }, [loading, tasks, replaceRoute]);

  // ── Storage failure banner ────────────────────────────────────────────────
  useEffect(() => {
    const handleSaveFailed = () => setShowSaveError(true);
    storageErrorEvent.addEventListener('save-failed', handleSaveFailed);
    return () => storageErrorEvent.removeEventListener('save-failed', handleSaveFailed);
  }, []);

  // ── Persist planner route-list visibility on change ───────────────────────
  useEffect(() => {
    savePlannerFilterState(routeTaskListVisibility);
  }, [routeTaskListVisibility]);

  // ── Interaction State ───────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  // ── Shared import UI state (drives both top-of-page and sticky instances) ──
  const [importPaste, setImportPaste] = useState('');
  const [importTracked, setImportTracked] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ type: 'idle' });

  const handleRevert = useCallback(() => {
    revertImport();
    setImportStatus({ type: 'idle' });
  }, [revertImport]);

  // Wrapper that detects no-op imports and skips replaceFromPlugin if nothing would change.
  // Returns true if changes were applied, false if the import was a no-op.
  const handleImportForButton = useCallback(
    (completedIds: string[], todoIds: string[], replaceTodos: boolean): boolean => {
      const noOp = isNoOpImport(completedIds, todoIds, replaceTodos);
      if (!noOp) replaceFromPlugin(completedIds, todoIds, replaceTodos);
      return !noOp;
    },
    [isNoOpImport, replaceFromPlugin],
  );
  
  // We use a ref to track the entire sticky header container's height
  const headerRef = useRef<HTMLDivElement>(null);
  
  // Use a ResizeObserver to keep the sticky offset updated perfectly
  useEffect(() => {
    const root = document.documentElement;
    const header = headerRef.current;
    
    function updateOffset() {
      if (isScrolled && header) {
        root.style.setProperty('--sticky-offset', `${header.getBoundingClientRect().height}px`);
      } else {
        root.style.setProperty('--sticky-offset', isScrolled ? '3rem' : '0px');
      }
    }

    updateOffset();
    
    if (!header) return;
    const observer = new ResizeObserver(() => updateOffset());
    observer.observe(header);
    
    return () => {
      observer.disconnect();
    };
  }, [showFilters, isScrolled, layoutMode]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSortChange = useCallback((field: SortField) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, [setSort]);

  const activeFilterCount = useMemo(() => 
    filters.tiers.length +
    filters.skills.length +
    filters.areas.length +
    filters.categories.length +
    (filters.searchQuery.trim() ? 1 : 0),
  [filters]);

  // Lower Route Planner task-list visibility controls for route membership.
  // This layer is planner-only and runs after the shared task filters.
  const plannerDisplayTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      const isInRoute = taskIdsInRoute.has(task.id);
      if (routeTaskListVisibility.showOnlyTasksInRoute) return isInRoute;
      if (!routeTaskListVisibility.showTasksInRoute && isInRoute) return false;
      return true;
    });
  }, [visibleTasks, taskIdsInRoute, routeTaskListVisibility]);

  /**
   * Scroll-preserving wrapper for addTaskToRoute used by the lower task list in
   * planner mode. When a task is added the route panel above grows, which would
   * normally push the lower list down on-screen. We capture the #task-list
   * element's viewport position before the add, then after React has committed
   * the updated DOM (inside a requestAnimationFrame) we scroll by the delta so
   * the lower list stays visually fixed.
   */
  const addTaskToRoutePreservingScroll = useCallback((taskId: string) => {
    const anchor = document.getElementById('task-list');
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    // flushSync forces React to commit the state update synchronously so we can
    // measure the new DOM position immediately, without relying on rAF timing.
    flushSync(() => {
      addTaskToRouteWithSnap(taskId);
    });
    const after = anchor ? anchor.getBoundingClientRect().top : 0;
    const delta = after - before;
    if (delta !== 0) {
      window.scrollBy({ top: delta, behavior: 'instant' });
    }
  }, [addTaskToRouteWithSnap]);

  // Route planner summary stats — used by the mobile sticky bar in planner mode
  const routeItemCount = useMemo(
    () => route.sections.reduce((sum, s) => sum + s.items.length, 0),
    [route.sections],
  );
  const routeTotalPoints = useMemo(() => {
    const taskMap = new Map(allTaskViews.map((t) => [t.id, t]));
    return route.sections.flatMap((s) => s.items).reduce((sum, item) => {
      if (item.isCustom) return sum;
      return sum + (taskMap.get(item.taskId)?.points ?? 0);
    }, 0);
  }, [route.sections, allTaskViews]);

  /** 
   * CRITICAL FIX: 
   * Instead of just toggling showFilters and letting the whole App rerender,
   * we want the UI thread to prioritize the visibility change.
   */
  const handleToggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  return (
    <div
      className={`min-h-screen bg-wiki-bg dark:bg-wiki-bg-dark pt-4 pb-4 font-wiki relative ${plannerWide && layoutMode !== 'mobile' ? 'px-1 sm:px-1' : 'px-3 sm:px-6'}`}
    >
      
      {/* ── Top Utility Layer (Desktop/Tablet Only) ─────────────────────── */}
      {layoutMode !== 'mobile' && (
        <div
          ref={headerRef}
          data-app-sticky-header=""
          className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-100 ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none invisible'
          }`}
        >
          {/* Utility Bar */}
          <div 
            onClick={handleToggleFilters}
            className="wiki-article !py-0 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm flex justify-between items-center h-12 px-4 shadow-sm cursor-pointer select-none group hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark"
            style={plannerWide ? { width: 'min(99vw, 99%)', maxWidth: 'none' } : undefined}
            aria-expanded={showFilters}
            aria-label="Toggle filters and import"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleFilters();
              }
            }}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <span className="flex items-center gap-2 text-[14px] font-bold text-wiki-link dark:text-wiki-link-dark group-hover:underline">
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="14" height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className={showFilters ? 'rotate-180' : ''}
                >
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </span>
              {activeFilterCount > 0 && (
                <span className="bg-wiki-link dark:bg-wiki-link-dark text-white dark:text-wiki-bg-dark px-2 py-0.5 rounded-full text-[11px] font-bold leading-none">
                  {activeFilterCount} Active
                </span>
              )}
            </div>

            {/* Compact summary — only in tracker mode */}
            {appMode !== 'planner' && (
              <div className="flex-1 flex justify-center pointer-events-none px-4">
                <TaskSummary
                  variant="compact"
                  loading={loading}
                  visibleCount={visibleTasks.length}
                  totalCount={tasks.length}
                  visiblePoints={visiblePointsTotal}
                  visiblePointsExcludingCompleted={visiblePointsExcludingCompleted}
                  totalAcquiredPoints={totalAcquiredPoints}
                  completedCount={totalCompletedCount}
                />
              </div>
            )}

            <div className="flex items-center gap-2 flex-shrink-0 pointer-events-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}
                className="w-10 h-10 flex items-center justify-center text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark rounded-full border border-transparent hover:border-wiki-border dark:hover:border-wiki-border-dark transition-transform hover:scale-110 active:scale-95"
                title="Scroll to top"
                aria-label="Scroll to top"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Sticky Filters + Import Panel — two-layer animation */}
          {/* Outer: layout-height container for ResizeObserver. Height jumps instantly    */}
          {/* (no duration) so only ONE measurement fires per toggle, not one per frame.  */}
          {/* The collapse-to-zero is delayed 0.18s so layout shrinks after content hides.*/}
          {/* Inner: GPU-composited clip-path + opacity — zero main-thread work per frame. */}
          <div className={`filter-panel-outer ${showFilters ? 'expanded' : 'collapsed'}`}>
            <div
              className="wiki-article !mt-0 px-4 py-3 !border-t-0 !border-x-0 bg-opacity-95 shadow-md overflow-y-auto max-h-[70vh] filter-panel-inner"
              style={plannerWide ? { width: 'min(99vw, 99%)', maxWidth: 'none' } : undefined}
            >
              <div className="wiki-filter-strip">
                <div className="flex flex-col lg:flex-row lg:items-start">
                  <div className="flex-1 min-w-0 lg:pr-4">
                    <TaskFiltersBar
                      tasks={tasks}
                      filters={filters}
                      onChange={setFilters}
                      mode={appMode}
                      routeTaskListVisibility={routeTaskListVisibility}
                      onRouteTaskListVisibilityChange={setRouteTaskListVisibility}
                      loading={loading}
                    />
                  </div>
                  {appMode !== 'planner' && (
                  <div className="flex-shrink-0 lg:w-72 border-t border-wiki-border dark:border-wiki-border-dark lg:border-t-0 lg:border-l pt-3 lg:pt-0 lg:pl-4 mt-3 lg:mt-0">
                    <ImportButton
                      tasks={tasks}
                      pasteValue={importPaste}
                      onPasteChange={setImportPaste}
                      importTracked={importTracked}
                      onImportTrackedChange={setImportTracked}
                      status={importStatus}
                      onStatusChange={setImportStatus}
                      canRevert={canRevert}
                      onRevert={handleRevert}
                      onImport={handleImportForButton}
                    />
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Wiki article container ────────────────────────────────────── */}
      <div
        className="wiki-article"
        style={plannerWide && layoutMode !== 'mobile' ? { width: 'min(99vw, 99%)', maxWidth: 'none' } : undefined}
      >
        {/* ── Mode Tabs ─────────────────────────────────────────────── */}
        {/* -mx-6 cancels the wiki-article side padding so tabs reach edge-to-edge. */}
        <div className="-mx-6 border-b border-wiki-border dark:border-wiki-border-dark flex items-end pt-2 px-3">
          {(['tracker', 'planner'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={[
                'px-4 py-1.5 text-[13px] transition-colors select-none',
                appMode === m
                  ? 'font-semibold text-wiki-text dark:text-wiki-text-dark border-b-2 border-wiki-link dark:border-wiki-link-dark -mb-px'
                  : 'text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark',
              ].join(' ')}
            >
              {m === 'tracker' ? 'Task Tracker' : 'Route Planner'}
            </button>
          ))}
        </div>
        {/* ── Heading row ────────────────────────────────────────────────── */}
        <div className="pt-4 pb-3 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-wiki-border dark:border-wiki-border-dark">
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-wiki-muted dark:text-wiki-muted-dark mb-1">
              SJKD's Wiki-Style Leagues Task Tracker
            </div>
            {appMode === 'planner' ? (
              <>
                <h1 className="wiki-page-title">{CURRENT_LEAGUE.name} Route Planner</h1>
                <p className="mt-1.5 text-[12px] text-wiki-muted dark:text-wiki-muted-dark">
                  ←{' '}
                  <button
                    onClick={() => switchMode('tracker')}
                    className="text-wiki-link dark:text-wiki-link-dark hover:underline font-medium"
                  >
                    Back to Task Tracker
                  </button>
                </p>
              </>
            ) : (
              <>
                <h1 className="wiki-page-title">{CURRENT_LEAGUE.name} League - Tasks</h1>
                <div className="mt-1.5">
                  <TaskSummary
                    variant="full"
                    loading={loading}
                    visibleCount={visibleTasks.length}
                    totalCount={tasks.length}
                    visiblePoints={visiblePointsTotal}
                    visiblePointsExcludingCompleted={visiblePointsExcludingCompleted}
                    totalAcquiredPoints={totalAcquiredPoints}
                    completedCount={totalCompletedCount}
                  />
                </div>
                <p className="mt-2 text-[12px] text-wiki-muted dark:text-wiki-muted-dark">
                  Planning your run?{' '}
                  <button
                    onClick={() => switchMode('planner')}
                    className="text-wiki-link dark:text-wiki-link-dark hover:underline font-medium"
                  >
                    Try the Route Planner →
                  </button>
                </p>
              </>
            )}
          </div>
          <div className="flex flex-row items-center justify-between md:flex-col md:items-end gap-3 flex-shrink-0 w-full md:w-auto pt-2 md:pt-0 border-t md:border-0 border-wiki-border dark:border-wiki-border-dark mt-2 md:mt-0">
            <div className="text-[12px] leading-tight text-wiki-muted dark:text-wiki-muted-dark text-left md:text-right">
              <div>
                Created by{' '}
                <a href="https://github.com/sjkd23/SJKDs-OSRS-League-Task-Tracker" target="_blank" rel="noreferrer" className="text-wiki-link dark:text-wiki-link-dark hover:underline font-semibold">
                  SJKD
                </a>
              </div>
              <div className="mt-0.5">
                Using modified{' '}
                <a href="https://github.com/syrifgit/full-task-scraper" target="_blank" rel="noreferrer" className="text-wiki-link dark:text-wiki-link-dark hover:underline">
                  task scraper
                </a>
              </div>
              <div className="mt-0.5">
                Powered by the{' '}
                <a href="https://oldschool.runescape.wiki/" target="_blank" rel="noreferrer" className="text-wiki-link dark:text-wiki-link-dark hover:underline font-semibold">
                  OSRS Wiki
                </a>
              </div>
            </div>
            <div className="flex-shrink-0 md:mt-1 flex items-center gap-3">
              {layoutMode !== 'mobile' && (
                <button
                  onClick={togglePlannerWide}
                  title={plannerWide ? 'Use default width' : 'Expand to wide layout'}
                  className="inline-flex items-center gap-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors"
                >
                  <svg viewBox="0 0 16 10" fill="currentColor" className="w-3.5 h-2.5 flex-shrink-0" aria-hidden="true">
                    {plannerWide ? (
                      <>
                        <path d="M6 0h4v2H6zM0 4h16v2H0zM6 8h4v2H6z" />
                        <path d="M0 0l3 2-3 2V0zm16 0v4l-3-2 3-2z" />
                      </>
                    ) : (
                      <>
                        <path d="M6 0h4v2H6zM0 4h16v2H0zM6 8h4v2H6z" />
                        <path d="M5 2L2 0 5 4V2zm6 0v2l3-2-3-2v2z" />
                      </>
                    )}
                  </svg>
                  <span className="text-[12px] font-medium">{plannerWide ? 'Default' : 'Wide'}</span>
                </button>
              )}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        </div>

        {/* ── Page Filters Panel ─────────────────────────────────────────── */}
        {layoutMode === 'mobile' ? (
          <>
            <div className="sticky top-[0px] z-40 shadow-sm py-3 px-6 -mx-6 bg-wiki-surface dark:bg-wiki-surface-dark bg-opacity-95 dark:bg-opacity-95 backdrop-blur-sm border-b border-wiki-border dark:border-wiki-border-dark">
              <MobileFilterSortBar
                tasks={tasks}
                filters={filters}
                sort={sort}
                onFiltersChange={setFilters}
                onSortChange={handleSortChange}
                mode={appMode}
                activeCount={activeFilterCount}
                routeTaskListVisibility={routeTaskListVisibility}
                onRouteTaskListVisibilityChange={setRouteTaskListVisibility}
                onImport={handleImportForButton}
                canRevert={canRevert}
                onRevert={handleRevert}
                summaryLoading={loading}
                visibleCount={visibleTasks.length}
                totalCount={tasks.length}
                visiblePoints={visiblePointsTotal}
                visiblePointsExcludingCompleted={visiblePointsExcludingCompleted}
                totalAcquiredPoints={totalAcquiredPoints}
                completedCount={totalCompletedCount}
                routeItemCount={routeItemCount}
                routeTotalPoints={routeTotalPoints}
              />
            </div>
          </>
        ) : (
          <div className="pb-3 border-b border-wiki-border dark:border-wiki-border-dark">
            <div className="wiki-filter-strip">
              <div className="flex flex-col lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0 lg:pr-4">
                  <TaskFiltersBar
                    tasks={tasks}
                    filters={filters}
                    onChange={setFilters}
                    mode={appMode}
                    routeTaskListVisibility={routeTaskListVisibility}
                    onRouteTaskListVisibilityChange={setRouteTaskListVisibility}
                    loading={loading}
                  />
                </div>
                {appMode !== 'planner' && (
                <div className="flex-shrink-0 lg:w-72 border-t border-wiki-border dark:border-wiki-border-dark lg:border-t-0 lg:border-l pt-3 lg:pt-0 lg:pl-4 mt-3 lg:mt-0">
                  <ImportButton
                    tasks={tasks}
                    pasteValue={importPaste}
                    onPasteChange={setImportPaste}
                    importTracked={importTracked}
                    onImportTrackedChange={setImportTracked}
                    status={importStatus}
                    onStatusChange={setImportStatus}
                    canRevert={canRevert}
                    onRevert={handleRevert}
                    onImport={handleImportForButton}
                  />
                </div>
              )}
              </div>
            </div>
          </div>
        )}

        {/* ── Task table ─────────────────────────────────────────────────── */}
        {/* In tracker mode the task table stays inside this wiki-article.   */}
        {/* Keep-alive: render once visited; hide instead of unmounting.      */}
        {visitedTracker && (
          <main
            className={`mt-3 pb-6${appMode === 'planner' ? ' hidden' : ''}`}
            aria-hidden={appMode === 'planner' ? true : undefined}
          >
            {loading ? (
              <div className="text-center py-16 text-wiki-muted dark:text-wiki-muted-dark text-[13px] italic">
                Loading task list…
              </div>
            ) : layoutMode === 'mobile' ? (
              <MemoizedMobileTaskList
                tasks={visibleTasks}
                sort={sort}
                onSortChange={handleSortChange}
                onToggleCompleted={toggleCompleted}
                onToggleTodo={toggleTodo}
                onToggleIgnored={toggleIgnored}
                mode={appMode}
                onAddToRoute={addTaskToRouteWithSnap}
              />
            ) : (
              <MemoizedTaskTable
                tasks={visibleTasks}
                sort={sort}
                onSortChange={handleSortChange}
                onToggleCompleted={toggleCompleted}
                onToggleTodo={toggleTodo}
                onToggleIgnored={toggleIgnored}
                mode={appMode}
                onAddToRoute={addTaskToRouteWithSnap}
              />
            )}
          </main>
        )}

        {/* In planner mode, the route planner sits inside this wiki-article.     */}
        {/* Save-error banner is mode-independent — always conditionally rendered. */}
        {showSaveError && (
          <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-[12.5px] text-red-700 dark:text-red-400 flex items-start gap-2">
            <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true">
              <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
            </svg>
            <span className="flex-1"><strong>Save error:</strong> Your data could not be saved — browser storage may be full.</span>
            <button
              onClick={() => setShowSaveError(false)}
              className="flex-shrink-0 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {/* Planner panel keep-alive: render once visited; hide instead of unmounting. */}
        {visitedPlanner && (
          <div
            className={appMode !== 'planner' ? 'hidden' : ''}
            aria-hidden={appMode !== 'planner' ? true : undefined}
          >
            {pendingSharedRoute !== null && (
              <div className="mt-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 text-[12.5px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" aria-hidden="true">
                  <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
                </svg>
                <span className="flex-1">
                  A shared route was found (<strong>{pendingSharedRoute.name || 'Unnamed route'}</strong>).
                  {' '}Loading it will replace your current route.
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { replaceRoute(pendingSharedRoute); setPendingSharedRoute(null); }}
                    className="px-2 py-0.5 text-[11.5px] font-medium bg-wiki-link dark:bg-wiki-link-dark text-white rounded hover:opacity-90 transition-opacity"
                  >
                    Load Shared Route
                  </button>
                  <button
                    onClick={() => setPendingSharedRoute(null)}
                    className="px-2 py-0.5 text-[11.5px] font-medium text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                  >
                    Keep My Route
                  </button>
                </div>
              </div>
            )}
            {sharedRouteError && (
              <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-[12.5px] text-red-700 dark:text-red-400 flex items-start gap-2">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true">
                  <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
                </svg>
                <span className="flex-1"><strong>Shared link error:</strong> {sharedRouteError}</span>
                <button
                  onClick={() => setSharedRouteError(null)}
                  className="flex-shrink-0 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {!loading && (
              <div id="route-planner" className="mt-3 pb-3">
                <RoutePlannerPanel
                  route={route}
                  filters={filters}
                  isRunMode={isRunMode}
                  setIsRunMode={setIsRunMode}
                  allTasks={allTaskViews}
                  structIdMappings={structIdMappings}
                  onUpdateRouteName={updateRouteName}
                  onRemoveTask={removeTaskFromRoute}
                  onReorderSections={reorderSections}
                  onResetRoute={resetRoute}
                  onReplaceRoute={replaceRoute}
                  onAddCustomTask={addCustomTask}
                  onEditCustomTask={editCustomTask}
                  onAddSection={addSection}
                  onRenameSection={renameSection}
                  onRemoveSection={removeSection}
                  onSetRouteItemLocation={setRouteItemLocation}
                  onMoveItem={moveItem}
                  onToggleItemRunComplete={toggleItemRunComplete}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task List ─ separate wiki-article so the page bg shows between ──────────────── */}
      {/* Root cause of the old gap not working: planner and tasks shared one        */}
      {/* wiki-article surface. Closing that article and starting a new one below    */}
      {/* lets the bg-wiki-bg of the outer container show through as a real gap.     */}
      {/* Keep-alive: render once visited; hide instead of unmounting.               */}
      {visitedPlanner && (
        <div
          className={`wiki-article mt-4${appMode !== 'planner' ? ' hidden' : ''}`}
          id="task-list"
          aria-hidden={appMode !== 'planner' ? true : undefined}
          style={plannerWide && layoutMode !== 'mobile' ? { width: 'min(99vw, 99%)', maxWidth: 'none' } : undefined}
        >
          <div className="py-2 border-b border-wiki-border dark:border-wiki-border-dark flex items-center gap-3">
            <span className="font-bold text-[18px] text-wiki-text dark:text-wiki-text-dark">
              Task List
            </span>
            <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark">
              click any row to add it to your route
            </span>
          </div>
          <main className="pb-6">
            {loading ? (
              <div className="text-center py-16 text-wiki-muted dark:text-wiki-muted-dark text-[13px] italic">
                Loading task list…
              </div>
            ) : layoutMode === 'mobile' ? (
              <MemoizedMobileTaskList
                tasks={plannerDisplayTasks}
                sort={sort}
                onSortChange={handleSortChange}
                onToggleCompleted={toggleCompleted}
                onToggleTodo={toggleTodo}
                onToggleIgnored={toggleIgnored}
                mode={appMode}
                taskIdsInRoute={taskIdsInRoute}
                onAddToRoute={addTaskToRoutePreservingScroll}
              />
            ) : (
              <MemoizedTaskTable
                tasks={plannerDisplayTasks}
                sort={sort}
                onSortChange={handleSortChange}
                onToggleCompleted={toggleCompleted}
                onToggleTodo={toggleTodo}
                onToggleIgnored={toggleIgnored}
                mode={appMode}
                taskIdsInRoute={taskIdsInRoute}
                onAddToRoute={addTaskToRoutePreservingScroll}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

