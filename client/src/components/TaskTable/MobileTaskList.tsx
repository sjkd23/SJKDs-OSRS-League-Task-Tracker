import { memo } from 'react';
import type { TaskView, SortConfig, SortField } from '@/types/task';
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
import { TIER_COLOURS, completionTierClass } from '@/components/TaskRow/TaskRow';

interface MobileTaskListProps {
  tasks: TaskView[];
  sort: SortConfig;
  onSortChange: (field: SortField) => void;
  onToggleCompleted: (id: string) => void;
  onToggleTodo: (id: string) => void;
}

/** Returns true when a requirements string is effectively empty / not applicable. */
function isNaRequirements(text: string | undefined): boolean {
  const t = text?.trim();
  return !t || t === 'N/A' || t === '\u2014' || t === '-';
}

const MobileTaskCard = memo(function MobileTaskCard({
  task,
  onToggleCompleted,
  onToggleTodo,
}: {
  task: TaskView;
  onToggleCompleted: (id: string) => void;
  onToggleTodo: (id: string) => void;
}) {
  const regionIcon = regionIconUrl(task.area);
  const regionColor = REGION_COLOUR[task.area];
  const reqIsNa = isNaRequirements(task.requirementsText);
  const areaUrl = regionWikiUrl(task.area);

  // Styling based on wiki completed rows logic
  const cardBgClass = task.completed
    ? 'bg-[#c8e8c8] text-[#4a6b4a] dark:bg-[#182b18] dark:text-[#7aaa7a] border-[#b8ddb8] dark:border-[#1e3620]'
    : 'bg-wiki-surface dark:bg-wiki-surface-dark border-wiki-border dark:border-wiki-border-dark';

  return (
    <div
      className={['flex flex-col border rounded-sm mb-3 shadow-sm overflow-hidden transition-colors', cardBgClass].join(' ')}
    >
      {/* HEADER: Area Icon, Name, Tier/Points, Completion % */}
      <div className="flex items-start gap-2 p-3 pb-2 border-b border-wiki-border dark:border-wiki-border-dark/50">
        <div className="shrink-0 mt-0.5 flex flex-col items-center">
          {(() => {
            const icon = (
              <WikiIcon
                src={regionIcon ?? ''}
                alt={task.area}
                className={regionIconClass(task.area, 'table')}
                fallbackColor={regionColor}
              />
            );
            return areaUrl ? (
              <a
                href={areaUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={task.area}
                className="inline-flex items-center no-underline hover:opacity-80"
              >
                {icon}
              </a>
            ) : (
              icon
            );
          })()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-tight break-words">
            {task.nameParts && task.nameParts.length > 0 ? (
              <RichText parts={task.nameParts} />
            ) : task.wikiUrl ? (
              <a
                href={task.wikiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-wiki-link dark:text-wiki-link-dark hover:underline"
              >
                {task.name}
              </a>
            ) : (
              <span>{task.name}</span>
            )}
          </div>
          <div className="text-[12px] opacity-80 mt-0.5">{task.area}</div>
        </div>

        <div className="flex flex-col items-end shrink-0 gap-1 text-[13px] ml-1">
          <div className="flex items-center gap-1 font-semibold whitespace-nowrap">
            {difficultyIconUrl(task.tier) && (
              <WikiIcon
                src={difficultyIconUrl(task.tier)!}
                alt={task.tier}
                className="w-[16px] h-[16px] flex-shrink-0"
              />
            )}
            <span className={task.completed ? 'opacity-90' : TIER_COLOURS[task.tier] ?? ''}>
              {task.points}
            </span>
          </div>
          <div
            className={[
              'px-1.5 py-0.5 text-[11px] rounded whitespace-nowrap font-medium',
              task.completed ? 'bg-black/10 dark:bg-white/10' : completionTierClass(task.completionPercent)
            ].join(' ')}
          >
            {task.completionPercent.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* BODY: Description */}
      <div className="p-3 py-2 text-[14px] leading-snug break-words opacity-90">
        {task.descriptionParts && task.descriptionParts.length > 0 ? (
          <RichText parts={task.descriptionParts} />
        ) : (
          task.description
        )}
      </div>

      {/* REQUIREMENTS */}
      <div className={[
        'px-3 py-2 text-[13px] border-t border-wiki-border dark:border-wiki-border-dark/50 break-words',
        reqIsNa && !task.completed ? 'bg-black/5 dark:bg-white/5' : 'bg-black/5 dark:bg-black/20'
      ].join(' ')}>
        <div className="text-[11px] font-bold opacity-60 mb-1 uppercase tracking-wider">
          Requirements
        </div>
        <div className="opacity-90">
          <RequirementsCell
            requirementsText={task.requirementsText}
            requirementsParts={task.requirementsParts}
          />
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex items-stretch divide-x divide-wiki-border dark:divide-wiki-border-dark/50 border-t border-wiki-border dark:border-wiki-border-dark/50">
        <button
          onClick={() => onToggleCompleted(task.id)}
          className={[
            'flex-1 py-3 px-2 text-[14px] font-semibold text-center transition-colors touch-manipulation',
            task.completed
              ? 'hover:bg-white/20 dark:hover:bg-black/20 text-[#2a502a] dark:text-[#9bc89b]'
              : 'hover:bg-black/5 dark:hover:bg-white/5 text-wiki-text dark:text-wiki-text-dark'
          ].join(' ')}
        >
          {task.completed ? '✓ Completed' : 'Mark Complete'}
        </button>
        <button
          onClick={() => onToggleTodo(task.id)}
          className={[
            'flex-1 py-3 px-2 text-[14px] font-semibold text-center transition-colors touch-manipulation flex items-center justify-center gap-1.5',
            task.completed
              ? 'hover:bg-white/20 dark:hover:bg-black/20'
              : 'hover:bg-black/5 dark:hover:bg-white/5',
            task.isTodo && !task.completed ? 'text-blue-700 dark:text-blue-400' : ''
          ].join(' ')}
        >
          {task.isTodo ? '★ Pinned' : '☆ To-do'}
        </button>
      </div>
    </div>
  );
});

export function MobileTaskList({
  tasks,
  // sort,
  // onSortChange,
  onToggleCompleted,
  onToggleTodo,
}: MobileTaskListProps) {
  return (
    <div className="flex flex-col gap-2 p-2">
      {tasks.length === 0 ? (
        <div className="text-center py-8 text-wiki-muted dark:text-wiki-muted-dark italic text-[13px]">
          No tasks match the current filters.{' '}
          <span className="not-italic text-wiki-link dark:text-wiki-link-dark cursor-pointer hover:underline">
            Try adjusting or resetting the filters.
          </span>
        </div>
      ) : (
        tasks.map((task) => (
          <MobileTaskCard
            key={task.id}
            task={task}
            onToggleCompleted={onToggleCompleted}
            onToggleTodo={onToggleTodo}
          />
        ))
      )}
    </div>
  );
}
