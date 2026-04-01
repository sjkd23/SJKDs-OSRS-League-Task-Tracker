interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  return (
    <button
      onClick={onToggle}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className={[
        // Sizing — generous click target, not tiny
        'px-3 py-1.5 min-w-[110px]',
        // Border + surface — consistent with wiki controls
        'border border-wiki-border dark:border-wiki-border-dark',
        'bg-wiki-surface dark:bg-wiki-surface-dark',
        // Text
        'text-[13px] text-wiki-text dark:text-wiki-text-dark font-wiki',
        // Hover
        'hover:border-wiki-link dark:hover:border-wiki-link-dark',
        'hover:text-wiki-link dark:hover:text-wiki-link-dark',
        'select-none leading-snug transition-colors',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true">{isDark ? '☀' : '◑'}</span>
        {isDark ? 'Light mode' : 'Dark mode'}
      </span>
    </button>
  );
}

