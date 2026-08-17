import type { SupabaseClient, User } from '@supabase/supabase-js';
import { adminClient, anonClient } from './supabase';
import type { ServerEnv } from './env';
import { jsonError } from './http';

/**
 * Server-side authentication and owner authorization.
 *
 * ## Security Guarantees
 * 1. An admin route NEVER trusts client-submitted flags or headers.
 * 2. Every `/api/admin/*` request must present a valid Supabase JWT Bearer token.
 * 3. The server queries `public.profiles` using the service-role client to check `is_owner === true`.
 * 4. Fails closed: missing profile, non-owner, malformed token, or DB error always rejects.
 */

export interface ProfileRecord {
  id: string;
  email: string;
  display_name?: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  is_owner: boolean;
  stripe_customer_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type AuthHooks = {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
};

/** Authenticate an incoming request by verifying its Supabase JWT. */
export async function authenticateUser(
  env: ServerEnv,
  authHeader: string | null,
  hooks?: AuthHooks,
): Promise<User | null> {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const anon = hooks?.makeSupabase
      ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
      : anonClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export type RequireOwnerResult =
  | { ok: true; user: User; profile: ProfileRecord }
  | { ok: false; response: { status: number; body: string; headers?: Record<string, string> } };

/**
 * Server-side owner authorization guard for all `/api/admin/*` endpoints.
 *
 * Returns `{ ok: true, user, profile }` or an HTTP error response.
 */
export async function requireOwner(
  headers: { authorization: string | null; clientIp: string },
  env: ServerEnv,
  hooks?: AuthHooks,
): Promise<RequireOwnerResult> {
  const user = await authenticateUser(env, headers.authorization, hooks);
  if (!user) {
    return {
      ok: false,
      response: jsonError(401, 'Authentication required'),
    };
  }

  const db = hooks?.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error } = await db
    .from('profiles')
    .select('id, email, display_name, tier, is_owner, stripe_customer_id, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      ok: false,
      response: jsonError(403, 'Forbidden: Profile not found or access denied'),
    };
  }

  if (profile.is_owner !== true) {
    return {
      ok: false,
      response: jsonError(403, 'Forbidden: Owner access required'),
    };
  }

  return {
    ok: true,
    user,
    profile: profile as ProfileRecord,
  };
}
