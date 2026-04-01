/**
 * wikisync-scraper  –  src/scrape.ts
 *
 * Proof-of-concept: open the OSRS Wiki Leagues task list page, enter a
 * WikiSync username, wait for personalisation to finish, then extract and
 * save every piece of useful state that is available in the rendered DOM.
 *
 * Usage:
 *   tsx src/scrape.ts <username> [--discover] [--headed] [--page <url>]
 *
 * --discover  Dumps raw DOM diagnostics before saving JSON. Useful when the
 *             wiki changes its markup and you need to re-establish selectors.
 * --headed    Runs Chromium in a visible window (headless by default).
 * --page      Override the default wiki URL.
 *
 * Output:
 *   output/<username>-<timestamp>.json
 *
 * ── Approach / DOM contract ──────────────────────────────────────────────────
 *
 * The OSRS Wiki injects WikiSync personalisation via a MediaWiki gadget.
 * After a username is submitted, the gadget:
 *   1. Calls the WikiSync REST API internally.
 *   2. Marks each completed task row with class  "wikisync-complete"
 *      (or adds a green inline style on some page versions).
 *   3. Updates a progress counter element somewhere near the top of the table.
 *
 * Task rows on the wiki table have a  data-taskid  attribute containing the
 * numeric struct-id that matches our local LEAGUE_5.full.json structId field.
 * This is the most reliable identifier available — names alone can mismatch
 * due to wiki formatting differences.
 *
 * ── Limitations ──────────────────────────────────────────────────────────────
 *
 * • The completion detection relies on CSS class / DOM attribute markers that
 *   the wiki gadget must add client-side.  If the wiki updates its gadget the
 *   selectors here may stop working.
 *
 * • Unlocked regions/areas do NOT appear directly in the task list DOM.  The
 *   wiki shows area relics on a separate page.  This scraper returns an empty
 *   unlockedAreas array and notes the limitation clearly.
 *
 * • The wiki may rate-limit or refuse headless browsers.  The scraper uses a
 *   real Chromium install and waits politely; it should pass in practice.
 */

import { chromium, type Page, type Browser } from 'playwright';
import { createReadStream } from 'fs';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WikiSyncImport, WikiSyncTask, LocalTask } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Absolute path to the local task dataset (used for structId resolution).
const LOCAL_DATA_PATH = join(
  __dirname,
  '../../..',         // tools/wikisync/ → repo root
  'client/public/data/LEAGUE_5.full.json',
);

// Default wiki page to scrape.  Override with  --page <url>.
const DEFAULT_WIKI_URL =
  'https://oldschool.runescape.wiki/w/Leagues_V:_Raging_Echoes/Tasks';

// Output directory relative to this file's directory.
const OUTPUT_DIR = join(__dirname, '../output');

// How long (ms) to wait for the WikiSync personalisation to propagate into DOM.
const PERSONALISATION_TIMEOUT_MS = 30_000;

// How long (ms) to wait for the initial page load.
const PAGE_LOAD_TIMEOUT_MS = 45_000;

// ─── WikiSync UI selectors ────────────────────────────────────────────────────
//
// Tried from most-to-least specific.  We stop at the first one that matches.
//
// The OSRS Wiki WikiSync gadget renders a panel with a username text input.
// The exact class/id varies across wiki versions; we try several candidates.

const WIKISYNC_INPUT_SELECTORS = [
  'input#wikisync-search',
  'input[id*="wikisync"]',
  '.wikisync-box input[type="text"]',
  '.wikisync-panel input[type="text"]',
  '.wikisync input[type="text"]',
  'input[placeholder*="username" i]',
  'input[placeholder*="Username" i]',
  'input[aria-label*="wikisync" i]',
] as const;

// Selector for the submit button, tried in order.
const WIKISYNC_SUBMIT_SELECTORS = [
  'button#wikisync-submit',
  'button[id*="wikisync"]',
  '.wikisync-box button',
  '.wikisync-panel button',
  '.wikisync button',
] as const;

// After personalisation the wiki adds one of these classes to completed rows.
const COMPLETION_ROW_CLASS_CANDIDATES = [
  'wikisync-complete',
  'wikisync-done',
  'wikisync--complete',
  'wikisync--done',
  'table-bg-green',
  'wikisync-finished',
];

