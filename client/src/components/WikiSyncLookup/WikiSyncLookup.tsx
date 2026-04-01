import { useState, useRef, type KeyboardEvent } from 'react';
import type { WikiSyncImportResult } from './types';
import { CURRENT_LEAGUE } from '@/lib/leagueConfig';

interface WikiSyncLookupProps {
  onImport: (completedIds: string[]) => void;
}

export function WikiSyncLookup({ onImport }: WikiSyncLookupProps) {
  const [username, setUsername]  = useState('');
  const [phase, setPhase]        = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult]      = useState<WikiSyncImportResult | null>(null);
  const [errorMessage, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleLookup() {
    const trimmed = username.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }

    setPhase('loading');
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/wikisync/lookup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: trimmed, wikiUrl: CURRENT_LEAGUE.wikiTasksUrl }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${response.status}`);
      }

      const data = await response.json() as WikiSyncImportResult;
      setResult(data);
      setPhase('done');
      if (data.completedTaskIds.length > 0) onImport(data.completedTaskIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && phase !== 'loading') void handleLookup();
  }

  const canSubmit = username.trim().length > 0 && phase !== 'loading';

  return (
    <div className="mt-3 flex flex-col gap-1.5 text-[12px]">
      <span className="text-[11px] font-semibold text-wiki-muted dark:text-wiki-muted-dark uppercase tracking-wide">
        Import task list
      </span>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Player name"
          maxLength={12}
          disabled={phase === 'loading'}
          className="
            w-36 px-2 py-1
            bg-white dark:bg-wiki-bg-dark
            border border-wiki-border dark:border-wiki-border-dark
            text-wiki-text dark:text-wiki-text-dark
            placeholder:text-wiki-muted dark:placeholder:text-wiki-muted-dark
            focus:outline-none focus:ring-1 focus:ring-wiki-border dark:focus:ring-wiki-border-dark
            disabled:opacity-60 disabled:cursor-not-allowed
            rounded-sm text-[12px]
          "
        />
        <button
          onClick={() => void handleLookup()}
          disabled={!canSubmit}
          className="
            px-3 py-1
            bg-wiki-mid dark:bg-wiki-mid-dark
            border border-wiki-border dark:border-wiki-border-dark
            text-wiki-text dark:text-wiki-text-dark
            hover:bg-wiki-border dark:hover:bg-wiki-border-dark
            disabled:opacity-50 disabled:cursor-not-allowed
            rounded-sm text-[12px] font-medium whitespace-nowrap transition-colors
          "
        >
          {phase === 'loading' ? 'Looking up…' : 'Look up'}
        </button>
        {phase === 'loading' && (
          <span className="text-wiki-muted dark:text-wiki-muted-dark italic">
            May take ~30 s…
          </span>
        )}
        {phase === 'done' && result && (
          <ImportStatus result={result} />
        )}
        {phase === 'error' && errorMessage && (
          <span className="text-red-600 dark:text-red-400 truncate max-w-xs" title={errorMessage}>
            Error: {errorMessage}
          </span>
        )}
      </div>
    </div>
  );
}

function ImportStatus({ result }: { result: WikiSyncImportResult }) {
  const { personalisationSucceeded, completedTaskIds, summary } = result;

  if (!personalisationSucceeded) {
    return (
      <span className="text-wiki-muted dark:text-wiki-muted-dark italic">
        No WikiSync data found (league may not be active)
      </span>
    );
  }

  if (completedTaskIds.length === 0) {
    return (
      <span className="text-wiki-muted dark:text-wiki-muted-dark italic">
        No completed tasks found
      </span>
    );
  }

  return (
    <span className="text-green-700 dark:text-green-400">
      Imported {completedTaskIds.length} task{completedTaskIds.length !== 1 ? 's' : ''}
      {result.completionPercent !== null ? ` (${result.completionPercent}%)` : ''}
      {summary.unmatchedNames > 0 ? `, ${summary.unmatchedNames} unmatched` : ''}
    </span>
  );
}
