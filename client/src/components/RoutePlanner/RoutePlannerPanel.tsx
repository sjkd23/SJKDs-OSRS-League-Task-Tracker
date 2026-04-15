import { Fragment, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useLayoutMode } from '@/hooks/useLayoutMode';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskView, TaskFilters } from '@/types/task';
import type { Route, RouteItem, RouteLocation, RouteSection } from '@/types/route';
import { WikiIcon } from '@/components/WikiIcon/WikiIcon';
import { RichText } from '@/components/RichText/RichText';
import { RequirementsCell } from '@/components/TaskRow/RequirementsCell';
import { filterTasks } from '@/utils/taskFilters';
import {
  regionIconUrl,
  regionIconClass,
  difficultyIconUrl,
  regionWikiUrl,
  REGION_COLOUR
} from '@/lib/wikiIcons';
import { TIER_COLOURS } from '@/components/TaskRow/TaskRow';
import { createShareLink } from '@/utils/routeShare';
import { buildPluginExportPayload, parsePluginRoute, isNaReqs } from '@/utils/routePluginFormat';
import { RouteMapPanel, type MarkerViewModel } from './RouteMapPanel';
import { MapRouteList } from './MapRouteList';
import { SpreadsheetImportModal } from './SpreadsheetImportModal';
import { downloadRouteCsv } from '@/utils/spreadsheetExport';
import { backupStorageKeyOnce } from '@/utils/storage';
import { isMeaningfulRoute, normalizeRoute } from '@/state/useRouteStore';

// ─── Drag modifier ─────────────────────────────────────────────────────────────

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

// ─── Scroll offset helper ─────────────────────────────────────────────────────

/**
 * Returns the current bottom edge of the app's main fixed sticky header, in px
 * from the top of the viewport. Measured live via getBoundingClientRect so it is
 * accurate during filter-panel animations and regardless of CSS-variable state.
 * Falls back to --sticky-offset if the element isn't found.
 */
function getAppStickyBottom(): number {
  const bar = document.querySelector('[data-app-sticky-header]') as HTMLElement | null;
  if (bar) {
    const rect = bar.getBoundingClientRect();
    // Return the FULL height, not the current visible bottom (rect.bottom).
    // When the user starts a jump from the top of the page, the bar is hidden
    // (-translate-y-full) so rect.bottom is <= 0. If we return 0, the target
    // scrolls to the very top. Then, as it scrolls past 300px, the header
    // magically slides down and covers the target. rect.height tells us exactly
    // how much space the bar WILL occupy once scrolled.
    return rect.height;
  }
  
  // Mobile fallback (mobile handles stickiness intrinsically or via .sticky)
  const mobileBar = document.querySelector('.sticky.z-40.shadow-sm') as HTMLElement | null;
  if (mobileBar) {
    return mobileBar.getBoundingClientRect().height;
  }
  
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--sticky-offset').trim(),
    ) || 0
  );
}

// ─── Local save/load helpers ──────────────────────────────────────────────────

const SAVED_ROUTES_KEY_LEGACY = 'osrs-lt:saved-routes';
const SAVED_ROUTES_KEY = 'osrs-lt:saved-routes:v2';
const SAVED_ROUTES_LEGACY_SNAPSHOT_KEY = 'osrs-lt:saved-routes:pre-v2-backup';

type SavedRouteEntry = { name: string; savedAt: string; route: Route };

/**
 * Validate and normalize a single saved-route entry loaded from localStorage.
 * Returns null if the value is structurally invalid so callers can filter it out
 * rather than crashing at runtime on corrupt / migrated data.
 */
function normalizeSavedRouteEntry(entry: unknown): SavedRouteEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  if (typeof e['name'] !== 'string' || typeof e['savedAt'] !== 'string') return null;
  const r = e['route'];
  if (!r || typeof r !== 'object') return null;
  const route = r as Record<string, unknown>;
  if (typeof route['id'] !== 'string' || !Array.isArray(route['sections'])) return null;
  return {
    name: e['name'] as string,
    savedAt: e['savedAt'] as string,
    route: normalizeRoute(r as Route),
  };
}

function parseSavedRoutesRaw(raw: string | null): { entries: SavedRouteEntry[]; valid: boolean } {
  if (!raw) return { entries: [], valid: false };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { entries: [], valid: false };

    const entries = parsed
      .map(normalizeSavedRouteEntry)
      .filter((e): e is SavedRouteEntry => e !== null);

    // Empty arrays are valid data. Non-empty arrays must contain at least
    // one structurally valid entry to be considered migration-safe.
    const valid = parsed.length === 0 || entries.length > 0;
    return { entries, valid };
  } catch {
    return { entries: [], valid: false };
  }
}

function loadSavedRoutes(): SavedRouteEntry[] {
  const versioned = parseSavedRoutesRaw(localStorage.getItem(SAVED_ROUTES_KEY));
  if (versioned.valid) {
    return versioned.entries;
  }

  const legacyRaw = localStorage.getItem(SAVED_ROUTES_KEY_LEGACY);
  const legacy = parseSavedRoutesRaw(legacyRaw);
  if (legacy.valid) {
    // Keep a one-time raw snapshot of legacy data for emergency recovery.
    backupStorageKeyOnce(SAVED_ROUTES_KEY_LEGACY, SAVED_ROUTES_LEGACY_SNAPSHOT_KEY);
    // Copy-forward only; never mutate or delete the legacy key.
    persistSavedRoutes(legacy.entries);
    return legacy.entries;
  }

  return [];
}

function persistSavedRoutes(entries: SavedRouteEntry[]): void {
  try {
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage unavailable — the storageErrorEvent in the route
    // store will surface a banner for the user if needed.
  }
}

// ─── Small icon helpers ────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3" aria-hidden="true">
      <path d="M9.5.5a1.7 1.7 0 0 1 2 2L4 10l-3 .5L1.5 7.5 9.5.5z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M10.5 1.5 6 6l4.5 4.5-1 1L6 7 1.5 11.5l-1-1L5 6 1.5 1.5l1-1L6 5l4.5-4.5z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 12 16" fill="currentColor" className="w-3 h-4" aria-hidden="true">
      <path d="M6 0C3.239 0 1 2.239 1 5c0 3.75 5 11 5 11S11 8.75 11 5c0-2.761-2.239-5-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M0 1.75v10.5l4.5-1.5 4.5 1.5 4.5-1.5V.25L9 1.75 4.5.25 0 1.75zm4 7.5V2.1l5 1.667v7.133L4 9.25z" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" fill="currentColor" className="w-2.5 h-4" aria-hidden="true">
      <rect x="1" y="2" width="3" height="3" rx="0.75" />
      <rect x="6" y="2" width="3" height="3" rx="0.75" />
      <rect x="1" y="6.5" width="3" height="3" rx="0.75" />
      <rect x="6" y="6.5" width="3" height="3" rx="0.75" />
      <rect x="1" y="11" width="3" height="3" rx="0.75" />
      <rect x="6" y="11" width="3" height="3" rx="0.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 12 14" fill="currentColor" className="w-3 h-3.5" aria-hidden="true">
      <path d="M1 3h10v1H1zM4 1h4v1H4zM2 4h8l-1 9H3L2 4zm2 2v5h1V6H4zm3 0v5h1V6H7z" />
    </svg>
  );
}

// ─── Component types ───────────────────────────────────────────────────────────

interface RoutePlannerPanelProps {
  route: Route;
  filters: TaskFilters;
  isRunMode: boolean;
  setIsRunMode: (mode: boolean) => void;
  allTasks: TaskView[];
  onUpdateRouteName: (name: string) => void;
  onRemoveTask: (taskId: string) => void;
  onReorderSections: (fromIndex: number, toIndex: number) => void;
  onResetRoute: () => void;
  onReplaceRoute: (newRoute: Route) => void;
  onAddCustomTask: (sectionId: string, name: string) => void;
  onEditCustomTask: (taskId: string, field: 'label' | 'description' | 'note', value: string) => void;
  onAddSection: (name: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onSetRouteItemLocation: (routeItemId: string, location: RouteLocation | null) => void;
  onMoveItem: (routeItemId: string, destSectionId: string, destIndex: number) => void;
}

interface CrossSectionPreview {
  activeRouteItemId: string;
  sourceSectionId: string;
  destSectionId: string;
  destIndex: number;
}

function sectionEndDropId(sectionId: string): string {
  return `${sectionId}::end`;
}

function parseSectionEndDropId(dropId: string): string | null {
  if (!dropId.endsWith('::end')) return null;
  return dropId.slice(0, -'::end'.length) || null;
}

// ─── Sortable row (real task) ─────────────────────────────────────────────────

interface SortableRowProps {
  item: RouteItem;
  task: TaskView;
  listPos: number;
  isRunMode: boolean;
  mapVisible?: boolean;
  onFocusOnMap?: (routeItemId: string) => void;
  onStartPlaceLocation?: (routeItemId: string) => void;
  onClearLocation?: (routeItemId: string) => void;
  onRemove: (taskId: string) => void;
  isMapFocused?: boolean;
  isPlacingLocation?: boolean;
  suppressCrossSectionShift?: boolean;
}

function SortableRow({
  item,
  task,
  listPos,
  isRunMode,
  onRemove,
  onFocusOnMap,
  onStartPlaceLocation,
  onClearLocation,
  isMapFocused,
  isPlacingLocation,
  suppressCrossSectionShift,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.routeItemId });

  const style: React.CSSProperties = {
    transform: suppressCrossSectionShift && !isDragging ? undefined : CSS.Transform.toString(transform),
    transition: suppressCrossSectionShift && !isDragging ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 2 : undefined,
  };

  const stripeClass = listPos % 2 === 0 ? 'row-alt' : '';
  const completionClass = task.completed ? 'task-completed' : '';
  const reqIsNa = isNaReqs(task.requirementsText);
  const regionIcon = regionIconUrl(task.area);
  const regionColor = REGION_COLOUR[task.area];