// Selectors for the completion percentage / progress counter element.
const COMPLETION_PERCENT_SELECTORS = [
  '.wikisync-progress',
  '.wikisync-percent',
  '#wikisync-progress',
  '#wikisync-percent',
  '[data-wikisync-progress]',
  '.wikisync-count',
  '#wikisync-count',
];

// ─── Argument parsing ─────────────────────────────────────────────────────────

interface CliArgs {
  username: string;
  discover: boolean;
  headed: boolean;
  wikiUrl: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const discover = args.includes('--discover');
  const headed   = args.includes('--headed');

  const pageIdx = args.indexOf('--page');
  const wikiUrl = pageIdx >= 0 && args[pageIdx + 1]
    ? args[pageIdx + 1]
    : DEFAULT_WIKI_URL;

  // Username is the first positional (non-flag) argument.
  const username = args.find(a => !a.startsWith('--'));

  if (!username) {
    console.error(
      '\n  Usage: tsx src/scrape.ts <username> [--discover] [--headed] [--page <url>]\n',
    );
    process.exit(1);
  }

  return { username, discover, headed, wikiUrl };
}

// ─── Local dataset loader ─────────────────────────────────────────────────────

interface RawLocalTask {
  structId: number;
  sortId: number;
  name: string;
  area: string;
  tierName?: string;
  tier?: number;
}

async function loadLocalTasks(): Promise<LocalTask[]> {
  try {
    const raw = await readFile(LOCAL_DATA_PATH, 'utf-8');
    const tasks = JSON.parse(raw) as RawLocalTask[];
    return tasks.map(t => ({
      structId: t.structId,
      sortId:   t.sortId,
      name:     t.name,
      area:     t.area,
      tierName: t.tierName ?? tierNumberToName(t.tier ?? 1),
    }));
  } catch (err) {
    console.warn(
      `[warn] Could not load local task data from ${LOCAL_DATA_PATH}\n` +
      `       Scraped tasks will not resolve to app IDs.\n` +
      `       Error: ${(err as Error).message}`,
    );
    return [];
  }
}

function tierNumberToName(n: number): string {
  return ['Easy', 'Medium', 'Hard', 'Elite', 'Master'][n - 1] ?? 'Easy';
}

/**
 * Build lookup maps from the local dataset so we can resolve:
 *   structId   → LocalTask
 *   normalised name → LocalTask   (for fallback name-based matching)
 */
function buildLookupMaps(tasks: LocalTask[]): {
  byStructId:   Map<number, LocalTask>;
  byNormName:   Map<string, LocalTask>;
} {
  const byStructId = new Map<number, LocalTask>();
  const byNormName = new Map<string, LocalTask>();

  for (const t of tasks) {
    byStructId.set(t.structId, t);
    byNormName.set(normaliseName(t.name), t);
  }

  return { byStructId, byNormName };
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── Browser / page helpers ───────────────────────────────────────────────────

async function findFirstVisible(
  page: Page,
  selectors: readonly string[],
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return sel;
    } catch { /* continue */ }
  }
  return null;
}

/**
 * Navigate to the wiki page and wait for the main content to be present.
 * Returns true on success.
 */
