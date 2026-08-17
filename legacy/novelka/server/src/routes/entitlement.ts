import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient } from '../lib/supabase';
import { serverEnv, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';
import { signGrant, verifyGrant, type EntitlementGrantClaims } from '../lib/grants';
import {
  validateIdempotencyKey,
  hashPayload,
  getIdempotencyRecord,
  saveIdempotencyRecord,
} from '../lib/idempotency';

export { signGrant, verifyGrant };

/**
 * Entitlement — the authoritative answer to "is this user allowed to do X?"
 *
 * ## The problem this solves
 *
 * Novelka decides gating on the server. The client cannot forge or widen
 * grants, alter daily counters, or fabricate subscription upgrades.
 *
 * ## The grant token
 *
 * `/api/entitlement/consume` returns a short-lived HMAC-signed grant.
 * The watermark flag is determined server-side and cryptographically signed
 * using the dedicated `GRANT_SIGNING_SECRET` (never the service-role key).
 *
 * ## Operation-level idempotency
 *
 * Accepts an `Idempotency-Key` header bound to `(user_id, key)` to ensure
 * duplicate requests or client retries consume quota exactly once.
 */

interface Hooks {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
  now?: () => number;
}
let hooks: Hooks = {};
export function __setEntitlementHooks(h: Hooks) {
  hooks = h;
}

const now = () => (hooks.now ? hooks.now() : Date.now());

export type Tier = 'free' | 'basic' | 'pro' | 'enterprise';
const RANK: Record<Tier, number> = { free: 0, basic: 1, pro: 2, enterprise: 3 };

function admin(env: ServerEnv) {
  return hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

async function authenticate(env: ServerEnv, authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const anon = hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
    : anonClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

interface FlagRow {
  feature_id: string;
  enabled: boolean;
  route_free: boolean;
  route_paid: boolean;
  min_tier: Tier;
  daily_limit: number | null;
}

/**
 * GET /api/entitlement — what may this user do?
 *
 * Read-only. The client uses it to render locks and counters; it is a mirror of
 * the server's view, never the basis of a decision.
 */
export async function handleGetEntitlement(
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`ent:${headers.clientIp}`, 120, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const user = await authenticate(env, headers.authorization);
  const db = admin(env);

  const { data: flags } = await db
    .from('feature_flags')
    .select('feature_id, enabled, route_free, route_paid, min_tier, daily_limit');

  if (!user) {
    return jsonOk({ signedIn: false, tier: 'free', usage: {}, flags: flags ?? [] });
  }

  const { data: profile } = await db
    .from('profiles')
    .select('tier, is_owner')
    .eq('id', user.id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db
    .from('usage_events')
    .select('feature_id, count')
    .eq('user_id', user.id)
    .eq('day', today);

  const usageMap: Record<string, number> = {};
  for (const u of usage ?? []) usageMap[u.feature_id as string] = u.count as number;

  return jsonOk({
    signedIn: true,
    userId: user.id,
    tier: (profile?.tier as Tier) ?? 'free',
    isOwner: profile?.is_owner === true,
    usage: usageMap,
    flags: flags ?? [],
  });
}

export interface ConsumeHeaders {
  authorization: string | null;
  clientIp: string;
  idempotencyKey?: string | null;
  'idempotency-key'?: string | null;
  'x-idempotency-key'?: string | null;
}

/**
 * POST /api/entitlement/consume — "may I export, and count it"
 *
 * Atomically checks the tier, checks and increments the daily quota, and
 * returns a signed grant. Supports operation-level idempotency keys.
 */
export async function handleConsume(
  body: string,
  headers: ConsumeHeaders,
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`consume:${headers.clientIp}`, 30, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  let featureId: string;
  try {
    const parsed = JSON.parse(body) as { featureId?: unknown };
    featureId = String(parsed.featureId ?? '');
  } catch {
    return jsonError(400, 'Invalid request');
  }
  // Allow-list the shape; this string reaches a database function.
  if (!/^[a-z0-9_]{1,64}$/.test(featureId)) return jsonError(400, 'Unknown feature');

  const user = await authenticate(env, headers.authorization);
  if (!user) return jsonError(401, 'Sign in required');

  const rawKey =
    headers.idempotencyKey ??
    headers['idempotency-key'] ??
    headers['x-idempotency-key'] ??
    null;

  let validatedKey: string | null = null;
  let payloadHash = '';
  if (rawKey !== null && rawKey !== undefined) {
    validatedKey = validateIdempotencyKey(rawKey);
    if (!validatedKey) {
      return jsonError(400, 'Invalid idempotency key format. Must be 1-128 alphanumeric/hyphen characters.');
    }
    payloadHash = await hashPayload(body);
  }

  const db = admin(env);

  // 1. Check existing stored idempotency record before running quota transaction
  if (validatedKey) {
    const existing = await getIdempotencyRecord(db, user.id, validatedKey);
    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        return jsonError(409, 'Idempotency key payload mismatch. The same key was used with different request parameters.');
      }
      return jsonOk(existing.response_body, { 'Idempotent-Replayed': 'true' });
    }
  }

  const { data: flag } = await db
    .from('feature_flags')
    .select('feature_id, enabled, route_free, route_paid, min_tier, daily_limit')
    .eq('feature_id', featureId)
    .maybeSingle<FlagRow>();

  // Unknown feature fails CLOSED. A typo must never open a paid door.
  if (!flag) return jsonError(403, 'This feature is not available.');
  if (!flag.enabled) return jsonError(403, 'This feature is currently switched off.');

  const { data: profile } = await db
    .from('profiles')
    .select('tier, is_owner')
    .eq('id', user.id)
    .maybeSingle();

  const tier = (profile?.tier as Tier) ?? 'free';
  const isOwner = profile?.is_owner === true;

  // Tier check. Owner bypasses (it is their app).
  const meetsTier = isOwner || RANK[tier] >= RANK[flag.min_tier];
  const freeRoute = flag.route_free === true;

  if (!freeRoute && !meetsTier) {
    return jsonError(402, 'Upgrade required for this feature.');
  }

  // Paid users are never rate-capped; free users are.
  const limit = isOwner || RANK[tier] > RANK.free ? null : flag.daily_limit;

  // 2. Perform atomic quota decrement inside PostgreSQL transaction / function
  const { data: quotaResult, error: quotaError } = await db.rpc('consume_quota_atomic', {
    p_user_id: user.id,
    p_feature: featureId,
    p_limit: limit,
    p_idemp_key: validatedKey,
    p_payload_hash: payloadHash,
  });

  if (quotaError) {
    const errMsg = String(quotaError.message ?? '');
    if (errMsg.includes('idempotency_payload_mismatch')) {
      return jsonError(409, 'Idempotency key payload mismatch. The same key was used with different request parameters.');
    }
    if (errMsg.includes('quota_exceeded')) {
      return jsonError(429, "You've reached today's limit for this feature.");
    }

    // Fallback attempt with standard consume_quota if atomic function isn't yet migrated
    const { error: fallbackError } = await db.rpc('consume_quota', {
      p_user_id: user.id,
      p_feature: featureId,
      p_limit: limit,
    });
    if (fallbackError) {
      if (String(fallbackError.message ?? '').includes('quota_exceeded')) {
        return jsonError(429, "You've reached today's limit for this feature.");
      }
      console.error('[entitlement] quota error', fallbackError);
      return jsonError(500, 'Could not check your allowance.');
    }
  } else if (quotaResult && typeof quotaResult === 'object') {
    const qr = quotaResult as Record<string, unknown>;
    if (qr.is_replayed === true && qr.response_body) {
      return jsonOk(qr.response_body, { 'Idempotent-Replayed': 'true' });
    }
  }

  // Watermark is decided HERE and signed, so a patched client cannot drop it.
  const watermark = !isOwner && RANK[tier] < RANK.basic;
  const exp = Math.floor(now() / 1000) + 300; // 5 minutes

  const grantClaims: EntitlementGrantClaims = {
    sub: user.id,
    feature: featureId,
    tier,
    watermark,
    exp,
    iat: Math.floor(now() / 1000),
    jti: `grant_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    scope: watermark ? 'export:watermarked' : 'export:unwatermarked',
  };

  // Sign strictly with dedicated GRANT_SIGNING_SECRET
  const grant = await signGrant(grantClaims, env.GRANT_SIGNING_SECRET);

  const responseData = { allowed: true, tier, watermark, grant, expiresIn: 300 };

  // Store in idempotency ledger if key was provided
  if (validatedKey) {
    await saveIdempotencyRecord(db, {
      userId: user.id,
      key: validatedKey,
      featureId,
      payloadHash,
      responseStatus: 200,
      responseBody: responseData,
    });
  }

  return jsonOk(responseData);
}