  return (
    <tr
      ref={setNodeRef}
      data-route-item-id={item.routeItemId}
      style={{
        ...style,
        boxShadow: isPlacingLocation
          ? 'inset 3px 0 0 #0052cc'
          : isMapFocused
          ? 'inset 3px 0 0 #8b6914'
          : undefined,
      }}
      className={[
        completionClass, 
        stripeClass, 
        isRunMode ? '' : 'cursor-grab active:cursor-grabbing'
      ].filter(Boolean).join(' ')}
      {...attributes}
      {...(isRunMode ? {} : listeners)}
    >
      <td className="px-1 py-1.5 align-middle w-12">
        <div className="flex items-center justify-center">
          <span className="text-[12px] font-semibold tabular-nums leading-none text-wiki-text dark:text-wiki-text-dark">
            {listPos + 1}
          </span>
        </div>
      </td>

      <td className="px-2 py-1.5 text-center align-middle">
        <span className="flex items-center justify-center">
          {(() => {
            const areaUrl = regionWikiUrl(task.area);
            const icon = (
              <WikiIcon
                src={regionIcon ?? ''}
                alt={task.area}
                className={regionIconClass(task.area, 'table')}
                fallbackColor={regionColor}
              />
            );
            if (areaUrl) {
              return (
                <a
                  href={areaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(e) => e.stopPropagation()}
                  title={task.area}
                  className="inline-flex items-center no-underline hover:opacity-80"
                >
                  {icon}
                </a>
              );
            }
            return icon;
          })()}
        </span>
      </td>

      <td className="px-2 py-1.5 align-middle">
        {task.nameParts && task.nameParts.length > 0 ? (
          <div onPointerDown={(e) => { if (e.target instanceof HTMLAnchorElement) e.stopPropagation(); }}>
            <RichText parts={task.nameParts} />
          </div>
        ) : task.wikiUrl ? (
          <a
            href={task.wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="text-wiki-link dark:text-wiki-link-dark hover:text-wiki-link-hover dark:hover:text-wiki-link-hover-dark"
          >
            {task.name}
          </a>
        ) : (
          <span>{task.name}</span>
        )}
      </td>

      <td className="px-2 py-1.5 text-wiki-text dark:text-wiki-text-dark leading-snug align-middle">
        {task.descriptionParts && task.descriptionParts.length > 0 ? (
          <div onPointerDown={(e) => { if (e.target instanceof HTMLAnchorElement) e.stopPropagation(); }}>
            <RichText parts={task.descriptionParts} />
          </div>
        ) : (
          task.description
        )}
      </td>

      <td
        className={[
          'px-2 py-1.5 text-wiki-text dark:text-wiki-text-dark align-middle',
          reqIsNa && !task.completed ? 'req-na-cell' : '',
        ].join(' ')}
      >
        <div onPointerDown={(e) => { if (e.target instanceof HTMLAnchorElement) e.stopPropagation(); }}>
          <RequirementsCell
            requirementsText={task.requirementsText}
            requirementsParts={task.requirementsParts}
          />
        </div>
      </td>

      <td className="p-0 align-middle whitespace-nowrap">
        <div className="flex items-center justify-center gap-1 px-1 py-1.5">
          {difficultyIconUrl(task.tier) && (
            <WikiIcon
              src={difficultyIconUrl(task.tier)!}
              alt={task.tier}
              className="w-[18px] h-[18px] flex-shrink-0"
            />
          )}
          <span className={`tabular-nums font-medium ${TIER_COLOURS[task.tier] ?? ''}`}>
            {task.points}
          </span>
        </div>
      </td>

      <td className="p-0 align-middle text-center w-20">
        <div className="flex items-center justify-center gap-0.5 px-1 py-1.5">
          {/* Single unified pin button: focuses map if location exists, starts placement if not.
              When placing, it is highlighted blue. Clear appears only when a location is set. */}
          {!isRunMode && onStartPlaceLocation && (
            <button
              onClick={() => {
                if (item.location && onFocusOnMap && !isPlacingLocation) {
                  onFocusOnMap(item.routeItemId);
                } else {
                  onStartPlaceLocation(item.routeItemId);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={
                isPlacingLocation
                  ? 'Placing — click map to set location'
                  : item.location
                  ? 'View on map (click to focus)'
                  : 'Set location on map'
              }
              aria-label={`${item.location ? 'View' : 'Set'} map location for "${task.name}"`}
              className={[
                'flex items-center justify-center p-1 transition-colors cursor-pointer',
                isPlacingLocation
                  ? 'text-wiki-link dark:text-wiki-link-dark'
                  : item.location
                  ? 'text-[#c8940c] dark:text-[#c8a030] hover:text-wiki-link dark:hover:text-wiki-link-dark'
                  : 'text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark',
              ].join(' ')}
            >
              <MapPinIcon />
            </button>
          )}
          {/* Clear location — only shown when the item has a location, in edit mode */}
          {!isRunMode && item.location && onClearLocation && (
            <button
              onClick={() => onClearLocation(item.routeItemId)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Clear map location"
              aria-label={`Clear map location for "${task.name}"`}
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <XIcon />
            </button>
          )}
          {/* Remove from route */}
          {!isRunMode && (
            <button
              onClick={() => onRemove(item.taskId)}
              onPointerDown={(e) => e.stopPropagation()}
              title={`Remove "${task.name}" from route`}
              aria-label={`Remove "${task.name}" from route`}
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Sortable custom row ───────────────────────────────────────────────────────

interface SortableCustomRowProps {
  item: RouteItem;
  listPos: number;
  isRunMode: boolean;
  onRemove: (taskId: string) => void;
  onEdit: (taskId: string, field: 'label' | 'description' | 'note', value: string) => void;
  mapVisible?: boolean;
  onFocusOnMap?: (routeItemId: string) => void;
  onStartPlaceLocation?: (routeItemId: string) => void;
  onClearLocation?: (routeItemId: string) => void;
  isMapFocused?: boolean;
  isPlacingLocation?: boolean;
  suppressCrossSectionShift?: boolean;
}

function SortableCustomRow({
  item,
  listPos,
  isRunMode,
  onRemove,
  onEdit,
  onFocusOnMap,
  onStartPlaceLocation,
  onClearLocation,
  isMapFocused,
  isPlacingLocation,
  suppressCrossSectionShift,
}: SortableCustomRowProps) {
  const [editingField, setEditingField] = useState<'label' | 'description' | 'note' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.routeItemId });

  const style: React.CSSProperties = {
    transform: suppressCrossSectionShift && !isDragging ? undefined : CSS.Transform.toString(transform),
    transition: suppressCrossSectionShift && !isDragging ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 2 : undefined,
  };

  useEffect(() => {
    if (editingField) {
      setEditValue(
        editingField === 'label'
          ? (item.customName ?? '')
          : editingField === 'description'
          ? (item.customDescription ?? '')
          : (item.note ?? ''),
      );
      // Defer focus so the input is rendered before we try to focus it
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editingField, item.customName, item.customDescription, item.note]);

  const commitEdit = () => {
    if (!editingField) return;
    const trimmed = editValue.trim();
    // Allow saving empty strings for description and note so they can be cleared
    if (editingField === 'label' && !trimmed) {
      setEditingField(null);
      return; 
    }
    onEdit(item.taskId, editingField, trimmed);
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);

  const stripeClass = listPos % 2 === 0 ? 'row-alt' : '';
  const displayName = item.customName ?? '(custom task)';
  const displayDesc = item.customDescription ?? '';

  return (
    <tr
      ref={setNodeRef}
      data-route-item-id={item.routeItemId}
      style={{
        ...style,
        boxShadow: isPlacingLocation
          ? 'inset 3px 0 0 #0052cc'
          : isMapFocused
          ? 'inset 3px 0 0 #8b6914'
          : undefined,
      }}
      className={[
        stripeClass,
        editingField || isRunMode ? '' : 'cursor-grab active:cursor-grabbing'
      ].filter(Boolean).join(' ')}
      {...attributes}
      {...(editingField || isRunMode ? {} : listeners)}
    >
      {/* # */}
      <td className="px-1 py-1.5 align-middle w-12">
        <div className="flex items-center justify-center">
          <span className="text-[12px] font-semibold tabular-nums leading-none text-wiki-text dark:text-wiki-text-dark">
            {listPos + 1}
          </span>
        </div>
      </td>

      {/* Area */}
      <td className="px-2 py-1.5 text-center align-middle">
        <span className="flex items-center justify-center">
          <WikiIcon
            src="/icons/areas/Custom.png"
            alt="Custom"
            className="w-[22px] h-[22px] flex-shrink-0"
          />
        </span>
      </td>

      {/* Name / Label */}
      <td className="px-2 py-1.5 align-middle">
        {editingField === 'label' ? (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              maxLength={120}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark focus:outline-none"
            />
            <button
              onClick={commitEdit}
              title="Save label"
              className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity flex-shrink-0"
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-wiki-text dark:text-wiki-text-dark">{displayName}</span>
            {!isRunMode && (
              <button
                onClick={() => setEditingField('label')}
                onPointerDown={(e) => e.stopPropagation()}
                title={`Edit label "${displayName}"`}
                aria-label={`Edit label "${displayName}"`}
                className="flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors cursor-pointer flex-shrink-0"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </td>

      {/* Task / Description */}
      <td className="px-2 py-1.5 align-middle">
        {editingField === 'description' ? (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              placeholder="Task description…"
              maxLength={200}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/60 dark:placeholder:text-wiki-muted-dark focus:outline-none"
            />
            <button
              onClick={commitEdit}
              title="Save description"
              className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity flex-shrink-0"
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {displayDesc ? (
              <span className="text-wiki-text dark:text-wiki-text-dark leading-snug">{displayDesc}</span>
            ) : (
              <span className="text-wiki-muted dark:text-wiki-muted-dark font-medium cursor-default select-none">N/A</span>
            )}
            {!isRunMode && (
              <button
                onClick={() => setEditingField('description')}
                onPointerDown={(e) => e.stopPropagation()}
                title="Edit task description"
                aria-label="Edit task description"
                className="flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors cursor-pointer flex-shrink-0"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </td>

      {/* Requirements — Note for custom tasks if present */}
      <td
        className={[
          'px-2 py-1.5 align-middle',
          item.note || editingField === 'note' ? 'text-wiki-text dark:text-wiki-text-dark' : 'text-wiki-muted dark:text-wiki-muted-dark',
          (!item.note && editingField !== 'note') ? 'req-na-cell' : '',
        ].join(' ')}
      >
        {editingField === 'note' ? (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') cancelEdit();
              }}
              placeholder="Requirements/Notes…"
              maxLength={200}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-[12px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/60 dark:placeholder:text-wiki-muted-dark focus:outline-none"
            />
            <button
              onClick={commitEdit}
              title="Save notes"
              className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity flex-shrink-0"
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {item.note ? (
              <span className="leading-snug">{item.note}</span>
            ) : (
              <span className="font-medium cursor-default select-none">N/A</span>
            )}
            {!isRunMode && (
              <button
                onClick={() => setEditingField('note')}
                onPointerDown={(e) => e.stopPropagation()}
                title="Edit requirements/notes"
                aria-label="Edit requirements/notes"
                className="flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors cursor-pointer flex-shrink-0"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </td>

      {/* Points — not applicable */}
      <td className="p-0 align-middle whitespace-nowrap">
        <div className="flex items-center justify-center gap-1 px-1 py-1.5">
          <span className="tabular-nums text-wiki-muted dark:text-wiki-muted-dark">-</span>
        </div>
      </td>

      {/* Actions */}
      <td className="p-0 align-middle text-center w-20">
        <div className="flex items-center justify-center gap-0.5 px-1 py-1.5">
          {/* Unified pin: focuses if location exists, starts placement if not */}
          {!isRunMode && onStartPlaceLocation && (
            <button
              onClick={() => {
                if (item.location && onFocusOnMap && !isPlacingLocation) {
                  onFocusOnMap(item.routeItemId);
                } else {
                  onStartPlaceLocation(item.routeItemId);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={
                isPlacingLocation
                  ? 'Placing — click map to set location'
                  : item.location
                  ? 'View on map (click to focus)'
                  : 'Set location on map'
              }
              aria-label={`${item.location ? 'View' : 'Set'} map location for "${displayName}"`}
              className={[
                'flex items-center justify-center p-1 transition-colors cursor-pointer',
                isPlacingLocation
                  ? 'text-wiki-link dark:text-wiki-link-dark'
                  : item.location
                  ? 'text-[#c8940c] dark:text-[#c8a030] hover:text-wiki-link dark:hover:text-wiki-link-dark'
                  : 'text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark',
              ].join(' ')}
            >
              <MapPinIcon />
            </button>
          )}
          {/* Clear location */}
          {!isRunMode && item.location && onClearLocation && (
            <button
              onClick={() => onClearLocation(item.routeItemId)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Clear map location"
              aria-label={`Clear map location for "${displayName}"`}
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <XIcon />
            </button>
          )}
          {/* Remove from route */}
          {!isRunMode && (
            <button
              onClick={() => onRemove(item.taskId)}
              onPointerDown={(e) => e.stopPropagation()}
              title={`Remove "${displayName}" from route`}
              aria-label={`Remove "${displayName}" from route`}
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Unresolved task row ───────────────────────────────────────────────────────
//
// Rendered when a route item's taskId does not match any task in the current
// dataset (e.g. cross-league routes, incomplete transitional data, or future
// dataset updates that removed a task).
//
// The row is visually distinct (muted/italic) so the user can tell it is a
// preserved placeholder, and the remove button works normally.
// The item remains in the route and round-trips correctly through share/export.

interface UnresolvedTaskRowProps {
  item: RouteItem;
  listPos: number;
  isRunMode: boolean;
  onRemove: (taskId: string) => void;
  suppressCrossSectionShift?: boolean;
}

function UnresolvedTaskRow({ item, listPos, isRunMode, onRemove, suppressCrossSectionShift }: UnresolvedTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.routeItemId });

  const style: React.CSSProperties = {
    transform: suppressCrossSectionShift && !isDragging ? undefined : CSS.Transform.toString(transform),
    transition: suppressCrossSectionShift && !isDragging ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 2 : undefined,
  };

  const stripeClass = listPos % 2 === 0 ? 'row-alt' : '';

  // Extract what identity information we can from the taskId or _snap.
  const displayName = item._snap?.name ?? (() => {
    const m = item.taskId.match(/^task-\d+-(\d+)$/);
    return m ? `Preserved task (sortId ${m[1]})` : 'Preserved task';
  })();

  return (
    <tr
      ref={setNodeRef}
      data-route-item-id={item.routeItemId}
      style={style}
      className={[
        stripeClass,
        isRunMode ? '' : 'cursor-grab active:cursor-grabbing',
        'opacity-60',
      ].filter(Boolean).join(' ')}
      title="This task could not be found in the current dataset. It has been preserved in your route."
      {...attributes}
      {...(isRunMode ? {} : listeners)}
    >
      {/* # */}
      <td className="px-1 py-1.5 align-middle w-12">
        <div className="flex items-center justify-center">
          <span className="text-[12px] font-semibold tabular-nums leading-none text-wiki-muted dark:text-wiki-muted-dark">
            {listPos + 1}
          </span>
        </div>
      </td>
      {/* Area */}
      <td className="px-2 py-1.5 text-center align-middle">
        <span className="text-wiki-muted dark:text-wiki-muted-dark text-[10px]">?</span>
      </td>
      {/* Name */}
      <td className="px-2 py-1.5 align-middle">
        <span className="italic text-wiki-muted dark:text-wiki-muted-dark text-[12px]">{displayName}</span>
      </td>
      {/* Description */}
      <td className="px-2 py-1.5 align-middle">
        <span className="italic text-wiki-muted dark:text-wiki-muted-dark text-[11px]">
          Task not found in current dataset
        </span>
      </td>
      {/* Requirements */}
      <td className="px-2 py-1.5 align-middle">
        {item.note ? (
          <span className="text-wiki-muted dark:text-wiki-muted-dark text-[12px]">{item.note}</span>
        ) : (
          <span className="text-wiki-muted dark:text-wiki-muted-dark font-medium">—</span>
        )}
      </td>
      {/* Points */}
      <td className="p-0 align-middle whitespace-nowrap">
        <div className="flex items-center justify-center gap-1 px-1 py-1.5">
          <span className="tabular-nums text-wiki-muted dark:text-wiki-muted-dark">?</span>
        </div>
      </td>
      {/* Actions */}
      <td className="p-0 align-middle text-center w-20">
        <div className="flex items-center justify-center gap-0.5 px-1 py-1.5">
          {!isRunMode && (
            <button
              onClick={() => onRemove(item.taskId)}
              onPointerDown={(e) => e.stopPropagation()}
              title={`Remove preserved task from route`}
              aria-label={`Remove preserved task "${displayName}" from route`}
              className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Section header row ────────────────────────────────────────────────────────

interface SectionHeaderRowProps {
  section: RouteSection;
  itemCount: number;
  taskMap: Map<string, TaskView>;
  isRunMode: boolean;
  onRename: (sectionId: string, name: string) => void;
  onRemove: (sectionId: string) => void;
}

function SectionHeaderRow({ section, itemCount, taskMap, isRunMode, onRename, onRemove }: SectionHeaderRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sectionPoints = useMemo(
    () =>
      section.items.reduce((sum, item) => {
        if (item.isCustom) return sum;
        const task = taskMap.get(item.taskId);
        return sum + (task?.points ?? 0);
      }, 0),
    [section.items, taskMap],
  );

  useEffect(() => {
    if (editing) {
      setEditName(section.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, section.name]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== section.name) onRename(section.id, trimmed);
    setEditing(false);
  };

  return (
    <tr id={`route-section-${section.id}`}>
      <td
        colSpan={7}
        className="px-3 py-3 bg-wiki-mid dark:bg-wiki-mid-dark border-y border-[#706050] dark:border-[#455270] select-none"
      >
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              maxLength={80}
              className="flex-1 max-w-[220px] px-1.5 py-0.5 text-[13px] font-semibold bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark focus:outline-none"
            />
            <button
              onClick={commitRename}
              className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-0.5">
                <span className="text-[14px] leading-none font-bold uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark">
                  {section.name}
                </span>
                {!isRunMode && (
                  <button
                    onClick={() => setEditing(true)}
                    title={`Rename section "${section.name}"`}
                    aria-label={`Rename section "${section.name}"`}
                    className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors"
                  >
                    <PencilIcon />
                  </button>
                )}
              </div>
              {!confirmRemove && itemCount > 0 && (
                <span className="text-[13px] font-medium text-wiki-text/75 dark:text-wiki-text-dark/75 tabular-nums">
                  {itemCount} task{itemCount !== 1 ? 's' : ''} &middot; {sectionPoints} pts
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isRunMode && (
                confirmRemove ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-wiki-text dark:text-wiki-text-dark whitespace-nowrap">
                      Remove{itemCount > 0 ? ` (${itemCount} task${itemCount !== 1 ? 's' : ''})` : ''}?
                    </span>
                    <button
                      onClick={() => { onRemove(section.id); setConfirmRemove(false); }}
                      className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-red-600 dark:bg-red-700 hover:opacity-80 transition-opacity"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmRemove(false)}
                      className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (itemCount === 0) {
                        onRemove(section.id);
                      } else {
                        setConfirmRemove(true);
                      }
                    }}
                    title={`Remove section "${section.name}"`}
                    aria-label={`Remove section "${section.name}"`}
                    className="flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <XIcon />
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Add custom task row (inline form) ────────────────────────────────────────

interface AddCustomTaskRowProps {
  onAdd: (name: string) => void;
  onCancel: () => void;
}

function AddCustomTaskRow({ onAdd, onCancel }: AddCustomTaskRowProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) onAdd(trimmed);
  };

  return (
    <tr className="bg-wiki-surface dark:bg-wiki-surface-dark">
      <td
        colSpan={7}
        className="px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark"
      >
        <div className="flex items-center gap-2">
          <WikiIcon
            src="/icons/areas/Custom.png"
            alt="Custom"
            className="w-[22px] h-[22px] flex-shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') onCancel();
            }}
            placeholder="Custom task name…"
            maxLength={120}
            className="flex-1 max-w-sm px-2 py-1.5 text-[13px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/60 dark:placeholder:text-wiki-muted-dark focus:outline-none"
          />
          <button
            onClick={commit}
            disabled={!name.trim()}
            className="px-2.5 py-1 text-[12px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Table section (section header + its rows) ────────────────────────────────

// ─── Empty section drop targets ───────────────────────────────────────────────

/**
 * Rendered inside a <tbody> when a section has no items.
 * Uses useDroppable so dnd-kit's collision detection can find it when the
 * user drags a task over an otherwise empty section.
 */
function TableEmptySectionDropTarget({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });
  return (
    <tr ref={setNodeRef}>
      <td
        colSpan={7}
        className={[
          'px-3 py-5 text-center text-[12px] border border-dashed transition-colors',
          isOver
            ? 'border-wiki-link dark:border-wiki-link-dark bg-wiki-link/5 dark:bg-wiki-link-dark/5 text-wiki-link dark:text-wiki-link-dark'
            : 'border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark',
        ].join(' ')}
      >
        Drop a task here
      </td>
    </tr>
  );
}

/**
 * Rendered inside a mobile section when it has no items.
 * Uses useDroppable for the same reason as the table variant.
 */
function MobileEmptySectionDropTarget({ sectionId }: { sectionId: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionId });
  return (
    <div
      ref={setNodeRef}
      className={[
        'mb-2 py-5 text-center text-[12px] border border-dashed rounded-sm transition-colors',
        isOver
          ? 'border-wiki-link dark:border-wiki-link-dark bg-wiki-link/5 dark:bg-wiki-link-dark/5 text-wiki-link dark:text-wiki-link-dark'
          : 'border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark',
      ].join(' ')}
    >
      Drop a task here
    </div>
  );
}

function TableSectionEndDropTarget({ sectionId }: { sectionId: string }) {
  const id = sectionEndDropId(sectionId);
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <tr ref={setNodeRef}>
      <td colSpan={7} className="px-3 py-0 bg-wiki-table-bg dark:bg-wiki-table-bg-dark border-0">
        <div
          className={[
            'h-3 my-0.5 rounded-sm transition-colors',
            isOver
              ? 'border border-dashed border-wiki-link dark:border-wiki-link-dark bg-wiki-link/10 dark:bg-wiki-link-dark/10'
              : 'border border-transparent bg-transparent opacity-0',
          ].join(' ')}
        />
      </td>
    </tr>
  );
}

function MobileSectionEndDropTarget({ sectionId }: { sectionId: string }) {
  const id = sectionEndDropId(sectionId);
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={[
        'h-4 mb-1 rounded-sm transition-colors',
        isOver
          ? 'border border-dashed border-wiki-link dark:border-wiki-link-dark bg-wiki-link/10 dark:bg-wiki-link-dark/10'
          : 'border border-transparent bg-transparent opacity-0',
      ].join(' ')}
    />
  );
}

function TableCrossSectionInsertPlaceholder() {
  return (
    <tr aria-hidden="true">
      <td
        colSpan={7}
        className="px-3 py-0 bg-wiki-table-bg dark:bg-wiki-table-bg-dark"
      >
        <div className="h-10 my-1 rounded-sm border border-dashed border-wiki-link dark:border-wiki-link-dark bg-wiki-link/5 dark:bg-wiki-link-dark/5" />
      </td>
    </tr>
  );
}

function MobileCrossSectionInsertPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-16 mb-2 rounded-sm border border-dashed border-wiki-link dark:border-wiki-link-dark bg-wiki-link/5 dark:bg-wiki-link-dark/5"
    />
  );
}

// ─── Table section (section header + its rows) ────────────────────────────────

interface TableSectionProps {
  section: RouteSection;
  itemIndexMap: Map<string, number>;
  taskMap: Map<string, TaskView>;
  isRunMode: boolean;
  onRemoveTask: (taskId: string) => void;
  onEditCustomTask: (taskId: string, field: 'label' | 'description' | 'note', value: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onRemoveSection: (sectionId: string) => void;
  addingCustomToSection: string | null;
  setAddingCustomToSection: (id: string | null) => void;
  onAddCustomConfirm: (sectionId: string, name: string) => void;
  isDraggingSection: boolean;
  mapVisible?: boolean;
  onFocusOnMap?: (routeItemId: string) => void;
  onStartPlaceLocation?: (routeItemId: string) => void;
  onClearLocation?: (routeItemId: string) => void;
  focusedItemId?: string | null;
  placingRouteItemId?: string | null;
  crossSectionPreview: CrossSectionPreview | null;
  suppressCrossSectionShift: boolean;
  isDragActive: boolean;
}

function TableSection({
  section,
  itemIndexMap,
  taskMap,
  isRunMode,
  onRemoveTask,
  onEditCustomTask,
  onRenameSection,
  onRemoveSection,
  addingCustomToSection,
  setAddingCustomToSection,
  onAddCustomConfirm,
  isDraggingSection,
  mapVisible,
  onFocusOnMap,
  onStartPlaceLocation,
  onClearLocation,
  focusedItemId,
  placingRouteItemId,
  crossSectionPreview,
  suppressCrossSectionShift,
  isDragActive,
}: TableSectionProps) {
  const previewForSection =
    crossSectionPreview && crossSectionPreview.destSectionId === section.id
      ? crossSectionPreview
      : null;

  return (
    <>
      <SectionHeaderRow
        section={section}
        itemCount={section.items.length}
        taskMap={taskMap}
        isRunMode={isRunMode}
        onRename={onRenameSection}
        onRemove={onRemoveSection}
      />

      {!isDraggingSection && section.items.map((item, itemIndex) => {
        if (!itemIndexMap.has(item.routeItemId)) return null;
        const listPos = itemIndexMap.get(item.routeItemId)!;
        const isMapFocused = focusedItemId === item.routeItemId;
        const isPlacingLocation = placingRouteItemId === item.routeItemId;
        return (
          <Fragment key={item.routeItemId}>
            {previewForSection?.destIndex === itemIndex && (
              <TableCrossSectionInsertPlaceholder />
            )}

            {item.isCustom ? (
              <SortableCustomRow
                item={item}
                listPos={listPos}
                isRunMode={isRunMode}
                onRemove={onRemoveTask}
                onEdit={onEditCustomTask}
                mapVisible={mapVisible}
                onFocusOnMap={onFocusOnMap}
                onStartPlaceLocation={onStartPlaceLocation}
                onClearLocation={onClearLocation}
                isMapFocused={isMapFocused}
                isPlacingLocation={isPlacingLocation}
                suppressCrossSectionShift={suppressCrossSectionShift}
              />
            ) : (() => {
              const task = taskMap.get(item.taskId);
              if (!task) {
                // Task not found in the current dataset — render a preserved placeholder
                // instead of dropping the item silently. The user can still remove it.
                return (
                  <UnresolvedTaskRow
                    item={item}
                    listPos={listPos}
                    isRunMode={isRunMode}
                    onRemove={onRemoveTask}
                    suppressCrossSectionShift={suppressCrossSectionShift}
                  />
                );
              }
              return (
                <SortableRow
                  item={item}
                  task={task}
                  listPos={listPos}
                  isRunMode={isRunMode}
                  onRemove={onRemoveTask}
                  mapVisible={mapVisible}
                  onFocusOnMap={onFocusOnMap}
                  onStartPlaceLocation={onStartPlaceLocation}
                  onClearLocation={onClearLocation}
                  isMapFocused={isMapFocused}
                  isPlacingLocation={isPlacingLocation}
                  suppressCrossSectionShift={suppressCrossSectionShift}
                />
              );
            })()}
          </Fragment>
        );
      })}

      {!isRunMode && !isDraggingSection && isDragActive && section.items.length > 0 && (
        <TableSectionEndDropTarget sectionId={section.id} />
      )}

      {/* Empty section drop target — visible when no items exist.
           Must remain mounted while isDragActive, even when crossSectionPreview
           targets this section. Unmounting it causes the droppable to vanish,
           which clears event.over, which clears the preview, which remounts the
           droppable — a tight render loop that flickers the whole section. */}
      {!isRunMode && !isDraggingSection && section.items.length === 0 && (
        <TableEmptySectionDropTarget sectionId={section.id} />
      )}

      {!isRunMode && !isDraggingSection && (addingCustomToSection === section.id ? (
        <AddCustomTaskRow
          onAdd={(name) => onAddCustomConfirm(section.id, name)}
          onCancel={() => setAddingCustomToSection(null)}
        />
      ) : (
        <tr>
          <td
            colSpan={7}
            className="px-3 py-1 bg-wiki-article dark:bg-wiki-article-dark border-b border-wiki-border dark:border-wiki-border-dark"
          >
            <button
              onClick={() => setAddingCustomToSection(section.id)}
              className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors"
            >
              + Custom task
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Sortable section chip (for horizontal section reorder bar) ───────────────

interface SortableSectionChipProps {
  section: RouteSection;
  isBeingDragged: boolean;
  isRunMode: boolean;
  onJump: (sectionId: string) => void;
}

function SortableSectionChip({ section, isBeingDragged, isRunMode, onJump }: SortableSectionChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isBeingDragged ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isRunMode ? {} : attributes)}
      className="flex items-center rounded border border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark text-[12px] text-wiki-text dark:text-wiki-text-dark select-none touch-none overflow-hidden"
    >
      {!isRunMode && (
        <span
          {...listeners}
          className="flex items-center px-1.5 py-1.5 text-wiki-muted dark:text-wiki-muted-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark border-r border-wiki-border dark:border-wiki-border-dark cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder sections"
          aria-label="Drag handle"
        >
          <GripIcon />
        </span>
      )}
      <button
        type="button"
        onClick={() => onJump(section.id)}
        className="px-2.5 py-1.5 font-medium hover:text-wiki-link dark:hover:text-wiki-link-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark transition-colors cursor-pointer"
        title={`Jump to "${section.name}" section`}
        aria-label={`Jump to ${section.name} section`}
      >
        {section.name}
        <span className="ml-1.5 font-normal text-[11px] text-wiki-muted dark:text-wiki-muted-dark">
          ({section.items.length})
        </span>
      </button>
    </div>
  );
}

// ─── Mobile route card (real task) ────────────────────────────────────────────

function SortableRouteCard({ item, task, listPos, isRunMode, onRemove, onFocusOnMap, onStartPlaceLocation, onClearLocation, isMapFocused, isPlacingLocation, suppressCrossSectionShift }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.routeItemId });

  const style: React.CSSProperties = {
    transform: suppressCrossSectionShift && !isDragging ? undefined : CSS.Transform.toString(transform),
    transition: suppressCrossSectionShift && !isDragging ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 2 : undefined,
    boxShadow: isPlacingLocation
      ? 'inset 3px 0 0 #0052cc'
      : isMapFocused
      ? 'inset 3px 0 0 #8b6914'
      : undefined,
  };

  const reqIsNa = isNaReqs(task.requirementsText);
  const regionIcon = regionIconUrl(task.area);
  const regionColor = REGION_COLOUR[task.area];
  const areaUrl = regionWikiUrl(task.area);
  const cardBg = task.completed
    ? 'bg-[#c8e8c8] dark:bg-[#182b18] border-[#b8ddb8] dark:border-[#1e3620]'
    : 'bg-wiki-surface dark:bg-wiki-surface-dark border-wiki-border dark:border-wiki-border-dark';

  return (
    <div
      ref={setNodeRef}
      data-route-item-id={item.routeItemId}
      style={style}
      {...attributes}
      className={`flex flex-col border rounded-sm shadow-sm overflow-hidden transition-colors ${cardBg}`}
    >
      {/* Header: drag handle, position #, area icon, task name, points */}
      <div className="flex items-start gap-2 p-2.5 border-b border-wiki-border dark:border-wiki-border-dark/50">
        {!isRunMode && (
          <span
            {...listeners}
            aria-label="Drag to reorder"
            className="flex-shrink-0 flex items-center self-stretch px-1 text-wiki-muted dark:text-wiki-muted-dark cursor-grab active:cursor-grabbing touch-none select-none hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-sm"
          >
            <GripIcon />
          </span>
        )}
        <span className="flex-shrink-0 text-[11px] font-bold tabular-nums text-wiki-muted dark:text-wiki-muted-dark self-center min-w-[1.25rem] text-right">
          {listPos + 1}.
        </span>
        <div className="flex-shrink-0 mt-0.5">
          {(() => {
            const icon = (
              <WikiIcon
                src={regionIcon ?? ''}
                alt={task.area}
                className={regionIconClass(task.area, 'table')}
                fallbackColor={regionColor}
              />
            );
            return areaUrl ? (
              <a href={areaUrl} target="_blank" rel="noopener noreferrer" title={task.area} className="inline-flex items-center no-underline hover:opacity-80">
                {icon}
              </a>
            ) : icon;
          })()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] leading-tight break-words text-wiki-text dark:text-wiki-text-dark">
            {task.nameParts && task.nameParts.length > 0 ? (
              <RichText parts={task.nameParts} />
            ) : task.wikiUrl ? (
              <a href={task.wikiUrl} target="_blank" rel="noopener noreferrer" className="text-wiki-link dark:text-wiki-link-dark hover:underline">
                {task.name}
              </a>
            ) : (
              task.name
            )}
          </div>
          <div className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark mt-0.5">{task.area}</div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-1 ml-1 self-center">
          {difficultyIconUrl(task.tier) && (
            <WikiIcon src={difficultyIconUrl(task.tier)!} alt={task.tier} className="w-4 h-4 flex-shrink-0" />
          )}
          <span className={`text-[13px] font-semibold tabular-nums ${TIER_COLOURS[task.tier] ?? ''}`}>
            {task.points}
          </span>
        </div>
      </div>

      {/* Description */}
      <div className="px-2.5 py-2 text-[13px] leading-snug break-words text-wiki-text dark:text-wiki-text-dark opacity-90">
        {task.descriptionParts && task.descriptionParts.length > 0 ? (
          <RichText parts={task.descriptionParts} />
        ) : (
          task.description
        )}
      </div>

      {/* Requirements (hidden when N/A) */}
      {!reqIsNa && (
        <div className="px-2.5 py-1.5 border-t border-wiki-border dark:border-wiki-border-dark/50 text-[12px] bg-black/5 dark:bg-black/20 break-words">
          <span className="font-bold text-[10px] uppercase tracking-wider text-wiki-muted dark:text-wiki-muted-dark mr-1">Reqs:</span>
          <RequirementsCell
            requirementsText={task.requirementsText}
            requirementsParts={task.requirementsParts}
          />
        </div>
      )}

      {/* Map pin action: single button â€“ focuses if location exists, starts placement otherwise */}
      {!isRunMode && onStartPlaceLocation && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => {
              if (item.location && onFocusOnMap && !isPlacingLocation) {
                onFocusOnMap(item.routeItemId);
              } else {
                onStartPlaceLocation(item.routeItemId);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={[
              'w-full py-2 text-[12px] font-medium transition-colors touch-manipulation flex items-center justify-center gap-1.5',
              isPlacingLocation
                ? 'text-wiki-link dark:text-wiki-link-dark bg-wiki-mid dark:bg-wiki-mid-dark'
                : item.location
                ? 'text-[#c8940c] dark:text-[#c8a030] hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark'
                : 'text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark',
            ].join(' ')}
          >
            <MapPinIcon />
            {isPlacingLocation
              ? 'Placing — click on map'
              : item.location
              ? 'View on map'
              : 'Set location on map'}
          </button>
        </div>
      )}
      {!isRunMode && item.location && onClearLocation && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => onClearLocation(item.routeItemId)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full py-2 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors touch-manipulation"
          >
            Clear map location
          </button>
        </div>
      )}
      {!isRunMode && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => onRemove(item.taskId)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full py-2.5 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors touch-manipulation"
          >
            Remove from route
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mobile custom task card ───────────────────────────────────────────────────

function SortableCustomCard({ item, listPos, isRunMode, onRemove, onEdit, onFocusOnMap, onStartPlaceLocation, onClearLocation, isMapFocused, isPlacingLocation, suppressCrossSectionShift }: SortableCustomRowProps) {
  const [editingField, setEditingField] = useState<'label' | 'description' | 'note' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.routeItemId });

  const style: React.CSSProperties = {
    transform: suppressCrossSectionShift && !isDragging ? undefined : CSS.Transform.toString(transform),
    transition: suppressCrossSectionShift && !isDragging ? undefined : transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 2 : undefined,
    boxShadow: isPlacingLocation
      ? 'inset 3px 0 0 #0052cc'
      : isMapFocused
      ? 'inset 3px 0 0 #8b6914'
      : undefined,
  };

  useEffect(() => {
    if (editingField) {
      setEditValue(
        editingField === 'label'
          ? (item.customName ?? '')
          : editingField === 'description'
          ? (item.customDescription ?? '')
          : (item.note ?? ''),
      );
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editingField, item.customName, item.customDescription, item.note]);

  const commitEdit = () => {
    if (!editingField) return;
    const trimmed = editValue.trim();
    if (editingField === 'label' && !trimmed) { setEditingField(null); return; }
    onEdit(item.taskId, editingField, trimmed);
    setEditingField(null);
  };

  const cancelEdit = () => setEditingField(null);
  const displayName = item.customName ?? '(custom task)';
  const displayDesc = item.customDescription ?? '';

  const sharedInputCls = 'flex-1 min-w-0 px-1.5 py-1 text-[13px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-muted dark:placeholder:text-wiki-muted-dark focus:outline-none';
  const saveCls = 'px-2 py-1 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity flex-shrink-0';
  const cancelCls = 'px-2 py-1 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0';

  return (
    <div
      ref={setNodeRef}
      data-route-item-id={item.routeItemId}
      style={style}
      {...attributes}
      className="flex flex-col border rounded-sm shadow-sm overflow-hidden bg-wiki-surface dark:bg-wiki-surface-dark border-wiki-border dark:border-wiki-border-dark"
    >
      {/* Header: drag handle, #, custom icon, label */}
      <div className="flex items-start gap-2 p-2.5 border-b border-wiki-border dark:border-wiki-border-dark/50">
        {!isRunMode && (
          <span
            {...(editingField ? {} : listeners)}
            aria-label="Drag to reorder"
            className="flex-shrink-0 flex items-center self-stretch px-1 text-wiki-muted dark:text-wiki-muted-dark cursor-grab active:cursor-grabbing touch-none select-none hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-sm"
          >
            <GripIcon />
          </span>
        )}
        <span className="flex-shrink-0 text-[11px] font-bold tabular-nums text-wiki-muted dark:text-wiki-muted-dark self-center min-w-[1.25rem] text-right">
          {listPos + 1}.
        </span>
        <div className="flex-shrink-0 mt-0.5">
          <WikiIcon src="/icons/areas/Custom.png" alt="Custom" className="w-[22px] h-[22px] flex-shrink-0" />
        </div>
        <div className="flex-1 min-w-0">
          {editingField === 'label' ? (
            <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <input ref={inputRef} type="text" value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
                maxLength={120} className={sharedInputCls} />
              <button onClick={commitEdit} className={saveCls}>Save</button>
              <button onClick={cancelEdit} className={cancelCls}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[14px] leading-tight text-wiki-text dark:text-wiki-text-dark break-words">{displayName}</span>
              {!isRunMode && (
                <button onClick={() => setEditingField('label')} onPointerDown={(e) => e.stopPropagation()} title="Edit label"
                  className="flex-shrink-0 flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors">
                  <PencilIcon />
                </button>
              )}
            </div>
          )}
          <div className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark mt-0.5">Custom task</div>
        </div>
      </div>

      {/* Description */}
      <div className="px-2.5 py-2 border-b border-wiki-border dark:border-wiki-border-dark/50 text-[13px]">
        {editingField === 'description' ? (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <input ref={inputRef} type="text" value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              placeholder="Task description…" maxLength={200} className={sharedInputCls} />
            <button onClick={commitEdit} className={saveCls}>Save</button>
            <button onClick={cancelEdit} className={cancelCls}>✕</button>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <span className="flex-1 leading-snug break-words text-wiki-text dark:text-wiki-text-dark">
              {displayDesc || <span className="text-wiki-muted dark:text-wiki-muted-dark italic">No description</span>}
            </span>
            {!isRunMode && (
              <button onClick={() => setEditingField('description')} onPointerDown={(e) => e.stopPropagation()} title="Edit description"
                className="flex-shrink-0 flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors mt-0.5">
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Notes / Requirements */}
      <div className="px-2.5 py-2 text-[12px] bg-black/5 dark:bg-black/20">
        {editingField === 'note' ? (
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <input ref={inputRef} type="text" value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              placeholder="Notes / requirements…" maxLength={200} className={sharedInputCls} />
            <button onClick={commitEdit} className={saveCls}>Save</button>
            <button onClick={cancelEdit} className={cancelCls}>✕</button>
          </div>
        ) : (
          <div className="flex items-start gap-1.5">
            <span className="flex-1 break-words">
              <span className="font-bold text-[10px] uppercase tracking-wider text-wiki-muted dark:text-wiki-muted-dark">Notes: </span>
              {item.note
                ? <span className="text-wiki-text dark:text-wiki-text-dark">{item.note}</span>
                : <span className="text-wiki-muted dark:text-wiki-muted-dark italic">None</span>}
            </span>
            {!isRunMode && (
              <button onClick={() => setEditingField('note')} onPointerDown={(e) => e.stopPropagation()} title="Edit notes"
                className="flex-shrink-0 flex items-center justify-center p-0.5 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors mt-0.5">
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Map focus action */}
      {!isRunMode && onStartPlaceLocation && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => {
              if (item.location && onFocusOnMap && !isPlacingLocation) {
                onFocusOnMap(item.routeItemId);
              } else {
                onStartPlaceLocation(item.routeItemId);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={[
              'w-full py-2 text-[12px] font-medium transition-colors touch-manipulation flex items-center justify-center gap-1.5',
              isPlacingLocation
                ? 'text-wiki-link dark:text-wiki-link-dark bg-wiki-mid dark:bg-wiki-mid-dark'
                : item.location
                ? 'text-[#c8940c] dark:text-[#c8a030] hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark'
                : 'text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark',
            ].join(' ')}
          >
            <MapPinIcon />
            {isPlacingLocation
              ? 'Placing — click on map'
              : item.location
              ? 'View on map'
              : 'Set location on map'}
          </button>
        </div>
      )}
      {!isRunMode && item.location && onClearLocation && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => onClearLocation(item.routeItemId)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full py-2 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors touch-manipulation"
          >
            Clear map location
          </button>
        </div>
      )}
      {/* Remove action */}
      {!isRunMode && (
        <div className="border-t border-wiki-border dark:border-wiki-border-dark/50">
          <button
            onClick={() => onRemove(item.taskId)}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full py-2.5 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors touch-manipulation"
          >
            Remove from route
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Mobile add-custom-task form ───────────────────────────────────────────────

function MobileAddCustomForm({ onAdd, onCancel }: { onAdd: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const commit = () => { const t = name.trim(); if (t) onAdd(t); };
  return (
    <div className="flex items-center gap-2 px-2 py-2.5 bg-wiki-surface dark:bg-wiki-surface-dark border border-dashed border-wiki-link dark:border-wiki-link-dark rounded-sm">
      <WikiIcon src="/icons/areas/Custom.png" alt="Custom" className="w-[18px] h-[18px] flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Custom task name…"
        maxLength={120}
        className="flex-1 min-w-0 px-2 py-1.5 text-[13px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-muted dark:placeholder:text-wiki-muted-dark focus:outline-none"
      />
      <button onClick={commit} disabled={!name.trim()}
        className="px-2.5 py-1.5 text-[12px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
        Add
      </button>
      <button onClick={onCancel}
        className="px-2.5 py-1.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0">
        Cancel
      </button>
    </div>
  );
}

// ─── Mobile route section (section header + cards) ────────────────────────────

interface MobileRouteSectionProps {
  section: RouteSection;
  itemIndexMap: Map<string, number>;
  taskMap: Map<string, TaskView>;
  isRunMode: boolean;
  onRemoveTask: (taskId: string) => void;
  onEditCustomTask: (taskId: string, field: 'label' | 'description' | 'note', value: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onRemoveSection: (sectionId: string) => void;
  addingCustomToSection: string | null;
  setAddingCustomToSection: (id: string | null) => void;
  onAddCustomConfirm: (sectionId: string, name: string) => void;
  isDraggingSection: boolean;
  mapVisible?: boolean;
  onFocusOnMap?: (routeItemId: string) => void;
  onStartPlaceLocation?: (routeItemId: string) => void;
  onClearLocation?: (routeItemId: string) => void;
  focusedItemId?: string | null;
  placingRouteItemId?: string | null;
  crossSectionPreview: CrossSectionPreview | null;
  suppressCrossSectionShift: boolean;
  isDragActive: boolean;
}

function MobileRouteSection({
  section,
  itemIndexMap,
  taskMap,
  isRunMode,
  onRemoveTask,
  onEditCustomTask,
  onRenameSection,
  onRemoveSection,
  addingCustomToSection,
  setAddingCustomToSection,
  onAddCustomConfirm,
  isDraggingSection,
  mapVisible,
  onFocusOnMap,
  onStartPlaceLocation,
  onClearLocation,
  focusedItemId,
  placingRouteItemId,
  crossSectionPreview,
  suppressCrossSectionShift,
  isDragActive,
}: MobileRouteSectionProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sectionPoints = useMemo(
    () => section.items.reduce((sum, item) => {
      if (item.isCustom) return sum;
      const task = taskMap.get(item.taskId);
      return sum + (task?.points ?? 0);
    }, 0),
    [section.items, taskMap],
  );

  useEffect(() => {
    if (editing) {
      setEditName(section.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, section.name]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== section.name) onRenameSection(section.id, trimmed);
    setEditing(false);
  };

  const previewForSection =
    crossSectionPreview && crossSectionPreview.destSectionId === section.id
      ? crossSectionPreview
      : null;

  return (
    <div id={`route-section-${section.id}`} className="mb-3">
      {/* Section header */}
      <div className="px-2.5 py-3 bg-wiki-mid dark:bg-wiki-mid-dark border border-[#706050] dark:border-[#455270] rounded-sm mb-2">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              maxLength={80}
              className="flex-1 px-1.5 py-0.5 text-[13px] font-semibold bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark focus:outline-none"
            />
            <button onClick={commitRename}
              className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-80 transition-opacity flex-shrink-0">
              Save
            </button>
            <button onClick={() => setEditing(false)}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors flex-shrink-0">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-[14px] leading-none font-bold uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark truncate">
                  {section.name}
                </span>
                {!isRunMode && (
                  <button onClick={() => setEditing(true)} title={`Rename "${section.name}"`}
                    className="flex-shrink-0 flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark transition-colors">
                    <PencilIcon />
                  </button>
                )}
              </div>
              {!confirmRemove && (
                <span className="flex-shrink-0 text-[13px] text-wiki-muted dark:text-wiki-muted-dark tabular-nums">
                  {section.items.length} task{section.items.length !== 1 ? 's' : ''} · {sectionPoints} pts
                </span>
              )}
            </div>
            {!isRunMode && (
              confirmRemove ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] text-wiki-text dark:text-wiki-text-dark whitespace-nowrap">Remove?</span>
                  <button onClick={() => { onRemoveSection(section.id); setConfirmRemove(false); }}
                    className="px-1.5 py-0.5 text-[11px] font-medium text-white bg-red-600 dark:bg-red-700 hover:opacity-80 transition-opacity">
                    Yes
                  </button>
                  <button onClick={() => setConfirmRemove(false)}
                    className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors">
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { if (section.items.length === 0) onRemoveSection(section.id); else setConfirmRemove(true); }}
                  title={`Remove section "${section.name}"`}
                  className="flex-shrink-0 flex items-center justify-center p-1 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <XIcon />
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Task cards */}
      {!isDraggingSection && section.items.map((item, itemIndex) => {
        if (!itemIndexMap.has(item.routeItemId)) return null;
        const listPos = itemIndexMap.get(item.routeItemId)!;
        const isMapFocused = focusedItemId === item.routeItemId;
        const isPlacingLocation = placingRouteItemId === item.routeItemId;
        return (
          <Fragment key={item.routeItemId}>
            {previewForSection?.destIndex === itemIndex && (
              <MobileCrossSectionInsertPlaceholder />
            )}
            <div className="mb-2">
              {item.isCustom ? (
                <SortableCustomCard
                  item={item}
                  listPos={listPos}
                  isRunMode={isRunMode}
                  onRemove={onRemoveTask}
                  onEdit={onEditCustomTask}
                  mapVisible={mapVisible}
                  onFocusOnMap={onFocusOnMap}
                  onStartPlaceLocation={onStartPlaceLocation}
                  onClearLocation={onClearLocation}
                  isMapFocused={isMapFocused}
                  isPlacingLocation={isPlacingLocation}
                  suppressCrossSectionShift={suppressCrossSectionShift}
                />
              ) : (() => {
                const task = taskMap.get(item.taskId);
                if (!task) {
                  // Render a muted placeholder card instead of dropping the item.
                  const snapName = item._snap?.name ?? (() => {
                    const m = item.taskId.match(/^task-\d+-(\d+)$/);
                    return m ? `Preserved task (sortId ${m[1]})` : 'Preserved task';
                  })();
                  return (
                    <div
                      className="px-3 py-2 border border-dashed border-wiki-border dark:border-wiki-border-dark rounded-sm opacity-60"
                      title="This task could not be found in the current dataset."
                    >
                      <span className="text-[11px] italic text-wiki-muted dark:text-wiki-muted-dark">{snapName}</span>
                      {!isRunMode && (
                        <button
                          onClick={() => onRemoveTask(item.taskId)}
                          className="ml-2 text-[11px] text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <SortableRouteCard
                    item={item}
                    task={task}
                    listPos={listPos}
                    isRunMode={isRunMode}
                    onRemove={onRemoveTask}
                    mapVisible={mapVisible}
                    onFocusOnMap={onFocusOnMap}
                    onStartPlaceLocation={onStartPlaceLocation}
                    onClearLocation={onClearLocation}
                    isMapFocused={isMapFocused}
                    isPlacingLocation={isPlacingLocation}
                    suppressCrossSectionShift={suppressCrossSectionShift}
                  />
                );
              })()}
            </div>
          </Fragment>
        );
      })}

      {!isRunMode && !isDraggingSection && isDragActive && section.items.length > 0 && (
        <MobileSectionEndDropTarget sectionId={section.id} />
      )}

      {/* Add custom task */}
      {!isRunMode && !isDraggingSection && (
        <>
          {/* Empty section drop target — visible when no items exist.
               Must remain mounted while a drag is active to prevent the
               flicker loop (see TableEmptySectionDropTarget note above). */}
          {section.items.length === 0 && (
            <MobileEmptySectionDropTarget sectionId={section.id} />
          )}
          {addingCustomToSection === section.id ? (
            <MobileAddCustomForm
              onAdd={(name) => onAddCustomConfirm(section.id, name)}
              onCancel={() => setAddingCustomToSection(null)}
            />
          ) : (
            <button
              onClick={() => setAddingCustomToSection(section.id)}
              className="w-full py-2 text-[12px] text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark border border-dashed border-wiki-border dark:border-wiki-border-dark hover:border-wiki-link dark:hover:border-wiki-link-dark bg-wiki-article dark:bg-wiki-article-dark transition-colors rounded-sm"
            >
              + Custom task
            </button>
          )}
        </>
      )}
    </div>
  );
}




// ─── Main panel ────────────────────────────────────────────────────────────────

export function RoutePlannerPanel({
  route,
  filters,
  isRunMode,
  setIsRunMode,
  allTasks,
  onUpdateRouteName,
  onRemoveTask,
  onReorderSections,
  onResetRoute,
  onReplaceRoute,
  onAddCustomTask,
  onEditCustomTask,
  onAddSection,
  onRenameSection,
  onRemoveSection,
  onSetRouteItemLocation,
  onMoveItem,
}: RoutePlannerPanelProps) {
  const layoutMode = useLayoutMode();

  const allRouteItems = useMemo(
    () => route.sections.flatMap((s) => s.items),
    [route.sections],
  );
  const itemCount = allRouteItems.length;

  const taskMap = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let globalIndex = 0;
    for (const section of route.sections) {
      for (const item of section.items) {
        const listPos = globalIndex++;

        if (!filters.applyFilterToRoute) {
          map.set(item.routeItemId, listPos);
          continue;
        }

        let matches = false;
        if (!item.isCustom) {
          const task = taskMap.get(item.taskId);
          if (task) {
            matches = filterTasks([task], filters).length > 0;
          } else {
            // Unresolved task — always show so the user can see and remove it.
            matches = true;
          }
        } else {
          matches = true;
          const query = filters.searchQuery.trim().toLowerCase();
          if (query) {
            const haystack = `${item.customName ?? ''} ${item.customDescription ?? ''} ${item.note ?? ''}`.toLowerCase();
            if (!haystack.includes(query)) matches = false;
          }

          if (matches && filters.categories.length > 0 && !filters.categories.includes('Custom tasks')) matches = false;

          const isExplicitCustom = filters.categories.includes('Custom tasks');
          if (matches && filters.tiers.length > 0 && !isExplicitCustom) matches = false;
          if (matches && filters.skills.length > 0 && !isExplicitCustom) matches = false;
          if (matches && filters.areas.length > 0 && !isExplicitCustom) matches = false;

          if (matches && filters.showOnlyCompleted) matches = false;
          if (matches && filters.showTodoOnly) matches = false;
        }
        
        if (matches) {
          map.set(item.routeItemId, listPos);
        }
      }
    }
    return map;
  }, [route.sections, filters, taskMap]);

  const visibleRouteItemIds = useMemo(() => Array.from(itemIndexMap.keys()), [itemIndexMap]);

  const totalPoints = useMemo(
    () =>
      allRouteItems.reduce((sum, item) => {
        if (item.isCustom) return sum;
        const task = taskMap.get(item.taskId);
        return sum + (task?.points ?? 0);
      }, 0),
    [allRouteItems, taskMap],
  );

  /** Flat ordered list of all route item IDs — passed to MapRouteList for DnD context. */
  const orderedItemIds = useMemo(
    () => allRouteItems.map((i) => i.routeItemId),
    [allRouteItems],
  );

  // ── Map state ──────────────────────────────────────────────────────────────
  const [mapVisible, setMapVisible]             = useState(false);
  const [mapFocusedItemId, setMapFocusedItemId] = useState<string | null>(null);
  const [mapPlacementItemId, setMapPlacementItemId] = useState<string | null>(null);
  /** Controlled height for the map area (desktop only). Min 200, max 700. */
  const [mapHeight, setMapHeight]               = useState(440);
  /** Controlled width for the right-side route list (desktop only). Min 180, max 520. */
  const [listWidth, setListWidth]               = useState(340);
  /** Resize drag state — not stored in state to avoid re-render on every move. */
  const resizeDragRef     = useRef<{ startY: number; startH: number } | null>(null);
  const listResizeDragRef = useRef<{ startX: number; startW: number } | null>(null);
  /** Ref for the map canvas container - used to detect drag-to-map drops from the route list. */
  const mapContainerRef = useRef<HTMLDivElement>(null);
  /** Trigger counter: increment to smoothly scroll the viewport to the map section. */
  const [scrollToMapTrigger, setScrollToMapTrigger] = useState(0);
  /** Ref to the outer map section wrapper — target for scroll-to-map. */
  const mapSectionRef = useRef<HTMLDivElement>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeDragRef.current = { startY: e.clientY, startH: mapHeight };
  }, [mapHeight]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeDragRef.current) return;
    const delta = e.clientY - resizeDragRef.current.startY;
    const newH  = Math.max(200, Math.min(700, resizeDragRef.current.startH + delta));
    setMapHeight(newH);
  }, []);

  const handleResizePointerUp = useCallback(() => {
    resizeDragRef.current = null;
  }, []);

  /** Horizontal resize: drag handle between map and route list. Drag left = wider list. */
  const handleListResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    listResizeDragRef.current = { startX: e.clientX, startW: listWidth };
  }, [listWidth]);

  const handleListResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!listResizeDragRef.current) return;
    // Drag left (negative delta from startX) widens the right panel.
    const delta = listResizeDragRef.current.startX - e.clientX;
    const newW  = Math.max(180, Math.min(520, listResizeDragRef.current.startW + delta));
    setListWidth(newW);
  }, []);

  const handleListResizePointerUp = useCallback(() => {
    listResizeDragRef.current = null;
  }, []);

  /** Derive marker view-models from route items that have an explicit location. */
  const mapMarkers = useMemo((): MarkerViewModel[] => {
    const result: MarkerViewModel[] = [];
    for (const section of route.sections) {
      for (const item of section.items) {
        if (!item.location) continue;
        const listPos = itemIndexMap.get(item.routeItemId);
        if (listPos === undefined) continue; // filtered out
        
        const task = item.isCustom ? undefined : taskMap.get(item.taskId);
        const label = item.isCustom
          ? (item.customName ?? 'Custom')
          : (task?.name ?? 'Task');
        const isCompleted = !item.isCustom && (task?.completed ?? false);
        
        result.push({
          routeItemId: item.routeItemId,
          listPos: listPos + 1,
          label,
          location: item.location,
          isCustom: item.isCustom ?? false,
          isCompleted,
          description: task?.description ?? item.customDescription,
          descriptionParts: task?.descriptionParts,
          notes: item.note,
          // Omit requirements that are N/A-ish so the tooltip stays clean.
          requirements: isNaReqs(task?.requirementsText) ? undefined : task?.requirementsText,
          requirementsParts: isNaReqs(task?.requirementsText) ? undefined : task?.requirementsParts,
        });
      }
    }
    return result;
  }, [route.sections, itemIndexMap, taskMap]);

  const routeItemLookup = useMemo(() => {
    const map = new Map<string, RouteItem>();
    for (const section of route.sections) {
      for (const item of section.items) {
        map.set(item.routeItemId, item);
      }
    }
    return map;
  }, [route.sections]);

  const placementItem = mapPlacementItemId ? routeItemLookup.get(mapPlacementItemId) ?? null : null;
  const placementLabel = useMemo(() => {
    if (!placementItem) return null;
    if (placementItem.isCustom) return placementItem.customName ?? 'Custom task';
    return taskMap.get(placementItem.taskId)?.name ?? 'Task';
  }, [placementItem, taskMap]);

  useEffect(() => {
    if (mapPlacementItemId && !routeItemLookup.has(mapPlacementItemId)) {
      setMapPlacementItemId(null);
    }
  }, [mapPlacementItemId, routeItemLookup]);

  // Scroll the viewport to the map section whenever a pin button is clicked.
  // Using a trigger counter so each click reliably fires the effect even if
  // the map was already visible. requestAnimationFrame defers the scroll until
  // after React has committed the mapVisible=true state to the DOM.
  useEffect(() => {
    if (scrollToMapTrigger === 0) return;
    const raf = requestAnimationFrame(() => {
      const mapEl = mapSectionRef.current;
      if (!mapEl) return;
      const appStickyBottom = getAppStickyBottom();
      const elementTop = window.scrollY + mapEl.getBoundingClientRect().top;
      window.scrollTo({
        top: Math.max(0, elementTop - appStickyBottom - 8),
        behavior: 'smooth',
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollToMapTrigger]);

  /**
   * Called when a map marker is clicked.
   * Sets the shared focused item — the map list and main planner highlight will
   * update via props/state. Does NOT scroll the page to the big planner.
   */
  const handleMarkerClick = useCallback((routeItemId: string) => {
    setMapFocusedItemId(routeItemId);
  }, []);

  /**
   * Called when the user clicks a row in the compact map-side route list.
   * Same effect as a marker click — sets focus, map panel flies to the marker.
   */
  const handleSelectMapItem = useCallback((routeItemId: string) => {
    setMapFocusedItemId(routeItemId);
  }, []);

  /** Called when a list row's map-pin button is clicked — pans map to that marker. */
  const handleFocusOnMap = useCallback((routeItemId: string) => {
    setMapVisible(true);
    setMapFocusedItemId(routeItemId);
    // Scroll viewport to the map section so the user sees the result immediately.
    setScrollToMapTrigger((t) => t + 1);
  }, []);

  const handleStartPlaceLocation = useCallback((routeItemId: string) => {
    setMapVisible(true);
    setMapFocusedItemId(routeItemId);
    setMapPlacementItemId(routeItemId);
    // Scroll viewport to the map so the user can click to place the pin.
    setScrollToMapTrigger((t) => t + 1);
  }, []);

  const handleStartPlaceLocationNoScroll = useCallback((routeItemId: string) => {
    setMapFocusedItemId(routeItemId);
    setMapPlacementItemId(routeItemId);
  }, []);

  const handleCancelPlaceLocation = useCallback(() => {
    setMapPlacementItemId(null);
  }, []);

  const handleMapPlacement = useCallback((location: RouteLocation) => {
    if (!mapPlacementItemId) return;
    onSetRouteItemLocation(mapPlacementItemId, location);
    setMapFocusedItemId(mapPlacementItemId);
    setMapPlacementItemId(null);
  }, [mapPlacementItemId, onSetRouteItemLocation]);

  const handleClearLocation = useCallback((routeItemId: string) => {
    onSetRouteItemLocation(routeItemId, null);
    if (mapPlacementItemId === routeItemId) {
      setMapPlacementItemId(null);
    }
  }, [mapPlacementItemId, onSetRouteItemLocation]);

  // ── Export state ───────────────────────────────────────────────────────────
  const [exportStatus, setExportStatus] = useState<'idle' | 'copied'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  // ── Share state ────────────────────────────────────────────────────────────
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);
  // Fallback URL shown in a copyable input when clipboard write is unavailable
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExportStatus('idle');
    if (!route.name.trim()) {
      setExportError('Route name cannot be blank before exporting.');
      return;
    }
    if (itemCount === 0) {
      setExportError('Add at least one task before exporting.');
      return;
    }
    setExportError(null);
    const payload = buildPluginExportPayload(route, allTasks);
    const json = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(json);
      setExportStatus('copied');
      setTimeout(() => setExportStatus((s) => (s === 'copied' ? 'idle' : s)), 3000);
    } catch {
      setExportError('Clipboard unavailable — could not copy the route.');
    }
  }, [route, itemCount, allTasks]);

  /** Download the current route as a CSV file for use in spreadsheets. */
  const handleExportCsv = useCallback(() => {
    if (itemCount === 0) return;
    downloadRouteCsv(route, taskMap);
  }, [route, taskMap, itemCount]);

  const handleShare = useCallback(async () => {
    setShareError(null);
    setShareFallbackUrl(null);
    setShareStatus('idle');
    if (!route.name.trim()) {
      setShareError('Route name cannot be blank before sharing.');
      return;
    }
    if (itemCount === 0) {
      setShareError('Add at least one task before sharing.');
      return;
    }
    const result = await createShareLink(route, allTasks);
    if (!result.ok) {
      setShareError(result.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus((s) => (s === 'copied' ? 'idle' : s)), 3000);
    } catch {
      // Clipboard blocked (common on some mobile browsers) — show a copyable fallback
      setShareFallbackUrl(result.url);
      setShareError('Could not copy automatically — copy the link below:');
    }
  }, [route, itemCount, allTasks]);

  // ── Import state ───────────────────────────────────────────────────────────
  const [importStatus, setImportStatus] = useState<'idle' | 'success'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  /** Plugin route awaiting user confirmation before replacing the active route. */
  const [pendingImportRoute, setPendingImportRoute] = useState<{ route: Route; info: string } | null>(null);
  const [showImportHelp, setShowImportHelp] = useState(false);
  const importHelpRef = useRef<HTMLDivElement>(null);
  const [mobileImportOpen, setMobileImportOpen] = useState(false);
  const [mobileImportText, setMobileImportText] = useState('');

  // ── Spreadsheet import state ───────────────────────────────────────────────
  const [spreadsheetImportOpen, setSpreadsheetImportOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (importHelpRef.current && !importHelpRef.current.contains(e.target as Node)) {
        setShowImportHelp(false);
      }
    }
    if (showImportHelp) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showImportHelp]);

  const handleImportOpen = useCallback(async () => {
    setImportError(null);
    setImportInfo(null);
    let clipboardText = '';
    try {
      if (navigator.clipboard?.readText) {
        clipboardText = (await navigator.clipboard.readText()).trim();
      }
    } catch {
      // Permission denied or unavailable.
    }
    if (!clipboardText) {
      setImportError('Clipboard was empty or unavailable — copy a route export first.');
      return;
    }
    const result = parsePluginRoute(clipboardText, allTasks);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    const infoParts: string[] = [];
    const customNote = result.customCount > 0 ? ` (${result.customCount} custom)` : '';
    infoParts.push(`Imported ${result.imported} item${result.imported !== 1 ? 's' : ''}${customNote}`);
    if (result.unmapped > 0) {
      infoParts.push(`preserved ${result.unmapped} task${result.unmapped !== 1 ? 's' : ''} not found in current dataset`);
    }
    const info = infoParts.join(', ') + '.';
    if (isMeaningfulRoute(route)) {
      setPendingImportRoute({ route: result.route, info });
    } else {
      onReplaceRoute(result.route);
      setImportInfo(info);
      setImportStatus('success');
      setTimeout(() => setImportStatus((s) => (s === 'success' ? 'idle' : s)), 3000);
    }
  }, [allTasks, onReplaceRoute, route]);

  const handleMobileImportSubmit = useCallback(() => {
    setImportError(null);
    setImportInfo(null);
    const clipboardText = mobileImportText.trim();
    if (!clipboardText) {
      setImportError('Paste a route export JSON first.');
      return;
    }
    const result = parsePluginRoute(clipboardText, allTasks);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    const infoParts: string[] = [];
    const customNote = result.customCount > 0 ? ` (${result.customCount} custom)` : '';
    infoParts.push(`Imported ${result.imported} item${result.imported !== 1 ? 's' : ''}${customNote}`);
    if (result.unmapped > 0) {
      infoParts.push(`preserved ${result.unmapped} task${result.unmapped !== 1 ? 's' : ''} not found in current dataset`);
    }
    const info = infoParts.join(', ') + '.';
    if (isMeaningfulRoute(route)) {
      setPendingImportRoute({ route: result.route, info });
    } else {
      onReplaceRoute(result.route);
      setImportInfo(info);
      setMobileImportOpen(false);
      setMobileImportText('');
      setImportStatus('success');
      setTimeout(() => setImportStatus((s) => (s === 'success' ? 'idle' : s)), 3000);
    }
  }, [allTasks, onReplaceRoute, mobileImportText, route]);

  // ── Local save/load state ──────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteEntry[]>(loadSavedRoutes);
  /** Saved slot entry awaiting user confirmation before replacing the active route. */
  const [pendingLoadEntry, setPendingLoadEntry] = useState<SavedRouteEntry | null>(null);
  const loadMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loadMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (loadMenuRef.current && !loadMenuRef.current.contains(e.target as Node)) {
        setLoadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [loadMenuOpen]);

  const handleSaveRoute = useCallback(() => {
    const name = route.name.trim() || 'Untitled Route';
    const now = new Date().toISOString();
    setSavedRoutes((prev) => {
      const filtered = prev.filter((en) => en.name !== name);
      const next: SavedRouteEntry[] = [{ name, savedAt: now, route }, ...filtered];
      persistSavedRoutes(next);
      return next;
    });
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
  }, [route]);

  const handleLoadRoute = useCallback((entry: SavedRouteEntry) => {
    if (isMeaningfulRoute(route)) {
      setPendingLoadEntry(entry);
      setLoadMenuOpen(false);
    } else {
      onReplaceRoute(entry.route);
      setLoadMenuOpen(false);
    }
  }, [onReplaceRoute, route]);

  const handleDeleteSaved = useCallback((name: string) => {
    setSavedRoutes((prev) => {
      const next = prev.filter((en) => en.name !== name);
      persistSavedRoutes(next);
      return next;
    });
  }, []);

  // ── Add section inline state ───────────────────────────────────────────────
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const newSectionInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingSectionOpen) {
      setNewSectionName('');
      newSectionInputRef.current?.focus();
    }
  }, [addingSectionOpen]);

  const commitAddSection = useCallback(() => {
    onAddSection(newSectionName.trim() || 'New Section');
    setAddingSectionOpen(false);
    setNewSectionName('');
  }, [newSectionName, onAddSection]);

  // ── Add custom task inline state ───────────────────────────────────────────
  const [addingCustomToSection, setAddingCustomToSection] = useState<string | null>(null);

  const handleAddCustomConfirm = useCallback(
    (sectionId: string, name: string) => {
      onAddCustomTask(sectionId, name);
      setAddingCustomToSection(null);
    },
    [onAddCustomTask],
  );

  // ── DnD setup (item reorder) ───────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [draggedRouteItemId, setDraggedRouteItemId] = useState<string | null>(null);
  const [crossSectionPreview, setCrossSectionPreview] = useState<CrossSectionPreview | null>(null);

  const resolveItemSection = useCallback(
    (routeItemId: string): { sectionId: string; index: number } | null => {
      for (const section of route.sections) {
        const index = section.items.findIndex((item) => item.routeItemId === routeItemId);
        if (index !== -1) {
          return { sectionId: section.id, index };
        }
      }
      return null;
    },
    [route.sections],
  );

  const resolveDestinationFromOverId = useCallback(
    (overId: string): { sectionId: string; index: number } | null => {
      const endSectionId = parseSectionEndDropId(overId);
      if (endSectionId) {
        const section = route.sections.find((candidate) => candidate.id === endSectionId);
        if (section) {
          return { sectionId: section.id, index: section.items.length };
        }
      }

      const emptySection = route.sections.find((section) => section.id === overId);
      if (emptySection) {
        return { sectionId: emptySection.id, index: 0 };
      }

      for (const section of route.sections) {
        const index = section.items.findIndex((item) => item.routeItemId === overId);
        if (index !== -1) {
          return { sectionId: section.id, index };
        }
      }

      return null;
    },
    [route.sections],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isRunMode) return;
      const activeId = event.active.id as string;
      if (!resolveItemSection(activeId)) return;
      setDraggedRouteItemId(activeId);
      setCrossSectionPreview(null);
    },
    [isRunMode, resolveItemSection],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (isRunMode) return;

      const activeId = event.active.id as string;
      const source = resolveItemSection(activeId);
      if (!source) {
        setCrossSectionPreview(null);
        return;
      }

      if (!event.over) {
        setCrossSectionPreview(null);
        return;
      }

      const destination = resolveDestinationFromOverId(event.over.id as string);
      if (!destination) {
        setCrossSectionPreview(null);
        return;
      }

      if (destination.sectionId === source.sectionId) {
        setCrossSectionPreview(null);
        return;
      }

      setCrossSectionPreview({
        activeRouteItemId: activeId,
        sourceSectionId: source.sectionId,
        destSectionId: destination.sectionId,
        destIndex: destination.index,
      });
    },
    [isRunMode, resolveItemSection, resolveDestinationFromOverId],
  );

  const handleDragCancel = useCallback(() => {
    setDraggedRouteItemId(null);
    setCrossSectionPreview(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedRouteItemId(null);
      if (isRunMode) return;

      const { active, over } = event;

      if (crossSectionPreview && crossSectionPreview.activeRouteItemId === (active.id as string)) {
        onMoveItem(active.id as string, crossSectionPreview.destSectionId, crossSectionPreview.destIndex);
        setCrossSectionPreview(null);
        return;
      }

      setCrossSectionPreview(null);
      if (!over || active.id === over.id) return;

      const draggedId = active.id as string;
      const destination = resolveDestinationFromOverId(over.id as string);
      if (destination) {
        onMoveItem(draggedId, destination.sectionId, destination.index);
      }
    },
    [onMoveItem, isRunMode, crossSectionPreview, resolveDestinationFromOverId],
  );

  // ── DnD setup (section reorder) ────────────────────────────────────────────
  const [isDraggingSection, setIsDraggingSection] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSectionDragStart = useCallback((event: DragStartEvent) => {
    if (isRunMode) return;
    setIsDraggingSection(true);
    setDraggingSectionId(event.active.id as string);
  }, [isRunMode]);

  const handleSectionDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (isRunMode) return;
      setIsDraggingSection(false);
      setDraggingSectionId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = route.sections.findIndex((s) => s.id === active.id);
      const newIdx = route.sections.findIndex((s) => s.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) onReorderSections(oldIdx, newIdx);
    },
    [route.sections, onReorderSections, isRunMode],
  );

  const handleSectionDragCancel = useCallback(() => {
    setIsDraggingSection(false);
    setDraggingSectionId(null);
  }, []);

  const handleSectionJump = useCallback((sectionId: string) => {
    const el = document.getElementById(`route-section-${sectionId}`);
    if (!el) return;
    // Measure the actual visible bottom of the app's fixed sticky header.
    const appStickyBottom = getAppStickyBottom();
    // Also account for the Route Planner table's own sticky <thead>.
    const tableHead = el.closest('table')?.querySelector('thead');
    const tableHeadHeight = tableHead ? tableHead.getBoundingClientRect().height : 0;
    const elementTop = window.scrollY + el.getBoundingClientRect().top;
    window.scrollTo({
      top: Math.max(0, elementTop - appStickyBottom - tableHeadHeight - 8),
      behavior: 'smooth',
    });
  }, []);

  // ── Reset route confirmation state ─────────────────────────────────────────
  const [confirmReset, setConfirmReset] = useState(false);
  const handleResetConfirm = useCallback(() => {
    onResetRoute();
    setConfirmReset(false);
  }, [onResetRoute]);

  return (
    <div className="border border-wiki-border dark:border-wiki-border-dark text-[13px]">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="bg-wiki-mid dark:bg-wiki-mid-dark px-3 py-2 flex items-center justify-between border-b border-wiki-border dark:border-wiki-border-dark flex-wrap gap-y-2">
        {/* Left: title + primary planner-building action */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">
            Route Planner
          </span>

          <div className="flex items-center ml-2 bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark rounded-sm overflow-hidden text-[12px] font-medium">
            <button
              onClick={() => setIsRunMode(false)}
              className={`px-3 py-1 transition-colors ${
                !isRunMode 
                  ? 'bg-wiki-link dark:bg-wiki-link-dark text-white' 
                  : 'text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark cursor-pointer'
              }`}
            >
              Edit Mode
            </button>
            <button
              onClick={() => setIsRunMode(true)}
              className={`px-3 py-1 transition-colors ${
                 isRunMode 
                  ? 'bg-wiki-link dark:bg-wiki-link-dark text-white' 
                  : 'text-wiki-text dark:text-wiki-text-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark cursor-pointer'
              }`}
            >
              Run Mode
            </button>
          </div>
        </div>
        {/* Right: route management controls */}
        <div className="flex items-center justify-end gap-2 flex-wrap flex-1 ml-auto">
          {itemCount > 0 && (
            <span className="text-wiki-text/85 dark:text-wiki-text-dark/85 font-semibold text-[13px] tabular-nums">
              {itemCount} task{itemCount !== 1 ? 's' : ''} &middot; {totalPoints} pts
            </span>
          )}

          {/* Map toggle */}
          <button
            onClick={() => {
              setMapVisible((v) => {
                const next = !v;
                if (!next) setMapPlacementItemId(null);
                return next;
              });
            }}
            title={mapVisible ? 'Hide route map' : 'Show route map'}
            className={[
              'flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium border transition-colors flex-shrink-0',
              mapVisible
                ? 'bg-wiki-link dark:bg-wiki-link-dark text-white border-transparent'
                : 'border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark',
            ].join(' ')}
          >
            <MapIcon />
            Map
            {mapMarkers.length > 0 && (
              <span className={`text-[10px] font-normal ${mapVisible ? 'opacity-80' : 'opacity-60'}`}>
                ({mapMarkers.length})
              </span>
            )}
          </button>

          {/* Utility cluster: Import + Export + Share grouped so they wrap as one unit on mobile */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="relative flex items-center gap-1.5" ref={importHelpRef}>
            <button
              onClick={() => setShowImportHelp((v) => !v)}
              aria-label="Help with route import"
              aria-expanded={showImportHelp}
              className="w-[18px] h-[18px] flex items-center justify-center rounded-full border text-[10px] font-bold leading-none border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-link dark:hover:text-wiki-link-dark hover:border-wiki-link dark:hover:border-wiki-link-dark transition-colors select-none cursor-pointer"
            >
              ?
            </button>
            {showImportHelp && (
              <div className="absolute right-0 top-6 z-50 w-[260px] sm:w-[420px] bg-wiki-article dark:bg-wiki-article-dark border border-wiki-border dark:border-wiki-border-dark shadow-md p-3 text-[12.5px] text-wiki-text dark:text-wiki-text-dark text-left">
                <p className="font-semibold mb-2 text-[13px] text-wiki-text dark:text-wiki-text-dark">
                  How to import and export routes
                </p>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold text-[11px] uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark mb-1">
                      1. From the Task Tracker plugin
                    </h4>
                    <ol className="list-decimal list-inside pl-1 space-y-1 text-wiki-muted dark:text-wiki-muted-dark leading-snug">
                      <li>Install the <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Task Tracker</span> RuneLite plugin by <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Reldo.net</span></li>
                      <li>Open the plugin and ensure the correct league is selected</li>
                      <li>Select <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Route</span> in the sort dropdown menu</li>
                      <li>Select your desired route from the next dropdown menu</li>
                      <li>Click the <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">three dots [...]</span> next to that dropdown</li>
                      <li>Click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Export Active Route to Clipboard</span></li>
                      <li>Click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Import</span> below — or tap the <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Import</span> button above</li>
                    </ol>
                  </div>
                  <div className="border-t border-wiki-border dark:border-wiki-border-dark pt-2">
                    <h4 className="font-semibold text-[11px] uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark mb-1">
                      2. From other route sites
                    </h4>
                    <ol className="list-decimal list-inside pl-1 space-y-1 text-wiki-muted dark:text-wiki-muted-dark leading-snug">
                      <li>Click that site's <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Export by plugin/json</span> option</li>
                      <li>Your route will be copied to your clipboard</li>
                      <li>Click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Import</span> above</li>
                    </ol>
                  </div>
                  <div className="border-t border-wiki-border dark:border-wiki-border-dark pt-2">
                    <h4 className="font-semibold text-[11px] uppercase tracking-wider text-wiki-text dark:text-wiki-text-dark mb-1">
                      Exporting for RuneLite
                    </h4>
                    <p className="text-wiki-muted dark:text-wiki-muted-dark leading-snug">
                      Click <span className="font-semibold text-wiki-text dark:text-wiki-text-dark">Export</span> to copy your route JSON. You can import this directly into the Task Tracker RuneLite plugin to see it in-game!
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <button
              onClick={() => void handleImportOpen()}
              title="Import route from clipboard"
              className="hidden sm:block px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => {
                setImportError(null);
                setImportStatus('idle');
                setMobileImportOpen((v) => !v);
              }}
              title="Paste route JSON to import"
              className="sm:hidden px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors"
            >
              Import
            </button>
            {importStatus === 'success' && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] flex items-start gap-2 max-w-xs">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-green-700 dark:text-green-400" aria-hidden="true">
                  <path d="M10 2 4.5 8.5 2 6l-1 1 3.5 3.5 6.5-7.5z"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-green-700 dark:text-green-400">Route imported from clipboard.</span>
                  {importInfo && (
                    <span className="block text-amber-700 dark:text-amber-400 mt-0.5">{importInfo}</span>
                  )}
                </div>
                <button
                  onClick={() => { setImportStatus('idle'); setImportInfo(null); }}
                  className="flex-shrink-0 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {importError && importStatus !== 'success' && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] flex items-start gap-2 max-w-xs">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true">
                  <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
                </svg>
                <span className="flex-1 text-red-600 dark:text-red-400">{importError}</span>
                <button
                  onClick={() => setImportError(null)}
                  className="flex-shrink-0 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          {/* Spreadsheet import button */}
          <button
            onClick={() => {
              setSpreadsheetImportOpen((v) => !v);
            }}
            title="Import tasks from a spreadsheet or CSV file"
            className={[
              'px-2.5 py-1 text-[12px] font-medium border transition-colors flex-shrink-0',
              spreadsheetImportOpen
                ? 'bg-wiki-link dark:bg-wiki-link-dark text-white border-transparent'
                : 'border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark',
            ].join(' ')}
          >
            Spreadsheet
          </button>
          {/* CSV export — downloads a spreadsheet-friendly file */}
          <button
            onClick={handleExportCsv}
            disabled={itemCount === 0}
            title={itemCount === 0 ? 'Add tasks before exporting' : 'Download route as a CSV spreadsheet'}
            className="px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            CSV
          </button>
          {/* Export button with anchored status popup */}
          <div className="relative">
            <button
              onClick={() => void handleExport()}
              title="Copy route JSON to clipboard"
              className="px-2.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors"
            >
              Export
            </button>
            {exportError && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] text-red-600 dark:text-red-400 flex items-start gap-2 max-w-xs">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden="true">
                  <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
                </svg>
                <span className="flex-1">{exportError}</span>
                <button
                  onClick={() => setExportError(null)}
                  className="flex-shrink-0 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {exportStatus === 'copied' && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] text-green-700 dark:text-green-400 flex items-center gap-2 whitespace-nowrap">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0" aria-hidden="true">
                  <path d="M10 2 4.5 8.5 2 6l-1 1 3.5 3.5 6.5-7.5z"/>
                </svg>
                Route JSON copied to clipboard.
              </div>
            )}
          </div>

          {/* Thin separator between clipboard utilities and the share action */}
          <div className="h-4 w-px bg-wiki-border dark:bg-wiki-border-dark mx-0.5" aria-hidden="true" />

          {/* Share button — slightly distinct border to signal a different action */}
          <div className="relative">
            <button
              onClick={() => void handleShare()}
              title="Generate a shareable link for this route"
              className="px-2.5 py-1 text-[12px] font-medium border border-wiki-link/40 dark:border-wiki-link-dark/40 text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors"
            >
              Share
            </button>
            {shareStatus === 'copied' && !shareError && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] text-green-700 dark:text-green-400 flex items-center gap-2 whitespace-nowrap">
                <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0" aria-hidden="true">
                  <path d="M10 2 4.5 8.5 2 6l-1 1 3.5 3.5 6.5-7.5z"/>
                </svg>
                Route link copied to clipboard.
              </div>
            )}
            {shareError && (
              <div className="absolute top-full right-0 mt-1 z-30 bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md px-2.5 py-1.5 text-[12px] flex flex-col gap-1.5 max-w-xs">
                <div className="flex items-start gap-2">
                  <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true">
                    <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
                  </svg>
                  <span className="flex-1 text-red-600 dark:text-red-400">{shareError}</span>
                  <button
                    onClick={() => { setShareError(null); setShareFallbackUrl(null); }}
                    className="flex-shrink-0 text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
                {shareFallbackUrl && (
                  <input
                    type="text"
                    readOnly
                    value={shareFallbackUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full px-1.5 py-1 text-[11px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark focus:outline-none focus:border-wiki-link dark:focus:border-wiki-link-dark cursor-text select-all"
                    aria-label="Shareable route link"
                  />
                )}
              </div>
            )}
          </div>
          </div>{/* end utility cluster */}
        </div>
      </div>

      {/* ── Mobile Input/Output Panels ──────────────────────────────────── */}
      {mobileImportOpen && (
        <div className="sm:hidden bg-wiki-surface dark:bg-wiki-surface-dark px-3 py-3 border-b border-wiki-border dark:border-wiki-border-dark">
          <p className="text-[12px] font-semibold text-wiki-text dark:text-wiki-text-dark mb-1.5">
            Paste your route JSON:
          </p>
          <textarea
            value={mobileImportText}
            onChange={(e) => setMobileImportText(e.target.value)}
            placeholder="Paste exported route JSON here…"
            className="w-full min-h-[80px] text-[13px] px-2 py-1.5 bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-muted dark:placeholder:text-wiki-muted-dark focus:outline-none focus:border-wiki-link dark:focus:border-wiki-link-dark resize-y"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setMobileImportOpen(false)}
              className="px-3 py-1 text-[12px] border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleMobileImportSubmit}
              className="px-3 py-1 text-[12px] font-semibold text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-90 transition-opacity"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* ── Spreadsheet import panel ─────────────────────────────────────── */}
      {spreadsheetImportOpen && (
        <SpreadsheetImportModal
          allTasks={allTasks}
          existingRoute={route}
          onReplaceRoute={onReplaceRoute}
          onClose={() => setSpreadsheetImportOpen(false)}
        />
      )}

      {/* ── Plugin import confirmation banner ─────────────────────────────────── */}
      {pendingImportRoute !== null && (
        <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-300 dark:border-amber-700/50 text-[12.5px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" aria-hidden="true">
            <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
          </svg>
          <span className="flex-1">
            Route found ({pendingImportRoute.info}) — loading it will replace your current route.
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                onReplaceRoute(pendingImportRoute.route);
                setImportInfo(pendingImportRoute.info);
                setImportStatus('success');
                setTimeout(() => setImportStatus((s) => (s === 'success' ? 'idle' : s)), 3000);
                setPendingImportRoute(null);
              }}
              className="px-2 py-0.5 text-[11.5px] font-medium bg-wiki-link dark:bg-wiki-link-dark text-white rounded hover:opacity-90 transition-opacity"
            >
              Load Route
            </button>
            <button
              onClick={() => setPendingImportRoute(null)}
              className="px-2 py-0.5 text-[11.5px] font-medium text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Load saved route confirmation banner ──────────────────────────────── */}
      {pendingLoadEntry !== null && (
        <div className="px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-300 dark:border-amber-700/50 text-[12.5px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" aria-hidden="true">
            <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0zm.75 8.5h-1.5v-1.5h1.5v1.5zm0-3h-1.5v-3h1.5v3z"/>
          </svg>
          <span className="flex-1">
            Load saved route <strong>"{pendingLoadEntry.name}"</strong>? This will replace your current route.
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { onReplaceRoute(pendingLoadEntry.route); setPendingLoadEntry(null); }}
              className="px-2 py-0.5 text-[11.5px] font-medium bg-wiki-link dark:bg-wiki-link-dark text-white rounded hover:opacity-90 transition-opacity"
            >
              Load
            </button>
            <button
              onClick={() => setPendingLoadEntry(null)}
              className="px-2 py-0.5 text-[11.5px] font-medium text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Route name field ────────────────────────────────────────────── */}
      <div className="bg-wiki-surface dark:bg-wiki-surface-dark px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark flex items-center gap-2 flex-wrap">
        <label
          htmlFor="route-name-input"
          className="font-semibold whitespace-nowrap text-wiki-text dark:text-wiki-text-dark"
        >
          Route name:
        </label>
        <input
          id="route-name-input"
          type="text"
          value={route.name}
          onChange={(e) => {
            onUpdateRouteName(e.target.value);
            if (exportError) setExportError(null);
          }}
          maxLength={80}
          disabled={isRunMode}
          placeholder="New Route"
          className="w-48 flex-shrink min-w-0 px-2 py-0.5 bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-border dark:border-wiki-border-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/50 dark:placeholder:text-wiki-muted-dark focus:outline-none focus:border-wiki-link dark:focus:border-wiki-link-dark text-[13px] disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {/* Local save */}
        <button
          onClick={handleSaveRoute}
          title={`Save "${route.name.trim() || 'Untitled Route'}" to browser storage`}
          className="px-2 py-0.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-article dark:hover:bg-wiki-article-dark transition-colors whitespace-nowrap"
        >
          {saveStatus === 'saved' ? '✓ Saved' : 'Save'}
        </button>
        {/* Local load */}
        <div ref={loadMenuRef} className="relative">
          <button
            onClick={() => setLoadMenuOpen((v) => !v)}
            title="Load a previously saved route"
            className="px-2 py-0.5 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-article dark:hover:bg-wiki-article-dark transition-colors whitespace-nowrap"
          >
            Load ▾
          </button>
          {loadMenuOpen && (
            <div className="absolute top-full left-0 mt-0.5 z-50 min-w-[260px] max-w-xs bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-lg">
              {savedRoutes.length === 0 ? (
                <p className="px-3 py-2.5 text-[12px] text-wiki-muted dark:text-wiki-muted-dark italic">
                  No saved routes yet.
                </p>
              ) : (
                <ul className="max-h-64 overflow-y-auto">
                  {savedRoutes.map((entry) => (
                    <li
                      key={entry.name}
                      className="flex items-center border-b border-wiki-border dark:border-wiki-border-dark last:border-0 hover:bg-wiki-article dark:hover:bg-wiki-article-dark"
                    >
                      <button
                        onClick={() => handleLoadRoute(entry)}
                        className="flex-1 text-left px-3 py-2 min-w-0"
                      >
                        <span className="block text-[12px] font-medium text-wiki-text dark:text-wiki-text-dark truncate">
                          {entry.name}
                        </span>
                        <span className="block text-[10px] text-wiki-muted dark:text-wiki-muted-dark">
                          {new Date(entry.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSaved(entry.name); }}
                        title={`Delete saved route "${entry.name}"`}
                        aria-label={`Delete saved route "${entry.name}"`}
                        className="flex items-center justify-center p-2 text-wiki-muted dark:text-wiki-muted-dark hover:text-red-600 dark:hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <XIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {/* Reset Route — inline confirmation */}
        {confirmReset ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[11px] text-wiki-text dark:text-wiki-text-dark whitespace-nowrap">
              Clear route?
            </span>
            <button
              onClick={handleResetConfirm}
              className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 dark:bg-red-700 hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              Reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="px-1.5 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            title="Reset the current route back to a blank state"
            className="px-2 py-0.5 text-[12px] font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap flex-shrink-0"
          >
            Reset Route
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById('task-list');
            if (!el) return;
            const appStickyBottom = getAppStickyBottom();
            const elementTop = window.scrollY + el.getBoundingClientRect().top;
            window.scrollTo({ top: Math.max(0, elementTop - appStickyBottom - 8), behavior: 'smooth' });
          }}
          className="ml-auto text-[12px] font-medium text-wiki-link dark:text-wiki-link-dark hover:underline whitespace-nowrap flex-shrink-0"
        >
          ↓ Jump to Task List
        </button>
      </div>

      {/* ── Section order bar (drag chips & add section) ──────── */}
      <div className="bg-wiki-article dark:bg-wiki-article-dark px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {route.sections.length > 0 && (
              <DndContext
                sensors={sectionSensors}
                collisionDetection={closestCenter}
                onDragStart={handleSectionDragStart}
                onDragEnd={handleSectionDragEnd}
                onDragCancel={handleSectionDragCancel}
              >
                <SortableContext
                  items={route.sections.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {route.sections.map((s) => (
                      <SortableSectionChip
                        key={s.id}
                        section={s}
                        isRunMode={isRunMode}
                        isBeingDragged={draggingSectionId === s.id}
                        onJump={handleSectionJump}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {draggingSectionId ? (
                    <div className="flex items-center gap-1.5 rounded border border-wiki-link dark:border-wiki-link-dark bg-wiki-surface dark:bg-wiki-surface-dark text-[12px] text-wiki-text dark:text-wiki-text-dark shadow-md opacity-90 select-none px-2.5 py-1.5">
                      <GripIcon />
                      <span className="font-medium">
                        {route.sections.find((s) => s.id === draggingSectionId)?.name ?? ''}
                      </span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            {!isRunMode && (
              addingSectionOpen ? (
                <div className="flex items-center gap-1 ml-1">
                  <input
                    ref={newSectionInputRef}
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitAddSection();
                      if (e.key === 'Escape') setAddingSectionOpen(false);
                    }}
                    placeholder="Section name…"
                    maxLength={80}
                    className="w-36 px-1.5 py-1 text-[12px] bg-wiki-bg dark:bg-wiki-bg-dark border border-wiki-link dark:border-wiki-link-dark text-wiki-text dark:text-wiki-text-dark placeholder:text-wiki-text/50 dark:placeholder:text-wiki-muted-dark focus:outline-none"
                  />
                  <button
                    onClick={commitAddSection}
                    className="px-2 py-1 text-[12px] font-semibold text-white bg-wiki-link dark:bg-wiki-link-dark hover:opacity-90 transition-opacity"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAddingSectionOpen(false)}
                    className="px-1.5 py-1 text-[12px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingSectionOpen(true)}
                  title="Add a new section to the route"
                  className="px-2 py-1 ml-1 text-[12px] border border-dashed border-wiki-link dark:border-wiki-link-dark text-wiki-link dark:text-wiki-link-dark hover:bg-wiki-surface dark:hover:bg-wiki-surface-dark transition-colors flex items-center gap-1"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                    <path d="M8 2a1 1 0 0 0-1 1v4H3a1 1 0 1 0 0 2h4v4a1 1 0 1 0 2 0V9h4a1 1 0 1 0 0-2H9V3a1 1 0 0 0-1-1Z"/>
                  </svg>
                  Section
                </button>
              )
            )}
          </div>
          {route.sections.length > 1 && (
            <span className="text-[11px] text-wiki-muted dark:text-wiki-muted-dark whitespace-nowrap flex-shrink-0 italic">
              Drag handle to reorder &middot; click section name to jump
            </span>
          )}
        </div>
      </div>

      {/* ── Route map (collapsible) ────────────────────────────────────────── */}
      {mapVisible && (
        <div
          ref={mapSectionRef}
          className="relative z-0 border-t border-wiki-border dark:border-wiki-border-dark"
        >
          {placementItem && placementLabel && (
            <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 border-b border-wiki-border dark:border-wiki-border-dark bg-wiki-surface dark:bg-wiki-surface-dark flex items-center justify-between gap-2">
              <p className="text-[12px] text-wiki-text dark:text-wiki-text-dark leading-snug">
                Placing location for <span className="font-semibold">{placementLabel}</span>. Click the map to set it.
              </p>
              <button
                type="button"
                onClick={handleCancelPlaceLocation}
                className="px-2 py-0.5 text-[11px] font-medium border border-wiki-border dark:border-wiki-border-dark text-wiki-muted dark:text-wiki-muted-dark hover:text-wiki-text dark:hover:text-wiki-text-dark transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {/* Map + right route-list row */}
          <div
            className="flex flex-row"
            style={{ height: mapHeight }}
          >
            {/* Left: Leaflet map fills remaining width */}
            <div ref={mapContainerRef} className="flex-1 min-w-0 relative">
              <RouteMapPanel
                markers={mapMarkers}
                focusedItemId={mapFocusedItemId}
                onMarkerClick={handleMarkerClick}
                onMapClick={placementItem ? handleMapPlacement : undefined}
                isPlacementMode={Boolean(placementItem)}
                containerHeight={mapHeight}
              />
            </div>

            {/* Horizontal resize handle — desktop only */}
            <div
              className="hidden sm:flex w-2 cursor-ew-resize items-center justify-center bg-wiki-surface dark:bg-wiki-surface-dark border-l border-r border-wiki-border dark:border-wiki-border-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark transition-colors select-none touch-none flex-shrink-0 group"
              role="separator"
              aria-label="Drag to resize route list"
              onPointerDown={handleListResizePointerDown}
              onPointerMove={handleListResizePointerMove}
              onPointerUp={handleListResizePointerUp}
              onPointerCancel={handleListResizePointerUp}
            >
              <div className="w-0.5 h-8 rounded-full bg-wiki-border dark:bg-wiki-border-dark group-hover:bg-wiki-muted dark:group-hover:bg-wiki-muted-dark transition-colors" />
            </div>

            {/* Right: compact route list — desktop only, width controlled by drag */}
            <div
              className="hidden sm:flex flex-col bg-wiki-surface dark:bg-wiki-surface-dark overflow-hidden flex-shrink-0"
              style={{ width: listWidth }}
            >
              <MapRouteList
                sections={route.sections}
                taskMap={taskMap}
                itemIndexMap={itemIndexMap}
                markers={mapMarkers}
                focusedItemId={mapFocusedItemId}
                onSelectItem={handleSelectMapItem}
                isRunMode={isRunMode}
                orderedItemIds={orderedItemIds}
                onMoveItem={onMoveItem}
                onStartPlacement={handleStartPlaceLocationNoScroll}
                getMapRect={() => mapContainerRef.current?.getBoundingClientRect() ?? null}
              />
            </div>
          </div>

          {/* Vertical resize handle — desktop only */}
          <div
            className="hidden sm:flex h-2 cursor-ns-resize items-center justify-center border-t border-wiki-border dark:border-wiki-border-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark transition-colors select-none touch-none group"
            role="separator"
            aria-label="Drag to resize map"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
          >
            <div className="w-10 h-0.5 rounded-full bg-wiki-border dark:bg-wiki-border-dark group-hover:bg-wiki-muted dark:group-hover:bg-wiki-muted-dark transition-colors" />
          </div>
        </div>
      )}

      {/* ── Validation / status banners ──────────────────────────────────── */}
      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {itemCount === 0 && route.sections.length <= 1 && (
        <div className="bg-wiki-article dark:bg-wiki-article-dark px-3 py-5 text-center text-wiki-muted dark:text-wiki-muted-dark italic">
          No tasks yet —{' '}
          <span className="not-italic font-semibold text-wiki-link dark:text-wiki-link-dark">
            click any task
          </span>{' '}
          in the task list below, or{' '}
          <button
            className="font-semibold text-wiki-link dark:text-wiki-link-dark underline cursor-pointer bg-transparent border-0 p-0 text-[13px]"
            onClick={() => setAddingCustomToSection(route.sections[0]?.id ?? '')}
          >
            add a custom task
          </button>
          .
        </div>
      )}

      {/* ── Task list (shown when there are items OR multiple sections) ─── */}
      {(itemCount > 0 || route.sections.length > 1) && (
        layoutMode === 'mobile' ? (
          /* Mobile: card layout */
          <div className="p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleRouteItemIds}
                strategy={verticalListSortingStrategy}
              >
                {route.sections.map((section) => (
                  <MobileRouteSection
                    key={section.id}
                    section={section}
                    itemIndexMap={itemIndexMap}
                    taskMap={taskMap}
                    isRunMode={isRunMode}
                    onRemoveTask={onRemoveTask}
                    onEditCustomTask={onEditCustomTask}
                    onRenameSection={onRenameSection}
                    onRemoveSection={onRemoveSection}
                    addingCustomToSection={addingCustomToSection}
                    setAddingCustomToSection={setAddingCustomToSection}
                    onAddCustomConfirm={handleAddCustomConfirm}
                    isDraggingSection={isDraggingSection}
                    mapVisible={mapVisible}
                    onFocusOnMap={handleFocusOnMap}
                    onStartPlaceLocation={handleStartPlaceLocation}
                    onClearLocation={handleClearLocation}
                    focusedItemId={mapFocusedItemId}
                    placingRouteItemId={mapPlacementItemId}
                    crossSectionPreview={crossSectionPreview}
                    suppressCrossSectionShift={Boolean(crossSectionPreview && draggedRouteItemId)}
                    isDragActive={Boolean(draggedRouteItemId)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          /* Desktop/tablet: table layout */
          <div className="w-full relative">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
            >
              <table className="wikitable table-fixed border-separate border-spacing-0 min-w-[700px] sm:min-w-full">
                <thead>
                  <tr>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-1 py-2 font-semibold text-center w-12 cursor-default">#</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-center w-16 cursor-default">Area</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-left cursor-default">Name</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-left cursor-default">Task</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-left cursor-default">Requirements</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-center w-20 cursor-default">Pts</th>
                    <th style={{ top: 'var(--sticky-offset, 0px)' }} className="sticky z-20 bg-wiki-surface dark:bg-wiki-surface-dark border-b border-wiki-border dark:border-wiki-border-dark px-2 py-2 font-semibold text-center w-20 cursor-default"></th>
                  </tr>
                </thead>
                <SortableContext
                  items={visibleRouteItemIds}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {route.sections.map((section) => (
                      <TableSection
                        key={section.id}
                        section={section}
                        itemIndexMap={itemIndexMap}
                        taskMap={taskMap}
                        isRunMode={isRunMode}
                        onRemoveTask={onRemoveTask}
                        onEditCustomTask={onEditCustomTask}
                        onRenameSection={onRenameSection}
                        onRemoveSection={onRemoveSection}
                        addingCustomToSection={addingCustomToSection}
                        setAddingCustomToSection={setAddingCustomToSection}
                        onAddCustomConfirm={handleAddCustomConfirm}
                        isDraggingSection={isDraggingSection}
                        mapVisible={mapVisible}
                        onFocusOnMap={handleFocusOnMap}
                        onStartPlaceLocation={handleStartPlaceLocation}
                        onClearLocation={handleClearLocation}
                        focusedItemId={mapFocusedItemId}
                        placingRouteItemId={mapPlacementItemId}
                        crossSectionPreview={crossSectionPreview}
                        suppressCrossSectionShift={Boolean(crossSectionPreview && draggedRouteItemId)}
                        isDragActive={Boolean(draggedRouteItemId)}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </div>
        )
      )}
    </div>
  );
}