async function navigateTo(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    // Wait for the main content element — robust regardless of JS load state.
    await page.waitForSelector('#mw-content-text', { timeout: PAGE_LOAD_TIMEOUT_MS });
    return true;
  } catch (err) {
    console.error(`[error] Navigation to ${url} failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Discovery mode ───────────────────────────────────────────────────────────
//
// Dumps a diagnostic snapshot of things that might be the WikiSync UI and the
// first 5 task-table rows.  Use this when the selectors stop working.

async function discoverPage(page: Page): Promise<void> {
  console.log('\n── DISCOVERY ──────────────────────────────────────────────');

  // 1. All inputs on the page (id, name, placeholder, type)
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      id:          el.id || null,
      name:        el.name || null,
      type:        el.type || null,
      placeholder: el.placeholder || null,
      classes:     el.className || null,
      visible:     el.offsetParent !== null,
    }));
  });
  console.log('\nAll <input> elements:');
  inputs.forEach(i => console.log('  ', JSON.stringify(i)));

  // 2. Elements whose class or id contains "wikisync"
  const wsElements = await page.evaluate(() => {
    const matches: object[] = [];
    document.querySelectorAll('*').forEach(el => {
      const id  = el.id  ?? '';
      const cls = el.className ?? '';
      if (typeof cls !== 'string') return;
      if (id.toLowerCase().includes('wikisync') || cls.toLowerCase().includes('wikisync')) {
        matches.push({
          tag:     el.tagName,
          id:      id || null,
          classes: cls || null,
          text:    (el as HTMLElement).innerText?.slice(0, 80) || null,
        });
      }
    });
    return matches;
  });
  console.log('\nElements with "wikisync" in id/class:');
  wsElements.forEach(e => console.log('  ', JSON.stringify(e)));

  // 3. First 5 task table rows — classes, data-attrs, cell content
  const tableRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr')).slice(1, 6);
    return rows.map(tr => ({
      classes:   tr.className || null,
      inline:    (tr as HTMLElement).style?.cssText || null,
      dataAttrs: Object.fromEntries(
        Array.from(tr.attributes)
          .filter(a => a.name.startsWith('data-'))
          .map(a => [a.name, a.value]),
      ),
      cells: Array.from(tr.querySelectorAll('td')).slice(0, 4).map(td =>
        (td as HTMLElement).innerText?.slice(0, 50).trim(),
      ),
    }));
  });
  console.log('\nFirst 5 non-header table rows:');
  tableRows.forEach(r => console.log('  ', JSON.stringify(r)));

  console.log('\n── END DISCOVERY ──────────────────────────────────────────\n');
}

// ─── WikiSync personalisation ─────────────────────────────────────────────────

interface PersonalisationResult {
  succeeded: boolean;
  note: string;
  detectionMethod: string;
}

async function triggerPersonalisation(
  page: Page,
  username: string,
): Promise<PersonalisationResult> {
  // --- Find the WikiSync input ---
  const inputSel = await findFirstVisible(page, WIKISYNC_INPUT_SELECTORS);
  if (!inputSel) {
    return {
      succeeded: false,
      note: 'WikiSync input not found on page — none of the known selectors matched a visible element.',
      detectionMethod: 'n/a',
    };
  }
  console.log(`  WikiSync input found: ${inputSel}`);

  // Clear any existing value and type the username.
  await page.click(inputSel, { timeout: 10_000 });
  await page.fill(inputSel, '');
  await page.type(inputSel, username, { delay: 40 });

  // Try a submit button first; fall back to pressing Enter.
  const submitSel = await findFirstVisible(page, WIKISYNC_SUBMIT_SELECTORS);
  if (submitSel) {
    console.log(`  WikiSync submit button found: ${submitSel}`);
    await page.click(submitSel);
  } else {
    console.log('  No submit button found — pressing Enter.');
    await page.press(inputSel, 'Enter');
  }

  // --- Wait for personalisation to propagate ---
  //
  // Strategy: wait for either
  //   (a) a known completion-class to appear on at least one <tr>  [ideal]
  //   (b) a progress counter element to appear                     [fallback]
  //   (c) a network request to the WikiSync API to complete        [last resort]
  //   (d) timeout                                                   [fail]

  let succeeded  = false;
  let detectionMethod = 'timeout';

  try {
    await Promise.race([
      // (a) row class injection
      (async () => {
        const classSelector = COMPLETION_ROW_CLASS_CANDIDATES
          .map(c => `tr.${c}`)
          .join(', ');
        await page.waitForSelector(classSelector, {
          timeout: PERSONALISATION_TIMEOUT_MS,
        });
        succeeded = true;
        detectionMethod = 'row-class-injection';
      })(),

      // (b) progress counter element appearance
      (async () => {
        const counterSel = COMPLETION_PERCENT_SELECTORS.join(', ');
        await page.waitForSelector(counterSel, {
          timeout: PERSONALISATION_TIMEOUT_MS,
        });
        succeeded = true;
        detectionMethod = 'progress-counter-element';
      })(),

      // (c) network request to the WikiSync API completing
      page.waitForResponse(
        (resp) =>
          resp.url().includes('sync.runescape.wiki') ||
          resp.url().includes('wikisync'),
        { timeout: PERSONALISATION_TIMEOUT_MS },
      ).then((resp) => {
        // Don't mark succeeded here — a 4xx for unknown user is still a response.
        if (resp.status() < 400) {
          succeeded = true;
          detectionMethod = 'wikisync-api-network-response';
        } else {
          detectionMethod = `wikisync-api-network-${resp.status()}`;
        }
      }),

      // Timeout sentinel
      new Promise<void>(resolve => setTimeout(resolve, PERSONALISATION_TIMEOUT_MS)),
    ]);
  } catch {
    // waitForSelector / waitForResponse can throw on timeout — swallow here.
  }

  if (!succeeded) {
    // One final check: if data-taskid rows exist but none have completion class,
    // personalisation may have partially worked with an unexpected class name.
    const anyTaskRows = await page.$$('[data-taskid]');
    if (anyTaskRows.length > 0) {
      detectionMethod = 'task-rows-found-but-no-known-completion-class';
      return {
        succeeded: false,
        note:
          `Found ${anyTaskRows.length} rows with data-taskid but no known completion class. ` +
          'Either the username was not found by WikiSync, or the wiki uses an unexpected ' +
          'completion marker.  Run with --discover to inspect what classes/attributes appear.',
        detectionMethod,
      };
    }

    return {
      succeeded: false,
      note:
        'Timed out waiting for personalisation to complete.  The username may not exist, ' +
        'WikiSync may be temporarily unavailable, or the wiki markup has changed.',
      detectionMethod: 'timeout',
    };
  }

  return {
    succeeded: true,
    note: `Personalisation detected via: ${detectionMethod}`,
    detectionMethod,
  };
}

// ─── Data extraction ──────────────────────────────────────────────────────────

/**
 * Determine which CSS class, if any, the wiki is using to mark completed tasks.
 * Returns the class name (without leading dot) or null if none matched.
 */
async function resolveCompletionClass(page: Page): Promise<string | null> {
  for (const cls of COMPLETION_ROW_CLASS_CANDIDATES) {
    const matched = await page.$(`.${cls}`);
    if (matched) return cls;
  }
  return null;
}

/**
 * Determine the background-colour value the wiki uses for completed rows
 * (some wiki versions use inline style rather than class).
 * Returns a partial colour string to match on, or null.
 */
async function resolveCompletionStyle(page: Page): Promise<string | null> {
  // Check if ANY table row has a non-empty inline background style.
  const sample = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table.wikitable tr'));
    for (const tr of rows) {
      const style = (tr as HTMLElement).style?.backgroundColor;
      if (style && style.length > 0) return style;
    }
    return null;
  });
  return sample ?? null;
}

async function extractCompletionPercent(page: Page): Promise<{
  value: number | null;
  raw: string | null;
}> {
  for (const sel of COMPLETION_PERCENT_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = await el.innerText();
      if (!text) continue;
      // Match patterns like "123/456", "27%", "27.3%", "27.3 / 456"
      const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
      if (percentMatch) return { value: parseFloat(percentMatch[1]), raw: text.trim() };
      const fractionMatch = text.match(/(\d+)\s*[/]\s*(\d+)/);
      if (fractionMatch) {
        const done  = parseInt(fractionMatch[1], 10);
        const total = parseInt(fractionMatch[2], 10);
        if (total > 0) return { value: Math.round((done / total) * 1000) / 10, raw: text.trim() };
      }
      // Just a number — could be a count, not a percent.  Include as raw.
      return { value: null, raw: text.trim() };
    } catch { /* try next */ }
  }

  // Broader text search: look for anything on the page that looks like "xx% complete"
  const broader = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.getElementById('mw-content-text') ?? document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent ?? '';
      if (/\d+[%/]\d*/.test(text) && text.toLowerCase().includes('task')) {
        return text.trim().slice(0, 80);
      }
    }
    return null;
  });

  if (broader) {
    const m = broader.match(/(\d+(?:\.\d+)?)\s*%/);
    return { value: m ? parseFloat(m[1]) : null, raw: broader };
  }

  return { value: null, raw: null };
}

/**
 * Extract ALL task rows from the wiki table.
 *
 * The wiki task list is rendered as a sortable wikitable.  Each <tr> that
 * represents a task (not a header) should have:
 *
 *   data-taskid   - numeric struct ID  (ideal — present on Leagues V+ pages)
 *
 * The cells contain (in typical column order):
 *   Area | Difficulty | Task name | Description | Skill | Points
 *   (exact order may vary; we use column-header detection below)
 *
 * Completed state comes from:
 *   1. tr.wikisync-complete / tr.wikisync-done / etc.     ← class-based
 *   2. tr with green background-color inline style         ← style-based
 *
 * Both strategies are checked and the result is unioned.
 */
async function extractTaskRows(
  page: Page,
  completionClass: string | null,
  completionStyle: string | null,
  lookups: {
    byStructId: Map<number, LocalTask>;
    byNormName: Map<string, LocalTask>;
  },
): Promise<WikiSyncTask[]> {
  // Get structural info about the table header to identify column positions.
  const headerInfo: { nameCol: number; tierCol: number; areaCol: number } =
    await page.evaluate(() => {
      let nameCol = -1, tierCol = -1, areaCol = -1;
      const headers = Array.from(
        document.querySelectorAll('table.wikitable thead th, table.wikitable tr:first-child th'),
      );
      headers.forEach((th, idx) => {
        const text = (th as HTMLElement).innerText?.toLowerCase().trim() ?? '';
        if (text.includes('task') && nameCol === -1) nameCol = idx;
        if ((text.includes('diffic') || text.includes('tier')) && tierCol === -1) tierCol = idx;
        if ((text.includes('area') || text.includes('region')) && areaCol === -1) areaCol = idx;
      });
      // Fallback column assignments (typical Leagues V table layout).
      if (nameCol === -1) nameCol = 2;
      if (tierCol === -1) tierCol = 1;
      if (areaCol === -1) areaCol = 0;
      return { nameCol, tierCol, areaCol };
    });

  console.log(
    `  Column detection: area[${headerInfo.areaCol}] tier[${headerInfo.tierCol}] name[${headerInfo.nameCol}]`,
  );

  // Extract all <tr> data.
  const rawRows = await page.evaluate(
    ({ completionClass, completionStyle, headerInfo }) => {
      const rows   = Array.from(document.querySelectorAll('table.wikitable tbody tr'));
      if (rows.length === 0) {
        // Fallback: try any wikitable row that has td children.
        const all = Array.from(document.querySelectorAll('table tr')).filter(
          tr => tr.querySelectorAll('td').length >= 2,
        );
        rows.push(...all);
      }

      return rows.map(tr => {
        const el     = tr as HTMLElement;
        const cells  = Array.from(tr.querySelectorAll('td'));
        const styles = el.style?.cssText ?? '';
        const cls    = tr.className ?? '';

        // Completion detection: class-based
        const classCompleted = completionClass
          ? cls.split(/\s+/).includes(completionClass)
          : false;

        // Completion detection: style-based (green background)
        const styleCompleted = completionStyle
          ? styles.includes(completionStyle)
          : (
              styles.includes('rgb(212, 239, 223)') ||   // #d4efdf
              styles.includes('#d4efdf') ||
              styles.includes('rgb(0, 128, 0)') ||
              (el.style?.backgroundColor ?? '').toLowerCase().includes('green')
            );

        const completed = classCompleted || styleCompleted;

        // Data attributes — look for data-taskid specifically
        const dataAttrs: Record<string, string> = {};
        for (const attr of Array.from(tr.attributes)) {
          if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value;
        }

        const nCells = cells.length;
        const getCellText = (idx: number): string =>
          idx >= 0 && idx < nCells
            ? (cells[idx] as HTMLElement).innerText?.replace(/\n/g, ' ').trim() ?? ''
            : '';

        return {
          name:      getCellText(headerInfo.nameCol),
          tier:      getCellText(headerInfo.tierCol) || null,
          area:      getCellText(headerInfo.areaCol) || null,
          classes:   cls ? cls.split(/\s+/).filter(Boolean) : [],
          style:     styles || null,
          dataAttrs,
          completed,
          cellCount: nCells,
        };
      }).filter(r => r.name && r.cellCount >= 2);
    },
    { completionClass, completionStyle, headerInfo },
  );

  console.log(`  Raw rows extracted from DOM: ${rawRows.length}`);

  // Resolve each row to an app ID.
  const tasks: WikiSyncTask[] = rawRows.map(row => {
    // 1. Try data-taskid → structId → LocalTask
    const rawTaskId = row.dataAttrs['data-taskid'];
    const structId  = rawTaskId ? parseInt(rawTaskId, 10) : NaN;
    let local: LocalTask | undefined;

    if (!isNaN(structId)) {
      local = lookups.byStructId.get(structId);
    }

    // 2. Fallback: normalised name match
    if (!local) {
      local = lookups.byNormName.get(normaliseName(row.name));
    }

    const appId   = local ? `task-${local.structId}-${local.sortId}` : null;
    const resolvedStructId = local?.structId ?? (isNaN(structId) ? null : structId);

    return {
      name:       row.name,
      appId,
      structId:   resolvedStructId,
      completed:  row.completed,
      tier:       row.tier,
      area:       row.area,
      rowClasses: row.classes,
      rowStyle:   row.style,
    };
  });

  return tasks;
}

/**
 * Attempt to extract unlocked areas from the page.
 *
 * ⚠ LIMITATION: The Leagues V task list page does NOT show region unlock state
 * in its DOM.  Region unlocks live on separate wiki pages and are not part of
 * the WikiSync task-list gadget.  This function always returns [] and reports
 * the limitation.  Future work could scrape the /Regions page separately.
 */
async function extractUnlockedAreas(page: Page): Promise<{
  areas: string[];
  note: string;
}> {
  // Best effort: look for any element with "area" or "region" in class/id that
  // has children that could be area names.
  const found = await page.evaluate(() => {
    const candidates = document.querySelectorAll(
      '[class*="region" i], [class*="area" i], [id*="region" i], [id*="area" i]',
    );
    const texts: string[] = [];
    candidates.forEach(el => {
      const text = (el as HTMLElement).innerText?.trim();
      if (text && text.length < 40 && text.length > 2) texts.push(text);
    });
    return texts.slice(0, 20);
  });

  if (found.length > 0) {
    return {
      areas: found,
      note: 'Potential area labels found via class heuristic — not confirmed as region unlocks.',
    };
  }

  return {
    areas: [],
    note:
      'Region/area unlock state is NOT available on the Leagues task-list page DOM. ' +
      'WikiSync does not inject this data here.  To get unlocked regions, a separate ' +
      'scrape of the relics/regions wiki page would be required.',
  };
}

// ─── Output ───────────────────────────────────────────────────────────────────

async function saveOutput(data: WikiSyncImport): Promise<string> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const safeName  = data.username.replace(/[^a-z0-9_-]/gi, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `${safeName}-${timestamp}.json`;
  const outPath   = join(OUTPUT_DIR, filename);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  return outPath;
}

function printSummary(data: WikiSyncImport, outPath: string): void {
  const s = data.summary;
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  WikiSync Import Summary');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Username        : ${data.username}`);
  console.log(`  Page used       : ${data.sourcePage}`);
  console.log(`  Personalised    : ${data.personalisationSucceeded ? 'YES' : 'NO'}`);
  console.log(`  Note            : ${data.personalisationNote}`);
  console.log(`  Detect method   : ${data.completionDetectionMethod}`);
  console.log(`  Completion %    : ${data.completionPercent !== null ? `${data.completionPercent}%` : 'not found'}`);
  if (data.completionPercentRaw) {
    console.log(`  Completion raw  : "${data.completionPercentRaw}"`);
  }
  console.log(`  Total task rows : ${s.totalTasksFound}`);
  console.log(`  Completed tasks : ${s.completedTasksFound}`);
  console.log(`  Matched to ID   : ${s.matchedToAppId}`);
  console.log(`  Unmatched names : ${s.unmatchedNames}`);
  if (data.unlockedAreas.length > 0) {
    console.log(`  Unlocked areas  : ${data.unlockedAreas.join(', ')}`);
  } else {
    console.log(`  Unlocked areas  : not available (see rawExtra.areasNote)`);
  }
  console.log(`  Output file     : ${outPath}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (data.completedUnmatchedNames.length > 0) {
    console.log(
      `[warn] ${data.completedUnmatchedNames.length} completed task(s) could NOT be matched to a local ID:\n` +
      data.completedUnmatchedNames.slice(0, 10).map(n => `       • "${n}"`).join('\n'),
    );
    if (data.completedUnmatchedNames.length > 10) {
      console.log(`       ... and ${data.completedUnmatchedNames.length - 10} more`);
    }
    console.log('');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`\n[WikiSync Scraper] username="${args.username}"  page="${args.wikiUrl}"\n`);

  // Load local task data for name→ID mapping.
  console.log('Loading local task data…');
  const localTasks = await loadLocalTasks();
  const lookups    = buildLookupMaps(localTasks);
  console.log(`  Loaded ${localTasks.length} local tasks for ID resolution.`);

  // Launch browser.
  console.log(`Launching ${args.headed ? 'headed' : 'headless'} Chromium…`);
  const browser: Browser = await chromium.launch({
    headless: !args.headed,
    // Slow Mo helps with headed debugging; 0 for normal use.
    slowMo: args.headed ? 100 : 0,
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const page = await context.newPage();

  try {
    // Navigate to the wiki page.
    console.log(`Navigating to ${args.wikiUrl} …`);
    const navOk = await navigateTo(page, args.wikiUrl);
    if (!navOk) {
      throw new Error('Navigation failed — cannot continue.');
    }
    console.log('  Page loaded.');

    // Optional: run discovery to inspect DOM before any personalisation.
    if (args.discover) {
      await discoverPage(page);
    }

    // Trigger WikiSync personalisation.
    console.log(`Triggering WikiSync personalisation for "${args.username}"…`);
    const personalisation = await triggerPersonalisation(page, args.username);
    console.log(`  Result: ${personalisation.note}`);

    // Optional: re-run discovery after personalisation (shows completed markers).
    if (args.discover) {
      console.log('\n[After personalisation]');
      await discoverPage(page);
    }

    // Extract completion percent.
    console.log('Extracting completion percentage…');
    const { value: completionPercent, raw: completionPercentRaw } =
      await extractCompletionPercent(page);
    console.log(
      `  Result: ${completionPercent !== null ? `${completionPercent}%` : 'not found'}`
      + (completionPercentRaw ? ` (raw: "${completionPercentRaw}")` : ''),
    );

    // Determine which completion marker the page is using.
    const completionClass = await resolveCompletionClass(page);
    const completionStyle = await resolveCompletionStyle(page);
    const detectionNote   = completionClass
      ? `CSS class ".${completionClass}" on <tr> elements`
      : completionStyle
      ? `Inline background-color style "${completionStyle}" on <tr> elements`
      : 'No confirmed completion marker — rows not reliably identified as complete';

    console.log(`  Completion detection strategy: ${detectionNote}`);

    // Extract task rows.
    console.log('Extracting task rows…');
    const tasks = await extractTaskRows(
      page,
      completionClass,
      completionStyle,
      lookups,
    );

    // Extract unlocked areas.
    console.log('Attempting to extract unlocked areas…');
    const { areas: unlockedAreas, note: areasNote } = await extractUnlockedAreas(page);
    console.log(`  ${areasNote}`);

    // Build structured output.
    const completedTasks    = tasks.filter(t => t.completed);
    const completedTaskIds  = completedTasks.filter(t => t.appId).map(t => t.appId as string);
    const completedUnmatched = completedTasks.filter(t => !t.appId).map(t => t.name);

    const output: WikiSyncImport = {
      username:                   args.username,
      sourcePage:                 args.wikiUrl,
      syncedAt:                   new Date().toISOString(),
      personalisationSucceeded:   personalisation.succeeded,
      personalisationNote:        personalisation.note,
      completionDetectionMethod:  personalisation.succeeded
                                    ? detectionNote
                                    : personalisation.detectionMethod,
      completionPercent,
      completionPercentRaw,
      unlockedAreas,
      tasks,
      completedTaskIds,
      completedUnmatchedNames:    completedUnmatched,
      summary: {
        totalTasksFound:    tasks.length,
        completedTasksFound: completedTasks.length,
        matchedToAppId:     tasks.filter(t => t.appId !== null).length,
        unmatchedNames:     tasks.filter(t => t.appId === null).length,
      },
      rawExtra: {
        areasNote,
        completionClass,
        completionStyle,
        localTasksLoaded: localTasks.length,
      },
    };

    // Save and print summary.
    const outPath = await saveOutput(output);
    printSummary(output, outPath);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n[fatal]', err instanceof Error ? err.message : err);
  process.exit(1);
});
