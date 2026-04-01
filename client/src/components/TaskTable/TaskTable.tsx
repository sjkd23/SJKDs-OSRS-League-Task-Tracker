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
  return (
    <div className="w-full overflow-x-auto relative">
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
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggleCompleted={onToggleCompleted}
                onToggleTodo={onToggleTodo}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
