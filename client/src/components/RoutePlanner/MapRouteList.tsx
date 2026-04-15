/**
 * MapRouteList - compact route list shown to the right of the OSRS map.
 *
 * Interaction model:
 * - Click the pin button (LEFT of each row) to activate placement mode for that item.
 * - Drag the grip handle (RIGHT of each row) within the list to reorder.
 * - Drag the grip handle OUT of the list and release over the map canvas to activate
 *   placement mode (detected via final pointer position vs. map bounding rect).
 * - Click a row body to select/focus the item on the map; the selected row expands inline to show task details.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MarkerViewModel } from './RouteMapPanel';
import type { RouteSection, RouteItem } from '@/types/route';
import type { TaskView } from '@/types/task';
import { isNaReqs } from '@/utils/routePluginFormat';
import { RequirementsCell } from '@/components/TaskRow/RequirementsCell';
import { RichText } from '@/components/RichText/RichText';

// --- Props -------------------------------------------------------------------

export interface MapRouteListProps {
  /** Route sections - used for grouping and item order. */
  sections: RouteSection[];
  /** Task lookup by taskId. */
  taskMap: Map<string, TaskView>;
  /**
   * Mapping from routeItemId to 0-based global display position.
   * Items not present in this map are filtered out and should be skipped.
   */
  itemIndexMap: Map<string, number>;
  /** Marker view-models - used to identify which items have map locations. */
  markers: MarkerViewModel[];
  /** Currently focused/selected item (drives highlight + auto-scroll). */
  focusedItemId: string | null;
  /** Whether the planner is in run mode (disables editing/reorder). */
  isRunMode: boolean;
  /** Flat ordered list of all routeItemIds for sortable context. */
  orderedItemIds: string[];
  /** Called when the user clicks a list row body. */
  onSelectItem: (routeItemId: string) => void;
  /**
   * Called when the user reorders or moves an item from this list.
   * Uses section-aware semantics: only the dragged item changes position;
   * all other items stay in their current sections.
   */
  onMoveItem: (routeItemId: string, destSectionId: string, destIndex: number) => void;
  /**
   * Called when the user activates map placement for an item.
   * Triggered by:
   *  1. Clicking the pin button on the LEFT of a row.
   *  2. Dragging the grip handle (RIGHT) and releasing over the map canvas.
   */
  onStartPlacement: (routeItemId: string) => void;
  /**
   * Returns the current bounding rect of the map canvas container.
   * Used to detect drag-to-map drops. Pass `() => mapRef.current?.getBoundingClientRect() ?? null`.
   */
  getMapRect?: () => DOMRect | null;
  /**
   * Called when the user clicks an item's checkbox in Run Mode.
   * Toggles the run-completion state for that route item.
   */
  onToggleRunComplete?: (routeItemId: string) => void;
}

// --- Small inline SVG pin ----------------------------------------------------

function SmallPin({ active, hasLocation }: { active: boolean; hasLocation: boolean }) {
  const fill = hasLocation
    ? (active ? '#2563eb' : '#e82424')
    : '#aaa';

  const stroke = hasLocation
    ? (active ? '#1e40af' : '#8b1a1a')
    : '#888';

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

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" fill="currentColor" className="w-2 h-3.5" aria-hidden="true">
      <rect x="1" y="2" width="3" height="3" rx="0.75" />
      <rect x="6" y="2" width="3" height="3" rx="0.75" />
      <rect x="1" y="6.5" width="3" height="3" rx="0.75" />
      <rect x="6" y="6.5" width="3" height="3" rx="0.75" />
      <rect x="1" y="11" width="3" height="3" rx="0.75" />
      <rect x="6" y="11" width="3" height="3" rx="0.75" />
    </svg>
  );
}

// --- Sortable row ------------------------------------------------------------

