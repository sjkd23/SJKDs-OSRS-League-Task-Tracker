/**
 * POST /api/share
 *
 * Accepts a SharePayloadV2 or SharePayloadV3 object and stores it in
 * Cloudflare KV under a generated short ID. Returns { id, url } on success.
 *
 * Schema versions accepted:
 *   v: 2  — original compact format (tasks as bare sortId numbers / [id, note] tuples)
 *   v: 3  — adds located-task objects { ti, nt?, loc } and extended custom items
 *            { cn, cd?, nt?, ic?, loc? } with optional [x,y,plane] coordinate tuples
 */

interface Env {
  ROUTE_SHARES: KVNamespace;
}

// ─── v2 item shapes ───────────────────────────────────────────────────────────

type CustomItemV2 = { cn: string; cd?: string; nt?: string };
type ShareItemV2 = number | [number, string] | CustomItemV2;

interface ShareSectionV2 {
  n: string;
  d?: string;
  i: ShareItemV2[];
}

interface SharePayloadV2 {
  v: 2;
  n: string;
  t?: string;
  s: ShareSectionV2[];
}

// ─── v3 item shapes ───────────────────────────────────────────────────────────

/** Compact world-map coordinate tuple: [x, y, plane]. */
type LocTuple = [number, number, number];

/** Regular task item that carries an explicit location. */
type LocatedTaskItem = { ti: number; nt?: string; loc: LocTuple };

/** Custom (non-game) task item in v3 format. */
type CustomItemV3 = { cn: string; cd?: string; nt?: string; ic?: string; loc?: LocTuple };

type ShareItemV3 = number | [number, string] | LocatedTaskItem | CustomItemV3;

interface ShareSectionV3 {
  n: string;
  d?: string;
  i: ShareItemV3[];
}

interface SharePayloadV3 {
  v: 3;
  n: string;
  t?: string;
  s: ShareSectionV3[];
}

type SharePayload = SharePayloadV2 | SharePayloadV3;

/** Generate a 10-char URL-safe alphanumeric ID. */
function generateId(): string {
  // Omit visually ambiguous chars (0/O, 1/I/l).
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Validate the top-level shape of the incoming body.
 * Returns the typed payload or null if invalid.
 * Accepts both v2 (no location) and v3 (location-aware) payloads.
 */
function validatePayload(raw: unknown): SharePayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (obj.v !== 2 && obj.v !== 3) return null;
  if (typeof obj.n !== 'string' || !obj.n.trim() || obj.n.length > 200) return null;
  if (!Array.isArray(obj.s) || obj.s.length === 0 || obj.s.length > 100) return null;

  let totalItems = 0;
  for (const rawSec of obj.s) {
    if (!rawSec || typeof rawSec !== 'object' || Array.isArray(rawSec)) return null;
    const sec = rawSec as Record<string, unknown>;
    if (typeof sec.n !== 'string') return null;
    if (!Array.isArray(sec.i)) return null;
    totalItems += (sec.i as unknown[]).length;
    if (totalItems > 2000) return null;
  }

  return obj as unknown as SharePayload;
}

/**
 * Validate that a value is a well-formed coordinate tuple [x, y, plane].
 * All three elements must be finite integers within plausible OSRS map bounds.
 */
function isValidLocTuple(v: unknown): v is LocTuple {
  if (!Array.isArray(v) || v.length !== 3) return false;
  const [x, y, plane] = v as [unknown, unknown, unknown];
  return (
    typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 16383 &&
    typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= 16383 &&
    typeof plane === 'number' && Number.isFinite(plane) && plane >= 0 && plane <= 3
  );
}

/** Deep-sanitize the validated payload before storing it. */
function sanitizePayload(payload: SharePayload): SharePayload {
  const version = payload.v; // preserved as-is (2 or 3)

  const sanitizedSections = payload.s.map((sec) => {
    const sanitizedItems: (ShareItemV2 | ShareItemV3)[] = (sec.i ?? []).flatMap(
      (item): (ShareItemV2 | ShareItemV3)[] => {
        // number — regular task, no note, no location
        if (typeof item === 'number') return [item];

        // [number, string] — regular task with note, no location
        if (
          Array.isArray(item) &&
          item.length === 2 &&
          typeof item[0] === 'number' &&
          typeof item[1] === 'string'
        ) {
          return [[item[0], item[1].slice(0, 400)]];
        }

        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const raw = item as Record<string, unknown>;

          // { ti, nt?, loc } — located regular task (v3 only)
          if (typeof raw.ti === 'number') {
            if (!isValidLocTuple(raw.loc)) return []; // loc is required for this shape
            const out: LocatedTaskItem = { ti: raw.ti, loc: raw.loc };
            if (typeof raw.nt === 'string' && raw.nt) out.nt = raw.nt.slice(0, 400);
            return [out];
          }

          // { cn, cd?, nt?, ic?, loc? } — custom task (v2 or v3)
          if (typeof raw.cn === 'string' && raw.cn.trim()) {
            const out: CustomItemV3 = { cn: raw.cn.slice(0, 200) };
            if (typeof raw.cd === 'string' && raw.cd) out.cd = raw.cd.slice(0, 400);
            if (typeof raw.nt === 'string' && raw.nt) out.nt = raw.nt.slice(0, 400);
            if (typeof raw.ic === 'string' && raw.ic) out.ic = raw.ic.slice(0, 200);
            if (isValidLocTuple(raw.loc)) out.loc = raw.loc;
            return [out];
          }
        }

        // Unrecognised shape — drop it.
        return [];
      },
    );

    const sanitizedSec: ShareSectionV2 | ShareSectionV3 = {
      n: (typeof sec.n === 'string' ? sec.n : '').trim().slice(0, 200) || 'Main',
      i: sanitizedItems as ShareItemV2[],
    };
    if (typeof sec.d === 'string' && sec.d) sanitizedSec.d = sec.d.slice(0, 500);
    return sanitizedSec;
  });

  const sanitized: SharePayload = {
    v: version,
    n: payload.n.trim().slice(0, 200),
    s: sanitizedSections as SharePayloadV2['s'],
  } as SharePayload;

  if (typeof payload.t === 'string') sanitized.t = payload.t.slice(0, 50);
  return sanitized;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Reject oversized payloads (512 KB limit).
  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > 524288) {
    return jsonResponse({ error: 'Payload too large.' }, 413);
  }

  let bodyText: string;
  try {
    bodyText = await request.text();
  } catch {
    return jsonResponse({ error: 'Could not read request body.' }, 400);
  }

  if (bodyText.length > 524288) {
    return jsonResponse({ error: 'Payload too large.' }, 413);
  }

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const validated = validatePayload(rawBody);
  if (!validated) {
    return jsonResponse({ error: 'Invalid route payload.' }, 400);
  }

  const sanitized = sanitizePayload(validated);

  const stored = JSON.stringify({
    v: 1,
    createdAt: new Date().toISOString(),
    route: sanitized,
  });

  // Generate a unique ID, retrying on the rare collision.
  let id: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateId();
    const existing = await env.ROUTE_SHARES.get(candidate);
    if (!existing) {
      id = candidate;
      break;
    }
  }

  if (!id) {
    return jsonResponse(
      { error: 'Could not generate a unique share ID. Please try again.' },
      500,
    );
  }

  // Store with a 365-day expiry.
  await env.ROUTE_SHARES.put(id, stored, { expirationTtl: 31536000 });

  const origin = new URL(request.url).origin;
  const url = `${origin}/?r=${id}`;

  return jsonResponse({ id, url });
};
