/**
 * OSRS world coordinate → Leaflet map position conversion.
 *
 * Coordinate system and constants from Explv's OSRS map tool:
 *   https://github.com/Explv/Explv.github.io
 *
 * Tile source:
 *   https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/{plane}/{z}/{x}/{y}.png
 *   TMS tile format; minZoom: 4, maxZoom: 11
 *
 * Transform notes:
 *   - OSRS world coordinates: X increases eastward, Y increases northward.
 *   - Leaflet (EPSG:3857) uses pixel space at a fixed zoom as the intermediary.
 *   - osrsToLatLng() requires a Leaflet Map instance because it uses
 *     map.unproject() to invert the pixel-to-LatLng mapping at maxZoom.
 *   - Call it from inside any component that holds a L.Map instance.
 */
import L from 'leaflet';

// ─── Constants (from Explv's Position.js) ─────────────────────────────────────

const RS_TILE_PX          = 32;       // pixels per OSRS tile at OSRS_MAX_ZOOM
const RS_OFFSET_X         = 1024 - 64; // = 960 — OSRS x origin in pixel space
const RS_OFFSET_Y         = 6208;      // OSRS y origin in pixel space
const MAP_HEIGHT_MAX_PX   = 364544;    // total world height in px at OSRS_MAX_ZOOM

export const OSRS_MAX_ZOOM = 11;
export const OSRS_MIN_ZOOM = 4;

/**
 * Default map view: central OSRS (near Varrock/Lumbridge).
 * Pre-computed via EPSG:3857 projection at maxZoom=11 for OSRS ~(3200, 3220).
 * Matches the default centre used by Explv's OSRS map tool.
 */
export const DEFAULT_CENTER: [number, number] = [-79, -137];
export const DEFAULT_ZOOM = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tile URL template for an OSRS plane using Explv's GitHub-hosted tile mirror.
 * `{z}`, `{x}`, `{y}` are substituted by Leaflet at runtime.
 * Uses TMS tile numbering (y-axis inverted) — pass `tms: true` to TileLayer.
 */
export function osrsTileUrl(plane: number): string {
  return `https://raw.githubusercontent.com/Explv/osrs_map_tiles/master/${plane}/{z}/{x}/{y}.png`;
}

/**
 * Convert an OSRS game-tile coordinate (x, y) to a Leaflet L.LatLng.
 *
 * Must be called with a valid L.Map instance that has been fully initialised.
 */
export function osrsToLatLng(map: L.Map, x: number, y: number): L.LatLng {
  const px = ((x - RS_OFFSET_X) * RS_TILE_PX) + (RS_TILE_PX / 4);
  const py = MAP_HEIGHT_MAX_PX - ((y - RS_OFFSET_Y) * RS_TILE_PX);
  return map.unproject(L.point(px, py), OSRS_MAX_ZOOM);
}
