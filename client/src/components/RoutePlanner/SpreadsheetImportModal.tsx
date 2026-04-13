import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskView } from '@/types/task';
import type { Route, RouteSection } from '@/types/route';
import {
  parseSpreadsheetText,
  matchRows,
  buildImportedSections,
  type SpreadsheetParseResult,
  type UnmatchedRow,
} from '@/utils/spreadsheetImport';

// ─── Icons ────────────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M10.5 1.5 6 6l4.5 4.5-1 1L6 7 1.5 11.5l-1-1L5 6 1.5 1.5l1-1L6 5l4.5-4.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3" aria-hidden="true">
      <path d="M10 2 4.5 8.5 2 6l-1 1 3.5 3.5 6.5-7.5z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3" aria-hidden="true">
      <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SpreadsheetImportModalProps {
  allTasks: TaskView[];
  existingRoute: Route;
  onReplaceRoute: (route: Route) => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Step = 'input' | 'preview';

interface FullParseResult extends SpreadsheetParseResult {
  skipped: number;
}

export function SpreadsheetImportModal({
  allTasks,
  existingRoute,
  onReplaceRoute,
  onClose,
}: SpreadsheetImportModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [pasteText, setPasteText] = useState('');
  const [parseResult, setParseResult] = useState<FullParseResult | null>(null);
  const [importedSections, setImportedSections] = useState<RouteSection[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    function handler(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHelp]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (step === 'input') {
      textareaRef.current?.focus();
    }
  }, [step]);

  const hasExistingItems = existingRoute.sections.some((s) => s.items.length > 0);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      setPasteText(text);
    };
    reader.readAsText(file, 'utf-8');
    // Allow the same file to be re-selected
    e.target.value = '';
  }, []);

  const handleParse = useCallback(() => {
    setParseError(null);
    const text = pasteText.trim();
    if (!text) {
      setParseError('Paste your spreadsheet rows first, or upload a CSV file.');
      return;
    }
    const { rows, skipped } = parseSpreadsheetText(text);
    if (rows.length === 0) {
      setParseError(
        'No task rows detected. Make sure each row has a task name in the expected column.',
      );
      return;
    }
    const result = matchRows(rows, allTasks);
    const sections = buildImportedSections(result.matched);
    setParseResult({ ...result, skipped });
    setImportedSections(sections);
    setStep('preview');
    setShowUnmatched(result.unmatched.length > 0);
  }, [pasteText, allTasks]);

  const handleBack = useCallback(() => {
    setStep('input');
    setParseResult(null);
    setParseError(null);
  }, []);

  const doImport = useCallback(
    (mode: 'append' | 'replace') => {
      if (!parseResult || importedSections.length === 0) return;

      let newRoute: Route;
      if (mode === 'replace' || !hasExistingItems) {
        // Replace: keep route identity (id, name, taskType) but swap sections
        newRoute = {
          id: existingRoute.id,
          name: existingRoute.name,
          taskType: existingRoute.taskType,
          author: existingRoute.author,
          description: existingRoute.description,
          completed: existingRoute.completed,
          sections: importedSections,
        };
      } else {
        // Append: add new sections after existing ones
        newRoute = {
          ...existingRoute,
          sections: [...existingRoute.sections, ...importedSections],
        };
      }
      onReplaceRoute(newRoute);
      onClose();
    },
    [parseResult, importedSections, existingRoute, hasExistingItems, onReplaceRoute, onClose],
  );

  // ── Render: input step ───────────────────────────────────────────────────────

  if (step === 'input') {
    return (
      <div className="bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark">

        {/* Header row */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark">
          <span className="font-semibold text-[13px] text-wiki-text dark:text-wiki-text-dark">
            Import from Spreadsheet
          </span>
          <div className="flex items-center gap-2">
            {/* Help toggle */}
            <div className="relative" ref={helpRef}>
              <button
                onClick={() => setShowHelp((v) => !v)}
                aria-label="Help: how spreadsheet import works"
                aria-expanded={showHelp}
                className="w-[18px] h-[18px] flex items-center justify-center rounded-full border text-[10px] font-bold leading-none border-wiki-border dark:border-wiki-border-dark bg-wiki-bg dark:bg-wiki-bg-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark hover:border-wiki-link dark:hover:border-wiki-link-dark transition-colors select-none cursor-pointer"
              >
                ?
              </button>
              {showHelp && (
                <div className="absolute right-0 top-6 z-50 w-[300px] sm:w-[400px] bg-wiki-article dark:bg-wiki-article-dark border border-wiki-border dark:border-wiki-border-dark shadow-lg p-3 text-[12.5px] text-wiki-text dark:text-wiki-text-dark">
                  <p className="font-semibold text-[13px] mb-2">How spreadsheet import works</p>
                  <ul className="space-y-1.5 text-wiki-muted dark:text-wiki-muted-dark leading-snug list-disc list-inside pl-0.5">
                    <li>Copy rows from Google Sheets or Excel, or upload a CSV file</li>
                    <li>
                      The importer reads task names and matches them to known tasks in the
                      current dataset
                    </li>
                    <li>Tasks are added in the same order they appear in the spreadsheet</li>
                    <li>
                      Rows that cannot be matched are shown in the preview — you can proceed
                      with matched rows only
                    </li>
                  </ul>
                  <div className="mt-2.5 pt-2.5 border-t border-wiki-border dark:border-wiki-border-dark">
                    <p className="font-semibold text-[12px] text-wiki-text dark:text-wiki-text-dark mb-1">
                      Supported formats
                    </p>
                    <ul className="space-y-1 text-wiki-muted dark:text-wiki-muted-dark leading-snug list-disc list-inside pl-0.5">
                      <li>Single column: one task name per row</li>
                      <li>
                        Two columns: task name | note &nbsp;
                        <span className="text-[11px]">(no header needed)</span>
                      </li>
                      <li>
                        Three columns: section | task name | note &nbsp;
                        <span className="text-[11px]">(no header needed)</span>
                      </li>
                      <li>
                        With a header row: columns labelled{' '}
                        <span className="font-mono font-semibold">task</span>,{' '}
                        <span className="font-mono font-semibold">section</span>,{' '}
                        <span className="font-mono font-semibold">note</span> (any order)
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close spreadsheet import"
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              <XIcon />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-3">
          <div>
            <label
              htmlFor="spreadsheet-paste"
              className="block text-[12px] font-semibold text-wiki-text dark:text-wiki-text-dark mb-1"
            >
              Paste spreadsheet rows
            </label>
            <textarea
              id="spreadsheet-paste"
              ref={textareaRef}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl+Enter to parse
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParse();
              }}
              placeholder={
                'Paste rows from Google Sheets or Excel here.\n' +
                'One task per row. The importer will match each row to a known task.\n\n' +
                'Example (single column):\n' +
                'Kill a Giant Rat\n' +
                'Chop Some Logs\n' +
                'Mine Some Copper'
              }
              rows={8}
              className="w-full px-2.5 py-2 text-[13px] font-mono bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-muted/60 dark:placeholder:text-wiki-muted-dark/60 focus:outline-none focus:border-wiki-link dark:focus:border-wiki-link-dark resize-y leading-relaxed"
            />
          </div>

          {/* File upload */}
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-wiki-muted dark:text-wiki-muted-dark">or</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload a CSV or text file"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-article dark:hover:bg-wiki-article-dark transition-colors"
            >
              Upload CSV / text file
            </button>
            {pasteText && (
              <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark">
                {pasteText.split(/\r?\n/).filter((l) => l.trim()).length} non-empty line
                {pasteText.split(/\r?\n/).filter((l) => l.trim()).length !== 1 ? 's' : ''} ready
              </span>
            )}
          </div>

          {/* Error */}
          {parseError && (
            <div className="flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
              <span className="flex-shrink-0 mt-0.5">
                <WarningIcon />
              </span>
              <span>{parseError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={handleParse}
              disabled={!pasteText.trim()}
              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Parse rows
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
            <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark ml-1 hidden sm:block">
              Tip: press Ctrl+Enter / ⌘+Enter to parse
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: preview step ─────────────────────────────────────────────────────

  if (!parseResult) return null;

  const { matched, unmatched, skipped, total } = parseResult;
  const allUnmatched = unmatched.length === total && total > 0;

  return (
    <div className="bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark">

      {/* Header row */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark">
        <span className="font-semibold text-[13px] text-wiki-text dark:text-wiki-text-dark">
          Import from Spreadsheet — Preview
        </span>
        <button
          onClick={onClose}
          aria-label="Close spreadsheet import"
          className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
        >
          <XIcon />
        </button>
      </div>

      {/* Summary row */}
      <div className="px-3 py-3 space-y-3">
        <div className="flex flex-wrap gap-3 text-[13px]">
          <div className="flex items-center gap-1.5">
            <span className="text-wiki-muted dark:text-wiki-muted-dark">Rows read:</span>
            <span className="font-semibold text-wiki-text dark:text-wiki-text-dark tabular-nums">
              {total + skipped}
            </span>
            {skipped > 0 && (
              <span className="text-wiki-muted dark:text-wiki-muted-dark text-[12px]">
                ({skipped} empty, skipped)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex-shrink-0 text-green-700 dark:text-green-400">
              <CheckIcon />
            </span>
            <span className="font-semibold text-green-700 dark:text-green-400 tabular-nums">
              {matched.length}
            </span>
            <span className="text-wiki-muted dark:text-wiki-muted-dark">matched</span>
          </div>
          {unmatched.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="flex-shrink-0 text-amber-600 dark:text-amber-400">
                <WarningIcon />
              </span>
              <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {unmatched.length}
              </span>
              <span className="text-wiki-muted dark:text-wiki-muted-dark">unmatched</span>
            </div>
          )}
        </div>

        {/* Unmatched rows panel */}
        {unmatched.length > 0 && (
          <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <button
              onClick={() => setShowUnmatched((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-left"
            >
              <span>
                {showUnmatched ? '▾' : '▸'}{' '}
                {unmatched.length} row{unmatched.length !== 1 ? 's' : ''} could not be
                matched — will be skipped
              </span>
            </button>
            {showUnmatched && (
              <div className="border-t border-amber-300 dark:border-amber-800 px-3 py-2">
                <p className="text-[11.5px] text-amber-700 dark:text-amber-400 mb-2 leading-snug">
                  These rows did not match any task in the current dataset. Check spelling
                  carefully — the importer performs an exact (normalized) match only.
                </p>
                <UnmatchedList rows={unmatched} />
              </div>
            )}
          </div>
        )}

        {/* Match success / fully unmatched messages */}
        {matched.length > 0 && unmatched.length === 0 && (
          <p className="text-[12.5px] text-green-700 dark:text-green-400">
            All {matched.length} row{matched.length !== 1 ? 's' : ''} matched successfully.
          </p>
        )}
        {allUnmatched && (
          <p className="text-[12.5px] text-red-600 dark:text-red-400">
            None of the {total} rows could be matched. Check that task names exactly match
            the current task dataset, then go back and try again.
          </p>
        )}

        {/* Sections preview (when section column was used) */}
        {matched.length > 0 && importedSections.length > 1 && (
          <div className="text-[12px] text-wiki-muted dark:text-wiki-muted-dark">
            <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">
              Sections to create:
            </span>{' '}
            {importedSections.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <span className="font-medium text-wiki-text dark:text-wiki-text-dark">
                  {s.name}
                </span>{' '}
                ({s.items.length})
              </span>
            ))}
          </div>
        )}

        {/* Import action buttons */}
        {matched.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {hasExistingItems ? (
              <>
                <button
                  onClick={() => doImport('append')}
                  className="px-3 py-1.5 text-[12px] font-semibold text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-90 transition-opacity"
                >
                  Add to current route
                  <span className="ml-1 font-normal text-[11px] opacity-80">
                    (new section{importedSections.length !== 1 ? 's' : ''})
                  </span>
                </button>
                <button
                  onClick={() => doImport('replace')}
                  className="px-3 py-1.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-article dark:hover:bg-wiki-article-dark transition-colors"
                >
                  Replace current route
                </button>
              </>
            ) : (
              <button
                onClick={() => doImport('replace')}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-90 transition-opacity"
              >
                Import {matched.length} task{matched.length !== 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={handleBack}
              className="px-3 py-1.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] font-medium text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Back only when nothing matched */}
        {matched.length === 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={handleBack}
              className="px-3 py-1.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] font-medium text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unmatched list sub-component ─────────────────────────────────────────────

function UnmatchedList({ rows }: { rows: UnmatchedRow[] }) {
  const MAX_SHOWN = 20;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, MAX_SHOWN);
  const remaining = rows.length - MAX_SHOWN;

  return (
    <ul className="space-y-0.5">
      {visible.map((row) => (
        <li
          key={row.lineNumber}
          className="flex items-start gap-2 text-[12px] font-mono leading-snug"
        >
          <span className="flex-shrink-0 text-wiki-muted dark:text-wiki-muted-dark w-8 text-right tabular-nums">
            {row.lineNumber}:
          </span>
          <span className="text-wiki-text dark:text-wiki-text-dark break-all">
            {row.rawName}
          </span>
        </li>
      ))}
      {!showAll && remaining > 0 && (
        <li>
          <button
            onClick={() => setShowAll(true)}
            className="text-[11.5px] text-wiki-link dark:text-wiki-link-dark hover:underline mt-1"
          >
            Show {remaining} more…
          </button>
        </li>
      )}
    </ul>
  );
}
