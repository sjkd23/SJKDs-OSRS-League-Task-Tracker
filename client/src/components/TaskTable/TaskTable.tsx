import { useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TaskView, SortConfig, SortField } from '@/types/task';
import { TaskRow } from '@/components/TaskRow/TaskRow';

interface TaskTableProps {
  tasks: TaskView[];
  sort: SortConfig;
  onSortChange: (field: SortField) => void;
  onToggleCompleted: (id: string) => void;
  onToggleTodo: (id: string) => void;
}

interface Column {
  label: string;
  field: SortField;
  className?: string;
}

// Column widths use fixed values so the table obeys table-fixed layout.
// The Task (description) column has no explicit width and absorbs remaining space.
// All columns are sortable; clicking any header cycles asc/desc.
const COLUMNS: Column[] = [
  { label: 'Area',         field: 'area',              className: 'w-16 text-center' },
  { label: 'Name',         field: 'name',              className: '' },
  { label: 'Task',         field: 'description',       className: '' },
  { label: 'Requirements', field: 'skill',             className: '' },
  { label: 'Pts',          field: 'points',            className: 'w-20 text-center' },
  { label: 'Compl. %',     field: 'completionPercent', className: 'w-[7rem] text-center' },
  { label: 'To-do',        field: 'isTodo',            className: 'w-20 text-center' },
];

interface TaskTableProps {
  tasks: TaskView[];
  sort: SortConfig;
  onSortChange: (field: SortField) => void;
  onToggleCompleted: (id: string) => void;
  onToggleTodo: (id: string) => void;
}

export function TaskTable({
  tasks,
  sort,
  onSortChange,
  onToggleCompleted,
  onToggleTodo,
}: TaskTableProps) {
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Window-based virtualizer: uses window.scrollY as the scroll reference.
  // scrollMargin tells it how far the list container is from the top of the document.
  // We read offsetTop directly from the ref on every render so it stays in sync with
  // layout changes (filter panel opening/closing, etc.).
  const rowVirtualizer = useWindowVirtualizer({
    count: tasks.length,
    estimateSize: () => 38, // approximate row height in px (py-1.5 rows ≈ 38px)
    overscan: 12,
    scrollMargin: tableWrapperRef.current?.offsetTop ?? 0,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const scrollMargin = rowVirtualizer.options.scrollMargin ?? 0;

  // Padding rows fill the space above/below the rendered window so the scrollbar
  // represents the true full list height. This is the correct approach for real
  // <table> elements where position:absolute rows break layout.
  const paddingTop =
    virtualRows.length > 0
      ? Math.max(0, virtualRows[0].start - scrollMargin)
      : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? Math.max(0, totalSize - virtualRows[virtualRows.length - 1].end)
      : 0;

  return (
    <div ref={tableWrapperRef} className="w-full relative">
      {/* wikitable: border-collapse, 1 px cell borders, no shadow/radius */}
      {/* table-fixed: enforces column widths defined on <th> elements, prevents overflow */}
      <table className="wikitable table-fixed border-separate border-spacing-0 min-w-[700px]">
        <thead>
          <tr>
            {COLUMNS.map(({ label, field, className }) => {
              const isSorted = sort.field === field;
              return (
                <th
                  key={label}
                  onClick={() => onSortChange(field)}
                  style={{ top: 'var(--sticky-offset, 0px)' }}
                  className={[
                    'sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark shadow-[0_1px_0_rgba(0,0,0,0.05)]',
                    'px-2 py-2 font-semibold whitespace-nowrap text-center transition-colors',
                    'cursor-pointer select-none hover:text-wiki-link dark:hover:text-wiki-link-dark',
                    className ?? '',
                  ].join(' ')}
                >
                  {label}
                  {isSorted && (
                    <span className="ml-1 text-[10px] opacity-70">
                      {sort.direction === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="text-center py-8 text-wiki-muted dark:text-wiki-muted-dark italic text-[13px]"
              >
                No tasks match the current filters.{' '}
                <span className="not-italic text-wiki-link dark:text-wiki-link-dark cursor-pointer hover:underline">
                  Try adjusting or resetting the filters.
                </span>
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={COLUMNS.length} style={{ height: paddingTop, padding: 0, border: 'none' }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => (
                <TaskRow
                  key={virtualRow.key}
                  task={tasks[virtualRow.index]}
                  rowIndex={virtualRow.index}
                  onToggleCompleted={onToggleCompleted}
                  onToggleTodo={onToggleTodo}
                />
              ))}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={COLUMNS.length} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
