import { useEffect, useRef, useState } from 'react';

interface MultiSelectDropdownProps<T extends string> {
  /** Visible label before the dropdown button, e.g. "Difficulty" */
  label: string;
  /** All available options */
  options: T[];
  /** Currently selected values */
  selected: T[];
  /** Called when selection changes */
  onChange: (next: T[]) => void;
  /** Optional render override for each option label (e.g. to add icons) */
  renderOption?: (option: T) => React.ReactNode;
}

/**
 * Compact multi-select dropdown for the filter bar.
 *
 * Shows a wiki-style flat button summarising the current selection.
 * Opens a small popover with checkbox items on click.
 * Closes on outside click or Escape.
 */
export function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function clearAll() {
    onChange([]);
    setOpen(false);
  }

  // ── Summary label ──────────────────────────────────────────────────────────
  let summary: string;
  if (selected.length === 0) {
    summary = 'All';
  } else if (selected.length <= 2) {
    summary = selected.join(', ');
  } else {
    summary = `${selected.length} selected`;
  }

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative flex items-center gap-1 text-[13px]">
      <span className="text-wiki-muted dark:text-wiki-muted-dark select-none">{label}</span>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          'border border-wiki-border dark:border-wiki-border-dark',
          'bg-wiki-article dark:bg-wiki-article-dark',
          'text-wiki-text dark:text-wiki-text-dark',
          'px-2 py-0.5 min-w-[5.5rem] text-left text-[12px] leading-tight',
          'flex items-center justify-between gap-1',
          'hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark',
          'focus:outline-none transition-colors',
          hasSelection ? 'font-medium text-wiki-link dark:text-wiki-link-dark' : '',
        ].join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} filter: ${summary}`}
      >
        <span className="truncate">{summary}</span>
        <span className="opacity-50 text-[9px] ml-0.5">{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown popover */}
      {open && (
        <div
          className={[
            'absolute top-full left-0 mt-0.5 z-50',
            'min-w-[9rem] max-h-64 overflow-y-auto',
            'bg-wiki-article dark:bg-wiki-article-dark',
            'border border-wiki-border dark:border-wiki-border-dark',
            'shadow-md',
          ].join(' ')}
          role="listbox"
          aria-multiselectable="true"
          aria-label={`${label} options`}
        >
          {/* All / clear row */}
          <button
            type="button"
            onClick={clearAll}
            className={[
              'w-full text-left px-2 py-1 text-[12px]',
              'border-b border-wiki-border dark:border-wiki-border-dark',
              'hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark',
              !hasSelection
                ? 'font-medium text-wiki-link dark:text-wiki-link-dark'
                : 'text-wiki-muted dark:text-wiki-muted-dark',
            ].join(' ')}
          >
            All
          </button>

          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label
                key={opt}
                className={[
                  'flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[12px]',
                  'hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark',
                  checked ? 'text-wiki-text dark:text-wiki-text-dark font-medium' : 'text-wiki-text dark:text-wiki-text-dark',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  className="w-3 h-3 flex-shrink-0 accent-wiki-link dark:accent-wiki-link-dark"
                />
                {renderOption ? renderOption(opt) : opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
