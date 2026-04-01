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
  return tasks.filter((task) => {
    if (filters.tiers.length > 0 && !filters.tiers.includes(task.tier)) return false;
    if (filters.skills.length > 0) {
      // Match against the real per-task skill requirements, not the broad scraper category.
      // A task matches if ANY of its required skills is in the selected filter set.
      const taskSkillNames = task.skills.map(skillNameFromString);
      if (!filters.skills.some((s) => taskSkillNames.includes(s))) return false;
    }
    if (filters.areas.length > 0 && !filters.areas.includes(task.area)) return false;
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
      case 'skill':
        cmp = a.skill.localeCompare(b.skill);
        break;
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
