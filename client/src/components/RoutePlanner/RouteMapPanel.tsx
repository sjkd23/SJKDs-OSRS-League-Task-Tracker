/**
 * RouteMapPanel — read-only Leaflet map for the Route Planner.
 *
 * Displays markers at explicit RouteItem locations on a surface-only map,
 * supports fit-to-route, and bidirectional list↔marker sync via focusedItemId.
 *
 * Design:
 *   - Desktop: 380px fixed height, collapsible via parent toggle
 *   - Mobile:  280px fixed height, shown only when parent opts in
 *   - Tile source: Explv's OSRS map tiles (GitHub raw, TMS format)
 *   - Coordinate system: Explv's OSRS → EPSG:3857 pixel projection
 *
 * Implementation note:
 *   Uses plain Leaflet (not react-leaflet's MapContainer) to avoid a
 *   react-leaflet v5 bug where React 18 StrictMode's cleanup/remount cycle
 *   leaves mapInstanceRef.current pointing at an already-removed map, so the
 *   guard `!mapInstanceRef.current` prevents re-initialisation and the panel
 *   renders blank forever. Managing the L.Map instance via useState makes it
 *   a proper reactive dependency: when cleanup sets it to null, all dependent
 *   effects no-op, and when the init effect creates a fresh map the tile and
 *   marker effects automatically re-run.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import type { RouteLocation } from '@/types/route';
import type { RichPart } from '@/types/task';
import { RichText } from '@/components/RichText/RichText';
import { RequirementsCell } from '@/components/TaskRow/RequirementsCell';
import {
  osrsToLatLng,
  latLngToOsrs,
  osrsTileUrl,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  OSRS_MAX_ZOOM,
  OSRS_MIN_ZOOM,
} from './map/osrsCoords';

// ─── View model ───────────────────────────────────────────────────────────────

/** Derived per-marker data shape passed into the map panel. */
export interface MarkerViewModel {
  routeItemId: string;
  /** 1-indexed position in the route list — rendered on the pin. */
  listPos: number;
  /** Display label (task name or custom item label). */
  label: string;
  location: RouteLocation;
  isCustom: boolean;
  isCompleted: boolean;
  /** Optional longer description for the task. */
  description?: string;
  /** Rich-text parts for the description (when available). */
  descriptionParts?: RichPart[];
  /** Optional user notes for this specific route item. */
  notes?: string;
  /** Optional requirements string (e.g. from task definitions). */
  requirements?: string;
  /** Rich-text parts for the requirements (when available). */
  requirementsParts?: RichPart[];
}

// ─── Marker icon factory ──────────────────────────────────────────────────────

