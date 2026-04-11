import { memo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AppTask, TaskFilters, SortConfig, SortField } from '@/types/task';
import { TaskFiltersBar } from './TaskFiltersBar';
import { TaskSummary } from '@/components/TaskSummary/TaskSummary';
import { ImportButton } from '@/components/ImportButton/ImportButton';
import type { ImportStatus } from '@/components/ImportButton/ImportButton';

interface MobileFilterSortBarProps {
  tasks: AppTask[];
  filters: TaskFilters;
  sort: SortConfig;
  onFiltersChange: (filters: TaskFilters) => void;
  onSortChange: (field: SortField) => void;
  mode?: 'tracker' | 'planner';
  activeCount: number;
  onImport: (completedIds: string[], todoIds: string[]) => boolean;
  canRevert: boolean;
  onRevert: () => void;
  // ── Task summary props ──────────────────────────────────────────────────
  summaryLoading?: boolean;
  visibleCount: number;
  totalCount: number;
  visiblePoints: number;
  visiblePointsExcludingCompleted: number;
  totalAcquiredPoints: number;
  completedCount: number;
}

export const MobileFilterSortBar = memo(function MobileFilterSortBar({
  tasks,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  mode = 'tracker',
  activeCount,
  onImport,
  canRevert,
  onRevert,
  summaryLoading = false,
  visibleCount,
  totalCount,
  visiblePoints,
  visiblePointsExcludingCompleted,
  totalAcquiredPoints,
  completedCount,
}: MobileFilterSortBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 200);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Local import state for mobile (independent of desktop)
  const [importPaste, setImportPaste] = useState('');
  const [importTracked, setImportTracked] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ type: 'idle' });

  function handleMobileRevert() {
    onRevert();
    setImportStatus({ type: 'idle' });
  }

  useEffect(() => {
    if (filterOpen || sortOpen) {
      document.documentElement.classList.add('scroll-lock');
      document.body.classList.add('scroll-lock');
    } else {
      document.documentElement.classList.remove('scroll-lock');
      document.body.classList.remove('scroll-lock');
    }
    return () => {
      document.documentElement.classList.remove('scroll-lock');
      document.body.classList.remove('scroll-lock');
    };
  }, [filterOpen, sortOpen]);



  const filterSheet = filterOpen && createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-wiki-bg dark:bg-wiki-bg-dark font-wiki">
      <div className="flex items-center justify-between px-4 py-3 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark">
        <h2 className="text-lg font-bold text-wiki-text dark:text-wiki-text-dark">Filters</h2>
        <button 
          onClick={() => setFilterOpen(false)}
          className="text-wiki-link dark:text-wiki-link-dark font-semibold text-[15px] hover:underline py-3 px-3 -mr-2"
        >
          Done
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 mobile-filter-sheet-content">
        {/* Summary at the top of the filter sheet */}
        <div className="mb-4 pb-3 border-b border-wiki-border dark:border-wiki-border-dark">
          <TaskSummary
            variant="full"
            loading={summaryLoading}
            visibleCount={visibleCount}
            totalCount={totalCount}
            visiblePoints={visiblePoints}
            visiblePointsExcludingCompleted={visiblePointsExcludingCompleted}
            totalAcquiredPoints={totalAcquiredPoints}
            completedCount={completedCount}
          />
        </div>
        <TaskFiltersBar tasks={tasks} filters={filters} onChange={onFiltersChange} mode={mode} />
        {/* ── Import section — tracker mode only ──────────────── */}
        {mode !== 'planner' && (
        <div className="mt-5 pt-4 border-t border-wiki-border dark:border-wiki-border-dark">
          <ImportButton
            tasks={tasks}
            pasteValue={importPaste}
            onPasteChange={setImportPaste}
            importTracked={importTracked}
            onImportTrackedChange={setImportTracked}
            status={importStatus}
            onStatusChange={setImportStatus}
            canRevert={canRevert}
            onRevert={handleMobileRevert}
            onImport={(completedIds, todoIds) => onImport(completedIds, todoIds)}
          />
        </div>
        )}
      </div>
    </div>,
    document.body
  );

  const SortOptions: { label: string; field: SortField }[] = [
    { label: 'Tier (Default)', field: 'tier' },
    { label: 'Points', field: 'points' },
    { label: 'Name', field: 'name' },
    { label: 'Skill', field: 'skill' },
    { label: 'Area', field: 'area' },
    { label: 'Completion %', field: 'completionPercent' },
    { label: 'To-Do', field: 'isTodo' },
  ];

  const sortSheet = sortOpen && createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-wiki-bg dark:bg-wiki-bg-dark font-wiki">
      <div className="flex items-center justify-between px-4 py-3 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark">
        <h2 className="text-lg font-bold text-wiki-text dark:text-wiki-text-dark">Sort</h2>
        <button 
          onClick={() => setSortOpen(false)}
          className="text-wiki-link dark:text-wiki-link-dark font-semibold text-[15px] hover:underline py-3 px-3 -mr-2"
        >
          Done
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          {SortOptions.map(opt => {
            const isActive = sort.field === opt.field;
            return (
              <button
                key={opt.field}
                onClick={() => {
                  onSortChange(opt.field);
                  setSortOpen(false);
                }}
                className={`py-3 px-4 rounded-md text-left font-medium text-[15px] ${
                  isActive
                    ? 'bg-wiki-link/10 text-wiki-link dark:text-wiki-link-dark border border-wiki-link/20'
                    : 'text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{opt.label}</span>
                  {isActive && (
                    <span className="text-[12px] opacity-80 uppercase tracking-widest">{sort.direction}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Filter / Sort buttons row */}
      <div className="flex items-center justify-between gap-2">
      <div className="flex gap-2 flex-1">
        <button
          onClick={() => setFilterOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark rounded font-semibold text-[13px] text-wiki-text dark:text-wiki-text-dark active:scale-95 transition-transform relative"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          <span className="flex-shrink-0">Filter</span>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 pointer-events-none">
            <span className="bg-wiki-link dark:bg-wiki-link-dark px-1.5 py-0.5 rounded-full text-[10px] leading-none">
              99
            </span>
          </div>
          {activeCount > 0 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-wiki-link dark:bg-wiki-link-dark text-white px-1.5 py-0.5 rounded-full text-[10px] leading-none">
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSortOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark rounded font-semibold text-[13px] text-wiki-text dark:text-wiki-text-dark active:scale-95 transition-transform"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
          Sort: {SortOptions.find(o => o.field === sort.field)?.label.replace(' (Default)', '')}
        </button>

      </div>
      
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
        className={[
          'w-10 h-10 flex-shrink-0 flex items-center justify-center',
          'text-wiki-text dark:text-wiki-text-dark',
          'bg-wiki-surface dark:bg-wiki-surface-dark',
          'border border-wiki-border dark:border-wiki-border-dark rounded-full',
          'active:scale-95 transition-all duration-200',
          isScrolled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/>
        </svg>
      </button>

      </div>{/* end buttons row */}

      {/* Compact summary strip — always visible in the sticky bar */}
      <div className="px-1 pb-0.5">
        <TaskSummary
          variant="compact"
          loading={summaryLoading}
          visibleCount={visibleCount}
          totalCount={totalCount}
          visiblePoints={visiblePoints}
          visiblePointsExcludingCompleted={visiblePointsExcludingCompleted}
          totalAcquiredPoints={totalAcquiredPoints}
          completedCount={completedCount}
        />
      </div>

      {filterSheet}
      {sortSheet}
    </div>
  );
});
