/**
 * Storage-key migration for the Gridpress → Novelka rename.
 *
 * All localStorage keys changed from `gridpress.*` to `novelka.*`. Reads go
 * through these helpers so a browser that still holds the old keys finds them
 * once, copies them forward, and drops the stale copy — no saved book, theme,
 * upload or account is lost by the rename. Writes always target the new key.
 *
 * The legacy hash domain in auth.ts (`gridpress:`) is deliberately NOT in this
 * map: it is a password-hash domain separator, not a storage key, and changing
 * it would break verification of accounts created before the rename.
 */

const LEGACY: Record<string, string> = {
  'novelka.users.v1': 'gridpress.users.v1',
  'novelka.session.v1': 'gridpress.session.v1',
  'novelka.owner.v1': 'gridpress.owner.v1',
  'novelka.flags.v1': 'gridpress.flags.v1',
  'novelka.entitlement.v1': 'gridpress.entitlement.v1',
  'novelka.theme.v1': 'gridpress.theme.v1',
  'novelka.admin-unlocked.v1': 'gridpress.admin-unlocked.v1',
  'novelka.uploads.v1': 'gridpress.uploads.v1',
  'novelka.content-overrides.v1': 'gridpress.content-overrides.v1',
  'novelka.index.v1': 'gridpress.index.v1',
};

const legacyOf = (key: string): string | null => LEGACY[key] ?? null;

const hasStorage = (): boolean =>
  typeof localStorage !== 'undefined' &&
  typeof localStorage.getItem === 'function';

/** Read a key, migrating a legacy value on first use. Returns null when absent. */
export function readStorage(key: string): string | null {
  if (!hasStorage()) return null;
  const v = localStorage.getItem(key);
  if (v !== null) return v;
  const legacy = legacyOf(key);
  if (!legacy) return null;
  const old = localStorage.getItem(legacy);
  if (old === null) return null;
  try {
    localStorage.setItem(key, old);
    localStorage.removeItem(legacy);
  } catch {
    /* keep the legacy copy if the new write fails */
  }
  return old;
}

/** Write a key, clearing any legacy copy so the two never diverge. */
export function writeStorage(key: string, value: string): void {
  if (!hasStorage()) return;
  localStorage.setItem(key, value);
  const legacy = legacyOf(key);
  if (legacy) {
    try { localStorage.removeItem(legacy); } catch { /* best effort */ }
  }
}

/** Remove a key and any legacy copy. */
export function removeStorage(key: string): void {
  if (!hasStorage()) return;
  localStorage.removeItem(key);
  const legacy = legacyOf(key);
  if (legacy) {
    try { localStorage.removeItem(legacy); } catch { /* best effort */ }
  }
}