interface SortableMapRowProps {
  item: RouteItem;
  label: string;
  idx: number;
  isPinnable: boolean;
  isFocused: boolean;
  isHovered: boolean;
  isCompleted: boolean;
  isRunMode: boolean;
  isCustom: boolean;
  /** Running cumulative league points up to and including this task. */
  cumulativePts: number;
  onSelect: () => void;
  onHover: (id: string | null) => void;
  /** Click the pin icon on the left to activate placement for this item. */
  onPlaceOnMap: () => void;
  /** In Run Mode: toggles run-completion for this item. */
  onToggleRunComplete?: () => void;
  /** Task detail fields shown inline when this row is focused/selected. */
  detailDesc?: string | null;
  detailDescParts?: TaskView['descriptionParts'];
  detailReqs?: string | null;
  detailReqsParts?: TaskView['requirementsParts'];
  detailNote?: string | null;
}

function SortableMapRow({
  item,
  label,
  idx,
  isPinnable,
  isFocused,
  isHovered,
  isCompleted,
  isRunMode,
  isCustom,
  cumulativePts,
  onSelect,
  onHover,
  onPlaceOnMap,
  onToggleRunComplete,
  detailDesc,
  detailDescParts,
  detailReqs,
  detailReqsParts,
  detailNote,
}: SortableMapRowProps) {
  const {
    attributes,
    listeners: sortListeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.routeItemId, disabled: isRunMode });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-map-list-id={item.routeItemId}
      className={[
        'border-b border-wiki-border/60 dark:border-wiki-border-dark/60 select-none',
        isFocused
          ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-[3px] border-l-[#2563eb] dark:border-l-[#60a5fa]'
          : isHovered
          ? 'bg-wiki-mid dark:bg-wiki-mid-dark'
          : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center">
      {/* Pin placement button - LEFT side.
          Click to activate placement mode. Color indicates whether a pin exists. */}
      {!isRunMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); onPlaceOnMap(); }}
          title={isPinnable ? 'Edit pin location' : 'Place pin on map'}
          aria-label={isPinnable ? `Edit pin for "${label}"` : `Place pin for "${label}"`}
          className={[
            'flex-shrink-0 flex items-center justify-center w-7 h-7 mx-1 my-0.5 rounded transition-colors cursor-pointer',
            isFocused
              ? 'hover:bg-blue-600/10 dark:hover:bg-blue-400/10'
              : isPinnable
              ? 'hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark'
              : 'opacity-50 hover:opacity-100 hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark',
          ].join(' ')}
        >
          <SmallPin active={isFocused} hasLocation={isPinnable} />
        </button>
      ) : (
        /* Run mode: non-interactive pin indicator */
        <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 mx-1 my-0.5">
          <SmallPin active={isFocused} hasLocation={isPinnable} />
        </span>
      )}

      {/* Clickable row body - selects item */}
      <button
        className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left cursor-pointer"
        onClick={onSelect}
        onMouseEnter={() => onHover(item.routeItemId)}
        onMouseLeave={() => onHover(null)}
        title={label}
      >
        {/* Position number */}
        <span
          className={[
            'flex-shrink-0 text-[11px] font-bold tabular-nums w-5 text-right leading-none',
            isFocused
              ? 'text-[#2563eb] dark:text-[#60a5fa]'
              : 'text-wiki-muted dark:text-wiki-muted-dark',
          ].join(' ')}
        >
          {idx + 1}.
        </span>

        {/* Task label */}
        <span
          className={[
            'flex-1 min-w-0 truncate leading-snug text-[13px]',
            isFocused
              ? 'font-semibold text-wiki-text dark:text-wiki-text-dark'
              : 'font-medium text-wiki-text dark:text-wiki-text-dark',
            isCompleted ? 'opacity-60' : '',
          ].join(' ')}
        >
          {label}
        </span>

        {isCompleted && (
          <span className="flex-shrink-0 text-[11px] text-green-600 dark:text-green-400" aria-label="Completed">
            {'\u2713'}
          </span>
        )}
        <span className="flex-shrink-0 text-[11px] tabular-nums text-wiki-muted/60 dark:text-wiki-muted-dark/60">
          {cumulativePts}
        </span>
      </button>

      {/* Reorder grip / Run Mode checkbox - RIGHT side.
          In normal mode: drag within list to reorder, or drag onto map to place pin.
          In Run Mode: checkbox toggles run-completion for this item. */}
      {isRunMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleRunComplete?.(); }}
          title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
          aria-label={isCompleted ? `Mark "${label}" incomplete` : `Mark "${label}" complete`}
          className={[
            'flex-shrink-0 flex items-center justify-center w-8 self-stretch px-2 py-2 transition-colors cursor-pointer',
            isCompleted
              ? 'text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'
              : 'text-wiki-muted/50 dark:text-wiki-muted-dark/50 hover:text-wiki-muted dark:hover:text-wiki-muted-dark',
          ].join(' ')}
        >
          {/* Visual checkbox: filled circle with checkmark when done, empty circle when not */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
            {isCompleted ? (
              <>
                <circle cx="8" cy="8" r="7" />
                <path d="M4.5 8.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </>
            ) : (
              <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
      ) : (
        <span
          {...attributes}
          {...sortListeners}
          title="Drag to reorder. Drag onto map to place pin."
          aria-label="Drag to reorder"
          className="flex-shrink-0 flex items-center self-stretch px-2 py-2 text-wiki-muted/50 dark:text-wiki-muted-dark/50 hover:text-wiki-muted dark:hover:text-wiki-muted-dark cursor-grab active:cursor-grabbing touch-none"
        >
          <GripIcon />
        </span>
      )}
      </div>
      {isFocused && (
        <div className="pl-9 pr-3 pb-2.5 pt-1">
          {!isPinnable && !isRunMode && (
            <p className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark italic mb-1.5">
              No pin yet — click the pin icon to the left to place
            </p>
          )}
          {detailDesc && (
            <div className="text-[12px] text-wiki-text dark:text-wiki-text-dark leading-relaxed mb-1.5 break-words">
              {detailDescParts && detailDescParts.length > 0 ? (
                <RichText parts={detailDescParts} />
              ) : (
                detailDesc
              )}
            </div>
          )}
          {detailReqs && !isCustom && (
            <div className="flex items-start gap-1.5 mb-1.5">
              <span className="flex-shrink-0 text-[11px] font-bold uppercase tracking-wider text-wiki-text/65 dark:text-wiki-text-dark/65 mt-[2px]">
                Reqs:
              </span>
              <div className="text-[12px] text-wiki-text/80 dark:text-wiki-text-dark/75 leading-snug">
                <RequirementsCell
                  requirementsText={detailReqs}
                  requirementsParts={detailReqsParts}
                />
              </div>
            </div>
          )}
          {detailNote && (
            <p className="text-[12px] italic text-wiki-text/70 dark:text-wiki-text-dark/65 leading-snug break-words">
              <span className="font-bold not-italic text-[11px] uppercase tracking-wider mr-1">Note:</span>
              {detailNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Component ---------------------------------------------------------------

export function MapRouteList({
  sections,
  taskMap,
  itemIndexMap,
  markers,
  focusedItemId,
  isRunMode,
  orderedItemIds,
  onSelectItem,
  onMoveItem,
  onStartPlacement,
  getMapRect,
  onToggleRunComplete,
}: MapRouteListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pinnableIds = new Set(markers.map((m) => m.routeItemId));
  const allItems = sections.flatMap((s) => s.items);

  const visibleSections = sections.filter((s) =>
    s.items.some((it) => itemIndexMap.has(it.routeItemId)),
  );

  const visibleCount = visibleSections.reduce(
    (sum, s) => sum + s.items.filter((it) => itemIndexMap.has(it.routeItemId)).length,
    0,
  );

  // Auto-scroll focused item into view
  useEffect(() => {
    if (!focusedItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-map-list-id="${focusedItemId.replace(/"/g, '\\"')}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedItemId]);

  // --- DnD -------------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const { active, over, activatorEvent, delta } = event;

      // Map drop detection: when the grip handle is dragged outside the list
      // and released over the map canvas, `over` will be null (no droppable there).
      // Compare the final pointer position against the map element's bounding rect.
      if (getMapRect && activatorEvent instanceof PointerEvent) {
        const finalX = activatorEvent.clientX + delta.x;
        const finalY = activatorEvent.clientY + delta.y;
        const rect = getMapRect();
        if (
          rect &&
          finalX >= rect.left &&
          finalX <= rect.right &&
          finalY >= rect.top &&
          finalY <= rect.bottom
        ) {
          onStartPlacement(active.id as string);
          return;
        }
      }

      // Section-aware reorder:
      // Locate which section owns the over-item and its index within that section.
      // Only the dragged item changes position — no other item ever crosses a
      // section boundary as a side-effect of the redistribution.
      if (!over || over.id === active.id) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      let destSectionId: string | null = null;
      let destIndex = -1;
      for (const s of sections) {
        const idx = s.items.findIndex((i) => i.routeItemId === overId);
        if (idx !== -1) {
          destSectionId = s.id;
          destIndex = idx;
          break;
        }
      }
      if (!destSectionId || destIndex === -1) return;

      onMoveItem(activeId, destSectionId, destIndex);
    },
    [getMapRect, onStartPlacement, sections, onMoveItem],
  );

  // Build cumulative league points for each visible route item (in section/item display order)
  let _cumPts = 0;
  const cumulativePtsMap = new Map<string, number>();
  for (const section of sections) {
    for (const item of section.items) {
      if (!itemIndexMap.has(item.routeItemId)) continue;
      if (!item.isCustom) {
        _cumPts += taskMap.get(item.taskId)?.points ?? 0;
      }
      cumulativePtsMap.set(item.routeItemId, _cumPts);
    }
  }

  // --- Empty state -----------------------------------------------------------
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

  // --- Render ----------------------------------------------------------------
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Panel header — relative so drag hint can anchor absolutely below it */}
        <div className="px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark flex-shrink-0 flex items-center justify-between gap-1 relative">
          <span className="text-[12px] font-bold uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark">
            Route
          </span>
          <span className="text-[11px] font-medium text-wiki-muted dark:text-wiki-muted-dark tabular-nums">
            {visibleCount} item{visibleCount !== 1 ? 's' : ''}
          </span>
          {/* Drag-to-map hint — out of layout flow, overlays top of list while dragging */}
          <div
            aria-live="polite"
            className={[
              "absolute top-full left-0 right-0 z-10",
              "flex items-center justify-center gap-1.5 px-3 py-1.5",
              "text-[11px] font-medium select-none",
              "border-b border-wiki-border dark:border-wiki-border-dark",
              "bg-wiki-surface/95 dark:bg-wiki-surface-dark/95",
              "text-wiki-muted dark:text-wiki-muted-dark",
              "transition-opacity duration-150",
              draggingId ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(' ')}
          >
            <svg viewBox="0 0 24 30" fill="currentColor" className="w-2.5 h-3 flex-shrink-0 opacity-60" aria-hidden="true">
              <path d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z" />
            </svg>
            <span>Release over the map to place a pin</span>
          </div>
        </div>

        {/* Scrollable item list */}
        <SortableContext items={orderedItemIds} strategy={verticalListSortingStrategy}>
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {sections.map((section) => {
              const visibleSectionItems = section.items.filter((it) =>
                itemIndexMap.has(it.routeItemId),
              );
              if (visibleSectionItems.length === 0) return null;

              const sectionPts = visibleSectionItems.reduce((sum, it) => {
                if (it.isCustom) return sum;
                return sum + (taskMap.get(it.taskId)?.points ?? 0);
              }, 0);

              return (
                <div key={section.id}>
                  {visibleSections.length > 1 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-wiki-mid dark:bg-wiki-mid-dark border-b border-wiki-border dark:border-wiki-border-dark select-none">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-wiki-text/75 dark:text-wiki-text-dark/75 leading-none truncate flex-1">
                        {section.name}
                      </span>
                      <span className="text-[11px] font-medium text-wiki-muted dark:text-wiki-muted-dark flex-shrink-0 tabular-nums">
                        {visibleSectionItems.length} &middot; {sectionPts} pts
                      </span>
                    </div>
                  )}

                  {visibleSectionItems.map((item) => {
                    const idx = itemIndexMap.get(item.routeItemId)!;
                    const isPinnable = pinnableIds.has(item.routeItemId);
                    const isFocused = item.routeItemId === focusedItemId;
                    const isHovered = item.routeItemId === hoveredItemId;
                    const task = !item.isCustom ? taskMap.get(item.taskId) : undefined;
                    const isCompleted = isRunMode
                      ? (item.runCompleted ?? false)
                      : (task?.completed ?? false);
                    const label = item.isCustom
                      ? (item.customName ?? 'Custom task')
                      : task?.name ?? item._snap?.name ?? (() => {
                          const m = item.taskId.match(/^task-\d+-(\d+)$/);
                          return m ? `Task #${m[1]}` : 'Preserved task';
                        })();

                    const detailDesc = item.isCustom
                      ? (item.customDescription ?? null)
                      : task
                      ? (task.description || null)
                      : 'This task could not be found in the current dataset.';
                    const detailDescParts = !item.isCustom && task ? task.descriptionParts : undefined;
                    const detailReqs = !item.isCustom && task && !isNaReqs(task.requirementsText)
                      ? task.requirementsText
                      : null;
                    const detailReqsParts = !item.isCustom && task ? task.requirementsParts : undefined;
                    const detailNote = item.note ?? null;

                    return (
                      <SortableMapRow
                        key={item.routeItemId}
                        item={item}
                        label={label}
                        idx={idx}
                        isPinnable={isPinnable}
                        isFocused={isFocused}
                        isHovered={isHovered}
                        isCompleted={isCompleted}
                        isRunMode={isRunMode}
                        isCustom={!!item.isCustom}
                        cumulativePts={cumulativePtsMap.get(item.routeItemId) ?? 0}
                        onSelect={() => {
                          setHoveredItemId(null);
                          onSelectItem(item.routeItemId);
                        }}
                        onHover={(id) => setHoveredItemId((prev) =>
                          id === null && prev !== item.routeItemId ? prev : id,
                        )}
                        onPlaceOnMap={() => onStartPlacement(item.routeItemId)}
                        onToggleRunComplete={onToggleRunComplete ? () => onToggleRunComplete(item.routeItemId) : undefined}
                        detailDesc={detailDesc}
                        detailDescParts={detailDescParts}
                        detailReqs={detailReqs}
                        detailReqsParts={detailReqsParts}
                        detailNote={detailNote}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </div>

      {/* DragOverlay - ghost that follows the cursor during drag */}
      <DragOverlay>
        {draggingId ? (() => {
          const draggingItem = allItems.find((i) => i.routeItemId === draggingId);
          if (!draggingItem) return null;
          const dragLabel = draggingItem.isCustom
            ? (draggingItem.customName ?? 'Custom task')
            : taskMap.get(draggingItem.taskId)?.name
              ?? draggingItem._snap?.name
              ?? (() => { const m = draggingItem.taskId.match(/^task-\d+-(\d+)$/); return m ? `Task #${m[1]}` : 'Task'; })();
          const isPinnable = pinnableIds.has(draggingId);
          return (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-lg text-[13px] text-wiki-text dark:text-wiki-text-dark max-w-[220px] pointer-events-none">
              <SmallPin active hasLocation={isPinnable} />
              <span className="truncate font-medium">{dragLabel}</span>
            </div>
          );
        })() : null}
      </DragOverlay>
    </DndContext>
  );
}
