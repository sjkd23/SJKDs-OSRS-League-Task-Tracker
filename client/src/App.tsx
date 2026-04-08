import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { useTaskStore } from '@/state/useTaskStore';
import { useTheme } from '@/hooks/useTheme';
import { useLayoutMode } from '@/hooks/useLayoutMode';
import { TaskTable } from '@/components/TaskTable/TaskTable';
import { MobileTaskList } from '@/components/TaskTable/MobileTaskList';
import { TaskFiltersBar } from '@/components/TaskFilters/TaskFiltersBar';
import { MobileFilterSortBar } from '@/components/TaskFilters/MobileFilterSortBar';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { ImportButton } from '@/components/ImportButton/ImportButton';
import type { ImportStatus } from '@/components/ImportButton/ImportButton';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import type { SortField } from '@/types/task';

// Memoize TaskTable to prevent rerenders when только showFilters changes
const MemoizedTaskTable = memo(TaskTable);
const MemoizedMobileTaskList = memo(MobileTaskList);

export default function App() {
  const { loading, tasks, visibleTasks, filters, sort, setFilters, setSort, toggleCompleted, toggleTodo, replaceFromPlugin, isNoOpImport, canRevert, revertImport } =
    useTaskStore();
  const { theme, toggleTheme } = useTheme();
  const layoutMode = useLayoutMode();
  
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
    (completedIds: string[], todoIds: string[]): boolean => {
      const noOp = isNoOpImport(completedIds, todoIds);
      if (!noOp) replaceFromPlugin(completedIds, todoIds);
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
    filters.areas.length,
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
      
      {/* ── Top Utility Layer (Desktop/Tablet Only) ─────────────────────── */}
      {layoutMode !== 'mobile' && (
        <div
          ref={headerRef}
          className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-100 ${
            isScrolled ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none invisible'
          }`}
        >
          {/* Utility Bar */}
          <div 
            onClick={handleToggleFilters}
            className="wiki-article !py-0 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm flex justify-between items-center h-12 px-4 shadow-sm cursor-pointer select-none group hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark"
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

          {/* Sticky Filters + Import Panel (combined) */}
          <div
            className={`wiki-article !mt-0 px-4 !border-t-0 !border-x-0 bg-opacity-95 backdrop-blur-sm shadow-md overflow-y-auto max-h-[70vh] pointer-events-auto filter-panel-transition ${
              showFilters ? 'expanded py-3' : 'collapsed'
            }`}
          >
            <div className="wiki-filter-strip">
              <div className="flex flex-col lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0 lg:pr-4">
                  <TaskFiltersBar tasks={tasks} filters={filters} onChange={setFilters} />
                </div>
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Wiki article container ────────────────────────────────────── */}
      <div className="wiki-article">

        {/* ── Heading row ────────────────────────────────────────────────── */}
        <div className="pt-4 pb-3 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-wiki-border dark:border-wiki-border-dark">
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-wiki-muted dark:text-wiki-muted-dark mb-1">
              SJKD's Wiki-Style Leagues Task Tracker
            </div>
            <h1 className="wiki-page-title">{CURRENT_LEAGUE.name} League - Tasks</h1>
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
            <div className="flex-shrink-0 md:mt-1">
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
                activeCount={activeFilterCount}
                onImport={handleImportForButton}
                canRevert={canRevert}
                onRevert={handleRevert}
              />
            </div>
          </>
        ) : (
          <div className="pb-3 border-b border-wiki-border dark:border-wiki-border-dark">
            <div className="wiki-filter-strip">
              <div className="flex flex-col lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0 lg:pr-4">
                  <TaskFiltersBar tasks={tasks} filters={filters} onChange={setFilters} />
                </div>
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
              </div>
            </div>
          </div>
        )}

        {/* ── Task table ─────────────────────────────────────────────────── */}
        <main className="mt-3 pb-6">
          {loading ? (
            <div className="text-center py-16 text-wiki-muted dark:text-wiki-muted-dark text-[13px] italic">
              Loading task list…
            </div>
          ) : layoutMode === 'mobile' ? (
            // Mobile (card view) layout branch
            <MemoizedMobileTaskList
              tasks={visibleTasks}
              sort={sort}
              onSortChange={handleSortChange}
              onToggleCompleted={toggleCompleted}
              onToggleTodo={toggleTodo}
            />
          ) : (
            // Desktop and Tablet layout branch via the wiki table
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

