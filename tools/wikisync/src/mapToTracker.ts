/**
 * mapToTracker.ts
 *
 * Stub: convert a WikiSyncImport JSON file into the tracker's local-storage
 * user-state format, then print the result.
 *
 * This is NOT yet wired into the UI — it just shows the data shape that would
 * be imported and lets you verify the mapping before integrating it.
 *
 * Usage:
 *   tsx src/mapToTracker.ts <path-to-import-json>
 *
 * Output on stdout:
 *   A JSON object ready to be written into the tracker's localStorage keys:
 *     osrs-lt:completed   → string[]  (app task IDs)
 *     osrs-lt:todos       → string[]  (empty — WikiSync has no "todo" concept)
 *
 * ── How to apply this to the tracker manually ────────────────────────────────
 *
 *   1. Run this script and copy the "completedIds" array from the output.
 *   2. Open the tracker in your browser.
 *   3. Open the DevTools console.
 *   4. Paste and run:
 *
 *        localStorage.setItem('osrs-lt:completed', JSON.stringify(<paste array here>));
 *        location.reload();
 *
 *   Future work: add a proper "Import from WikiSync JSON" button in the UI.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { WikiSyncImport } from './types.js';

// ─── Tracker storage schema (mirrors useTaskStore.ts / storage.ts) ────────────

interface TrackerImportPayload {
  /** Key → value ready to write into localStorage. */
  localStorageEntries: {
    'osrs-lt:completed': string[];
    'osrs-lt:todos':     string[];
  };
  /** Human-readable import stats. */
  stats: {
    completedCount: number;
    unmatchedCount: number;
    completionPercent: number | null;
    username: string;
    syncedAt: string;
  };
  /** Names that couldn't be matched to an app ID — useful for debugging. */
  unmatchedCompletedNames: string[];
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function map(imported: WikiSyncImport): TrackerImportPayload {
  return {
    localStorageEntries: {
      'osrs-lt:completed': imported.completedTaskIds,
      // WikiSync doesn't track todos — preserve existing todos by leaving empty.
      // When integrating into the UI, you'd MERGE with existing todos rather
      // than replacing them.
      'osrs-lt:todos': [],
    },
    stats: {
      completedCount:    imported.completedTaskIds.length,
      unmatchedCount:    imported.completedUnmatchedNames.length,
      completionPercent: imported.completionPercent,
      username:          imported.username,
      syncedAt:          imported.syncedAt,
    },
    unmatchedCompletedNames: imported.completedUnmatchedNames,
  };
}

// ─── Manual localStorage apply script (printed to console) ───────────────────

function buildConsoleScript(payload: TrackerImportPayload): string {
  const ids = JSON.stringify(payload.localStorageEntries['osrs-lt:completed']);
  return [
    '// ── Paste this into the browser console on your tracker page ──',
    `localStorage.setItem('osrs-lt:completed', '${ids}');`,
    `// ${payload.stats.completedCount} tasks will be marked complete.`,
    `// Existing todos are NOT removed.`,
    `location.reload();`,
  ].join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args     = process.argv.slice(2);
  const jsonPath = args.find(a => !a.startsWith('--'));

  if (!jsonPath) {
    console.error('\n  Usage: tsx src/mapToTracker.ts <path-to-import-json>\n');
    process.exit(1);
  }

  let imported: WikiSyncImport;
  try {
    const raw = await readFile(jsonPath, 'utf-8');
    imported  = JSON.parse(raw) as WikiSyncImport;
  } catch (err) {
    console.error(`[error] Could not read ${jsonPath}: ${(err as Error).message}`);
    process.exit(1);
  }

  const payload = map(imported);

  console.log('\n─── Tracker Import Payload ───────────────────────────────────');
  console.log(JSON.stringify(payload, null, 2));

  console.log('\n─── Console script (paste into tracker browser tab) ──────────');
  console.log(buildConsoleScript(payload));
  console.log('──────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n[fatal]', err instanceof Error ? err.message : err);
  process.exit(1);
});
