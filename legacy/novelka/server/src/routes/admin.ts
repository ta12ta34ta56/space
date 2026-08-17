import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../lib/supabase';
import { serverEnv, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';
import { requireOwner, type ProfileRecord } from '../lib/auth';
import { logAdminAction } from '../lib/audit';

interface AdminHooks {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
  now?: () => number;
}
let adminHooks: AdminHooks = {};
export function __setAdminHooks(h: AdminHooks) {
  adminHooks = h;
}

function adminDb(env: ServerEnv) {
  return adminHooks.makeSupabase
    ? adminHooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

const VALID_TIERS = new Set(['free', 'basic', 'pro', 'enterprise']);
const VALID_TEMPLATE_STATUSES = new Set(['draft', 'published', 'unpublished', 'archived']);

// ============================================================================
// 1. GET /api/admin/overview
// ============================================================================
export async function handleAdminOverview(
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  const db = adminDb(env);

  // 1. User profiles & tiers
  const { data: profiles, error: pErr } = await db
    .from('profiles')
    .select('id, tier');

  if (pErr) return jsonError(500, 'Failed to query user profiles');

  const tierBreakdown: Record<string, number> = { free: 0, basic: 0, pro: 0, enterprise: 0 };
  for (const p of profiles ?? []) {
    const t = (p.tier as string) || 'free';
    tierBreakdown[t] = (tierBreakdown[t] ?? 0) + 1;
  }

  // 2. Active subscriptions
  const { data: subs } = await db
    .from('subscriptions')
    .select('id, status')
    .in('status', ['active', 'trialing']);

  // 3. Templates counts
  const { data: tmpls } = await db
    .from('templates')
    .select('id, status');

  const templatesBreakdown: Record<string, number> = { published: 0, draft: 0, unpublished: 0, archived: 0 };
  for (const t of tmpls ?? []) {
    const s = (t.status as string) || 'draft';
    templatesBreakdown[s] = (templatesBreakdown[s] ?? 0) + 1;
  }

  // 4. Daily exports today
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await db
    .from('usage_events')
    .select('count')
    .eq('feature_id', 'export_pdf')
    .eq('day', today);

  let dailyExportsToday = 0;
  for (const u of usage ?? []) {
    dailyExportsToday += Number(u.count ?? 0);
  }

  return jsonOk({
    ok: true,
    metrics: {
      totalUsers: (profiles ?? []).length,
      tierBreakdown,
      activeSubscriptions: (subs ?? []).length,
      templates: templatesBreakdown,
      dailyExportsToday,
    },
  });
}

// ============================================================================
// 2. GET /api/admin/users
// ============================================================================
export async function handleAdminListUsers(
  url: URL,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  const db = adminDb(env);

  const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);
  const offsetParam = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);
  const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();

  let query = db
    .from('profiles')
    .select('id, email, display_name, tier, is_owner, stripe_customer_id, created_at, updated_at', { count: 'exact' });

  if (search) {
    query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return jsonError(500, 'Failed to list users');

  const users = (data ?? []).map((u: ProfileRecord) => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name ?? '',
    tier: u.tier,
    isOwner: u.is_owner === true,
    stripeCustomerId: u.stripe_customer_id ?? null,
    createdAt: u.created_at ?? new Date().toISOString(),
    updatedAt: u.updated_at ?? new Date().toISOString(),
  }));

  return jsonOk({
    ok: true,
    users,
    total: count ?? users.length,
  });
}

