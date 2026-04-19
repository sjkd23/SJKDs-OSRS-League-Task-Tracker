import React, { useEffect, useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TaskView, SortConfig, SortField } from '@/types/task';
import { TaskRow } from '@/components/TaskRow/TaskRow';

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
  // ── Route Planner additions ────────────────────────────────────────────
  mode?: 'tracker' | 'planner';
  taskIdsInRoute?: Set<string>;
  onAddToRoute?: (id: string) => void;
}

export function TaskTable({
  tasks,
  sort,
  onSortChange,
  onToggleCompleted,
  onToggleTodo,
  mode = 'tracker',
  taskIdsInRoute,
  onAddToRoute,
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

  // Keep a stable ref so the ResizeObserver closure always reaches the current
  // virtualizer instance without needing to re-register the observer on each render.
  const virtualizerRef = useRef(rowVirtualizer);
  virtualizerRef.current = rowVirtualizer;

  // Reset all cached row measurements whenever the task list changes identity.
  // After a filter or sort change the items at each virtual index are different;
  // stale sizes from the previous list make getTotalSize() return a wrong value,
  // which causes the scroll thumb to jump while new items are being measured.
  // measure() clears the cache so remeasurement happens as rows enter the viewport.
  useEffect(() => {
    rowVirtualizer.measure();
    // rowVirtualizer is a stable Virtualizer instance — omitting it from deps is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Reset cached measurements when the table container's rendered width changes.
  // Row heights depend on text wrapping, which changes when width changes (e.g. window
  // resize, side-panel open/close).  We watch width only — height is a downstream
  // consequence of measurement, not a cause, so reacting to it would loop.
  // A requestAnimationFrame debounce coalesces rapid resize bursts into one reset.
  useEffect(() => {
    const el = tableWrapperRef.current;
    if (!el) return;
    let lastWidth = el.getBoundingClientRect().width;
    let rafId = 0;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      if (Math.abs(w - lastWidth) > 1) {
        lastWidth = w;
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          virtualizerRef.current.measure();
        });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
    // tableWrapperRef and virtualizerRef are stable refs — empty deps is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stable total-size for paddingBottom ─────────────────────────────────────
  // Root cause of thumb drag-lag: measureElement fires for each newly-visible
  // <tr>, and when its actual height differs from the 38px estimate, getTotalSize()
  // changes. That change flows into paddingBottom → document.scrollHeight changes →
  // the browser repositions the thumb to re-anchor to the new height → the thumb
  // slips back from the user's cursor during a drag.
  //
  // Fix: stableTotalSizeRef is frozen while rowVirtualizer.isScrolling is true.
  // The real totalSize is adopted once the virtualizer marks scroll as settled
  // (150 ms after the last scroll event). During that window paddingBottom does
  // not change so document.scrollHeight stays constant and the thumb tracks 1:1.
  const stableTotalSizeRef = useRef(totalSize);
  if (!rowVirtualizer.isScrolling) {
    stableTotalSizeRef.current = totalSize;
  }

  // Padding rows fill the space above/below the rendered window so the scrollbar
  // represents the true full list height. This is the correct approach for real
  // <table> elements where position:absolute rows break layout.
  const paddingTop =
    virtualRows.length > 0
      ? Math.max(0, virtualRows[0].start - scrollMargin)
      : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? Math.max(0, stableTotalSizeRef.current - virtualRows[virtualRows.length - 1].end)
      : 0;

  return (
    <div ref={tableWrapperRef} className="w-full relative">
      {/* wikitable: border-collapse, 1 px cell borders, no shadow/radius */}
      {/* table-fixed: enforces column widths defined on <th> elements, prevents overflow */}
      <table className="wikitable table-fixed border-separate border-spacing-0 min-w-[700px]">
        <thead>
          <tr>
            {COLUMNS.map(({ label, field, className }) => {
              // In planner mode, the To-do/Add column is removed entirely.
              // The whole row is clickable to add tasks, so no dedicated action column is needed.
              if (mode === 'planner' && field === 'isTodo') return null;
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
          {(() => {
            // In planner mode the To-do column is hidden, reducing column count by 1.
            const colCount = mode === 'planner' ? COLUMNS.length - 1 : COLUMNS.length;
            return tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
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
                    <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 'none' }} />
                  </tr>
                )}
              {virtualRows.map((virtualRow) => (
                <TaskRow
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement as React.Ref<HTMLTableRowElement>}
                  data-index={virtualRow.index}
                  task={tasks[virtualRow.index]}
                  rowIndex={virtualRow.index}
                  onToggleCompleted={onToggleCompleted}
                  onToggleTodo={onToggleTodo}
                  mode={mode}
                  isInRoute={taskIdsInRoute?.has(tasks[virtualRow.index].id)}
                  onAddToRoute={onAddToRoute}
                />
              ))}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
                </tr>
              )}
            </>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}
