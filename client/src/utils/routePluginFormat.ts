/**
 * routePluginFormat.ts
 *
 * Parse and build the RuneLite Task Tracker plugin JSON format.
 *
 * This module owns the boundary between the app's internal Route model and
 * the on-disk / clipboard format produced by the plugin. Keeping it separate
 * from RoutePlannerPanel lets the import/export logic be tested and reused
 * independently of any UI concerns.
 *
 * Exported surface:
 *   isNaReqs              — check whether a requirements string is N/A-ish
 *   buildPluginExportPayload — build the plugin-compatible JSON object
 *   parsePluginRoute      — parse a plugin JSON string into a Route
 */

import type { Route, RouteItem, RouteLocation, RouteSection } from '@/types/route';
import type { TaskView } from '@/types/task';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when a requirements string is blank or carries a N/A sentinel. */
export function isNaReqs(text: string | undefined): boolean {
  const t = text?.trim();
  return !t || t === 'N/A' || t === '—' || t === '-';
}

/**
 * Extract a RouteLocation from a raw plugin object if it contains a valid
 * { x, y, plane } sub-object, otherwise returns undefined.
 */
function parsePluginLocation(obj: Record<string, unknown>): RouteLocation | undefined {
  const loc = obj.location;
  if (!loc || typeof loc !== 'object' || Array.isArray(loc)) return undefined;
  const l = loc as Record<string, unknown>;
  if (typeof l.x === 'number' && typeof l.y === 'number' && typeof l.plane === 'number') {
    return { x: l.x, y: l.y, plane: l.plane };
  }
  return undefined;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Build a plugin-compatible JSON object from an internal Route.
 *
 * The returned object matches the format expected by the RuneLite Task Tracker
 * plugin:  { id, name, taskType, author, description, completed, sections }
 *
 * `location` is included on any item that carries one; the plugin may or may
 * not act on it but the field is preserved for round-trip fidelity.
 * `routeItemId` is internal-only and is never written to the export.
 */
export function buildPluginExportPayload(route: Route, allTasks: TaskView[]) {
  const taskMap = new Map<string, number>();
  for (const t of allTasks) {
    taskMap.set(t.id, t.structId);
  }

  return {
    id: route.id,
    name: route.name.trim(),
    taskType: CURRENT_LEAGUE.pluginTaskType,
    author: route.author ?? '',
    description: route.description ?? '',
    completed: [] as number[],
    sections: route.sections.map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description ?? '',
      items: section.items.map((item) => {
        if (item.isCustom) {
          return {
            taskId: null,
            customItem: {
              id: item.taskId,
              label: item.customName ?? '',
              description: item.customDescription ?? item.customName ?? '',
              ...(item.customIcon ? { icon: item.customIcon } : {}),
            },
            ...(item.note ? { note: item.note } : {}),
            ...(item.location ? { location: item.location } : {}),
          };
        }
        let numericId = taskMap.get(item.taskId);
        if (numericId === undefined) {
          const match = item.taskId.match(/^task-(\d+)/);
          numericId = match ? parseInt(match[1], 10) : 0;
        }
        return {
          taskId: numericId,
          ...(item.note ? { note: item.note } : {}),
          ...(item.location ? { location: item.location } : {}),
        };
      }),
    })),
  };
}

// ─── Import ───────────────────────────────────────────────────────────────────

type ParseSuccess = {
  ok: true;
  route: Route;
  imported: number;
  customCount: number;
  unmapped: number;
};
type ParseFailure = { ok: false; error: string };

/**
 * Parse a plugin-exported JSON string into an internal Route.
 *
 * Handles:
 *   - real task items (numeric taskId → structId → appId)
 *   - custom items ({ taskId: null, customItem: { id, label, description } })
 *   - legacy custom items ({ name: string })
 *   - note / notes fields on any item type
 *
 * All new RouteItems receive a fresh routeItemId (UUID) since the plugin
 * format carries no per-entry stable identity.
 *
 * Returns { ok: false, error } for invalid JSON or structurally invalid routes.
 * Individual unresolvable items are silently skipped and counted in `unmapped`.
 */
