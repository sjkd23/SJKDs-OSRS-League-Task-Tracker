import { useTaskStore } from '@/state/useTaskStore';
import { useTheme } from '@/hooks/useTheme';
import { TaskTable } from '@/components/TaskTable/TaskTable';
import { TaskFiltersBar } from '@/components/TaskFilters/TaskFiltersBar';
import { ThemeToggle } from '@/components/ThemeToggle/ThemeToggle';
import { WikiSyncLookup } from '@/components/WikiSyncLookup/WikiSyncLookup';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';
import type { SortField } from '@/types/task';

export default function App() {
  const { loading, tasks, visibleTasks, filters, sort, setFilters, setSort, toggleCompleted, toggleTodo, importCompletedTasks } =
    useTaskStore();
  const { theme, toggleTheme } = useTheme();

  function handleSortChange(field: SortField) {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }

  return (
    <div className="min-h-screen bg-wiki-bg dark:bg-wiki-bg-dark py-4 px-3 sm:px-6 font-wiki">

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

        {/* ── WikiSync import ─────────────────────────────────────────── */}
        {!loading && (
          <WikiSyncLookup onImport={importCompletedTasks} />
        )}

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="mt-3">
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
            />
          )}
        </main>

      </div>
    </div>
  );
}

