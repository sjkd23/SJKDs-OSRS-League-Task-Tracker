import type { TaskView } from '@/types/task';
import { WikiIcon } from '@/components/WikiIcon/WikiIcon';
import { RichText } from '@/components/RichText/RichText';
import { RequirementsCell } from '@/components/TaskRow/RequirementsCell';
import {
  regionIconUrl,
  regionIconClass,
  difficultyIconUrl,
  REGION_COLOUR,
  regionWikiUrl,
} from '@/lib/wikiIcons';

// Colored text for each difficulty tier — no badges, just inline text
const TIER_COLOURS: Record<string, string> = {
  Easy:   'text-difficulty-easy',
  Medium: 'text-difficulty-medium',
  Hard:   'text-difficulty-hard',
  Elite:  'text-difficulty-elite',
  Master: 'text-difficulty-master',
};

/** Maps a completionPercent value to a background + text colour class pair. */
function completionTierClass(pct: number): string {
  if (pct >= 50)   return 'bg-[#b8e4f0] text-[#0e5a72] dark:bg-[#0e4a60] dark:text-[#7fd4ec]'; // cyan/blue
  if (pct >= 10)   return 'bg-[#b8e8b8] text-[#2a6b2a] dark:bg-[#1a4a1a] dark:text-[#7acc7a]'; // green
  if (pct >= 1)    return 'bg-[#f5e080] text-[#6b5000] dark:bg-[#4a3800] dark:text-[#d4b84a]'; // yellow
  if (pct >= 0.1)  return 'bg-[#f5c080] text-[#7a3200] dark:bg-[#4a2000] dark:text-[#d4904a]'; // orange
  return                  'bg-[#f5a0a0] text-[#7a1a1a] dark:bg-[#4a1010] dark:text-[#d47070]'; // red
}

interface TaskRowProps {
  task: TaskView;
  onToggleCompleted: (id: string) => void;
  onToggleTodo: (id: string) => void;
}

/** Returns true when a requirements string is effectively empty / not applicable. */
function isNaRequirements(text: string | undefined): boolean {
  const t = text?.trim();
  return !t || t === 'N/A' || t === '\u2014' || t === '-';
}

export function TaskRow({ task, onToggleCompleted, onToggleTodo }: TaskRowProps) {
  const regionIcon = regionIconUrl(task.area);
  const regionColor = REGION_COLOUR[task.area];
  const reqIsNa = isNaRequirements(task.requirementsText);

  /**
   * Row-level click handler for completion toggle.
   * Ignored when the click originates from an interactive child element
   * (links, buttons, inputs) to prevent accidental toggling.
   */
  function handleRowClick(e: React.MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, [role="button"]')) return;
    onToggleCompleted(task.id);
  }

  return (
    <tr
      className={task.completed ? 'task-completed' : 'task-completable'}
      onClick={handleRowClick}
      style={{ cursor: 'pointer' }}
      aria-label={task.completed ? `${task.name} — completed` : `${task.name} — click to mark complete`}
    >
      {/* Area — region icon; clickable for named regions, plain for Global */}
      <td className="px-2 py-1.5 text-center align-middle">
        <span className="flex items-center justify-center">
          {(() => {
            const areaUrl = regionWikiUrl(task.area);
            const icon = (
              <WikiIcon
                src={regionIcon ?? ''}
                alt={task.area}
                className={regionIconClass(task.area, 'table')}
                fallbackColor={regionColor}
              />
            );
            if (areaUrl) {
              return (
                <a
                  href={areaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={task.area}
                  className="inline-flex items-center no-underline hover:opacity-80"
                >
                  {icon}
                </a>
              );
            }
            return icon;
          })()}
        </span>
      </td>

      {/* Name — rich parts when available; wiki-blue hyperlink fallback; plain text otherwise */}
      <td className="px-2 py-1.5 align-middle">
        {task.nameParts && task.nameParts.length > 0 ? (
          <RichText parts={task.nameParts} />
        ) : task.wikiUrl ? (
          <a
            href={task.wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-wiki-link dark:text-wiki-link-dark hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark"
          >
            {task.name}
          </a>
        ) : (
          <span>{task.name}</span>
        )}
      </td>

      {/* Task description — rich parts when available; plain text fallback */}
      <td className="px-2 py-1.5 text-wiki-text dark:text-wiki-text-dark leading-snug align-middle">
        {task.descriptionParts && task.descriptionParts.length > 0 ? (
          <RichText parts={task.descriptionParts} />
        ) : (
          task.description
        )}
      </td>

      {/* Requirements — icon-based rendering always; links from enriched parts when available.
           N/A rows get a lighter background to visually match the wiki reference,
           but only if the task is NOT completed (so the green styling can win). */}
      <td
        className={[
          'px-2 py-1.5 text-wiki-text dark:text-wiki-text-dark align-middle',
          reqIsNa && !task.completed ? 'req-na-cell' : ''
        ].join(' ')}
      >
        <RequirementsCell
          requirementsText={task.requirementsText}
          requirementsParts={task.requirementsParts}
        />
      </td>

      {/* Points — difficulty icon + numeric points value, tier-coloured */}
      <td className="p-0 align-middle whitespace-nowrap">
        <div className="flex items-center justify-center gap-1 px-1 py-1.5">
          {difficultyIconUrl(task.tier) && (
            <WikiIcon
              src={difficultyIconUrl(task.tier)!}
              alt={task.tier}
              className="w-[18px] h-[18px] flex-shrink-0"
            />
          )}
          <span className={`tabular-nums font-medium ${TIER_COLOURS[task.tier] ?? ''}`}>
            {task.points}
          </span>
        </div>
      </td>

      {/* Completion % — colour-coded by tier */}
      <td className={`p-0 align-middle ${completionTierClass(task.completionPercent)}`}>
        <div className="flex items-center justify-center px-1 py-1.5 h-full">
          <span className="tabular-nums text-[13px] font-medium">
            {task.completionPercent.toFixed(1)}%
          </span>
        </div>
      </td>

      {/* To-do — entire cell is the click target; no inner box */}
      <td className="p-0 align-middle">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleTodo(task.id); }}
          title={task.isTodo ? 'Remove from To-do list' : 'Add to To-do list'}
          aria-label={task.isTodo ? 'Remove from To-do list' : 'Add to To-do list'}
          aria-pressed={task.isTodo}
          className={[
            'w-full flex items-center justify-center py-2 transition-colors',
            task.isTodo
              ? 'text-wiki-link dark:text-wiki-link-dark bg-wiki-link/10 dark:bg-wiki-link-dark/10'
              : 'text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 12 14"
            fill={task.isTodo ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.4"
            className="w-[18px] h-[21px]"
            aria-hidden="true"
          >
            <path d="M2 1h8a1 1 0 0 1 1 1v11l-5-3-5 3V2a1 1 0 0 1 1-1Z" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

