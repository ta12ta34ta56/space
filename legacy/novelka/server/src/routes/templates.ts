import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../lib/supabase';
import { serverEnv, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';

/**
 * Public & Authenticated Template Fetching Endpoint.
 *
 * Normal users and anonymous visitors may ONLY read published templates.
 * Draft, unpublished, and archived templates are rejected and never returned here.
 */

interface TemplateHooks {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
}
let hooks: TemplateHooks = {};
export function __setTemplateHooks(h: TemplateHooks) {
  hooks = h;
}

function getDb(env: ServerEnv) {
  return hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * GET /api/templates — list published parametric templates.
 */
export async function handleGetPublishedTemplates(
  url: URL,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`templates:${headers.clientIp}`, 120, 60_000).ok) {
    return jsonError(429, 'Too many requests.');
  }

  const db = getDb(env);

  let query = db
    .from('templates')
    .select('id, version, name, description, generator_kinds, supported_sizes, schema_payload, style_tokens, status, access_level, published_at, created_at, updated_at')
    .eq('status', 'published');

  const generatorKind = url.searchParams.get('generatorKind');
  if (generatorKind) {
    query = query.contains('generator_kinds', [generatorKind]);
  }

  const { data, error } = await query;
  if (error) return jsonError(500, 'Failed to fetch templates');

  const templates = (data ?? []).map((t: Record<string, unknown>) => ({
    templateId: t.id,
    version: t.version ?? '1.0.0',
    name: t.name,
    description: t.description ?? '',
    generatorKinds: t.generator_kinds ?? ['wordsearch'],
    supportedSizes: t.supported_sizes ?? ['kdp6x9', 'kdp8x10', 'kdp85x11', 'A4', 'custom7x9'],
    schemaPayload: t.schema_payload ?? {},
    styleTokens: t.style_tokens ?? {},
    status: 'published',
    accessLevel: t.access_level ?? 'free',
    publishedAt: t.published_at ?? null,
    createdAt: t.created_at ?? new Date().toISOString(),
    updatedAt: t.updated_at ?? new Date().toISOString(),
  }));

  return jsonOk({ ok: true, templates });
}
