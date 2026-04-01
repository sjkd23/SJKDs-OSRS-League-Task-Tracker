import { Router, type Request, type Response } from 'express';
import { runWikiSyncLookup } from '../services/wikiSyncService';
import type { WikiSyncLookupRequest } from '../types/wikiSync';

export const wikiSyncRouter = Router();

/**
 * POST /api/wikisync/lookup
 *
 * Accepts { username, wikiUrl?, debug?, headed? } and runs a Playwright-based
 * scrape of the OSRS Wiki league tasks page to extract personalised completion
 * state via the WikiSync UI.
 *
 * This does NOT call the WikiSync API directly — it uses the public wiki page
 * UI only, as the wiki requests for third-party integrations.
 *
 * Responds with a WikiSyncImportResult (see server/src/types/wikiSync.ts).
 * Always returns 200 — the `success` field in the body indicates whether
 * personalisation was confirmed.
 */
wikiSyncRouter.post('/lookup', async (req: Request, res: Response) => {
  const body = req.body as Partial<WikiSyncLookupRequest>;

  if (!body.username || typeof body.username !== 'string') {
    res.status(400).json({ error: 'username is required and must be a string.' });
    return;
  }

  const username = body.username.trim();
  if (username.length === 0 || username.length > 12) {
    res.status(400).json({
      error: 'username must be between 1 and 12 characters.',
    });
    return;
  }

  const lookupReq: WikiSyncLookupRequest = {
    username,
    wikiUrl: typeof body.wikiUrl === 'string' ? body.wikiUrl : undefined,
    // debug and headed are only allowed for local dev usage and are opt-in.
    debug:  body.debug  === true,
    headed: body.headed === true,
  };

  console.log(
    `[wikisync] Lookup requested — user="${username}"`,
    lookupReq.wikiUrl ? `url="${lookupReq.wikiUrl}"` : '',
    lookupReq.debug ? '(debug)' : '',
  );

  try {
    const result = await runWikiSyncLookup(lookupReq);
    console.log(
      `[wikisync] Lookup complete — success=${result.success}`,
      `completed=${result.summary.completedTasksFound}/${result.summary.totalTasksFound}`,
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[wikisync] Unexpected error during lookup:', message);
    res.status(500).json({
      error:   'An unexpected error occurred while running the WikiSync lookup.',
      details: message,
    });
  }
});
