import { memo, useMemo } from 'react';
import type { AppTask, TaskFilters, Tier } from '@/types/task';
import { uniqueAreas, uniqueSkillsFromRequirements, UI_CATEGORIES } from '@/utils/taskFilters';
import { FilterToggleGroup } from './FilterToggleGroup';
import { WikiIcon } from '@/components/WikiIcon/WikiIcon';
import { skillIconUrl, regionIconUrl, regionIconClass, difficultyIconUrl, categoryIconUrl, REGION_COLOUR } from '@/lib/wikiIcons';
import { TIER_POINTS } from '@/lib/mapScraperTask';

const TIERS: Tier[] = ['Easy', 'Medium', 'Hard', 'Elite', 'Master'];

// Muted accent for skill badge fallbacks
const SKILL_FALLBACK_COLOUR = '#5a7a9a';

interface TaskFiltersBarProps {
  tasks: AppTask[];
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

export const TaskFiltersBar = memo(function TaskFiltersBar({ tasks, filters, onChange }: TaskFiltersBarProps) {
  const areas = useMemo(() => uniqueAreas(tasks), [tasks]);
  const skills = useMemo(() => uniqueSkillsFromRequirements(tasks), [tasks]);

  function set<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({ ...filters, tiers: [], skills: [], areas: [], categories: [], searchQuery: '' });
  }

  const hasActiveFilters =
    filters.tiers.length > 0 ||
    filters.skills.length > 0 ||
    filters.areas.length > 0 ||
    filters.categories.length > 0 ||
    filters.searchQuery.trim() !== '';

  const activeCount =
    filters.tiers.length +
    filters.skills.length +
    filters.areas.length +
    filters.categories.length +
    (filters.searchQuery.trim() ? 1 : 0);

  return (
    <div>
      {/* Strip header row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-[13px] text-wiki-muted dark:text-wiki-muted-dark uppercase tracking-wide">
          Filter
        </span>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <span className="text-[13px] font-medium text-wiki-text dark:text-wiki-text-dark">
              {activeCount} filter{activeCount !== 1 ? 's' : ''} active
            </span>
          )}
          {hasActiveFilters && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="text-wiki-link dark:text-wiki-link-dark hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark hover:underline text-[13px] font-semibold py-2 px-1 -mr-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 text-[13px] text-wiki-text dark:text-wiki-text-dark">

        {/* Difficulty — icon + points value only */}
        <FilterToggleGroup<Tier>
          label="Difficulty"
          options={TIERS}
          selected={filters.tiers}
          onChange={(tiers) => set('tiers', tiers)}
          getOptionTitle={(tier) => `${tier} (${TIER_POINTS[tier]} pts)`}
          renderOption={(tier) => {
            const iconPath = difficultyIconUrl(tier);
            return (
              <span className="flex items-center gap-1">
                {iconPath && (
                  <WikiIcon
                    src={iconPath}
                    alt={tier}
                    className="w-[24px] h-[24px] md:w-[26px] md:h-[26px] flex-shrink-0"
                  />
                )}
                <span className="tabular-nums text-[12px]">{TIER_POINTS[tier]}</span>
              </span>
            );
          }}
        />

        {/* Area — icon only */}
        <FilterToggleGroup<string>
          label="Area"
          options={areas}
          selected={filters.areas}
          onChange={(areas) => set('areas', areas)}
          getOptionTitle={(area) => area}
          renderOption={(area) => {
            const iconPath = regionIconUrl(area);
            const color = REGION_COLOUR[area];
            return (
              <WikiIcon
                src={iconPath ?? ''}
                alt={area}
                className={regionIconClass(area, 'filter')}
                fallbackColor={color}
              />
            );
          }}
        />

        {/* Skill — icon only */}
        <FilterToggleGroup<string>
          label="Skill"
          options={skills}
          selected={filters.skills}
          onChange={(skills) => set('skills', skills)}
          getOptionTitle={(skill) => skill}
          renderOption={(skill) => {
            const iconPath = skillIconUrl(skill);
            return (
              <WikiIcon
                src={iconPath ?? ''}
                alt={skill}
                className="w-[24px] h-[24px] md:w-[26px] md:h-[26px] flex-shrink-0"
                fallbackColor={SKILL_FALLBACK_COLOUR}
              />
            );
          }}
        />

        {/* Category — icon only (with tooltip), matching Area/Skill style */}
        <FilterToggleGroup<string>
          label="Category"
          options={[...UI_CATEGORIES]}
          selected={filters.categories}
          onChange={(categories) => set('categories', categories)}
          getOptionTitle={(cat) => cat}
          renderOption={(cat) => {
            const iconPath = categoryIconUrl(cat);
            return (
              <WikiIcon
                src={iconPath ?? ''}
                alt={cat}
                className="w-[24px] h-[24px] md:w-[26px] md:h-[26px] flex-shrink-0"
              />
            );
          }}
        />

        {/* Search bar */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-20 flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-wiki-muted dark:text-wiki-muted-dark pt-[3px]">
            Search
          </span>
          <input
            type="search"
            value={filters.searchQuery}
            onChange={(e) => set('searchQuery', e.target.value)}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            className="
              w-full max-w-[240px] sm:max-w-[280px] min-w-0 h-[30px] px-2 py-0
              text-[13px] text-wiki-text dark:text-wiki-text-dark
              bg-wiki-article dark:bg-wiki-surface-dark
              border border-wiki-border dark:border-wiki-border-dark
              shadow-sm
              rounded
              placeholder:text-wiki-muted dark:placeholder:text-wiki-muted-dark
              focus:outline-none focus:ring-1 focus:ring-wiki-link dark:focus:ring-wiki-link-dark
              transition-shadow
            "
          />
        </div>

        {/* Utility row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-wiki-border dark:border-wiki-border-dark">
          <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] font-medium text-wiki-text dark:text-wiki-text-dark group">
            <input
              type="checkbox"
              checked={filters.showCompleted}
              disabled={filters.showOnlyCompleted}
              onChange={(e) => set('showCompleted', e.target.checked)}
              className="w-4 h-4 rounded border-wiki-border dark:border-wiki-border-dark accent-wiki-link dark:accent-wiki-link-dark cursor-pointer transition-transform group-active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className={filters.showOnlyCompleted ? 'opacity-50' : ''}>Show completed</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] font-medium text-wiki-text dark:text-wiki-text-dark group">
            <input
              type="checkbox"
              checked={filters.showOnlyCompleted}
              onChange={(e) => {
                const isChecked = e.target.checked;
                const nextFilters = { ...filters, showOnlyCompleted: isChecked };
                if (isChecked) {
                  nextFilters.showCompleted = true; // Automatically enable "Show completed"
                }
                onChange(nextFilters);
              }}
              className="w-4 h-4 rounded border-wiki-border dark:border-wiki-border-dark accent-wiki-link dark:accent-wiki-link-dark cursor-pointer transition-transform group-active:scale-90"
            />
            Show only completed
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-[13px] font-medium text-wiki-text dark:text-wiki-text-dark group">
            <input
              type="checkbox"
              checked={filters.showTodoOnly}
              onChange={(e) => set('showTodoOnly', e.target.checked)}
              className="w-4 h-4 rounded border-wiki-border dark:border-wiki-border-dark accent-wiki-link dark:accent-wiki-link-dark cursor-pointer transition-transform group-active:scale-90"
            />
            To-do only
          </label>
        </div>

      </div>
    </div>
  );
});
