import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { useTaskStore } from '@/state/useTaskStore';
import { useTheme } from '@/hooks/useTheme';
import { TaskTable } from '@/components/TaskTable/TaskTable';
import { TaskFiltersBar } from '@/components/TaskFilters/TaskFiltersBar';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import type { SortField } from '@/types/task';

// Memoize TaskTable to prevent rerenders when только showFilters changes
const MemoizedTaskTable = memo(TaskTable);

export default function App() {
  const { loading, tasks, visibleTasks, filters, sort, setFilters, setSort, toggleCompleted, toggleTodo } =
    useTaskStore();
  const { theme, toggleTheme } = useTheme();
  
  // ── Interaction State ───────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  
  // We use a ref and an effect instead of synchronous measurement (useLayoutEffect)
  // to avoid blocking the first paint after a click.
  const filterPanelRef = useRef<HTMLDivElement>(null);
  
  // Use a ResizeObserver to keep the sticky offset updated without triggering React rerenders
  useEffect(() => {
    const root = document.documentElement;
    const panel = filterPanelRef.current;
    
    function updateOffset() {
      if (showFilters && isScrolled && panel) {
        root.style.setProperty('--sticky-offset', `calc(3rem + ${panel.offsetHeight}px)`);
      } else {
        root.style.setProperty('--sticky-offset', isScrolled ? '3rem' : '0px');
      }
    }

    updateOffset();
    
    if (!panel) return;
    const observer = new ResizeObserver(() => updateOffset());
    observer.observe(panel);
    
    return () => {
      observer.disconnect();
    };
  }, [showFilters, isScrolled]);

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
    (!filters.showCompleted ? 1 : 0) +
    (filters.showTodoOnly ? 1 : 0),
  [filters]);

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
      className="min-h-screen bg-wiki-bg dark:bg-wiki-bg-dark pt-4 pb-4 px-3 sm:px-6 font-wiki relative"
    >
      
      {/* ── Top Utility Layer ────────────────────────────────────────────── */}
      <div 
        className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-100 ${
          isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none invisible'
        }`}
      >
        {/* Utility Bar */}
        <div 
          onClick={handleToggleFilters}
          className="wiki-article !py-0 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm flex justify-between items-center h-12 px-4 shadow-sm cursor-pointer select-none group hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark"
          aria-expanded={showFilters}
          aria-label="Toggle filters"
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

          <button
            onClick={(e) => {
              e.stopPropagation();
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
            className="w-10 h-10 flex items-center justify-center text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark rounded-full border border-transparent hover:border-wiki-border dark:hover:border-wiki-border-dark transition-transform hover:scale-110 active:scale-95 pointer-events-auto"
            title="Scroll to top"
            aria-label="Scroll to top"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/>
            </svg>
          </button>
        </div>

        {/* Sticky Filters Panel */}
        <div
          ref={filterPanelRef}
          className={`wiki-article !mt-0 px-4 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm shadow-md overflow-y-auto max-h-[70vh] pointer-events-auto filter-panel-transition ${
            showFilters ? 'expanded py-2' : 'collapsed'
          }`}
        >
          <TaskFiltersBar tasks={tasks} filters={filters} onChange={setFilters} />
        </div>
      </div>

      {/* ── Wiki article container ─────────────────────────────────────── */}
      <div className="wiki-article">

        {/* ── Heading row ────────────────────────────────────────────────── */}
        <div className="pt-4 pb-3 flex items-start justify-between gap-4 border-b border-wiki-border dark:border-wiki-border-dark">
          <div>
            <h1 className="wiki-page-title">{CURRENT_LEAGUE.name} League — Tasks</h1>
            <p className="mt-1 text-[12px] text-wiki-muted dark:text-wiki-muted-dark">
              {loading ? (
                <span>Loading tasks…</span>
              ) : (
                <>
                  Showing{' '}
                  <strong className="text-wiki-text dark:text-wiki-text-dark">{visibleTasks.length}</strong>
                  {' '}of{' '}
                  <strong className="text-wiki-text dark:text-wiki-text-dark">{tasks.length}</strong>
                  {' '}task{tasks.length !== 1 ? 's' : ''}
                </>
              )}
            </p>
          </div>
          <div className="pt-1 flex-shrink-0">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        {/* ── Page Filters Panel (Always visible at top) ─────────────────── */}
        <div className="border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark pb-3">
          <TaskFiltersBar tasks={tasks} filters={filters} onChange={setFilters} />
        </div>

        {/* ── Task table ─────────────────────────────────────────────────── */}
        <main className="mt-3 pb-6">
          {loading ? (
            <div className="text-center py-16 text-wiki-muted dark:text-wiki-muted-dark text-[13px] italic">
              Loading task list…
            </div>
          ) : (
            <MemoizedTaskTable
              tasks={visibleTasks}
              sort={sort}
              onSortChange={handleSortChange}
              onToggleCompleted={toggleCompleted}
              onToggleTodo={toggleTodo}
            />
          )}
        </main>

      </div>
    </div>
  );
}

