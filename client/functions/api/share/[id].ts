/**
 * GET /api/share/:id
 *
 * Retrieves a previously stored share payload from Cloudflare KV and returns
 * it as { route: SharePayloadV2 }. Returns 404 JSON if the ID is not found or
 * has expired.
 */

interface Env {
  ROUTE_SHARES: KVNamespace;
}

interface StoredShare {
  v: 1;
  createdAt: string;
  route: Record<string, unknown>; // SharePayloadV2
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;

  const { id } = params as Record<string, string>;

  // Basic sanity check on the ID format — alphanumeric, 5–30 chars.
  if (!id || !/^[A-Za-z0-9_-]{5,30}$/.test(id)) {
    return jsonResponse({ error: 'Invalid share ID.' }, 400);
  }

  let stored: string | null;
  try {
    stored = await env.ROUTE_SHARES.get(id);
  } catch {
    return jsonResponse({ error: 'Could not reach share storage.' }, 503);
  }

  if (!stored) {
    return jsonResponse({ error: 'This share link has expired or does not exist.' }, 404);
  }

  let parsed: StoredShare;
  try {
    parsed = JSON.parse(stored) as StoredShare;
  } catch {
    return jsonResponse({ error: 'Stored share data is corrupt.' }, 500);
  }

  if (!parsed.route || typeof parsed.route !== 'object') {
    return jsonResponse({ error: 'Stored share data is missing route payload.' }, 500);
  }

  return jsonResponse({ route: parsed.route });
};
