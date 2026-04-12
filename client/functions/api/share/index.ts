/**
 * POST /api/share
 *
 * Accepts a SharePayloadV2 object and stores it in Cloudflare KV under a
 * generated short ID. Returns { id, url } on success.
 */

interface Env {
  ROUTE_SHARES: KVNamespace;
}

interface ShareSection {
  n: string;
  d?: string;
  i: (number | [number, string] | { cn: string; cd?: string; nt?: string })[];
}

interface SharePayloadV2 {
  v: 2;
  n: string;
  t?: string;
  s: ShareSection[];
}

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
 */
function validatePayload(raw: unknown): SharePayloadV2 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  if (obj.v !== 2) return null;
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

  return obj as unknown as SharePayloadV2;
}

/** Deep-sanitize the validated payload before storing it. */
function sanitizePayload(payload: SharePayloadV2): SharePayloadV2 {
  const sanitized: SharePayloadV2 = {
    v: 2,
    n: payload.n.trim().slice(0, 200),
    s: payload.s.map((sec) => {
      const sanitizedSec: ShareSection = {
        n: (typeof sec.n === 'string' ? sec.n : '').trim().slice(0, 200) || 'Main',
        i: (sec.i ?? []).flatMap(
          (
            item,
          ): (number | [number, string] | { cn: string; cd?: string; nt?: string })[] => {
            if (typeof item === 'number') return [item];
            if (
              Array.isArray(item) &&
              item.length === 2 &&
              typeof item[0] === 'number' &&
              typeof item[1] === 'string'
            ) {
              return [[item[0], item[1].slice(0, 400)]];
            }
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const ci = item as { cn?: unknown; cd?: unknown; nt?: unknown };
              if (typeof ci.cn === 'string' && ci.cn.trim()) {
                const out: { cn: string; cd?: string; nt?: string } = {
                  cn: ci.cn.slice(0, 200),
                };
                if (typeof ci.cd === 'string' && ci.cd) out.cd = ci.cd.slice(0, 400);
                if (typeof ci.nt === 'string' && ci.nt) out.nt = ci.nt.slice(0, 400);
                return [out];
              }
            }
            return [];
          },
        ),
      };
      if (typeof sec.d === 'string' && sec.d) sanitizedSec.d = sec.d.slice(0, 500);
      return sanitizedSec;
    }),
  };

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