function makeMarkerIcon(
  listPos: number,
  isSelected: boolean,
  isCompleted: boolean,
  isNextTask = false,
): L.DivIcon {
  // Priority: selected > next-task > completed > default
  const fill   = isSelected  ? '#0052cc'  // blue — selected
               : isNextTask  ? '#d95e00'  // orange — next destination
               : isCompleted ? '#3d7a3d'  // green — completed
               :               '#e82424'; // red — normal
  const stroke = isSelected  ? '#003a99'
               : isNextTask  ? '#8f3a00'
               : isCompleted ? '#1a4a1a'
               :               '#8b1a1a';
  const n     = String(listPos).slice(0, 3);
  const fsize = n.length > 2 ? 7 : 8;

  // Selected markers are largest; next-task markers are slightly larger than
  // normal so they stand out at a glance without competing with the selected pin.
  const w = isSelected ? 28 : isNextTask ? 26 : 24;
  const h = isSelected ? 35 : isNextTask ? 32 : 30;
  const cx = w / 2;

  const html = [
    `<svg width="${w}" height="${h}" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45))">`,
    `<path d="M12 1C6.477 1 2 5.477 2 11c0 4.75 4.5 10.5 10 18C18 21.5 22 15.75 22 11 22 5.477 17.523 1 12 1z"`,
    `      fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
    `<circle cx="12" cy="11" r="4.5" fill="white" opacity="0.35"/>`,
    `<text x="12" y="12" font-family="monospace,sans-serif" font-size="${fsize}" fill="white"`,
    `      text-anchor="middle" dominant-baseline="middle" font-weight="bold">${n}</text>`,
    `</svg>`,
  ].join('');

  return L.divIcon({
    className:    '',
    html,
    iconSize:     [w, h],
    iconAnchor:   [cx, h],
    tooltipAnchor: [0, -h],
  });
}

// ─── Tooltip HTML builder ────────────────────────────────────────────────────

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markerTooltipHtml(marker: MarkerViewModel): string {
  const badge =
    marker.isCompleted
      ? '<div style="font-size:10px;margin-top:2px;opacity:0.7">✓ Completed</div>'
      : marker.isCustom
      ? '<div style="font-size:10px;margin-top:2px;opacity:0.7">Custom task</div>'
      : '';
      
  let extraInfo = '';
  if (marker.description) {
    extraInfo += `<div style="font-size:11px;margin-top:4px;opacity:0.85"><span style="opacity:0.6">Desc:</span> ${escapeHtml(marker.description)}</div>`;
  }
  if (marker.requirements) {
    extraInfo += `<div style="font-size:11px;margin-top:2px;opacity:0.85"><span style="opacity:0.6">Reqs:</span> ${escapeHtml(marker.requirements)}</div>`;
  }
  if (marker.notes) {
    extraInfo += `<div style="font-size:11px;margin-top:2px;opacity:0.85;font-style:italic"><span style="opacity:0.6">Notes:</span> ${escapeHtml(marker.notes)}</div>`;
  }

  return (
    `<div style="font-size:12px;line-height:1.4">` +
    `<div><span style="font-weight:700">${marker.listPos}.</span> ` +
    `<span style="font-weight:600">${escapeHtml(marker.label)}</span></div>` +
    badge +
    extraInfo +
    `</div>`
  );
}

// ─── Panel props ──────────────────────────────────────────────────────────────

export interface RouteMapPanelProps {
  /** All markers across all planes, derived from the current route. */
  markers:       MarkerViewModel[];
  /** routeItemId of the list item currently focused (drives map flyTo). */
  focusedItemId: string | null;
  /** Called when the user clicks a map marker (drives list scroll). */
  onMarkerClick: (routeItemId: string) => void;
  /** Called when the user clicks the map during placement mode. */
  onMapClick?: (location: RouteLocation) => void;
  /** True while the user is picking a location for a specific route item. */
  isPlacementMode?: boolean;
  /**
   * Parent-controlled container height in px. When this changes the panel
   * calls map.invalidateSize() so Leaflet re-measures its container.
   */
  containerHeight?: number;
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function RouteMapPanel({
  markers,
  focusedItemId,
  onMarkerClick,
  onMapClick,
  isPlacementMode = false,
  containerHeight,
}: RouteMapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The Leaflet map instance lives in state (not a ref) so that tile-layer and
   * marker effects can list it as a dependency.  When StrictMode's simulated
   * unmount runs the init-effect cleanup (`map.remove(); setMap(null)`), those
   * effects see map=null and skip.  When StrictMode's simulated remount runs
   * the init-effect setup again, a fresh map is created and state updates to
   * the new instance → the dependent effects re-run and the map fully renders.
   */
  const [map, setMap] = useState<L.Map | null>(null);

  const [fitTrigger, setFitTrigger] = useState(0);
  const [showLines, setShowLines] = useState(true);

  /** Pixel position (container-relative) of the currently selected marker, updated on map move/zoom. */
  const [selectedMarkerPt, setSelectedMarkerPt] = useState<{ x: number; y: number } | null>(null);

  const hasAnyMarkers = markers.length > 0;

  // ── Init / teardown Leaflet map ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const m = L.map(container, {
      center:           DEFAULT_CENTER,
      zoom:             DEFAULT_ZOOM,
      maxZoom:          OSRS_MAX_ZOOM,
      minZoom:          2,
      zoomControl:      false,
      attributionControl: false,
    });

    setMap(m);

    // Ensure the map measures its container correctly after the browser paints.
    // This handles any edge cases where the CSS layout resolves after mount.
    const rafId = requestAnimationFrame(() => m.invalidateSize());

    return () => {
      cancelAnimationFrame(rafId);
      m.remove();
      setMap(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Prevent middle-click page autoscroll on the map canvas ─────────────────
  // The browser enters "autoscroll" mode when the middle mouse button is pressed
  // over a scrollable/any element. preventDefault() on button=1 mousedown stops it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    container.addEventListener('mousedown', onMouseDown);
    return () => container.removeEventListener('mousedown', onMouseDown);
  }, []);

  // ── Resize invalidation (re-measure on any container dimension change) ──────
  // A ResizeObserver on the container div fires whenever the element's rendered
  // size changes — including width changes from the plannerWide toggle in App.tsx
  // and height changes from the vertical drag-resize handle. This replaces the
  // previous containerHeight-only effect, which missed width-only changes and
  // caused Leaflet to load tiles for the wrong (stale) viewport size.
  useEffect(() => {
    if (!map) return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  // Belt-and-suspenders: also invalidate when the explicit height prop changes.
  // ResizeObserver covers this case too, but the prop-based trigger fires
  // synchronously within the same React commit phase which avoids a brief flash
  // if the rAF in ResizeObserver fires slightly after the next paint.
  useEffect(() => {
    if (!map || containerHeight === undefined) return;
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(raf);
  }, [map, containerHeight]);

  // ── Tile layer (surface-only) ───────────────────────────────────────────────
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    // Remove old tile layer before adding the new one.
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const layer = L.tileLayer(osrsTileUrl(0), {
      tms:     true,
      minZoom: OSRS_MIN_ZOOM,
      maxZoom: OSRS_MAX_ZOOM,
      noWrap:  true,
      // Slightly larger neighborhood + faster refresh improves perceived
      // smoothness while still keeping requests bounded.
      keepBuffer: 4,
      updateWhenIdle: false,
      updateInterval: 120,
    });
    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [map]);

  // ── Markers (re-applied when map, visible markers, or selection changes) ────
  const leafletMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  // onMarkerClick is a stable callback from the parent; wrap in useCallback to
  // keep the effect dependency stable across renders.
  const stableOnMarkerClick = useCallback(
    (id: string) => onMarkerClick(id),
    [onMarkerClick],
  );

  useEffect(() => {
    if (!map) return;

    // Remove previous markers.
    leafletMarkersRef.current.forEach((lm) => map.removeLayer(lm));
    leafletMarkersRef.current.clear();

    // Determine the next mapped task after the focused one so its pin can be
    // styled distinctly. Computed once here so every marker below can compare.
    let nextRouteItemId: string | null = null;
    if (focusedItemId) {
      const focusedIdx = markers.findIndex((m) => m.routeItemId === focusedItemId);
      if (focusedIdx >= 0 && focusedIdx < markers.length - 1) {
        nextRouteItemId = markers[focusedIdx + 1].routeItemId;
      }
    }

    // Add markers from all route items with explicit coordinates.
    markers.forEach((m) => {
      const isSelected = m.routeItemId === focusedItemId;
      const isNextTask = m.routeItemId === nextRouteItemId;
      const pos  = osrsToLatLng(map, m.location.x, m.location.y);
      const icon = makeMarkerIcon(
        m.listPos,
        isSelected,
        m.isCompleted,
        isNextTask,
      );
      const marker = L.marker(pos, {
        icon,
        bubblingMouseEvents: false,
        zIndexOffset: isSelected ? 1000 : isNextTask ? 500 : 0,
      });
      // Tooltip shown on hover — click is reserved for selection.
      marker.bindTooltip(markerTooltipHtml(m), {
        direction:  'top',
        permanent:  false,
        opacity:    0.95,
        className:  'osrs-map-tooltip',
      });
      marker.on('click', () => stableOnMarkerClick(m.routeItemId));
      marker.addTo(map);
      leafletMarkersRef.current.set(m.routeItemId, marker);
    });
  }, [map, markers, focusedItemId, stableOnMarkerClick]);

  // ── Base route polyline ────────────────────────────────────────────────────
  // Drawn as a multi-polyline that skips the currently highlighted segment
  // (focusedIdx → focusedIdx+1). This ensures the yellow base line is never
  // rendered underneath the blue highlight, preventing the muddy yellow-blue
  // bleed caused by drawing two semi-transparent lines over the same segment.
  const basePolylineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    if (basePolylineRef.current) {
      map.removeLayer(basePolylineRef.current);
      basePolylineRef.current = null;
    }

    if (markers.length < 2) return;

    const positions = markers.map((m) => osrsToLatLng(map, m.location.x, m.location.y));

    // Find the highlighted segment so we can leave a gap in the base line.
    let highlightIdx = -1;
    if (focusedItemId) {
      const idx = markers.findIndex((m) => m.routeItemId === focusedItemId);
      if (idx >= 0 && idx < markers.length - 1) {
        highlightIdx = idx;
      }
    }

    // Build segments: one or two runs of positions with the highlighted gap removed.
    // L.polyline accepts a nested array (L.LatLng[][]) for multi-segment polylines.
    const segments: L.LatLng[][] =
      highlightIdx >= 0
        ? [
            positions.slice(0, highlightIdx + 1),  // up to and including the "from" pin
            positions.slice(highlightIdx + 1),      // from the "to" pin onward
          ].filter((s) => s.length >= 2)            // drop degenerate single-point runs
        : [positions];                              // no highlight — draw the full line

    const baseLine = L.polyline(segments as unknown as L.LatLngExpression[][], {
      color:       '#e8b800',
      weight:      2,
      opacity:     showLines ? 0.7 : 0,
      interactive: false,
    });
    baseLine.addTo(map);
    basePolylineRef.current = baseLine;
  }, [map, markers, showLines, focusedItemId]);

  // ── Highlight segment (selected → next) ──────────────────────────────────
  // Uses setLatLngs() to update geometry in-place rather than removing and
  // recreating the layer on every selection change. This eliminates the brief
  // wrong/blank frame visible during rapid navigation: Leaflet mutates the SVG
  // path element atomically with no remove+addTo cycle, so there is never an
  // intermediate state where the old layer is gone and the new one not yet drawn.
  //
  // A second ref tracks which map instance owns the polyline. When the Leaflet
  // map is recreated (e.g. React StrictMode double-invoke), we detect the
  // mismatch and recreate the polyline on the new map.
  const highlightPolylineRef    = useRef<L.Polyline | null>(null);
  const highlightPolylineMapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!map) {
      // Map was destroyed — the whole L.Map instance is gone, so no explicit
      // removeLayer is needed. Just reset refs so the next map gets a fresh layer.
      highlightPolylineRef.current    = null;
      highlightPolylineMapRef.current = null;
      return;
    }

    // Compute endpoints for the current selection (empty array = hidden).
    const endpoints: L.LatLng[] = [];
    if (focusedItemId && markers.length >= 2) {
      const idx = markers.findIndex((m) => m.routeItemId === focusedItemId);
      if (idx >= 0 && idx < markers.length - 1) {
        endpoints.push(osrsToLatLng(map, markers[idx].location.x,     markers[idx].location.y));
        endpoints.push(osrsToLatLng(map, markers[idx + 1].location.x, markers[idx + 1].location.y));
      }
    }

    if (highlightPolylineRef.current && highlightPolylineMapRef.current === map) {
      // Same Leaflet instance — mutate geometry in-place, no layer churn.
      highlightPolylineRef.current.setLatLngs(endpoints);
    } else {
      // First run or the map was replaced — clean up old layer and create fresh.
      if (highlightPolylineRef.current && highlightPolylineMapRef.current) {
        highlightPolylineMapRef.current.removeLayer(highlightPolylineRef.current);
      }
      const line = L.polyline(endpoints, {
        color:       '#1a6fc4',
        weight:      4,
        opacity:     showLines ? 0.88 : 0,
        interactive: false,
      });
      line.addTo(map);
      highlightPolylineRef.current    = line;
      highlightPolylineMapRef.current = map;
    }
    // Apply visibility to an already-existing layer (covers the showLines toggle
    // case where geometry didn't change but opacity needs to update).
    highlightPolylineRef.current?.setStyle({ opacity: showLines ? 0.88 : 0 });
    // No cleanup function: the polyline is NOT removed on every dependency
    // change. Removal/reset happens only in the map===null branch above.
  }, [map, markers, focusedItemId, showLines]);

  // ── Placement clicks (map surface) ───────────────────────────────────────
  useEffect(() => {
    if (!map || !onMapClick) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      const { x, y } = latLngToOsrs(map, e.latlng);
      onMapClick({ x, y, plane: 0 });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onMapClick]);

  // ── Cursor hint for placement mode ───────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    container.style.cursor = isPlacementMode ? 'crosshair' : '';
    return () => {
      container.style.cursor = '';
    };
  }, [map, isPlacementMode]);

  // ── Fly to focused marker ───────────────────────────────────────────────────
  const allMarkersRef = useRef(markers);
  allMarkersRef.current = markers;

  useEffect(() => {
    if (!map || !focusedItemId) return;

    const target = allMarkersRef.current.find((x) => x.routeItemId === focusedItemId);
    if (!target) return;

    const pos = osrsToLatLng(map, target.location.x, target.location.y);
    map.flyTo(pos, Math.max(map.getZoom(), 8), { duration: 0.7 });
  }, [map, focusedItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track selected marker pixel position (for detail popup overlay) ─────────
  // Re-computed on every map move/zoom so the popup stays anchored to the pin.
  useEffect(() => {
    if (!map || !focusedItemId) {
      setSelectedMarkerPt(null);
      return;
    }
    const target = markers.find((m) => m.routeItemId === focusedItemId);
    if (!target) {
      setSelectedMarkerPt(null);
      return;
    }

    const latlng = osrsToLatLng(map, target.location.x, target.location.y);

    function updatePt() {
      const pt = map!.latLngToContainerPoint(latlng);
      setSelectedMarkerPt({ x: pt.x, y: pt.y });
    }

    updatePt();
    map.on('move zoom', updatePt);
    return () => {
      map.off('move zoom', updatePt);
    };
  }, [map, focusedItemId, markers]);

  // ── Focused index (prev/next navigation) ────────────────────────────────────
  const focusedIdx = useMemo(() => {
    if (!focusedItemId) return -1;
    return markers.findIndex((m) => m.routeItemId === focusedItemId);
  }, [markers, focusedItemId]);

  const prevId = focusedIdx > 0 ? markers[focusedIdx - 1].routeItemId : null;
  const nextId = focusedIdx >= 0 && focusedIdx < markers.length - 1
    ? markers[focusedIdx + 1].routeItemId
    : null;

  // ── Fit view to markers ────────────────────────────────────────────────────
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    if (!map || fitTrigger === 0) return;

    const visibleMarkers = markersRef.current;
    if (visibleMarkers.length === 0) return;

    if (visibleMarkers.length === 1) {
      const pos = osrsToLatLng(map, visibleMarkers[0].location.x, visibleMarkers[0].location.y);
      map.flyTo(pos, 9, { duration: 0.7 });
      return;
    }

    const latlngs = visibleMarkers.map((m) => osrsToLatLng(map, m.location.x, m.location.y));
    map.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 9 });
  }, [map, fitTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="relative h-full overflow-hidden"
      aria-label="Route map"
    >
      {/* Leaflet map mounts here — explicit pixel height so Leaflet reads correct size */}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* ── Overlay: fit + attribution (bottom-right) ──────────────────────── */}
      <div className="absolute bottom-2 right-2 z-[1000] flex flex-col items-end gap-1 pointer-events-auto">
        {hasAnyMarkers && (
          <button
            onClick={() => setShowLines((v) => !v)}
            title={showLines ? 'Hide route lines' : 'Show route lines'}
            className="px-2 py-1 text-[10px] font-semibold border shadow-sm transition-colors bg-wiki-surface dark:bg-wiki-surface-dark border-wiki-border dark:border-wiki-border-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark"
            style={{ color: showLines ? undefined : 'var(--color-wiki-muted, #6b7280)' }}
          >
            Lines: {showLines ? 'On' : 'Off'}
          </button>
        )}
        {hasAnyMarkers && (
          <button
            onClick={() => setFitTrigger((t) => t + 1)}
            title="Fit view to route markers"
            className="px-2 py-1 text-[10px] font-semibold border shadow-sm bg-wiki-surface dark:bg-wiki-surface-dark text-wiki-text dark:text-wiki-text-dark border-wiki-border dark:border-wiki-border-dark hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark transition-colors"
          >
            Fit
          </button>
        )}
        <span className="text-[9px] text-wiki-muted/70 dark:text-wiki-muted-dark/70 bg-white/60 dark:bg-black/40 px-1 select-none pointer-events-none">
          Tiles © Explv / Jagex
        </span>
      </div>

      {/* ── Overlay: prev / next navigation (bottom-centre) ────────────────── */}
      {hasAnyMarkers && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[1000] flex flex-row gap-2 pointer-events-auto">
          <button
            onClick={() => prevId && onMarkerClick(prevId)}
            disabled={!prevId}
            title="Previous step"
            className="px-3 py-1.5 text-[11px] font-semibold border shadow-sm transition-colors
              bg-wiki-surface dark:bg-wiki-surface-dark
              text-wiki-text dark:text-wiki-text-dark
              border-wiki-border dark:border-wiki-border-dark
              hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark
              disabled:opacity-40 disabled:cursor-not-allowed
              disabled:hover:bg-wiki-surface dark:disabled:hover:bg-wiki-surface-dark"
          >
            &#8592; Prev
          </button>
          <button
            onClick={() => nextId && onMarkerClick(nextId)}
            disabled={!nextId}
            title="Next step"
            className="px-3 py-1.5 text-[11px] font-semibold border shadow-sm transition-colors
              bg-wiki-surface dark:bg-wiki-surface-dark
              text-wiki-text dark:text-wiki-text-dark
              border-wiki-border dark:border-wiki-border-dark
              hover:bg-wiki-mid dark:hover:bg-wiki-mid-dark
              disabled:opacity-40 disabled:cursor-not-allowed
              disabled:hover:bg-wiki-surface dark:disabled:hover:bg-wiki-surface-dark"
          >
            Next &#8594;
          </button>
        </div>
      )}

      {/* ── Selected marker detail card ──────────────────────────────────────── */}
      {selectedMarkerPt && (() => {
        const focused = markers.find((m) => m.routeItemId === focusedItemId);
        if (!focused) return null;

        // Selected marker icon is 28×35 px; anchor is at its bottom-centre.
        // The card should sit above the pin body with a small gap.
        const MARKER_H = 35;
        const GAP      = 6;

        const hasBody = focused.description || focused.requirements || focused.notes;

        return (
          <div
            className="absolute z-[1001] pointer-events-none"
            style={{
              left: selectedMarkerPt.x,
              top:  selectedMarkerPt.y - MARKER_H - GAP,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="pointer-events-auto bg-wiki-surface dark:bg-wiki-surface-dark border border-wiki-border dark:border-wiki-border-dark shadow-md max-w-[230px] min-w-[130px] text-[12px]">
              {/* Header: step number + task name */}
              <div className="px-2.5 py-1.5 border-b border-wiki-border dark:border-wiki-border-dark bg-[#0052cc] dark:bg-[#1a4a8a] flex items-start gap-1.5">
                <span className="font-bold text-white flex-shrink-0 tabular-nums">
                  {focused.listPos}.
                </span>
                <span className="font-semibold text-white leading-snug break-words min-w-0 flex-1">
                  {focused.label}
                </span>
                {focused.isCompleted && (
                  <span className="flex-shrink-0 text-white/75 text-[10px] leading-none mt-[2px]">
                    ✓
                  </span>
                )}
              </div>

              {/* Body: description, requirements, notes */}
              {hasBody && (
                <div className="px-2.5 py-1.5 space-y-1.5">
                  {focused.description && (
                    <div className="text-wiki-text dark:text-wiki-text-dark leading-relaxed break-words">
                      {focused.descriptionParts && focused.descriptionParts.length > 0 ? (
                        <RichText parts={focused.descriptionParts} />
                      ) : (
                        focused.description
                      )}
                    </div>
                  )}

                  {focused.requirements && !focused.isCustom && (
                    <div className="flex items-start gap-1.5">
                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-wiki-text/65 dark:text-wiki-text-dark/65 mt-[1px]">
                        Reqs:
                      </span>
                      <div className="text-wiki-text/80 dark:text-wiki-text-dark/75 leading-snug min-w-0">
                        <RequirementsCell
                          requirementsText={focused.requirements}
                          requirementsParts={focused.requirementsParts}
                        />
                      </div>
                    </div>
                  )}

                  {focused.notes && (
                    <p className="italic text-wiki-text/70 dark:text-wiki-text-dark/65 leading-snug break-words">
                      <span className="font-bold not-italic text-[10px] uppercase tracking-wider mr-1">
                        Note:
                      </span>
                      {focused.notes}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Downward caret connecting card to pin */}
            <svg
              className="absolute left-1/2 -translate-x-1/2 text-wiki-border dark:text-wiki-border-dark"
              style={{ top: '100%' }}
              width="10"
              height="5"
              viewBox="0 0 10 5"
              aria-hidden="true"
              role="presentation"
            >
              <path d="M0 0 L5 5 L10 0 Z" fill="currentColor" />
            </svg>
          </div>
        );
      })()}

      {/* ── Empty state: no markers at all ─────────────────────────────────── */}
      {!hasAnyMarkers && (
        <div className="absolute inset-0 flex items-end justify-center pb-4 z-[999] pointer-events-none">
          <div className="bg-wiki-surface/90 dark:bg-wiki-surface-dark/90 border border-wiki-border dark:border-wiki-border-dark px-3 py-2 text-[11px] text-wiki-muted dark:text-wiki-muted-dark text-center max-w-xs leading-snug shadow-sm">
            No route items have map coordinates.
            <br />
            Import a route from the RuneLite plugin to see pins.
          </div>
        </div>
      )}

    </div>
  );
}
