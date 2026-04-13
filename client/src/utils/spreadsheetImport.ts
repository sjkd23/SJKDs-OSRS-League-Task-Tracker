/**
 * spreadsheetImport.ts
 *
 * Parse spreadsheet data (paste or CSV file) and match rows to known tasks.
 *
 * Exported surface:
 *   normalizeTaskName      — safe normalization for name matching
 *   parseSpreadsheetText   — parse raw text into ParsedRow[]
 *   matchRows              — match ParsedRow[] against a task list
 *   buildImportedSections  — build RouteSection[] from matched rows
 */

import type { RouteItem, RouteSection } from '@/types/route';
import type { TaskView } from '@/types/task';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedRow = {
  rawName: string;
  rawSection?: string;
  rawNote?: string;
  /** 1-based source line number — used in preview to help the user locate errors. */
  lineNumber: number;
};

export type MatchedRow = ParsedRow & { task: TaskView };
export type UnmatchedRow = ParsedRow;

export type SpreadsheetParseResult = {
  matched: MatchedRow[];
  unmatched: UnmatchedRow[];
  /** Non-empty rows in total (matched + unmatched). */
  total: number;
};

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalizes a task name for safe matching.
 *
 * Handles: trim, lowercase, collapse whitespace, normalize apostrophes/quotes,
 * normalize dashes, strip trailing period.
 *
 * Conservative: does NOT do substring or fuzzy matching.
 * Unresolved rows are surfaced to the user rather than silently guessed.
 */
export function normalizeTaskName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['\u2018\u2019`]/g, "'")
    .replace(/["\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\.$/, '');
}

// ─── CSV / tab-separated parser ───────────────────────────────────────────────

/** Parse a single CSV line respecting double-quoted fields. */
function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

/** Split raw text into rows of columns. Auto-detects tab vs comma delimiter. */
function parseDelimitedRows(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  // Prefer tab if any of the first 5 lines contain a tab character.
  const hasTab = lines.slice(0, 5).some((l) => l.includes('\t'));
  const delimiter = hasTab ? '\t' : ',';
  return lines.map((line) =>
    delimiter === '\t' ? line.split('\t').map((c) => c.trim()) : parseCSVLine(line),
  );
}

// ─── Column layout detection ──────────────────────────────────────────────────

const TASK_COL_NAMES = new Set([
  'task', 'tasks', 'name', 'task name', 'taskname', 'task names',
]);
const SECTION_COL_NAMES = new Set([
  'section', 'group', 'area', 'category', 'region',
]);
const NOTE_COL_NAMES = new Set([
  'note', 'notes', 'comment', 'comments',
]);

type ColumnLayout = {
  hasHeader: boolean;
  taskCol: number;
  sectionCol: number; // -1 if absent
  noteCol: number;    // -1 if absent
};

/**
 * Detect whether the first row is a header row and resolve column positions.
 *
 * If no recognised header is found, positional convention is used:
 *   1 column  → task name only
 *   2 columns → task name | note
 *   3+ columns → section | task name | note
 */
function detectColumnLayout(firstRow: string[], totalCols: number): ColumnLayout {
  const norm = firstRow.map((c) => c.trim().toLowerCase());
  const isHeader = norm.some(
    (c) => TASK_COL_NAMES.has(c) || SECTION_COL_NAMES.has(c) || NOTE_COL_NAMES.has(c),
  );

  if (isHeader) {
    let taskCol = -1, sectionCol = -1, noteCol = -1;
    norm.forEach((c, i) => {
      if (taskCol === -1 && TASK_COL_NAMES.has(c)) taskCol = i;
      if (sectionCol === -1 && SECTION_COL_NAMES.has(c)) sectionCol = i;
      if (noteCol === -1 && NOTE_COL_NAMES.has(c)) noteCol = i;
    });
    // If header row detected but no task column found, fall back to col 0
    if (taskCol === -1) taskCol = 0;
    return { hasHeader: true, taskCol, sectionCol, noteCol };
  }

  // Positional — no header
  if (totalCols <= 1) return { hasHeader: false, taskCol: 0, sectionCol: -1, noteCol: -1 };
  if (totalCols === 2) return { hasHeader: false, taskCol: 0, sectionCol: -1, noteCol: 1 };
  return { hasHeader: false, taskCol: 1, sectionCol: 0, noteCol: 2 };
}

// ─── Public: parse text ───────────────────────────────────────────────────────

/**
 * Parse pasted or file-uploaded spreadsheet text into structured rows.
 * Empty rows are skipped. Rows are returned in source order.
 */
export function parseSpreadsheetText(text: string): { rows: ParsedRow[]; skipped: number } {
  const allRows = parseDelimitedRows(text.trim());
  if (allRows.length === 0) return { rows: [], skipped: 0 };

  const maxCols = Math.max(...allRows.map((r) => r.length), 1);
  const layout = detectColumnLayout(allRows[0], maxCols);
  const dataRows = layout.hasHeader ? allRows.slice(1) : allRows;

  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const lineNumber = layout.hasHeader ? i + 2 : i + 1;
    const rawName = (row[layout.taskCol] ?? '').trim();

    if (!rawName) {
      skipped++;
      continue;
    }

    const entry: ParsedRow = { rawName, lineNumber };

    if (layout.sectionCol >= 0) {
      const s = (row[layout.sectionCol] ?? '').trim();
      if (s) entry.rawSection = s;
    }
    if (layout.noteCol >= 0) {
      const n = (row[layout.noteCol] ?? '').trim();
      if (n) entry.rawNote = n;
    }

    parsed.push(entry);
  }

  return { rows: parsed, skipped };
}

// ─── Public: match rows ───────────────────────────────────────────────────────

/**
 * Match parsed rows against the task list by normalized name.
 *
 * Strategy:
 *   1. Exact normalized match (trim, lowercase, collapse whitespace, normalize punctuation)
 *   2. No fuzzy matching — unresolved rows are surfaced to the user
 *
 * Row identity comes from the matched task name, not from row index position.
 */
export function matchRows(rows: ParsedRow[], allTasks: TaskView[]): SpreadsheetParseResult {
  // Build a normalized-name → task lookup
  const nameMap = new Map<string, TaskView>();
  for (const task of allTasks) {
    const key = normalizeTaskName(task.name);
    if (!nameMap.has(key)) {
      nameMap.set(key, task);
    }
  }

  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const row of rows) {
    const key = normalizeTaskName(row.rawName);
    const task = nameMap.get(key);
    if (task) {
      matched.push({ ...row, task });
    } else {
      unmatched.push(row);
    }
  }

  return { matched, unmatched, total: rows.length };
}

