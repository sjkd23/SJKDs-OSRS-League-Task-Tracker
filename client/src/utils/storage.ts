/**
 * Simple localStorage persistence helpers.
 * Typed wrappers so callers don't deal with JSON.parse manually.
 */

/**
 * Module-level EventTarget used to broadcast storage-write failures.
 * Dispatches a `'save-failed'` Event when saveToStorage cannot write
 * (e.g. quota exceeded or storage unavailable).
 *
 * App-level components can listen to this to surface a visible warning
 * without needing to thread error state through every call site.
 */
export const storageErrorEvent = new EventTarget();

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Serialise value to localStorage.
 * Returns true on success, false if storage is unavailable or quota exceeded.
 * On failure, dispatches a 'save-failed' event on storageErrorEvent so the
 * app can surface a visible warning to the user.
 */
export function saveToStorage<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    storageErrorEvent.dispatchEvent(new Event('save-failed'));
    return false;
  }
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Copy the raw stored bytes at sourceKey → destKey without parsing.
 * Used to back up the active route before any destructive replacement.
 * Returns true if a backup was written, false if nothing was available
 * to back up or the write failed.
 */
export function backupRouteToStorage(sourceKey: string, destKey: string): boolean {
  try {
    const raw = localStorage.getItem(sourceKey);
    if (raw === null) return false;
    localStorage.setItem(destKey, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy raw storage bytes only when destination does not exist yet.
 * Intended for one-time migration safety snapshots.
 */
export function backupStorageKeyOnce(sourceKey: string, destKey: string): boolean {
  try {
    if (localStorage.getItem(destKey) !== null) return false;
    const raw = localStorage.getItem(sourceKey);
    if (raw === null) return false;
    localStorage.setItem(destKey, raw);
    return true;
  } catch {
    return false;
  }
}
