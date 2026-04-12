import type { Route, RouteSection, RouteItem } from '@/types/route';

// ─── Constants ────────────────────────────────────────────────────────────────

/** URL query-param key used for shared routes. Kept short to minimise URL length. */
export const SHARE_PARAM = 'r';

const DEFAULT_TASK_TYPE = 'LEAGUE_5';

// ─── Compact transport types (v2) ─────────────────────────────────────────────

/**
 * Minimal task reference interface — only what routeShare needs from AppTask/TaskView.
 * Using a structural interface avoids importing the full TaskView type.
 */
interface TaskRef {
  sortId: number;
  id: string;
}

/**
 * v2 compact share item variants:
 *   number           — regular task (sortId, no note)
 *   [number, string] — regular task (sortId) with a note
 *   CustomShareItem  — custom (non-game) task
 */
interface CustomShareItem {
  cn: string;   // customName
  cd?: string;  // customDescription
  nt?: string;  // note
}

type ShareItem = number | [number, string] | CustomShareItem;

interface ShareSection {
  n: string;       // section name
  d?: string;      // section description (omitted when empty)
  i: ShareItem[];  // items
}

interface SharePayloadV2 {
  v: 2;
  n: string;          // route name
  t?: string;         // taskType (omitted when "LEAGUE_5")
  s: ShareSection[];  // sections
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(encoded: string): unknown {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// ─── v2 encoder ───────────────────────────────────────────────────────────────

function buildCompactPayload(route: Route, tasks: TaskRef[]): SharePayloadV2 {
  const taskIdToSortId = new Map<string, number>();
  for (const t of tasks) taskIdToSortId.set(t.id, t.sortId);

  const sections: ShareSection[] = route.sections.map((section) => {
    const items: ShareItem[] = section.items.flatMap((item): ShareItem[] => {
      if (item.isCustom) {
        const ci: CustomShareItem = { cn: (item.customName ?? '').slice(0, 200) };
        if (item.customDescription) ci.cd = item.customDescription.slice(0, 400);
        if (item.note) ci.nt = item.note.slice(0, 400);
        return [ci];
      }

      let sortId = taskIdToSortId.get(item.taskId);
      if (sortId === undefined) {
        // Fallback: extract sortId from the "task-structId-sortId" string format
        const match = item.taskId.match(/^task-\d+-(\d+)$/);
        if (!match) return []; // drop unresolvable items silently
        sortId = parseInt(match[1], 10);
      }

      if (item.note) return [[sortId, item.note.slice(0, 400)]];
      return [sortId];
    });

    const sec: ShareSection = { n: section.name.slice(0, 200), i: items };
    if (section.description) sec.d = section.description.slice(0, 500);
    return sec;
  });

  const payload: SharePayloadV2 = { v: 2, n: route.name.trim().slice(0, 200), s: sections };
  if (route.taskType && route.taskType !== DEFAULT_TASK_TYPE) payload.t = route.taskType;
  return payload;
}

// ─── v2 decoder ───────────────────────────────────────────────────────────────

function decodeV2Payload(payload: SharePayloadV2, tasks: TaskRef[]): Route | null {
  if (!payload.n || !Array.isArray(payload.s) || payload.s.length === 0) return null;

  const sortIdToTaskId = new Map<number, string>();
  for (const t of tasks) sortIdToTaskId.set(t.sortId, t.id);

  const sections: RouteSection[] = [];

  for (const rawSec of payload.s) {
    if (!rawSec || typeof rawSec !== 'object' || Array.isArray(rawSec)) continue;
    const sec = rawSec as ShareSection;

    const sectionName =
      typeof sec.n === 'string' && sec.n.trim() ? sec.n.trim().slice(0, 200) : 'Main';

    const items: RouteItem[] = [];

    if (Array.isArray(sec.i)) {
      for (const rawItem of sec.i) {
        if (typeof rawItem === 'number') {
          // Regular task, no note
          const taskId = sortIdToTaskId.get(rawItem);
          if (taskId) items.push({ taskId });
        } else if (
          Array.isArray(rawItem) &&
          rawItem.length === 2 &&
          typeof rawItem[0] === 'number' &&
          typeof rawItem[1] === 'string'
        ) {
          // Regular task with note
          const taskId = sortIdToTaskId.get(rawItem[0]);
          if (taskId) items.push({ taskId, note: rawItem[1].slice(0, 400) });
        } else if (rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem)) {
          // Custom task
          const ci = rawItem as CustomShareItem;
          if (typeof ci.cn === 'string' && ci.cn.trim()) {
            const customItem: RouteItem = {
              taskId: crypto.randomUUID(),
              isCustom: true,
              customName: ci.cn.slice(0, 200),
            };
            if (ci.cd) customItem.customDescription = ci.cd.slice(0, 400);
            if (ci.nt) customItem.note = ci.nt.slice(0, 400);
            items.push(customItem);
          }
        }
        // Unrecognised item shapes are silently skipped for forward-compatibility
      }
    }

    sections.push({
      id: crypto.randomUUID(),
      name: sectionName,
      description: typeof sec.d === 'string' ? sec.d.slice(0, 500) : '',
      items,
    });
  }

  if (sections.length === 0) return null;

  return {
    id: crypto.randomUUID(),
    name: payload.n,
    taskType: typeof payload.t === 'string' ? payload.t : DEFAULT_TASK_TYPE,
    author: '',
    description: '',
    completed: false,
    sections,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read the raw `?r=` share param from the current URL.
 * Returns null if the param is absent. Does not decode or validate.
 */
export function getShareParam(): string | null {
  return new URLSearchParams(window.location.search).get(SHARE_PARAM);
}

/**
 * Generate a compact shareable URL for the route.
 *
 * Uses the v2 compact payload format:
 *   - Tasks referenced by sortId integer (1–4 digits) instead of full ID strings
 *   - Short field names, defaults omitted, UUIDs regenerated on load
 *   - Produces URLs ~5–8× shorter than a naive full-object encoding
 *
 * @param route  The route to share
 * @param tasks  All available tasks (needed to map taskId → sortId)
 */
export function buildShareUrl(route: Route, tasks: TaskRef[]): string {
  const payload = buildCompactPayload(route, tasks);
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, toBase64Url(payload));
  url.hash = '';
  return url.toString();
}

/**
 * Decode a raw `?r=` param value into a Route.
 *
 * Requires the full task list (to map compact sortId integers back to taskIds).
 * Call this only once tasks have finished loading.
 *
 * Returns { ok: false } on any decoding or validation failure.
 */
export function decodeSharedRoute(
  encoded: string,
  tasks: TaskRef[],
): { ok: true; route: Route } | { ok: false; error: string } {
  const raw = fromBase64Url(encoded);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid share link — the route data could not be decoded.' };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.v === 2) {
    const route = decodeV2Payload(obj as unknown as SharePayloadV2, tasks);
    if (!route) {
      return {
        ok: false,
        error: 'Invalid share link — the route data appears to be malformed or empty.',
      };
    }
    return { ok: true, route };
  }

  return {
    ok: false,
    error: 'Invalid share link — this link uses an unsupported format and cannot be loaded.',
  };
}

/**
 * Remove the `?r=` share param from the URL without reloading the page.
 * Call this after a shared route has been successfully consumed.
 */
export function clearShareParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(null, '', url.toString());
}