// ─── Public: build route sections ────────────────────────────────────────────

/**
 * Build RouteSection[] from matched rows.
 *
 * Row order is preserved within each section.
 * If no section column was provided, all tasks are placed in one
 * "Imported Tasks" section.
 * If a section column was provided, sections are created in the order
 * they first appear and tasks are placed within their section in row order.
 */
export function buildImportedSections(matched: MatchedRow[]): RouteSection[] {
  if (matched.length === 0) return [];

  const hasSectionData = matched.some((r) => r.rawSection != null);

  if (!hasSectionData) {
    return [makeSection('Imported Tasks', matched)];
  }

  const sectionOrder: string[] = [];
  const sectionMap = new Map<string, MatchedRow[]>();
  const DEFAULT_SECTION = 'Imported Tasks';

  for (const row of matched) {
    const name = row.rawSection ?? DEFAULT_SECTION;
    if (!sectionMap.has(name)) {
      sectionMap.set(name, []);
      sectionOrder.push(name);
    }
    sectionMap.get(name)!.push(row);
  }

  return sectionOrder.map((name) => makeSection(name, sectionMap.get(name)!));
}

function makeSection(name: string, rows: MatchedRow[]): RouteSection {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    items: rows.map(
      (r): RouteItem => ({
        taskId: r.task.id,
        routeItemId: crypto.randomUUID(),
        ...(r.rawNote ? { note: r.rawNote } : {}),
        _snap: {
          name: r.task.name,
          structId: r.task.structId,
          sortId: r.task.sortId,
          ...(r.task.taskKey ? { taskKey: r.task.taskKey } : {}),
        },
      }),
    ),
  };
}
