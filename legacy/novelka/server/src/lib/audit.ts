import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Immutable Administrative Audit Logger.
 *
 * All owner mutations to user tiers, feature flags, and parametric templates
 * must record an entry to `public.admin_audit_logs`.
 */

export interface AuditLogParams {
  actorUserId: string;
  action: string;
  targetType: 'user' | 'feature_flag' | 'template' | 'system';
  targetId: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  requestId?: string;
  reason?: string;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'authorization',
  'key',
  'stripe_secret',
  'stripe_secret_key',
  'service_role_key',
  'card',
  'cvv',
  'credit_card',
]);

/** Recursively sanitize objects to prevent leaking secrets into audit logs. */
export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower) || lower.includes('secret') || lower.includes('token')) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/** Record an immutable administrative audit event. */
export async function logAdminAction(
  db: SupabaseClient,
  entry: AuditLogParams,
): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  try {
    const record = {
      actor_user_id: entry.actorUserId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      before_state: sanitizeAuditData(entry.beforeState),
      after_state: sanitizeAuditData(entry.afterState),
      ip_address: entry.ipAddress || 'unknown',
      request_id: entry.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reason: entry.reason ? String(entry.reason).slice(0, 500) : null,
    };

    const { data, error } = await db
      .from('admin_audit_logs')
      .insert(record)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[audit] failed to write log', error);
      return { ok: false, error };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[audit] exception logging action', err);
    return { ok: false, error: err };
  }
}
