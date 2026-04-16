import { useState, useRef, useEffect } from 'react';
import type { AppTask } from '@/types/task';
import { parsePluginExport } from '@/utils/pluginImport';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';

export type ImportStatus =
  | { type: 'idle' }
  | { type: 'success'; completedCount: number; todoCount: number; unmatched: number; noChanges: boolean }
  | { type: 'error'; message: string };

// How long (ms) a success/no-op message stays visible before auto-dismissing.
const SUCCESS_DISMISS_MS = 4500;

interface ImportButtonProps {
  tasks: AppTask[];
  pasteValue: string;
  onPasteChange: (v: string) => void;
  importTracked: boolean;
  onImportTrackedChange: (v: boolean) => void;
  status: ImportStatus;
  onStatusChange: (s: ImportStatus) => void;
  canRevert: boolean;
  onRevert: () => void;
  /** Returns true if changes were applied; false if the import was a no-op. */
  onImport: (completedIds: string[], todoIds: string[], replaceTodos: boolean) => boolean;
}

export function ImportButton({
  tasks,
  // pasteValue / onPasteChange kept in interface for API compatibility but not
  // used by the primary clipboard flow; the fallback textarea uses local state.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pasteValue: _pasteValue,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onPasteChange: _onPasteChange,
  importTracked,
  onImportTrackedChange,
  status,
  onStatusChange,
  canRevert,
  onRevert,
  onImport,
}: ImportButtonProps) {
  const [showHelp, setShowHelp] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Temporary overwrite warning: show briefly when tracked import is enabled, then auto-hide.
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (importTracked) {
      setShowOverwriteWarning(true);
      warningTimerRef.current = setTimeout(() => {
        setShowOverwriteWarning(false);
        warningTimerRef.current = null;
      }, 3500);
    } else {
      setShowOverwriteWarning(false);
    }
    return () => {
      if (warningTimerRef.current !== null) {
        clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
    };
  }, [importTracked]);

  // Auto-dismiss success messages after a short delay.
  useEffect(() => {
    if (status.type !== 'success') return;

    if (dismissTimerRef.current !== null) clearTimeout(dismissTimerRef.current);

    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      onStatusChange({ type: 'idle' });
    }, SUCCESS_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [status, onStatusChange]);

  useEffect(() => {
    if (!showHelp) return;
    function handleClickOutside(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHelp]);

  /** Core import logic — parses text and applies via onImport. Returns true on success. */
  function doImport(text: string): boolean {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      onStatusChange({ type: 'error', message: 'Pasted text is not valid JSON.' });
      return false;
    }

    let result;
    try {
      result = parsePluginExport(raw, tasks, CURRENT_LEAGUE.pluginTaskType);
    } catch (err) {
      onStatusChange({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse export.',
      });
      return false;
    }

    const totalInteracted = result.totalCompleted + result.totalTracked;
    if (totalInteracted === 0) {
      onStatusChange({
        type: 'error',
        message: 'No completed or tracked tasks found in this export.',
      });
      return false;
    }

    const effectiveTodos = importTracked ? result.matchedTodos : [];

    if (result.matchedCompleted.length === 0 && effectiveTodos.length === 0) {
      if (result.matchedTodos.length > 0 && !importTracked) {
        // Tracked tasks present but checkbox is unchecked — expected behavior.
        return true;
      }
      const noun = totalInteracted === 1 ? 'task' : 'tasks';
      onStatusChange({
        type: 'error',
        message: `${totalInteracted} ${noun} found in export but none matched tasks in this list.`,
      });
      return false;
    }

    const changed = onImport(result.matchedCompleted, effectiveTodos, importTracked);
    onStatusChange({
      type: 'success',
      completedCount: result.matchedCompleted.length,
      todoCount: effectiveTodos.length,
      unmatched: result.unmatchedStructIds.length,
      noChanges: !changed,
    });
    return true;
  }

  /** Primary action for desktop: read from clipboard and import. */
  async function handleClipboardImport() {
    onStatusChange({ type: 'idle' });
    let clipText = '';
    let clipboardFailed = false;
    try {
      if (navigator.clipboard?.readText) {
        clipText = (await navigator.clipboard.readText()).trim();
      } else {
        clipboardFailed = true;
      }
    } catch {
      clipboardFailed = true;
    }

    if (clipboardFailed || !clipText) {
      onStatusChange({
        type: 'error',
        message: clipboardFailed
          ? 'Clipboard unavailable — copy your Task Tracker export first.'
          : 'Clipboard was empty — copy your Task Tracker export first.',
      });
      return;
    }

    doImport(clipText);
  }

  /** Fallback action for mobile: import from pasted textarea. */
  function handleTextareaImport() {
    onStatusChange({ type: 'idle' });
    if (!mobilePasteToken.trim()) {
      onStatusChange({
        type: 'error',
        message: 'Paste your export data into the box first.',
      });
      return;
    }
    doImport(mobilePasteToken);
    setMobilePasteToken('');
  }

  const [mobilePasteToken, setMobilePasteToken] = useState('');

  return (
    <div className="flex flex-col gap-2">

      {/* Panel header */}
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-[13px] text-wiki-muted dark:text-wiki-muted-dark uppercase tracking-wide">
          Import from{' '}
          <a
            href="https://github.com/osrs-reldo/tasks-tracker-plugin"
            target="_blank"
            rel="noreferrer"
            className="text-wiki-link dark:text-wiki-link-dark hover:underline"
          >
            Task Tracker
          </a>
        </span>

        {/* Help trigger */}
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setShowHelp(v => !v)}
            aria-label="Help with import"
            aria-expanded={showHelp}
            className={[
              'w-[18px] h-[18px] flex items-center justify-center',
              'rounded-full border text-[10px] font-bold leading-none',
              'border-wiki-border dark:border-wiki-border-dark',
              'bg-wiki-surface dark:bg-wiki-surface-dark',
              'text-wiki-muted dark:text-wiki-muted-dark',
              'hover:text-wiki-link dark:hover:text-wiki-link-dark',
              'hover:border-wiki-link dark:hover:border-wiki-link-dark',
              'transition-colors select-none cursor-pointer',
            ].join(' ')}
          >
            ?
          </button>

          {showHelp && (
            <div className="absolute left-0 top-6 z-50 w-[340px] bg-wiki-article dark:bg-wiki-article-dark border border-wiki-border dark:border-wiki-border-dark shadow-md p-3 text-[12.5px] text-wiki-text dark:text-wiki-text-dark">
              <p className="font-semibold mb-2 text-[13px] text-wiki-text dark:text-wiki-text-dark">
                Import from Tasks Tracker plugin
              </p>
              <p className="text-wiki-muted dark:text-wiki-muted-dark mb-2 leading-snug">
                This shows which tasks you have completed and tracked (optional).
              </p>
              <ol className="list-decimal list-inside pl-1 space-y-1.5 mb-3 text-wiki-muted dark:text-wiki-muted-dark leading-snug">
                <li>
                  Install the <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Task Tracker</span> RuneLite plugin by <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Reldo.net</span>
                </li>
                <li>Open the Task Tracker plugin on the right side</li>
                <li>
                  Make sure the correct league is selected, and <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">no route is selected</span> in the sorting dropdown
                </li>
                <li>
                  At the bottom of the plugin panel, click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Export</span>. Your task list will be copied to your clipboard
                </li>
                <li>
                  Click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Import from Clipboard</span> below
                </li>
              </ol>
              <div className="border-t border-wiki-border dark:border-wiki-border-dark pt-2">
                <p className="font-semibold mb-1 text-wiki-text dark:text-wiki-text-dark">
                  Import tracked tasks
                </p>
                <p className="text-wiki-muted dark:text-wiki-muted-dark leading-snug mb-1">
                  When enabled, tasks tracked in the plugin are imported as To&#8209;Do items on this page.
                </p>
                <p className="text-amber-600 dark:text-amber-400 leading-snug">
                  ⚠ This replaces your current To&#8209;Do list.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import button row */}
      <div className="flex items-center gap-2">
        {canRevert && (
          <button
            onClick={onRevert}
            className="text-[12px] text-wiki-link dark:text-wiki-link-dark hover:underline select-none"
          >
            Revert
          </button>
        )}
        <button
          onClick={() => void handleClipboardImport()}
          className={[
            'hidden sm:block',
            'px-3 py-1.5',
            'border border-wiki-link dark:border-wiki-link-dark',
            'bg-wiki-link dark:bg-wiki-link-dark',
            'text-[13px] text-white dark:text-wiki-bg-dark font-semibold',
            'hover:opacity-90 active:opacity-80',
            'select-none leading-snug transition-opacity',
          ].join(' ')}
        >
          Import from Clipboard
        </button>
      </div>

      {/* Mobile-only paste flow */}
      <div className="sm:hidden flex flex-col gap-2 mt-1">
        <textarea
          value={mobilePasteToken}
          onChange={(e) => setMobilePasteToken(e.target.value)}
          placeholder="Paste export JSON here..."
          className="w-full text-[13px] px-2 py-1.5 bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/50 dark:placeholder:text-wiki-muted-dark focus:outline-none focus:border-wiki-link dark:focus:border-wiki-link-dark min-h-[50px] resize-y"
        />
        <button
          onClick={() => void handleTextareaImport()}
          className={[
            'w-full py-1.5',
            'border border-wiki-link dark:border-wiki-link-dark',
            'bg-wiki-link dark:bg-wiki-link-dark',
            'text-[13px] text-white dark:text-wiki-bg-dark font-semibold',
            'hover:opacity-90 active:opacity-80',
            'select-none leading-snug transition-opacity',
          ].join(' ')}
        >
          Import
        </button>
      </div>

      {/* Checkbox row */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none text-[13px] font-medium text-wiki-text dark:text-wiki-text-dark">
        <input
          type="checkbox"
          checked={importTracked}
          onChange={(e) => onImportTrackedChange(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-wiki-border dark:border-wiki-border-dark accent-wiki-link dark:accent-wiki-link-dark cursor-pointer"
        />
        Import tracked tasks
      </label>

      {/* Overwrite warning — only briefly visible after enabling */}
      {showOverwriteWarning && (
        <p className="text-[11.5px] font-medium text-amber-600 dark:text-amber-400 -mt-1 ml-[22px] leading-snug">
          Replaces your current To&#8209;Do list.
        </p>
      )}

      {/* Status message */}
      {status.type === 'error' && (
        <p className="text-[12.5px] font-medium text-red-600 dark:text-red-400">
          {status.message}
        </p>
      )}
      {status.type === 'success' && (
        <p className="text-[13px] text-wiki-text dark:text-wiki-text-dark">
          {status.noChanges ? (
            <span className="font-semibold text-green-700 dark:text-green-400">
              Import successful. No changes found.
            </span>
          ) : (
            <>
              <span className="font-semibold text-green-700 dark:text-green-400">Imported:</span>{' '}
              {status.completedCount > 0 && (
                <><strong>{status.completedCount}</strong>{' '}completed</>
              )}
              {status.completedCount > 0 && status.todoCount > 0 && ', '}
              {status.todoCount > 0 && (
                <><strong>{status.todoCount}</strong>{' '}To-Do</>
              )}
              {status.unmatched > 0 && (
                <span className="text-wiki-muted dark:text-wiki-muted-dark"> ({status.unmatched} unmatched)</span>
              )}
            </>
          )}
        </p>
      )}

    </div>
  );
}
