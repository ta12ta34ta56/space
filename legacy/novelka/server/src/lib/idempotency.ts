import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Operation-level Idempotency Helpers.
 *
 * Prevents double-spending of daily quotas and handles retries cleanly.
 */

export interface IdempotencyRecord {
  id: string;
  user_id: string;
  key: string;
  feature_id: string;
  payload_hash: string;
  response_status: number;
  response_body: Record<string, unknown>;
  created_at: string;
}

/** Validate format of an Idempotency-Key header. */
export function validateIdempotencyKey(key: string | null): string | null {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 128) return null;
  // Alphanumeric, hyphen, underscore, colon, dot
  if (!/^[A-Za-z0-9_.:-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Canonicalize and hash a payload to detect payload mismatches on key reuse. */
export async function hashPayload(payload: unknown): Promise<string> {
  let str: string;
  if (typeof payload === 'string') {
    try {
      str = JSON.stringify(JSON.parse(payload));
    } catch {
      str = payload;
    }
  } else {
    str = JSON.stringify(payload ?? {});
  }

  const msgUint8 = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Look up an existing idempotency record for a user. */
export async function getIdempotencyRecord(
  db: SupabaseClient,
  userId: string,
  key: string,
): Promise<IdempotencyRecord | null> {
  const { data, error } = await db
    .from('idempotency_keys')
    .select('id, user_id, key, feature_id, payload_hash, response_status, response_body, created_at')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return null;
  return data as IdempotencyRecord;
}

/** Store a completed operation's response against an idempotency key. */
export async function saveIdempotencyRecord(
  db: SupabaseClient,
  record: {
    userId: string;
    key: string;
    featureId: string;
    payloadHash: string;
    responseStatus: number;
    responseBody: Record<string, unknown>;
  },
): Promise<{ ok: boolean; error?: unknown }> {
  const { error } = await db.from('idempotency_keys').insert({
    user_id: record.userId,
    key: record.key,
    feature_id: record.featureId,
    payload_hash: record.payloadHash,
    response_status: record.responseStatus,
    response_body: record.responseBody,
  });

  if (error) {
    console.error('[idempotency] insert error', error);
    return { ok: false, error };
  }
  return { ok: true };
}
