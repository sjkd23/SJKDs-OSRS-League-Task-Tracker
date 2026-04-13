/**
 * MapRouteList - compact route list shown to the right of the OSRS map.
 *
 * Interaction model:
 * - Click the pin button (LEFT of each row) to activate placement mode for that item.
 * - Drag the grip handle (RIGHT of each row) within the list to reorder.
 * - Drag the grip handle OUT of the list and release over the map canvas to activate
 *   placement mode (detected via final pointer position vs. map bounding rect).
 * - Click a row body to select/focus the item on the map.
 * - Detail pane at the bottom shows focused/hovered item info.
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
  /** Called when the user reorders items from this list. */
  onReorderItems: (fromIndex: number, toIndex: number) => void;
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
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="8" r="1.2" />
      <circle cx="7" cy="8" r="1.2" />
      <circle cx="3" cy="13" r="1.2" />
      <circle cx="7" cy="13" r="1.2" />
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
  onSelect: () => void;
  onHover: (id: string | null) => void;
  /** Click the pin icon on the left to activate placement for this item. */
  onPlaceOnMap: () => void;
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
  onSelect,
  onHover,
  onPlaceOnMap,
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
        'flex items-center border-b border-wiki-border/40 dark:border-wiki-border-dark/40 select-none',
        isFocused
          ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-[3px] border-l-[#2563eb] dark:border-l-[#60a5fa]'
          : isHovered
          ? 'bg-wiki-mid dark:bg-wiki-mid-dark'
          : '',
      ].filter(Boolean).join(' ')}
    >
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

      {/* Clickable row body - selects item, shows detail in pane */}
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
              : 'text-wiki-text dark:text-wiki-text-dark',
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
      </button>

      {/* Reorder grip - RIGHT side.
          Drag within list to reorder.
          Drag outside list and release over the map canvas to activate placement. */}
      {!isRunMode && (
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
  onReorderItems,
  onStartPlacement,
  getMapRect,
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

      // Normal reorder
      if (!over || over.id === active.id) return;
      const oldIndex = allItems.findIndex((i) => i.routeItemId === active.id);
      const newIndex = allItems.findIndex((i) => i.routeItemId === over.id);
      if (oldIndex !== -1 && newIndex !== -1) onReorderItems(oldIndex, newIndex);
    },
    [getMapRect, onStartPlacement, allItems, onReorderItems],
  );

  // --- Detail pane data ------------------------------------------------------
  const detailId = focusedItemId ?? hoveredItemId;

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
        {/* Panel header */}
        <div className="px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-mid dark:bg-wiki-mid-dark flex-shrink-0 flex items-center justify-between gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-wiki-text dark:text-wiki-text-dark">
            Route
          </span>
          <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark tabular-nums">
            {visibleCount} item{visibleCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Drag-to-map hint - shown only while a row is being dragged */}
        {draggingId && (
          <div className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark text-wiki-muted dark:text-wiki-muted-dark select-none">
            <svg viewBox="0 0 24 30" fill="currentColor" className="w-2.5 h-3 flex-shrink-0 opacity-60" aria-hidden="true">
              <path d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z" />
            </svg>
            <span>Release over the map to place a pin</span>
          </div>
        )}

        {/* Scrollable item list */}
        <SortableContext items={orderedItemIds} strategy={verticalListSortingStrategy}>
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {sections.map((section) => {
              const visibleSectionItems = section.items.filter((it) =>
                itemIndexMap.has(it.routeItemId),
              );
              if (visibleSectionItems.length === 0) return null;

              return (
                <div key={section.id}>
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

                  {visibleSectionItems.map((item) => {
                    const idx = itemIndexMap.get(item.routeItemId)!;
                    const isPinnable = pinnableIds.has(item.routeItemId);
                    const isFocused = item.routeItemId === focusedItemId;
                    const isHovered = item.routeItemId === hoveredItemId;
                    const task = !item.isCustom ? taskMap.get(item.taskId) : undefined;
                    const isCompleted = task?.completed ?? false;
                    const label = item.isCustom
                      ? (item.customName ?? 'Custom task')
                      : (task?.name ?? 'Task');

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
                        onSelect={() => {
                          setHoveredItemId(null);
                          onSelectItem(item.routeItemId);
                        }}
                        onHover={(id) => setHoveredItemId((prev) =>
                          id === null && prev !== item.routeItemId ? prev : id,
                        )}
                        onPlaceOnMap={() => onStartPlacement(item.routeItemId)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </SortableContext>

        {/* Detail pane */}
        <div
          className={[
            'flex-shrink-0 border-t border-wiki-border dark:border-wiki-border-dark overflow-hidden',
            detail?.isFocused
              ? 'bg-blue-50 dark:bg-blue-900/10'
              : 'bg-wiki-article dark:bg-wiki-article-dark',
          ].join(' ')}
          style={{ minHeight: '96px', maxHeight: '180px' }}
        >
          {detail ? (
            <div className="px-3 py-2.5 h-full overflow-y-auto">
              <div className="flex items-start gap-2 mb-1">
                {detail.isPinnable && (
                  <svg width="9" height="12" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="flex-shrink-0 mt-[3px]">
                    <path
                      d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z"
                      fill={detail.isFocused ? '#2563eb' : '#e82424'}
                      stroke={detail.isFocused ? '#1e40af' : '#8b1a1a'}
                      strokeWidth="1.5"
                    />
                  </svg>
                )}
                <div className="flex-1 min-w-0">
                  <p className={[
                    'font-semibold text-[13px] leading-snug break-words',
                    detail.isFocused
                      ? 'text-[#1e3a8a] dark:text-[#93c5fd]'
                      : 'text-wiki-text dark:text-wiki-text-dark',
                  ].join(' ')}>
                    <span className={[
                      'text-[11px] tabular-nums mr-1.5 font-bold',
                      detail.isFocused
                        ? 'text-[#2563eb] dark:text-[#60a5fa]'
                        : 'text-wiki-muted dark:text-wiki-muted-dark',
                    ].join(' ')}>
                      #{detail.globalPos}
                    </span>
                    {detail.name}
                    {detail.isCompleted && (
                      <span className="ml-1.5 text-[11px] text-green-700 dark:text-green-400 font-semibold not-italic">
                        {'\u2713'}
                      </span>
                    )}
                  </p>
                  {!detail.isPinnable && !isRunMode && (
                    <p className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark mt-0.5 italic">
                      No pin yet - click the pin on the left to place
                    </p>
                  )}
                </div>
              </div>

              {detail.desc && (
                <div className="text-[12px] text-wiki-text/85 dark:text-wiki-text-dark/80 leading-snug mb-1.5 break-words">
                  {detail.descParts && detail.descParts.length > 0 ? (
                    <RichText parts={detail.descParts} />
                  ) : (
                    detail.desc
                  )}
                </div>
              )}

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
                {isRunMode
                  ? 'Click a task to select it'
                  : 'Click pin to place on map. Click row to select. Drag grip to reorder or drop on map.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* DragOverlay - ghost that follows the cursor during drag */}
      <DragOverlay>
        {draggingId ? (() => {
          const draggingItem = allItems.find((i) => i.routeItemId === draggingId);
          if (!draggingItem) return null;
          const dragLabel = draggingItem.isCustom
            ? (draggingItem.customName ?? 'Custom task')
            : (taskMap.get(draggingItem.taskId)?.name ?? 'Task');
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
