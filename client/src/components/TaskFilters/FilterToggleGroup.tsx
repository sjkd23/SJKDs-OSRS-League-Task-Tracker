import type { ReactNode } from 'react';

interface FilterToggleGroupProps<T extends string> {
  /** Display label for the group, e.g. "Difficulty" */
  label: string;
  /** All available option values */
  options: T[];
  /** Currently selected values (empty = All) */
  selected: T[];
  /** Fired when selection changes */
  onChange: (next: T[]) => void;
  /** Optional render override for the option label (icons, coloured text, etc.) */
  renderOption?: (option: T) => ReactNode;
  /**
   * Optional tooltip/accessible title for each option button. Useful when
   * renderOption shows only an icon and the raw option string is the name.
   * Defaults to the raw option value when not provided.
   */
  getOptionTitle?: (option: T) => string;
  /** Width class for the label column, defaults to "w-20" */
  labelClass?: string;
}

/**
 * An always-visible row of toggle buttons for a single filter dimension.
 *
 * Replaces the dropdown-based MultiSelectDropdown for a more glanceable,
 * wiki-task-planning-friendly filter UI.
 *
 * Behaviour:
 * - "All" deselects the whole group (shows everything for that dimension).
 * - Clicking any individual option toggles it in/out of the selection.
 * - Multiple options can be active simultaneously.
 * - "All" appears active when nothing is selected.
 */
export function FilterToggleGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderOption,
  getOptionTitle,
  labelClass = 'w-20',
}: FilterToggleGroupProps<T>) {
  const isAll = selected.length === 0;

  function toggleOption(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex items-start gap-2 min-w-0">
      {/* Group label */}
      <span
        className={`${labelClass} flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-wiki-muted dark:text-wiki-muted-dark pt-[3px]`}
      >
        {label}
      </span>

      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-1">
        {/* "All" resets the selection */}
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={isAll}
          className={[
            'filter-toggle-btn',
            isAll ? 'filter-toggle-btn--active' : '',
          ].join(' ')}
        >
          All
        </button>

        {options.map((opt) => {
          const active = selected.includes(opt);
          const title = getOptionTitle ? getOptionTitle(opt) : opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleOption(opt)}
              aria-pressed={active}
              aria-label={title}
              title={title}
              className={[
                'filter-toggle-btn',
                active ? 'filter-toggle-btn--active' : '',
              ].join(' ')}
            >
              {renderOption ? renderOption(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
