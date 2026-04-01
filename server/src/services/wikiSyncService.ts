/**
 * wikiSyncService.ts
 *
 * Server-side Playwright automation that opens the OSRS Wiki league tasks page,
 * submits an IGN through the WikiSync UI, waits for personalisation to render,
 * then extracts completed-task state from the DOM.
 *
 * ── Approach ─────────────────────────────────────────────────────────────────
 *
 * The OSRS Wiki WikiSync gadget:
 *   1. Renders a username input on league task pages.
 *   2. On submission, calls WikiSync internally.
 *   3. Marks completed task rows with class  "wikisync-complete"
 *      or a green inline background-color (exact marker varies by wiki version).
 *   4. May update a progress counter element near the top of the table.
 *
 * Task rows carry a  data-taskid  attribute (numeric structId) that maps
 * directly to our  LEAGUE_*.full.json  dataset IDs.  Name-based fallback
 * matching is also performed for rows that lack the attribute.
 *
 * ── Limitations ──────────────────────────────────────────────────────────────
 *
 * • Region/area unlock state is NOT present in the task-list DOM.  The scraper
 *   always returns  unlockedAreas: []  and notes this clearly.
 * • Selectors were established against the Leagues V (Raging Echoes) wiki page.
 *   If the wiki updates its gadget the selectors may need adjustment.  Run the
 *   standalone PoC with  --discover  to re-establish them.
 * • This uses the publicly rendered wiki page UI only.  The WikiSync API is
 *   NOT called directly.
 */

import { chromium, type Page } from 'playwright';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { WikiSyncLookupRequest, WikiSyncImportResult } from '../types/wikiSync';

// ─── Paths ────────────────────────────────────────────────────────────────────

/**
 * Path to the client's static task dataset.
 * Resolves to: <repo-root>/client/public/data/
 *
 * Works identically with ts-node-dev (server/src/services → repo root)
 * and compiled output  (server/dist/services → repo root).
 */
const CLIENT_DATA_DIR = join(__dirname, '..', '..', '..', 'client', 'public', 'data');

// ─── Defaults / constants ─────────────────────────────────────────────────────

const DEFAULT_WIKI_URL =
  'https://oldschool.runescape.wiki/w/Leagues_V:_Raging_Echoes/Tasks';

const PAGE_LOAD_TIMEOUT_MS      = 45_000;
const PERSONALISATION_TIMEOUT_MS = 30_000;

// WikiSync input — tried most-to-least specific, first visible match wins.
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

// WikiSync submit button — tried in order.
const WIKISYNC_SUBMIT_SELECTORS = [
  'button#wikisync-submit',
  'button[id*="wikisync"]',
  '.wikisync-box button',
  '.wikisync-panel button',
  '.wikisync button',
] as const;

// CSS classes the wiki gadget may add to completed <tr> elements.
const COMPLETION_ROW_CLASS_CANDIDATES = [
  'wikisync-complete',
  'wikisync-done',
  'wikisync--complete',
  'wikisync--done',
  'table-bg-green',
  'wikisync-finished',
];

// Selectors for the completion-percentage / progress counter element.
const COMPLETION_PERCENT_SELECTORS = [
  '.wikisync-progress',
  '.wikisync-percent',
  '#wikisync-progress',
  '#wikisync-percent',
  '[data-wikisync-progress]',
  '.wikisync-count',
  '#wikisync-count',
];

// ─── Local dataset helpers ────────────────────────────────────────────────────

interface LocalTask {
  structId: number;
  sortId:   number;
  name:     string;
  area:     string;
  tierName: string;
}

