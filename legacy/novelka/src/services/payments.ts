import type { Tier } from './feature-flags';

/**
 * Payments — the browser half.
 *
 * ## Two rules this file exists to enforce
 *
 * 1. **The browser never talks to Stripe's API.** It talks to our server, which
 *    holds the secret key. A Stripe secret key in client JavaScript can be read
 *    by anyone and used to issue refunds, read customers, and create charges.
 *
 * 2. **The browser never decides a payment succeeded.** Returning from Stripe's
 *    checkout page proves nothing — the URL can simply be typed. Entitlement
 *    changes only when Stripe calls our webhook, we verify the signature, and
 *    the server writes the tier. Everything here just refreshes and displays
 *    what the server already decided.
 *
 * Market: USA, billed in USD.
 *
 * ## STATUS: written and type-checked, NOT yet wired to the UI
 *
 * Every function here maps 1:1 to a tested server route in `server/src/routes/`.
 * Nothing imports this module yet, because calling it requires a real Supabase
 * access token and the client is still on the local mock auth.
 *
 * It is kept rather than deleted because it is the contract the server was
 * built against. Tree-shaking removes it from the bundle entirely (verified:
 * 0 occurrences of `startCheckout` in dist/), so it costs users nothing.
 *
 * Wiring order once Supabase auth lands:
 *   1. auth-store exposes `session.access_token`
 *   2. flag-store calls `fetchEntitlement()` instead of reading local flags
 *   3. export path calls `consumeFeature('export_pdf')` before rendering
 *   4. UpgradePrompt calls `startCheckout(tier)`
 */

/** Where our API lives. Empty means same origin. */
const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? '';

export interface ApiError extends Error {
  status: number;
}

async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const parsed = (await res.json()) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* not JSON — keep the generic message rather than dumping HTML at a user */
    }
    const err = new Error(message) as ApiError;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * Start a subscription.
 *
 * Sends only the tier NAME. The server looks up the price itself — if the
 * client could send an amount, it would send one cent.
 */
export async function startCheckout(tier: Exclude<Tier, 'free'>, accessToken: string): Promise<void> {
  const { url } = await api<{ url: string }>('/checkout', {
    method: 'POST',
    body: { tier },
    token: accessToken,
  });
  if (!url) throw new Error('Could not start checkout.');
  window.location.href = url;
}

// ------------------------------------------------------------- entitlement

export interface ServerEntitlement {
  signedIn: boolean;
  tier: Tier;
  isOwner?: boolean;
  usage: Record<string, number>;
  flags: {
    feature_id: string;
    enabled: boolean;
    route_free: boolean;
    route_paid: boolean;
    min_tier: Tier;
    daily_limit: number | null;
  }[];
}

/**
 * What the server says this user may do.
 *
 * Use this to render locks and "3 of 5 exports left". It is a *mirror* of the
 * server's view for display purposes — never the basis of a decision, because
 * anything decided here can be edited in DevTools.
 */
export function fetchEntitlement(accessToken?: string): Promise<ServerEntitlement> {
  return api<ServerEntitlement>('/entitlement', { token: accessToken });
}

export interface ConsumeResult {
  allowed: true;
  tier: Tier;
  /** decided and signed by the server; the client cannot turn this off */
  watermark: boolean;
  /** short-lived signed proof that permission was granted */
  grant: string;
  expiresIn: number;
}

/**
 * Ask permission to use a gated feature, and consume one unit of the allowance.
 *
 * Call this immediately before the action. It throws on refusal:
 *   401 not signed in · 402 upgrade required · 403 unavailable · 429 limit hit
 */
export function consumeFeature(featureId: string, accessToken: string): Promise<ConsumeResult> {
  return api<ConsumeResult>('/entitlement/consume', {
    method: 'POST',
    body: { featureId },
    token: accessToken,
  });
}

// ------------------------------------------------------------------- rating

export interface RatingPayload {
  stars: number;
  comment?: string;
  email?: string;
}

/**
 * Send a rating to the Novelka server (which stores it in Postgres for the
 * owner). Public endpoint — no token needed; the server rate-limits per IP.
 * Throws on failure so the caller can fall back to local-only.
 */
export function submitRating(rating: RatingPayload): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>('/rating', {
    method: 'POST',
    body: rating,
  });
}

// ------------------------------------------------------------------- GDPR

/** Download everything we hold about this account (GDPR Art. 15 / 20). */
export async function downloadMyData(accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/account/export`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Could not build your export.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'novelka-my-data.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Permanently delete this account (GDPR Art. 17).
 * `confirmEmail` must match the signed-in address exactly — the server checks.
 */
export function deleteMyAccount(confirmEmail: string, accessToken: string): Promise<{ deleted: boolean; message: string }> {
  return api<{ deleted: boolean; message: string }>('/account/delete', {
    method: 'POST',
    body: { confirmEmail },
    token: accessToken,
  });
}
