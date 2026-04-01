import { useState, useEffect } from 'react';
import { useTaskStore } from '@/state/useTaskStore';
import { useTheme } from '@/hooks/useTheme';
import { TaskTable } from '@/components/TaskTable/TaskTable';
import { TaskFiltersBar } from '@/components/TaskFilters/TaskFiltersBar';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import type { SortField } from '@/types/task';

export default function App() {
  const { loading, tasks, visibleTasks, filters, sort, setFilters, setSort, toggleCompleted, toggleTodo } =
    useTaskStore();
  const { theme, toggleTheme } = useTheme();
  const [showFilters, setShowFilters] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [stickyFilterHeight, setStickyFilterHeight] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      // Threshold: Once the top filter bar is mostly scrolled out of view.
      // Roughly 300px should suffice for most screen sizes.
      setIsScrolled(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function handleSortChange(field: SortField) {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }

  const activeFilterCount =
    filters.tiers.length +
    filters.skills.length +
    filters.areas.length +
    (!filters.showCompleted ? 1 : 0) +
    (filters.showTodoOnly ? 1 : 0);

  return (
    <div 
      className="min-h-screen bg-wiki-bg dark:bg-wiki-bg-dark pt-4 pb-4 px-3 sm:px-6 font-wiki relative"
    >
      
      {/* ── Top Utility Layer ────────────────────────────────────────────── */}
      <div 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-100 ${
          isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none invisible'
        }`}
      >
        {/* Utility Bar */}
        <div 
          onClick={() => setShowFilters(!showFilters)}
          className="wiki-article !py-0 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm flex justify-between items-center h-12 px-4 shadow-sm cursor-pointer select-none group transition-colors hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark"
          aria-expanded={showFilters}
          aria-label="Toggle filters"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowFilters(!showFilters);
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
                className={`transition-transform duration-100 ${showFilters ? 'rotate-180' : ''}`}
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
            className="w-10 h-10 flex items-center justify-center text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark rounded-full border border-transparent hover:border-wiki-border dark:hover:border-wiki-border-dark transition-all hover:scale-110 active:scale-95 pointer-events-auto"
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
          ref={(el) => {
            if (el && showFilters && isScrolled) {
              setStickyFilterHeight(el.offsetHeight);
            } else if (el && !showFilters) {
              setStickyFilterHeight(0);
            }
          }}
          className={`wiki-article !mt-0 !py-2 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm shadow-md overflow-y-auto max-h-[70vh] pointer-events-auto transition-[max-height,opacity,padding] duration-75 ease-out ${
            showFilters ? 'max-h-[70vh] opacity-100 py-2' : 'max-h-0 opacity-0 py-0 overflow-hidden border-none'
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
            <TaskTable
              tasks={visibleTasks}
              sort={sort}
              onSortChange={handleSortChange}
              onToggleCompleted={toggleCompleted}
              onToggleTodo={toggleTodo}
              stickyOffset={
                isScrolled 
                  ? `calc(3rem + ${stickyFilterHeight}px)` 
                  : '0px'
              }
            />
          )}
        </main>

      </div>
    </div>
  );
}

