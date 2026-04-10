import { memo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskSummaryProps {
    visibleCount: number;
    totalCount: number;
    visiblePoints: number;
    visiblePointsExcludingCompleted: number;
    totalAcquiredPoints: number;
    completedCount: number;
    loading?: boolean;
    /**
     * `full`    – three labelled items that can wrap; used in the heading row
     *             and at the top of the mobile filter sheet.
     * `compact` – condensed single-line version; used in sticky/toolbar areas.
     */
    variant?: 'full' | 'compact';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toLocaleString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TaskSummary = memo(function TaskSummary({
    visibleCount,
    totalCount,
    visiblePoints,
    visiblePointsExcludingCompleted,
    totalAcquiredPoints,
    completedCount,
    loading = false,
    variant = 'full',
}: TaskSummaryProps) {
    if (loading) {
        return (
            <span className="text-[12px] text-wiki-muted dark:text-wiki-muted-dark italic">
                Loading tasks…
            </span>
        );
    }

    if (variant === 'compact') {
        return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] sm:text-[13px] tabular-nums leading-none">
                {/* Current view: task count + points */}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-wiki-muted dark:text-wiki-muted-dark">
                    <span>
                        <strong className="font-bold text-wiki-text dark:text-wiki-text-dark">{fmt(visibleCount)}</strong>
                        <span> / {fmt(totalCount)} tasks</span>
                    </span>

                    <span className="text-[16px] leading-none text-wiki-text dark:text-wiki-text-dark opacity-40 select-none" aria-hidden>&bull;</span>

                    <span>
                        <strong className="font-bold text-wiki-text dark:text-wiki-text-dark">{fmt(visiblePoints)} pts</strong>
                        <span className="ml-1">({fmt(visiblePointsExcludingCompleted)} left)</span>
                    </span>
                </span>

                {/* Visible divider between groups */}
                <span className="hidden sm:block self-stretch w-0.5 rounded-full bg-wiki-border dark:bg-wiki-border-dark opacity-80" aria-hidden />

                {/* Completed total — intentionally visually distinct */}
                <span className="flex items-center gap-1.5 text-wiki-muted dark:text-wiki-muted-dark">
                    <span className="font-medium">Completed:</span>
                    <strong className="font-bold text-wiki-text dark:text-wiki-text-dark">{fmt(completedCount)} tasks / {fmt(totalAcquiredPoints)} pts</strong>
                </span>
            </div>
        );
    }

    // ── Full variant ─────────────────────────────────────────────────────────

    const sharedClass = "mt-2 text-[13px] text-wiki-muted dark:text-wiki-muted-dark leading-snug tabular-nums";

    return (
        <>
            {/* Mobile: single flowing sentence, no bullets */}
            <div className={`${sharedClass} sm:hidden`}>
                Showing{' '}
                <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(visibleCount)}</strong>
                {' '}of{' '}
                <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(totalCount)}</strong>
                {' '}task{totalCount !== 1 ? 's' : ''},{' '}
                <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(visiblePoints)}</strong>
                {' '}pts visible ({fmt(visiblePointsExcludingCompleted)} excl. completed), completed{' '}
                <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(completedCount)} tasks / {fmt(totalAcquiredPoints)} pts</strong>
            </div>

            {/* Desktop: flex layout with bullet separators */}
            <div className={`${sharedClass} hidden sm:flex flex-wrap gap-x-4 gap-y-1`}>
                <span>
                    Showing{' '}
                    <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(visibleCount)}</strong>
                    {' '}of{' '}
                    <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(totalCount)}</strong>
                    {' '}task{totalCount !== 1 ? 's' : ''}
                </span>
                <span className="text-[16px] leading-none text-wiki-text dark:text-wiki-text-dark opacity-40 select-none">•</span>
                <span>
                    Points shown:{' '}
                    <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(visiblePoints)}</strong>
                    {' '}({fmt(visiblePointsExcludingCompleted)} excl. completed)
                </span>
                <span className="text-[16px] leading-none text-wiki-text dark:text-wiki-text-dark opacity-40 select-none">•</span>
                <span>
                    Completed:{' '}
                    <strong className="text-wiki-text dark:text-wiki-text-dark">{fmt(completedCount)} tasks / {fmt(totalAcquiredPoints)} pts</strong>
                </span>
            </div>
        </>
    );
});
