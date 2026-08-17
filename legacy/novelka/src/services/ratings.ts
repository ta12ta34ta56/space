/**
 * App ratings — the "how much do you like Novelka?" feature.
 *
 * A rating is 1–5 stars plus an optional comment and email. It is always
 * stored locally (the user's own browser, keyed `novelka.rating.v1`) so the
 * flow works with no backend at all, and — when Supabase is configured — it
 * is also POSTed to the Novelka server (`/api/rating`) which persists it in
 * Postgres for the owner to read. A failed server POST never blocks the user:
 * the local copy stands, and the next rating attempt retries.
 *
 * The prompt is deliberately gentle: it appears once after a successful
 * export, once after a project is saved from the editor, and never again once
 * the user has rated or dismissed it twice.
 */

import { readStorage, writeStorage } from './storage-keys';

export interface RatingEntry {
  stars: number;
  comment?: string;
  /** optional contact — only collected when the user types it */
  email?: string;
  createdAt: string;
  /** which Novelka build they were using */
  version: string;
}

const RATING_KEY = 'novelka.rating.v1';
const PROMPTED_KEY = 'novelka.rating.prompted.v1';
const DISMISSED_KEY = 'novelka.rating.dismissed.v1';

const APP_VERSION = '1.0.0';

/** The user's last rating, or null. */
export function loadRating(): RatingEntry | null {
  try {
    const raw = readStorage(RATING_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RatingEntry;
    if (typeof r.stars !== 'number' || r.stars < 1 || r.stars > 5) return null;
    return r;
  } catch {
    return null;
  }
}

/** Persist a rating locally. Never throws. */
export function saveRatingLocal(entry: Omit<RatingEntry, 'createdAt' | 'version'>): RatingEntry {
  const full: RatingEntry = {
    stars: entry.stars,
    comment: entry.comment?.trim() || undefined,
    email: entry.email?.trim() || undefined,
    createdAt: new Date().toISOString(),
    version: APP_VERSION,
  };
  try {
    writeStorage(RATING_KEY, JSON.stringify(full));
  } catch {
    /* a rating that cannot be stored is not worth an error dialog */
  }
  return full;
}

// ------------------------------------------------------------------ prompts

/**
 * Should we show the rating prompt right now?
 * Once per app install, at most — after a rate, a dismiss, or two prompts.
 */
export function shouldPromptRating(): boolean {
  if (loadRating()) return false;
  try {
    const dismissed = Number(readStorage(DISMISSED_KEY) ?? 0);
    if (dismissed >= 2) return false;
    // Prompted twice (export + save) with no response? Stop asking.
    const prompted = Number(readStorage(PROMPTED_KEY) ?? 0);
    if (prompted >= 2) return false;
    return true;
  } catch {
    return true;
  }
}

/** Record that the prompt was shown (so we do not nag every export). */
export function markRatingPrompted(): void {
  try {
    const n = Number(readStorage(PROMPTED_KEY) ?? 0);
    writeStorage(PROMPTED_KEY, String(n + 1));
  } catch {
    /* best effort */
  }
}

/** Record that the user dismissed the prompt without rating. */
export function markRatingDismissed(): void {
  try {
    const n = Number(readStorage(DISMISSED_KEY) ?? 0);
    writeStorage(DISMISSED_KEY, String(n + 1));
  } catch {
    /* best effort */
  }
}