export function parsePluginRoute(
  jsonText: string,
  allTasks: TaskView[],
): ParseSuccess | ParseFailure {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'Invalid JSON — could not parse the text.' };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'Expected a JSON object at the top level.' };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    return { ok: false, error: 'Route is missing a valid "name" field.' };
  }

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    return { ok: false, error: 'Route is missing a valid "sections" array.' };
  }

  const structIdToAppId = new Map<number, string>();
  for (const t of allTasks) {
    structIdToAppId.set(t.structId, t.id);
  }

  let unmapped = 0;
  let customCount = 0;
  let imported = 0;

  const parsedSections: RouteSection[] = [];

  for (const rawSection of obj.sections as unknown[]) {
    const s =
      typeof rawSection === 'object' && rawSection !== null
        ? (rawSection as Record<string, unknown>)
        : {};
    const rawItems = Array.isArray(s.items) ? s.items : [];
    const sectionName =
      typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Main';

    const sectionItems: RouteItem[] = [];

    for (const rawItem of rawItems) {
      if (typeof rawItem !== 'object' || rawItem === null) continue;
      const it = rawItem as Record<string, unknown>;

      const rawTaskId = it.taskId;
      const numericId =
        typeof rawTaskId === 'number'
          ? rawTaskId
          : typeof rawTaskId === 'string'
            ? parseInt(rawTaskId, 10)
            : NaN;

      if (!isNaN(numericId)) {
        const appId = structIdToAppId.get(numericId);
        if (appId) {
          const baseItem: RouteItem = {
            taskId: appId,
            routeItemId: crypto.randomUUID(),
            ...(typeof it.note === 'string' && it.note ? { note: it.note } : {}),
          };
          const loc = parsePluginLocation(it);
          if (loc) baseItem.location = loc;
          sectionItems.push(baseItem);
          imported++;
          continue;
        }
      }

      const rawCustomItem =
        typeof it.customItem === 'object' && it.customItem !== null
          ? (it.customItem as Record<string, unknown>)
          : null;
      const pluginLabel =
        rawCustomItem && typeof rawCustomItem.label === 'string'
          ? rawCustomItem.label.trim()
          : '';
      const pluginDescription =
        rawCustomItem && typeof rawCustomItem.description === 'string'
          ? rawCustomItem.description.trim()
          : '';

      // Look for note or notes
      const noteVal =
        typeof it.note === 'string'
          ? it.note
          : typeof it.notes === 'string'
            ? it.notes
            : '';
      const rawNote = noteVal.trim();

      if (pluginLabel) {
        const stableId =
          rawCustomItem && typeof rawCustomItem.id === 'string' && rawCustomItem.id
            ? rawCustomItem.id
            : crypto.randomUUID();

        const customEntry: RouteItem = {
          taskId: stableId,
          routeItemId: crypto.randomUUID(),
          isCustom: true,
          customName: pluginLabel,
          customDescription: pluginDescription,
          ...(rawNote ? { note: rawNote } : {}),
        };

        // Prefer item-level location; fall back to customItem.location if present.
        const loc = parsePluginLocation(it) ?? (rawCustomItem ? parsePluginLocation(rawCustomItem) : undefined);
        if (loc) customEntry.location = loc;

        // Preserve the plugin icon identifier if one is provided.
        const rawIcon = rawCustomItem && typeof rawCustomItem.icon === 'string' ? rawCustomItem.icon.trim() : '';
        if (rawIcon) customEntry.customIcon = rawIcon;

        sectionItems.push(customEntry);
        customCount++;
        imported++;
        continue;
      }

      const legacyName = typeof it.name === 'string' ? it.name.trim() : '';
      if (legacyName) {
        sectionItems.push({
          taskId: crypto.randomUUID(),
          routeItemId: crypto.randomUUID(),
          isCustom: true,
          customName: legacyName,
          customDescription: legacyName,
          ...(typeof it.note === 'string' && it.note ? { note: it.note } : {}),
        });
        customCount++;
        imported++;
        continue;
      }

      unmapped++;
    }

    parsedSections.push({
      id: crypto.randomUUID(),
      name: sectionName,
      description: '',
      items: sectionItems,
    });
  }

  const newRoute: Route = {
    id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID(),
    name: (obj.name as string).trim(),
    taskType:
      typeof obj.taskType === 'string' ? obj.taskType : CURRENT_LEAGUE.pluginTaskType,
    author: typeof obj.author === 'string' ? obj.author : '',
    description: typeof obj.description === 'string' ? obj.description : '',
    completed: false,
    sections:
      parsedSections.length > 0
        ? parsedSections
        : [{ id: crypto.randomUUID(), name: 'Main', description: '', items: [] }],
  };

  return { ok: true, route: newRoute, imported, customCount, unmapped };
}
