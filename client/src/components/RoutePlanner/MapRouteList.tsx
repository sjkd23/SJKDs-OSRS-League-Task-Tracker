/**
 * MapRouteList — "run view" route list shown to the right of the OSRS map.
 *
 * Displays route items grouped by section. Items with a map location get a
 * pin indicator; others get a ghost dot. Clicking a row focuses the marker.
 * The focused item auto-scrolls into view within this panel.
 *
 * A detail pane at the bottom shows name/description/requirements/note for
 * the focused item (or the hovered item when nothing is focused but something
 * is hovered). The selected item uses RequirementsCell + RichText to match
 * normal task-list presentation.
 */
import { useEffect, useRef, useState } from 'react';
import type { MarkerViewModel } from './RouteMapPanel';
import type { RouteSection } from '@/types/route';
import type { TaskView } from '@/types/task';
import { isNaReqs } from '@/utils/routePluginFormat';
import { RequirementsCell } from '@/components/TaskRow/RequirementsCell';
import { RichText } from '@/components/RichText/RichText';

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface MapRouteListProps {
  /** Route sections — used for grouping and item order. */
  sections: RouteSection[];
  /** Task lookup by taskId. */
  taskMap: Map<string, TaskView>;
  /**
   * Mapping from routeItemId → 0-based global display position.
   * Items not present in this map are filtered out and should be skipped.
   */
  itemIndexMap: Map<string, number>;
  /** Marker view-models — used to identify which items have map locations. */
  markers: MarkerViewModel[];
  /** Currently focused/selected item (drives highlight + auto-scroll). */
  focusedItemId: string | null;
  /** Called when the user clicks a list row. */
  onSelectItem: (routeItemId: string) => void;
}

// ─── Small inline SVG pin ──────────────────────────────────────────────────────

