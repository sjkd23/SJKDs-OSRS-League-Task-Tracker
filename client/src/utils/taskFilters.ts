import type { TaskView, TaskFilters, SortConfig } from '@/types/task';
import { TIER_ORDER } from '@/lib/mapScraperTask';

/**
 * Extracts the base skill name from a "SkillName level" display string.
 * e.g. "Defence 40" → "Defence", "Runecraft 91" → "Runecraft"
 */
function skillNameFromString(s: string): string {
  return s.replace(/\s+\d+$/, '').trim();
}

export function filterTasks(tasks: TaskView[], filters: TaskFilters): TaskView[] {
  const searchQuery = filters.searchQuery.trim().toLowerCase();

  return tasks.filter((task) => {
    // Hide ignored tasks first — when enabled, hidden means hidden even if search/filters match.
    if (filters.hideIgnored && task.isIgnored) return false;
    if (filters.tiers.length > 0 && !filters.tiers.includes(task.tier)) return false;
    if (filters.skills.length > 0) {
      // Match against the real per-task skill requirements, not the broad scraper category.
      // A task matches if ANY of its required skills is in the selected filter set.
      const taskSkillNames = task.skills.map(skillNameFromString);
      if (!filters.skills.some((s) => taskSkillNames.includes(s))) return false;
    }
    if (filters.areas.length > 0 && !filters.areas.includes(task.area)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(task.uiCategory)) return false;
    if (searchQuery) {
      const haystack = `${task.name} ${task.description} ${task.requirementsText}`.toLowerCase();
      if (!haystack.includes(searchQuery)) return false;
    }
    if (filters.showOnlyCompleted && !task.completed) return false;
    if (!filters.showCompleted && task.completed) return false;
    if (filters.showTodoOnly && !task.isTodo) return false;
    return true;
  });
}

export function sortTasks(tasks: TaskView[], sort: SortConfig): TaskView[] {
  return [...tasks].sort((a, b) => {
    let cmp = 0;

    switch (sort.field) {
      case 'name':
        cmp = a.name.localeCompare(b.name);
        break;
      case 'tier':
        cmp = (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0);
        break;
      case 'skill': {
        // Requirements sorting:
        // 1. Group N/A-like values last.
        // 2. Sort by FIRST skill name alphabetically.
        // 3. Then by that skill's required level.
        // 4. Fallback to raw text if no skills.
        
        const reqA = a.requirementsText.trim();
        const reqB = b.requirementsText.trim();
        const isNA_A = !reqA || reqA === '—' || reqA.toLowerCase() === 'n/a';
        const isNA_B = !reqB || reqB === '—' || reqB.toLowerCase() === 'n/a';

        if (isNA_A && isNA_B) {
          cmp = 0;
        } else if (isNA_A) {
          cmp = 1;
        } else if (isNA_B) {
          cmp = -1;
        } else {
          // Both have requirements. Try to extract skill + level.
          // a.skills looks like ["Farming 70", "Magic 70"]
          const skillA = a.skills[0] || '';
          const skillB = b.skills[0] || '';

          if (skillA && skillB) {
            const nameA = skillNameFromString(skillA);
            const nameB = skillNameFromString(skillB);
            
            cmp = nameA.localeCompare(nameB);
            if (cmp === 0) {
              const levelA = parseInt(skillA.match(/\d+$/)?.[0] || '0', 10);
              const levelB = parseInt(skillB.match(/\d+$/)?.[0] || '0', 10);
              cmp = levelA - levelB;
            }
          } else if (skillA) {
            cmp = -1;
          } else if (skillB) {
            cmp = 1;
          } else {
            cmp = reqA.localeCompare(reqB);
          }
        }
        break;
      }
      case 'area':
        cmp = a.area.localeCompare(b.area);
        break;
      case 'points':
        cmp = a.points - b.points;
        break;
      case 'description':
        cmp = a.description.localeCompare(b.description);
        break;
      case 'completionPercent':
        cmp = a.completionPercent - b.completionPercent;
        break;
      case 'isTodo':
        // ascending = todos first
        cmp = (b.isTodo ? 1 : 0) - (a.isTodo ? 1 : 0);
        break;
    }

    return sort.direction === 'desc' ? -cmp : cmp;
  });
}

// ─── Helpers for deriving filter option lists from task data ──────────────────

/** Returns sorted unique area values present in the given task list. */
export function uniqueAreas(tasks: { area: string }[]): string[] {
  return [...new Set(tasks.map((t) => t.area))].sort();
}

/**
 * Returns sorted unique skill *names* derived from the real per-task skill
 * requirements (task.skills array). Uses actual OSRS skill names such as
 * "Woodcutting", "Firemaking", "Thieving" — not the scraper's broad category.
 *
 * Tasks with no skill requirements contribute nothing to this list, which is
 * correct: filtering by "Woodcutting" should not match tasks with no details.
 */
export function uniqueSkillsFromRequirements(tasks: { skills: string[] }[]): string[] {
  const names = new Set<string>();
  for (const task of tasks) {
    for (const s of task.skills) {
      const name = skillNameFromString(s);
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Returns the UI category options that are actually present in the given task
 * list, preserving the canonical display order defined in `UI_CATEGORIES`.
 *
 * Importing UI_CATEGORIES here keeps the ordering consistent everywhere
 * without duplicating the constant.
 */
export { UI_CATEGORIES } from '@/lib/mapScraperTask';