// ============================================================================
// 3. PATCH /api/admin/users/:id/tier
// ============================================================================
export async function handleAdminUpdateUserTier(
  targetUserId: string,
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  if (!targetUserId || !/^[a-zA-Z0-9_-]{1,64}$/.test(targetUserId)) {
    return jsonError(400, 'Invalid user ID format');
  }

  let parsed: { tier?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const newTier = String(parsed.tier ?? '').toLowerCase();
  if (!VALID_TIERS.has(newTier)) {
    return jsonError(400, `Invalid tier: must be one of ${Array.from(VALID_TIERS).join(', ')}`);
  }
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : undefined;

  const db = adminDb(env);

  // Load existing profile
  const { data: targetProfile, error: pErr } = await db
    .from('profiles')
    .select('id, email, tier, is_owner')
    .eq('id', targetUserId)
    .maybeSingle();

  if (pErr || !targetProfile) {
    return jsonError(404, 'User not found');
  }

  const previousTier = targetProfile.tier;
  const nowIso = new Date().toISOString();

  // Update tier
  const { error: uErr } = await db
    .from('profiles')
    .update({ tier: newTier, updated_at: nowIso })
    .eq('id', targetUserId);

  if (uErr) return jsonError(500, 'Failed to update user tier');

  // Record audit log
  await logAdminAction(db, {
    actorUserId: auth.user.id,
    action: 'user.tier_override',
    targetType: 'user',
    targetId: targetUserId,
    beforeState: { tier: previousTier },
    afterState: { tier: newTier },
    ipAddress: headers.clientIp,
    reason,
  });

  return jsonOk({
    ok: true,
    userId: targetUserId,
    previousTier,
    newTier,
    updatedAt: nowIso,
  });
}

// ============================================================================
// 4. GET /api/admin/flags
// ============================================================================
export async function handleAdminListFlags(
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  const db = adminDb(env);

  const { data: flags, error } = await db
    .from('feature_flags')
    .select('feature_id, enabled, route_free, route_ad, route_paid, min_tier, daily_limit, ad_unlock_minutes, note, updated_at')
    .order('feature_id', { ascending: true });

  if (error) return jsonError(500, 'Failed to fetch feature flags');

  const mapped = (flags ?? []).map((f: Record<string, unknown>) => ({
    featureId: f.feature_id,
    enabled: f.enabled === true,
    routeFree: f.route_free === true,
    routeAd: f.route_ad === true,
    routePaid: f.route_paid === true,
    minTier: f.min_tier ?? 'basic',
    dailyLimit: f.daily_limit ?? null,
    adUnlockMinutes: f.ad_unlock_minutes ?? null,
    note: f.note ?? '',
    updatedAt: f.updated_at ?? new Date().toISOString(),
  }));

  return jsonOk({ ok: true, flags: mapped });
}

// ============================================================================
// 5. PUT /api/admin/flags/:featureKey
// ============================================================================
export async function handleAdminUpdateFlag(
  featureKey: string,
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  if (!featureKey || !/^[a-z0-9_]{1,64}$/.test(featureKey)) {
    return jsonError(400, 'Invalid feature key format. Must be lowercase alphanumeric with underscores.');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  if (parsed.minTier && !VALID_TIERS.has(String(parsed.minTier))) {
    return jsonError(400, `Invalid minTier: must be one of ${Array.from(VALID_TIERS).join(', ')}`);
  }

  const db = adminDb(env);

  // Load existing flag
  const { data: oldFlag } = await db
    .from('feature_flags')
    .select('*')
    .eq('feature_id', featureKey)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    feature_id: featureKey,
    updated_at: nowIso,
  };

  if (typeof parsed.enabled === 'boolean') updateData.enabled = parsed.enabled;
  if (typeof parsed.routeFree === 'boolean') updateData.route_free = parsed.routeFree;
  if (typeof parsed.routeAd === 'boolean') updateData.route_ad = parsed.routeAd;
  if (typeof parsed.routePaid === 'boolean') updateData.route_paid = parsed.routePaid;
  if (parsed.minTier) updateData.min_tier = parsed.minTier;
  if (parsed.dailyLimit !== undefined) updateData.daily_limit = parsed.dailyLimit === null ? null : Number(parsed.dailyLimit);
  if (parsed.adUnlockMinutes !== undefined) updateData.ad_unlock_minutes = parsed.adUnlockMinutes === null ? null : Number(parsed.adUnlockMinutes);
  if (typeof parsed.note === 'string') updateData.note = parsed.note.slice(0, 500);

  const { error } = await db
    .from('feature_flags')
    .upsert(updateData, { onConflict: 'feature_id' });

  if (error) return jsonError(500, 'Failed to update feature flag');

  await logAdminAction(db, {
    actorUserId: auth.user.id,
    action: 'flag.update',
    targetType: 'feature_flag',
    targetId: featureKey,
    beforeState: oldFlag ?? null,
    afterState: updateData,
    ipAddress: headers.clientIp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  });

  return jsonOk({ ok: true, featureId: featureKey, updatedAt: nowIso });
}

// ============================================================================
// 6. GET /api/admin/templates
// ============================================================================
export async function handleAdminListTemplates(
  url: URL,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  const db = adminDb(env);

  let query = db
    .from('templates')
    .select('id, version, name, description, generator_kinds, supported_sizes, schema_payload, style_tokens, status, access_level, created_by, published_at, created_at, updated_at');

  const statusFilter = url.searchParams.get('status');
  if (statusFilter && VALID_TEMPLATE_STATUSES.has(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return jsonError(500, 'Failed to list templates');

  const templates = (data ?? []).map((t: Record<string, unknown>) => ({
    templateId: t.id,
    version: t.version ?? '1.0.0',
    name: t.name,
    description: t.description ?? '',
    generatorKinds: t.generator_kinds ?? ['wordsearch'],
    supportedSizes: t.supported_sizes ?? ['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9'],
    schemaPayload: t.schema_payload ?? {},
    styleTokens: t.style_tokens ?? {},
    status: t.status ?? 'draft',
    accessLevel: t.access_level ?? 'free',
    createdBy: t.created_by ?? null,
    publishedAt: t.published_at ?? null,
    createdAt: t.created_at ?? new Date().toISOString(),
    updatedAt: t.updated_at ?? new Date().toISOString(),
  }));

  return jsonOk({ ok: true, templates });
}

// ============================================================================
// 7. POST /api/admin/templates
// ============================================================================
export async function handleAdminCreateTemplate(
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const templateId = String(parsed.templateId ?? parsed.id ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,64}$/.test(templateId)) {
    return jsonError(400, 'Invalid templateId. Must be 2-64 lowercase alphanumeric, underscore or hyphen characters.');
  }

  const name = String(parsed.name ?? '').trim();
  if (!name) return jsonError(400, 'Template name is required');

  const version = String(parsed.version ?? '1.0.0').trim();
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    return jsonError(400, 'Invalid semver version format');
  }

  const status = String(parsed.status ?? 'draft').toLowerCase();
  if (!VALID_TEMPLATE_STATUSES.has(status)) {
    return jsonError(400, `Invalid status: must be one of ${Array.from(VALID_TEMPLATE_STATUSES).join(', ')}`);
  }

  const accessLevel = String(parsed.accessLevel ?? 'free').toLowerCase();
  if (!VALID_TIERS.has(accessLevel)) {
    return jsonError(400, `Invalid accessLevel: must be one of ${Array.from(VALID_TIERS).join(', ')}`);
  }

  const generatorKinds = Array.isArray(parsed.generatorKinds) && parsed.generatorKinds.length > 0
    ? parsed.generatorKinds.map(String)
    : ['wordsearch'];

  const supportedSizes = Array.isArray(parsed.supportedSizes) && parsed.supportedSizes.length > 0
    ? parsed.supportedSizes.map(String)
    : ['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9'];

  const schemaPayload = typeof parsed.schemaPayload === 'object' && parsed.schemaPayload !== null
    ? parsed.schemaPayload
    : (typeof parsed.rulesPayload === 'object' && parsed.rulesPayload !== null ? parsed.rulesPayload : {});

  const styleTokens = typeof parsed.styleTokens === 'object' && parsed.styleTokens !== null
    ? parsed.styleTokens
    : {};

  const db = adminDb(env);

  // Check collision
  const { data: existing } = await db
    .from('templates')
    .select('id')
    .eq('id', templateId)
    .maybeSingle();

  if (existing) {
    return jsonError(409, `Template with ID '${templateId}' already exists`);
  }

  const nowIso = new Date().toISOString();
  const publishedAt = status === 'published' ? nowIso : null;

  const insertRecord = {
    id: templateId,
    version,
    name,
    description: String(parsed.description ?? '').slice(0, 500),
    generator_kinds: generatorKinds,
    supported_sizes: supportedSizes,
    schema_payload: schemaPayload,
    style_tokens: styleTokens,
    status,
    access_level: accessLevel,
    created_by: auth.user.id,
    published_at: publishedAt,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await db.from('templates').insert(insertRecord);
  if (error) return jsonError(500, 'Failed to create template');

  await logAdminAction(db, {
    actorUserId: auth.user.id,
    action: 'template.create',
    targetType: 'template',
    targetId: templateId,
    afterState: { templateId, version, name, status, accessLevel },
    ipAddress: headers.clientIp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  });

  return jsonOk({
    ok: true,
    template: {
      templateId,
      version,
      name,
      description: insertRecord.description,
      generatorKinds,
      supportedSizes,
      schemaPayload,
      styleTokens,
      status,
      accessLevel,
      createdBy: auth.user.id,
      publishedAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  });
}

// ============================================================================
// 8. PATCH /api/admin/templates/:id
// ============================================================================
export async function handleAdminUpdateTemplate(
  templateId: string,
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  if (!templateId) return jsonError(400, 'Template ID is required');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const db = adminDb(env);

  const { data: existing, error: getErr } = await db
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (getErr || !existing) return jsonError(404, 'Template not found');

  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    updated_at: nowIso,
  };

  if (typeof parsed.name === 'string' && parsed.name.trim()) {
    updateData.name = parsed.name.trim();
  }
  if (typeof parsed.description === 'string') {
    updateData.description = parsed.description.slice(0, 500);
  }
  if (typeof parsed.version === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(parsed.version.trim())) {
    updateData.version = parsed.version.trim();
  }
  if (Array.isArray(parsed.generatorKinds) && parsed.generatorKinds.length > 0) {
    updateData.generator_kinds = parsed.generatorKinds.map(String);
  }
  if (Array.isArray(parsed.supportedSizes) && parsed.supportedSizes.length > 0) {
    updateData.supported_sizes = parsed.supportedSizes.map(String);
  }
  if (typeof parsed.schemaPayload === 'object' && parsed.schemaPayload !== null) {
    updateData.schema_payload = parsed.schemaPayload;
  } else if (typeof parsed.rulesPayload === 'object' && parsed.rulesPayload !== null) {
    updateData.schema_payload = parsed.rulesPayload;
  }
  if (typeof parsed.styleTokens === 'object' && parsed.styleTokens !== null) {
    updateData.style_tokens = parsed.styleTokens;
  }
  if (parsed.accessLevel && VALID_TIERS.has(String(parsed.accessLevel).toLowerCase())) {
    updateData.access_level = String(parsed.accessLevel).toLowerCase();
  }

  const { error } = await db
    .from('templates')
    .update(updateData)
    .eq('id', templateId);

  if (error) return jsonError(500, 'Failed to update template');

  await logAdminAction(db, {
    actorUserId: auth.user.id,
    action: 'template.update',
    targetType: 'template',
    targetId: templateId,
    beforeState: existing,
    afterState: updateData,
    ipAddress: headers.clientIp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  });

  return jsonOk({
    ok: true,
    template: {
      templateId,
      ...existing,
      ...updateData,
    },
  });
}

// ============================================================================
// 9. PATCH / PUT /api/admin/templates/:id/status
// ============================================================================
export async function handleAdminUpdateTemplateStatus(
  templateId: string,
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  if (!templateId) return jsonError(400, 'Template ID is required');

  let parsed: { status?: unknown; reason?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const newStatus = String(parsed.status ?? '').toLowerCase();
  if (!VALID_TEMPLATE_STATUSES.has(newStatus)) {
    return jsonError(400, `Invalid status: must be one of ${Array.from(VALID_TEMPLATE_STATUSES).join(', ')}`);
  }

  const db = adminDb(env);

  const { data: existing, error: getErr } = await db
    .from('templates')
    .select('id, status, published_at')
    .eq('id', templateId)
    .maybeSingle();

  if (getErr || !existing) return jsonError(404, 'Template not found');

  const previousStatus = existing.status;
  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: nowIso,
  };

  if (newStatus === 'published' && !existing.published_at) {
    updateData.published_at = nowIso;
  }

  const { error } = await db
    .from('templates')
    .update(updateData)
    .eq('id', templateId);

  if (error) return jsonError(500, 'Failed to transition template status');

  await logAdminAction(db, {
    actorUserId: auth.user.id,
    action: 'template.status_change',
    targetType: 'template',
    targetId: templateId,
    beforeState: { status: previousStatus },
    afterState: { status: newStatus },
    ipAddress: headers.clientIp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  });

  return jsonOk({
    ok: true,
    templateId,
    previousStatus,
    currentStatus: newStatus,
    updatedAt: nowIso,
  });
}

// ============================================================================
// 10. GET /api/admin/audit-logs
// ============================================================================
export async function handleAdminListAuditLogs(
  url: URL,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`admin:${headers.clientIp}`, 60, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const auth = await requireOwner(headers, env, adminHooks);
  if (!auth.ok) return auth.response;

  const db = adminDb(env);

  const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1), 100);
  const offsetParam = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  let query = db
    .from('admin_audit_logs')
    .select('id, actor_user_id, action, target_type, target_id, before_state, after_state, ip_address, request_id, reason, created_at', { count: 'exact' });

  const actionFilter = url.searchParams.get('action');
  if (actionFilter) query = query.eq('action', actionFilter);

  const targetTypeFilter = url.searchParams.get('targetType');
  if (targetTypeFilter) query = query.eq('target_type', targetTypeFilter);

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return jsonError(500, 'Failed to fetch audit logs');

  const logs = (data ?? []).map((l: Record<string, unknown>) => ({
    id: l.id,
    actorUserId: l.actor_user_id,
    action: l.action,
    targetType: l.target_type,
    targetId: l.target_id,
    beforeState: l.before_state ?? null,
    afterState: l.after_state ?? null,
    ipAddress: l.ip_address ?? 'unknown',
    requestId: l.request_id ?? '',
    reason: l.reason ?? '',
    createdAt: l.created_at ?? new Date().toISOString(),
  }));

  return jsonOk({
    ok: true,
    logs,
    total: count ?? logs.length,
  });
}