function SmallPin({ active, hasLocation }: { active: boolean; hasLocation: boolean }) {
  // If it has a location (pinnable), show blue pin when active, red when inactive (to match map)
  // If it does not have a location, show brown pin
  const fill = hasLocation
    ? (active ? '#0052cc' : '#e82424') // blue for map location selection, red for default
    : (active ? '#c8940c' : '#bb8317'); // brown/gold for NO map location       

  const stroke = hasLocation
    ? (active ? '#003a99' : '#8b1a1a')
    : (active ? '#7a4f00' : '#734e06');

  return (
    <svg
      width="9"
      height="12"
      viewBox="0 0 24 30"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function NoDotIcon() {
  return (
    <svg
      width="9"
      height="12"
      viewBox="0 0 24 30"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0 opacity-20"
    >
      <path
        d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z"
        fill="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function MapRouteList({
  sections,
  taskMap,
  itemIndexMap,
  markers,
  focusedItemId,
  onSelectItem,
}: MapRouteListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Track which row is being hovered for the detail pane.
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Set of routeItemIds that have a map location (and are therefore pinnable).
  const pinnableIds = new Set(markers.map((m) => m.routeItemId));

  // Number of sections that actually have visible items (used for section header logic).
  const visibleSections = sections.filter((s) =>
    s.items.some((it) => itemIndexMap.has(it.routeItemId)),
  );

  // Total visible item count across all sections.
  const visibleCount = visibleSections.reduce(
    (sum, s) => sum + s.items.filter((it) => itemIndexMap.has(it.routeItemId)).length,
    0,
  );

  // Auto-scroll the focused item into view within this panel.
  useEffect(() => {
    if (!focusedItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-map-list-id="${CSS.escape(focusedItemId)}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedItemId]);

  // ── Resolve the item to show in the detail pane ─────────────────────────────
  //    Priority: focused (primary) > hovered (secondary) > null
  //    The focused task always wins — it's the "active" task the user is running.
  //    While nothing is focused, hovering a row previews it.
  const detailId = focusedItemId ?? hoveredItemId;

  // Find the route item and task for the detail pane.
  type DetailData = {
    name: string;
    desc: string | null;
    descParts?: TaskView['descriptionParts'];
    reqs: string | null;
    reqsParts?: TaskView['requirementsParts'];
    note: string | null;
    globalPos: number;
    isPinnable: boolean;
    isCompleted: boolean;
    isFocused: boolean;
    isCustom: boolean;
  };

  let detail: DetailData | null = null;

  if (detailId) {
    outer: for (const section of sections) {
      for (const item of section.items) {
        if (item.routeItemId !== detailId) continue;
        const globalPos = (itemIndexMap.get(item.routeItemId) ?? 0) + 1;
        const isPinnable = pinnableIds.has(item.routeItemId);
        const isFocused = item.routeItemId === focusedItemId;

        if (item.isCustom) {
          detail = {
            name: item.customName ?? '(custom task)',
            desc: item.customDescription ?? null,
            reqs: null,
            note: item.note ?? null,
            globalPos,
            isPinnable,
            isCompleted: false,
            isFocused,
            isCustom: true,
          };
        } else {
          const task = taskMap.get(item.taskId);
          if (task) {
            detail = {
              name: task.name,
              desc: task.description || null,
              descParts: task.descriptionParts,
              reqs: isNaReqs(task.requirementsText) ? null : task.requirementsText,
              reqsParts: task.requirementsParts,
              note: item.note ?? null,
              globalPos,
              isPinnable,
              isCompleted: task.completed ?? false,
              isFocused,
              isCustom: false,
            };
          }
        }
        break outer;
      }
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (visibleCount === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark flex-shrink-0">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-wiki-text dark:text-wiki-text-dark">
            Route
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-3 py-4 text-[12px] text-wiki-muted dark:text-wiki-muted-dark italic text-center leading-snug">
          No tasks in route
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Panel header ────────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark flex-shrink-0 flex items-center justify-between gap-1">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-wiki-text dark:text-wiki-text-dark">
          Route
        </span>
        <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark tabular-nums">
          {visibleCount} item{visibleCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Scrollable item list, grouped by section ─────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {sections.map((section) => {
          const visibleSectionItems = section.items.filter((it) =>
            itemIndexMap.has(it.routeItemId),
          );
          if (visibleSectionItems.length === 0) return null;

          return (
            <div key={section.id}>
              {/* Section group header — only shown when multiple sections have items */}
              {visibleSections.length > 1 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-wiki-mid dark:bg-wiki-mid-dark border-b border-wiki-border dark:border-wiki-border-dark select-none">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-wiki-muted dark:text-wiki-muted-dark leading-none truncate flex-1">
                    {section.name}
                  </span>
                  <span className="text-[10px] text-wiki-muted/70 dark:text-wiki-muted-dark/70 flex-shrink-0 tabular-nums">
                    {visibleSectionItems.length}
                  </span>
                </div>
              )}

              {/* Items in this section */}
              {visibleSectionItems.map((item) => {
                const idx = itemIndexMap.get(item.routeItemId)!;
                const isPinnable = pinnableIds.has(item.routeItemId);
                const isFocused  = item.routeItemId === focusedItemId;
                const isHovered  = item.routeItemId === hoveredItemId;

                const label = item.isCustom
                  ? (item.customName ?? 'Custom task')
                  : (taskMap.get(item.taskId)?.name ?? 'Task');

                const task        = !item.isCustom ? taskMap.get(item.taskId) : undefined;
                const isCompleted = task?.completed ?? false;

                return (
                  <button
                    key={item.routeItemId}
                    data-map-list-id={item.routeItemId}
                    onClick={() => onSelectItem(item.routeItemId)}
                    onMouseEnter={() => setHoveredItemId(item.routeItemId)}
                    onMouseLeave={() => setHoveredItemId((prev) => prev === item.routeItemId ? null : prev)}
                    title={label}
                    className={[
                      'w-full text-left px-3 py-2 flex items-center gap-2',
                      'border-b border-wiki-border/40 dark:border-wiki-border-dark/40',
                      'transition-colors cursor-pointer',
                      isFocused
                        ? 'bg-[#f0e6c0] dark:bg-[#241c08] border-l-[3px] border-l-[#8b6914] dark:border-l-[#c8a030]'
                        : isHovered
                        ? 'bg-wiki-mid dark:bg-wiki-mid-dark'
                        : 'hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark',
                      isCompleted ? 'opacity-60' : '',
                    ].filter(Boolean).join(' ')}
                    aria-current={isFocused ? 'true' : undefined}
                  >
                    {/* Position number */}
                    <span
                      className={[
                        'flex-shrink-0 text-[11px] font-bold tabular-nums w-6 text-right leading-none',
                        isFocused
                          ? 'text-[#8b6914] dark:text-[#c8a030]'
                          : 'text-wiki-muted dark:text-wiki-muted-dark',
                      ].join(' ')}
                    >
                      {idx + 1}.
                    </span>

                    {/* Pin indicator */}
                    <SmallPin active={isFocused} hasLocation={isPinnable} />

                    {/* Task label */}
                    <span
                      className={[
                        'flex-1 min-w-0 truncate leading-snug text-[13px]',
                        isFocused
                          ? 'font-semibold text-wiki-text dark:text-wiki-text-dark'
                          : 'text-wiki-text dark:text-wiki-text-dark',
                      ].join(' ')}
                    >
                      {label}
                    </span>

                    {/* Completed checkmark */}
                    {isCompleted && (
                      <span
                        className="flex-shrink-0 text-[11px] text-green-600 dark:text-green-400"
                        aria-label="Completed"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Detail pane — active/focused task shown with full wiki-style detail */}
      <div
        className={[
          'flex-shrink-0 border-t border-wiki-border dark:border-wiki-border-dark overflow-hidden',
          detail?.isFocused
            ? 'bg-[#faf4e2] dark:bg-[#1e1606]'
            : 'bg-wiki-article dark:bg-wiki-article-dark',
        ].join(' ')}
        style={{ minHeight: '96px', maxHeight: '180px' }}
      >
        {detail ? (
          <div className="px-3 py-2.5 h-full overflow-y-auto">
            {/* Name row */}
            <div className="flex items-start gap-2 mb-1">
              {detail.isPinnable && (
                <svg width="9" height="12" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="flex-shrink-0 mt-[3px]">
                  <path
                    d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z"
                    fill={detail.isFocused ? '#c8940c' : '#e82424'}
                    stroke={detail.isFocused ? '#7a4f00' : '#8b1a1a'}
                    strokeWidth="1.5"
                  />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <p className={[
                  'font-semibold text-[13px] leading-snug break-words',
                  detail.isFocused
                    ? 'text-[#5a3e00] dark:text-[#e8c060]'
                    : 'text-wiki-text dark:text-wiki-text-dark',
                ].join(' ')}>
                  <span className={[
                    'text-[11px] tabular-nums mr-1.5 font-bold',
                    detail.isFocused
                      ? 'text-[#8b6914] dark:text-[#c8a030]'
                      : 'text-wiki-muted dark:text-wiki-muted-dark',
                  ].join(' ')}>
                    #{detail.globalPos}
                  </span>
                  {detail.name}
                  {detail.isCompleted && (
                    <span className="ml-1.5 text-[11px] text-green-700 dark:text-green-400 font-semibold not-italic">✓</span>
                  )}
                </p>
              </div>
            </div>

            {/* Description */}
            {detail.desc && (
              <div className="text-[12px] text-wiki-text/85 dark:text-wiki-text-dark/80 leading-snug mb-1.5 break-words ml-0">
                {detail.descParts && detail.descParts.length > 0 ? (
                  <RichText parts={detail.descParts} />
                ) : (
                  detail.desc
                )}
              </div>
            )}

            {/* Requirements — use RequirementsCell for icon-based presentation */}
            {detail.reqs && !detail.isCustom && (
              <div className="flex items-start gap-1.5 mb-1">
                <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-wiki-muted dark:text-wiki-muted-dark mt-[2px]">
                  Reqs:
                </span>
                <div className="text-[12px] text-wiki-muted dark:text-wiki-muted-dark leading-snug">
                  <RequirementsCell
                    requirementsText={detail.reqs}
                    requirementsParts={detail.reqsParts}
                  />
                </div>
              </div>
            )}

            {/* Note */}
            {detail.note && (
              <p className="text-[11px] italic text-wiki-muted dark:text-wiki-muted-dark leading-snug break-words">
                <span className="font-bold not-italic text-[10px] uppercase tracking-wider mr-1">Note:</span>
                {detail.note}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full px-3 py-3">
            <p className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark italic text-center leading-snug">
              Click a task to select it · hover to preview
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