async function loadLocalTasks(dataFile: string): Promise<LocalTask[]> {
  const filePath = join(CLIENT_DATA_DIR, dataFile);
  try {
    const raw = await readFile(filePath, 'utf-8');
    const tasks = JSON.parse(raw) as Array<{
      structId: number;
      sortId: number;
      name: string;
      area: string;
      tierName?: string;
      tier?: number;
    }>;
    return tasks.map(t => ({
      structId: t.structId,
      sortId:   t.sortId,
      name:     t.name,
      area:     t.area,
      tierName: t.tierName ?? tierNumberToName(t.tier ?? 1),
    }));
  } catch (err) {
    return [];
  }
}

function tierNumberToName(n: number): string {
  return ['Easy', 'Medium', 'Hard', 'Elite', 'Master'][n - 1] ?? 'Easy';
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildLookupMaps(tasks: LocalTask[]): {
  byStructId: Map<number, LocalTask>;
  byNormName: Map<string, LocalTask>;
} {
  const byStructId = new Map<number, LocalTask>();
  const byNormName = new Map<string, LocalTask>();
  for (const t of tasks) {
    byStructId.set(t.structId, t);
    byNormName.set(normaliseName(t.name), t);
  }
  return { byStructId, byNormName };
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

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

async function navigateTo(
  page: Page,
  url: string,
  debug: boolean,
): Promise<boolean> {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    await page.waitForSelector('#mw-content-text', {
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    if (debug) console.log('[wikisync] Page loaded:', url);
    return true;
  } catch (err) {
    console.error('[wikisync] Navigation failed:', (err as Error).message);
    return false;
  }
}

// ─── WikiSync personalisation ─────────────────────────────────────────────────

interface PersonalisationResult {
  succeeded:       boolean;
  note:            string;
  detectionMethod: string;
  inputSelFound:   string | null;
  submitSelFound:  string | null;
}

async function triggerPersonalisation(
  page: Page,
  username: string,
  debug: boolean,
): Promise<PersonalisationResult> {
  const inputSel = await findFirstVisible(page, WIKISYNC_INPUT_SELECTORS);
  if (!inputSel) {
    return {
      succeeded:       false,
      note:
        'WikiSync input not found on page — none of the known selectors matched a visible element. ' +
        'The wiki may have updated its gadget markup. Run the standalone PoC with --discover to re-establish selectors.',
      detectionMethod: 'n/a',
      inputSelFound:   null,
      submitSelFound:  null,
    };
  }
  if (debug) console.log('[wikisync] Input selector found:', inputSel);

  // Clear + type the username.
  await page.click(inputSel, { timeout: 10_000 });
  await page.fill(inputSel, '');
  await page.type(inputSel, username, { delay: 40 });

  const submitSel = await findFirstVisible(page, WIKISYNC_SUBMIT_SELECTORS);
  if (submitSel) {
    if (debug) console.log('[wikisync] Submit button found:', submitSel);
    await page.click(submitSel);
  } else {
    if (debug) console.log('[wikisync] No submit button — pressing Enter.');
    await page.press(inputSel, 'Enter');
  }

  // Wait for any of several personalisation signals to appear.
  let succeeded      = false;
  let detectionMethod = 'timeout';

  const rowClassSel = COMPLETION_ROW_CLASS_CANDIDATES.map(c => `tr.${c}`).join(', ');
  const counterSel  = COMPLETION_PERCENT_SELECTORS.join(', ');

  try {
    await Promise.race([
      // (a) Completion class injected on at least one <tr>
      (async () => {
        await page.waitForSelector(rowClassSel, {
          timeout: PERSONALISATION_TIMEOUT_MS,
        });
        succeeded       = true;
        detectionMethod = 'row-class-injection';
      })(),

      // (b) Progress counter element appeared
      (async () => {
        await page.waitForSelector(counterSel, {
          timeout: PERSONALISATION_TIMEOUT_MS,
        });
        succeeded       = true;
        detectionMethod = 'progress-counter-element';
      })(),

      // (c) Network response from WikiSync / sync.runescape.wiki
      page.waitForResponse(
        (resp) =>
          resp.url().includes('sync.runescape.wiki') ||
          resp.url().toLowerCase().includes('wikisync'),
        { timeout: PERSONALISATION_TIMEOUT_MS },
      ).then(resp => {
        if (resp.status() < 400) {
          succeeded       = true;
          detectionMethod = 'wikisync-network-response';
        } else {
          detectionMethod = `wikisync-network-${resp.status()}`;
        }
      }),

      // Timeout sentinel
      new Promise<void>(resolve =>
        setTimeout(resolve, PERSONALISATION_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // waitForSelector / waitForResponse throw on timeout — harmless here.
  }

  if (debug) {
    console.log('[wikisync] Personalisation detection method:', detectionMethod);
  }

  if (!succeeded) {
    // Final check: data-taskid rows exist but no known completion class.
    const anyTaskRows = await page.$$('[data-taskid]');
    if (anyTaskRows.length > 0) {
      return {
        succeeded:       false,
        note:
          `Found ${anyTaskRows.length} rows with data-taskid but no known completion class was detected. ` +
          'WikiSync may not have personalised for this username, or the wiki uses an unexpected ' +
          'completion marker. Check that: (1) the IGN is correct, (2) the WikiSync plugin is enabled ' +
          'in RuneLite or HDOS, (3) Leagues are currently live. Run the PoC with --discover for diagnostics.',
        detectionMethod: 'task-rows-found-no-completion-class',
        inputSelFound:   inputSel,
        submitSelFound:  submitSel,
      };
    }
    return {
      succeeded:       false,
      note:
        'Timed out waiting for WikiSync personalisation. Possible reasons: IGN not found, ' +
        'the WikiSync plugin is not enabled, Leagues are not currently live, or the wiki markup changed.',
      detectionMethod: 'timeout',
      inputSelFound:   inputSel,
      submitSelFound:  submitSel,
    };
  }

  return {
    succeeded:       true,
    note:            `Personalisation confirmed via: ${detectionMethod}`,
    detectionMethod,
    inputSelFound:   inputSel,
    submitSelFound:  submitSel,
  };
}

// ─── Data extraction ──────────────────────────────────────────────────────────

async function resolveCompletionClass(page: Page): Promise<string | null> {
  for (const cls of COMPLETION_ROW_CLASS_CANDIDATES) {
    const matched = await page.$(`.${cls}`);
    if (matched) return cls;
  }
  return null;
}

async function resolveCompletionStyle(page: Page): Promise<string | null> {
  const sample = await page.evaluate((): string | null => {
    const rows = Array.from(document.querySelectorAll('table.wikitable tr'));
    for (const tr of rows) {
      const bg = (tr as HTMLElement).style?.backgroundColor;
      if (bg && bg.length > 0) return bg;
    }
    return null;
  });
  return sample ?? null;
}

async function extractCompletionPercent(page: Page): Promise<{
  value: number | null;
  raw:   string | null;
}> {
  for (const sel of COMPLETION_PERCENT_SELECTORS) {
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const text = await el.innerText();
      if (!text) continue;

      const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
      if (percentMatch) {
        return { value: parseFloat(percentMatch[1]), raw: text.trim() };
      }
      const fractionMatch = text.match(/(\d+)\s*[/]\s*(\d+)/);
      if (fractionMatch) {
        const done  = parseInt(fractionMatch[1], 10);
        const total = parseInt(fractionMatch[2], 10);
        if (total > 0) {
          return {
            value: Math.round((done / total) * 1000) / 10,
            raw:   text.trim(),
          };
        }
      }
      return { value: null, raw: text.trim() };
    } catch { /* try next selector */ }
  }

  // Broader fallback: find any text node that contains a count/percent near "task"
  const broader = await page.evaluate((): string | null => {
    const root = document.getElementById('mw-content-text') ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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

interface RawTaskRow {
  name:      string;
  tier:      string | null;
  area:      string | null;
  classes:   string[];
  style:     string | null;
  dataAttrs: Record<string, string>;
  completed: boolean;
  cellCount: number;
}

async function extractTaskRows(
  page: Page,
  completionClass: string | null,
  completionStyle: string | null,
  lookups: { byStructId: Map<number, LocalTask>; byNormName: Map<string, LocalTask> },
  debug: boolean,
): Promise<Array<{
  name:       string;
  appId:      string | null;
  structId:   number | null;
  completed:  boolean;
  tier:       string | null;
  area:       string | null;
  rowClasses: string[];
  rowStyle:   string | null;
}>> {
  // Detect column order from table headers.
  const headerInfo = await page.evaluate((): {
    nameCol: number;
    tierCol: number;
    areaCol: number;
  } => {
    let nameCol = -1, tierCol = -1, areaCol = -1;
    const headers = Array.from(document.querySelectorAll(
      'table.wikitable thead th, table.wikitable tr:first-child th',
    ));
    headers.forEach((th, idx) => {
      const text = (th as HTMLElement).innerText?.toLowerCase().trim() ?? '';
      if (text.includes('task')   && nameCol === -1) nameCol = idx;
      if ((text.includes('diffic') || text.includes('tier')) && tierCol === -1) tierCol = idx;
      if ((text.includes('area')  || text.includes('region')) && areaCol === -1) areaCol = idx;
    });
    if (nameCol === -1) nameCol = 2;
    if (tierCol === -1) tierCol = 1;
    if (areaCol === -1) areaCol = 0;
    return { nameCol, tierCol, areaCol };
  });

  if (debug) {
    console.log(
      `[wikisync] Column layout — area[${headerInfo.areaCol}]`,
      `tier[${headerInfo.tierCol}]`,
      `name[${headerInfo.nameCol}]`,
    );
  }

  const rawRows: RawTaskRow[] = await page.evaluate(
    ({ completionClass: cls, completionStyle: style, headerInfo: hi }) => {
      let rows = Array.from(document.querySelectorAll('table.wikitable tbody tr'));
      if (rows.length === 0) {
        rows = Array.from(document.querySelectorAll('table tr')).filter(
          tr => tr.querySelectorAll('td').length >= 2,
        );
      }

      return rows.map(tr => {
        const el    = tr as HTMLElement;
        const cells = Array.from(tr.querySelectorAll('td'));
        const styleText = el.style?.cssText ?? '';
        const className = tr.className ?? '';

        const classCompleted = cls
          ? className.split(/\s+/).includes(cls)
          : false;

        const styleCompleted = style
          ? styleText.includes(style)
          : (
              styleText.includes('rgb(212, 239, 223)') ||
              styleText.includes('#d4efdf') ||
              styleText.includes('rgb(0, 128, 0)') ||
              (el.style?.backgroundColor ?? '').toLowerCase().includes('green')
            );

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
          name:      getCellText(hi.nameCol),
          tier:      getCellText(hi.tierCol) || null,
          area:      getCellText(hi.areaCol) || null,
          classes:   className ? className.split(/\s+/).filter(Boolean) : [],
          style:     styleText || null,
          dataAttrs,
          completed: classCompleted || styleCompleted,
          cellCount: nCells,
        };
      }).filter((r: RawTaskRow) => r.name && r.cellCount >= 2);
    },
    {
      completionClass,
      completionStyle,
      headerInfo,
    },
  );

  if (debug) {
    console.log(`[wikisync] Raw rows extracted: ${rawRows.length}`);
  }

  return rawRows.map(row => {
    const rawTaskId = row.dataAttrs['data-taskid'];
    const structId  = rawTaskId ? parseInt(rawTaskId, 10) : NaN;
    let local: LocalTask | undefined;

    if (!isNaN(structId)) {
      local = lookups.byStructId.get(structId);
    }
    if (!local) {
      local = lookups.byNormName.get(normaliseName(row.name));
    }

    const appId = local ? `task-${local.structId}-${local.sortId}` : null;
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
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a WikiSync personalised lookup for the given username against the
 * OSRS Wiki league tasks page.
 *
 * Uses Playwright (headless Chromium) to navigate the page, enter the username
 * through the WikiSync UI, wait for personalisation to render, and extract
 * completed-task state from the DOM.
 *
 * The WikiSync API is NOT called directly.  Only the publicly rendered page UI
 * is used, as recommended by the OSRS Wiki.
 */
export async function runWikiSyncLookup(
  req: WikiSyncLookupRequest,
  dataFile = 'LEAGUE_5.full.json',
): Promise<WikiSyncImportResult> {
  const { username, debug = false, headed = false } = req;
  const wikiUrl = req.wikiUrl ?? DEFAULT_WIKI_URL;
  const notes: string[] = [];

  if (debug) {
    console.log(`[wikisync] Starting lookup — user="${username}" url="${wikiUrl}"`);
  }

  // ── Load local task data for ID resolution ──────────────────────────────
  const localTasks = await loadLocalTasks(dataFile);
  const lookups    = buildLookupMaps(localTasks);
  if (debug) {
    console.log(`[wikisync] Loaded ${localTasks.length} local tasks for ID resolution.`);
  }
  if (localTasks.length === 0) {
    notes.push(
      `Could not load local task data from ${dataFile}. Task IDs will not be resolved — ` +
      `only raw names will be available. Check that the data file exists at client/public/data/.`,
    );
  }

  // ── Launch browser ──────────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: !headed,
    slowMo:   headed ? 100 : 0,
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  const page = await context.newPage();

  const syncedAt = new Date().toISOString();

  try {
    // ── Navigate ──────────────────────────────────────────────────────────
    const navOk = await navigateTo(page, wikiUrl, debug);
    if (!navOk) {
      return errorResult(username, wikiUrl, syncedAt, notes, {
        note: `Navigation to ${wikiUrl} failed. The wiki may be temporarily unavailable.`,
      });
    }

    // ── Personalisation ───────────────────────────────────────────────────
    const personalisation = await triggerPersonalisation(page, username, debug);
    if (debug) {
      console.log('[wikisync] Personalisation result:', personalisation.note);
      console.log('[wikisync]   input selector  :', personalisation.inputSelFound ?? 'n/a');
      console.log('[wikisync]   submit selector :', personalisation.submitSelFound ?? 'n/a (pressed Enter)');
    }

    if (!personalisation.inputSelFound) {
      return errorResult(username, wikiUrl, syncedAt, notes, {
        note: personalisation.note,
      });
    }

    // ── Completion markers ────────────────────────────────────────────────
    const completionClass = await resolveCompletionClass(page);
    const completionStyle = completionClass ? null : await resolveCompletionStyle(page);
    const detectionNote = completionClass
      ? `CSS class ".${completionClass}" on <tr> elements`
      : completionStyle
      ? `Inline background-color "${completionStyle}" on <tr> elements`
      : 'No confirmed completion marker (rows may still be extracted by class candidate scan)';

    if (debug) {
      console.log('[wikisync] Completion marker strategy:', detectionNote);
    }

    // ── Completion percent ────────────────────────────────────────────────
    const { value: completionPercent, raw: completionPercentRaw } =
      await extractCompletionPercent(page);
    if (debug) {
      console.log(
        '[wikisync] Completion percent:',
        completionPercent !== null ? `${completionPercent}%` : 'not found',
        completionPercentRaw ? `(raw: "${completionPercentRaw}")` : '',
      );
    }

    // ── Task rows ─────────────────────────────────────────────────────────
    const tasks = await extractTaskRows(
      page,
      completionClass,
      completionStyle,
      lookups,
      debug,
    );

    // Unlocked areas — not available on the task-list page DOM.
    const unlockedAreas: string[] = [];
    const areasNote =
      'Region/area unlock state is NOT available in the Leagues task-list page DOM. ' +
      'WikiSync does not inject this data here. unlockedAreas will always be empty from this flow.';
    notes.push(areasNote);

    // ── Build result ──────────────────────────────────────────────────────
    const completedTasks     = tasks.filter(t => t.completed);
    const completedTaskIds   = completedTasks.filter(t => t.appId).map(t => t.appId as string);
    const completedUnmatched = completedTasks.filter(t => !t.appId).map(t => t.name);
    const completedTaskNames = completedTasks.map(t => t.name);

    const nMatched     = tasks.filter(t => t.appId !== null).length;
    const nUnmatched   = tasks.filter(t => t.appId === null).length;

    if (debug) {
      console.log('[wikisync] ─────────────────────────────────────────────────');
      console.log('[wikisync] Summary');
      console.log(`[wikisync]   Page             : ${wikiUrl}`);
      console.log(`[wikisync]   Input found      : ${personalisation.inputSelFound}`);
      console.log(`[wikisync]   Personalised     : ${personalisation.succeeded}`);
      console.log(`[wikisync]   Detect method    : ${detectionNote}`);
      console.log(`[wikisync]   Total rows       : ${tasks.length}`);
      console.log(`[wikisync]   Completed rows   : ${completedTasks.length}`);
      console.log(`[wikisync]   Matched to ID    : ${nMatched}`);
      console.log(`[wikisync]   Unmatched names  : ${nUnmatched}`);
      console.log(`[wikisync]   Completion %     : ${completionPercent !== null ? `${completionPercent}%` : 'n/a'}`);
      console.log('[wikisync] ─────────────────────────────────────────────────');
    }

    if (!personalisation.succeeded) {
      notes.push(personalisation.note);
    }
    if (completedUnmatched.length > 0) {
      notes.push(
        `${completedUnmatched.length} completed task(s) could not be matched to a local ID ` +
        `(possible name mismatch between wiki and dataset). Names: ` +
        completedUnmatched.slice(0, 5).join(', ') +
        (completedUnmatched.length > 5 ? `… (+${completedUnmatched.length - 5} more)` : ''),
      );
    }

    return {
      username,
      sourcePage:               wikiUrl,
      syncedAt,
      success:                  personalisation.succeeded,
      personalisationSucceeded: personalisation.succeeded,
      personalisationNote:      personalisation.note,
      completionDetectionMethod: personalisation.succeeded
        ? detectionNote
        : personalisation.detectionMethod,
      completionPercent,
      completionPercentRaw,
      completedTaskIds,
      completedTaskNames,
      completedUnmatchedNames: completedUnmatched,
      unlockedAreas,
      notes,
      summary: {
        totalTasksFound:     tasks.length,
        completedTasksFound: completedTasks.length,
        matchedToAppId:      nMatched,
        unmatchedNames:      nUnmatched,
      },
      rawExtra: {
        completionClass,
        completionStyle,
        localTasksLoaded:   localTasks.length,
        areasNote,
        completedUnmatched,
      },
    };

  } finally {
    await browser.close();
  }
}

// ─── Error result helper ──────────────────────────────────────────────────────

function errorResult(
  username: string,
  sourcePage: string,
  syncedAt: string,
  notes: string[],
  opts: { note: string },
): WikiSyncImportResult {
  notes.push(opts.note);
  return {
    username,
    sourcePage,
    syncedAt,
    success:                  false,
    personalisationSucceeded: false,
    personalisationNote:      opts.note,
    completionDetectionMethod: 'n/a',
    completionPercent:        null,
    completionPercentRaw:     null,
    completedTaskIds:         [],
    completedTaskNames:       [],
    completedUnmatchedNames:  [],
    unlockedAreas:            [],
    notes,
    summary: {
      totalTasksFound:     0,
      completedTasksFound: 0,
      matchedToAppId:      0,
      unmatchedNames:      0,
    },
    rawExtra: {},
  };
}
