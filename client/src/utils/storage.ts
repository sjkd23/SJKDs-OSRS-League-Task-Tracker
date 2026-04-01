/**
 * Simple localStorage persistence helpers.
 * Typed wrappers so callers don't deal with JSON.parse manually.
 */

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable — fail silently.
  }
}

export function removeFromStorage(key: string): void {
  localStorage.removeItem(key);
}
