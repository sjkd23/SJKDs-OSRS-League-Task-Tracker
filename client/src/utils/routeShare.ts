import type { Route, RouteSection, RouteItem } from '@/types/route';

// ─── Constants ────────────────────────────────────────────────────────────────

/** URL query-param key used for shared routes. Kept short to minimise URL length. */
export const SHARE_PARAM = 'r';

const DEFAULT_TASK_TYPE = 'LEAGUE_5';

/**
 * Prefix character that distinguishes v2-compressed links from legacy v2-plain links.
 * A compressed encoded value always starts with 'z'; a legacy value starts with 'e'
 * (the first base64 char of '{"', i.e. 'eyJ').
 */
const COMPRESSED_PREFIX = 'z';

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(encoded: string): Uint8Array<ArrayBuffer> | null {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const buf = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Legacy synchronous encoder — kept for the uncompressed fallback path. */
function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  return bytesToBase64Url(bytes);
}

/** Decode a legacy (uncompressed) base64url value into parsed JSON. */
function fromBase64Url(encoded: string): unknown {
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Compress a JSON-serialisable value with deflate-raw and return
 * COMPRESSED_PREFIX + base64url(compressed bytes).
 *
 * Uses the browser's built-in CompressionStream API (Chrome 80+, Firefox 113+,
 * Safari 16.4+).  Falls back to the uncompressed base64url encoding if the API
 * is unavailable so old browsers still get a working (longer) link.
 */
async function compressPayload(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  const input = new TextEncoder().encode(json);

  if (typeof CompressionStream === 'undefined') {
    // Graceful fallback for environments without CompressionStream support.
    return toBase64Url(value);
  }

  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];

  const readAll = async () => {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      chunks.push(chunk);
    }
  };

  const reading = readAll();
  await writer.write(input);
  await writer.close();
  await reading;

  const totalLen = chunks.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }

  return COMPRESSED_PREFIX + bytesToBase64Url(result);
}

/**
 * Decompress a COMPRESSED_PREFIX-prefixed base64url value into parsed JSON.
 * Returns null on any decoding or decompression failure.
 */
async function decompressPayload(encoded: string): Promise<unknown> {
  // Strip the leading 'z' prefix before decoding bytes.
  const bytes = base64UrlToBytes(encoded.slice(COMPRESSED_PREFIX.length));
  if (!bytes) return null;

  if (typeof DecompressionStream === 'undefined') return null;

  try {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];

    const readAll = async () => {
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
    };

    const reading = readAll();
    await writer.write(bytes);
    await writer.close();
    await reading;

    const totalLen = chunks.reduce((a, b) => a + b.length, 0);
    const result = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { result.set(c, off); off += c.length; }

    return JSON.parse(new TextDecoder().decode(result));
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
 * Encoding: deflate-raw(JSON(v2-payload)) → base64url, prefixed with 'z'.
 * Old uncompressed links (no 'z' prefix) continue to decode correctly.
 *
 * Uses the v2 compact payload schema:
 *   - Tasks referenced by sortId integer (1–4 digits) instead of full ID strings
 *   - Short field names, defaults omitted, UUIDs regenerated on load
 *   - deflate-raw compression yields 4–8× shorter links for typical routes
 *
 * Falls back to uncompressed base64url if CompressionStream is unavailable.
 *
 * @param route  The route to share
 * @param tasks  All available tasks (needed to map taskId → sortId)
 */
export async function buildShareUrl(route: Route, tasks: TaskRef[]): Promise<string> {
  const payload = buildCompactPayload(route, tasks);
  const encoded = await compressPayload(payload);
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, encoded);
  url.hash = '';
  return url.toString();
}

/**
 * Decode a raw `?r=` param value into a Route.
 *
 * Supports both the compressed format ('z' prefix → deflate-raw → JSON)
 * and the legacy uncompressed format (plain base64url JSON) for backward
 * compatibility with links generated before compression was added.
 *
 * Requires the full task list (to map compact sortId integers back to taskIds).
 * Call this only once tasks have finished loading.
 *
 * Returns { ok: false } on any decoding or validation failure.
 */
export async function decodeSharedRoute(
  encoded: string,
  tasks: TaskRef[],
): Promise<{ ok: true; route: Route } | { ok: false; error: string }> {
  let raw: unknown;

  if (encoded.startsWith(COMPRESSED_PREFIX)) {
    // New compressed format: 'z' + base64url(deflate-raw(JSON))
    raw = await decompressPayload(encoded);
  } else {
    // Legacy uncompressed format: base64url(JSON) — backward compat
    raw = fromBase64Url(encoded);
  }

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

// ─── KV-backed short-link API ─────────────────────────────────────────────────

/**
 * Returns true if the `?r=` value is a KV-backed short share ID rather than
 * the old locally-encoded (base64url / compressed) format.
 *
 * Old encoded values are always ≥ 50 characters (typically 100–400 chars).
 * Short KV IDs are ≤ 20 characters.
 */
export function isShortShareId(encoded: string): boolean {
  return encoded.length < 50;
}

/**
 * Build the compact v2 payload and POST it to the share-creation endpoint.
 * Returns { ok: true, url } with the short shareable URL on success.
 * Returns { ok: false, error } with a human-readable message on failure.
 */
export async function createShareLink(
  route: Route,
  tasks: TaskRef[],
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const payload = buildCompactPayload(route, tasks);

  let response: Response;
  try {
    response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      error: 'Could not reach the share server. Check your connection and try again.',
    };
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Share server returned an unreadable response (${response.status}).` };
  }

  if (!response.ok) {
    const msg =
      typeof data.error === 'string' ? data.error : `Share server error (${response.status}).`;
    return { ok: false, error: msg };
  }

  if (typeof data.url !== 'string' || !data.url) {
    return { ok: false, error: 'Share server did not return a valid URL.' };
  }

  return { ok: true, url: data.url };
}

/**
 * Fetch a KV-backed shared route by its short ID and decode it into a Route.
 * Requires the full task list (to map compact sortId integers back to taskIds).
 *
 * Returns { ok: true, route } on success or { ok: false, error } on failure.
 */
export async function loadSharedRouteFromApi(
  id: string,
  tasks: TaskRef[],
): Promise<{ ok: true; route: Route } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(`/api/share/${encodeURIComponent(id)}`);
  } catch {
    return {
      ok: false,
      error: 'Could not load the shared route. Check your connection and try again.',
    };
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: `Share server returned an unreadable response (${response.status}).` };
  }

  if (!response.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : response.status === 404
          ? 'This share link has expired or does not exist.'
          : `Share server error (${response.status}).`;
    return { ok: false, error: msg };
  }

  if (!data.route || typeof data.route !== 'object') {
    return { ok: false, error: 'Share server returned invalid route data.' };
  }

  const obj = data.route as Record<string, unknown>;
  if (obj.v !== 2) {
    return { ok: false, error: 'Unsupported share format returned from server.' };
  }

  const route = decodeV2Payload(obj as unknown as SharePayloadV2, tasks);
  if (!route) {
    return { ok: false, error: 'The shared route data is malformed or empty.' };
  }

  return { ok: true, route };
}
