import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client factory.
 *
 * ## Why this file exists
 *
 * `createClient()` eagerly constructs a Realtime client, which needs a global
 * `WebSocket`. That exists on Cloudflare Workers and on Node >= 22, but NOT on
 * Node 20 — where the constructor throws outright.
 *
 * Novelka never subscribes to Realtime; we only run queries and verify JWTs.
 * So rather than add a `ws` dependency we would never use, install a stub that
 * satisfies the constructor and throws loudly if anything ever tries to open a
 * socket. If that error is ever seen, something started using Realtime and this
 * decision needs revisiting — which is exactly what the message says.
 *
 * Centralising creation also means the security-relevant options (no session
 * persistence, no token auto-refresh) are set once and cannot drift between
 * routes.
 */

function ensureWebSocket(): void {
  const g = globalThis as { WebSocket?: unknown };
  if (typeof g.WebSocket !== 'undefined') return;

  class UnsupportedWebSocket {
    constructor() {
      throw new Error(
        'Novelka does not use Supabase Realtime. Something tried to open a ' +
          'WebSocket — run on Node >= 22 or add the "ws" package if Realtime ' +
          'is genuinely needed.',
      );
    }
  }
  g.WebSocket = UnsupportedWebSocket;
}

const BASE_OPTIONS = {
  auth: {
    // A server has no browser storage and no user session to keep.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { headers: { 'X-Client-Info': 'novelka-server' } },
} as const;

/**
 * Service-role client. **Bypasses Row Level Security.**
 *
 * Only for code paths that must write money columns — the Stripe webhook and
 * entitlement checks. Never construct this from anything a user can influence.
 */
export function adminClient(url: string, serviceRoleKey: string): SupabaseClient {
  ensureWebSocket();
  return createClient(url, serviceRoleKey, BASE_OPTIONS);
}

/**
 * Anon client, used only to verify a caller's access token.
 *
 * RLS applies, so even if this leaked it grants nothing beyond what the token
 * already allows.
 */
export function anonClient(url: string, anonKey: string): SupabaseClient {
  ensureWebSocket();
  return createClient(url, anonKey, BASE_OPTIONS);
}
