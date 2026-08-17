import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../lib/supabase';
import { serverEnv, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';

/**
 * POST /api/rating — collect app ratings.
 *
 * Deliberately tiny and deliberately open: anyone may rate, signed in or not
 * (requiring an account would quietly throw away most feedback). The route
 * validates the shape, rate-limits per IP so a script cannot flood the table,
 * and lets the client decide whether to attach an email.
 *
 * A rating is the only public write in the whole API, and it is the only one
 * that should be: the data is low-value, non-personal by default, and the
 * table is append-only. RLS keeps reads locked to the service role, so the
 * owner's feedback inbox cannot be scraped through the anon key.
 */

interface Hooks {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
}
let hooks: Hooks = {};
export function __setRatingHooks(h: Hooks) {
  hooks = h;
}

const admin = (env: ServerEnv) =>
  hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleRating(
  body: string,
  headers: { clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`rating:${headers.clientIp}`, 5, 3600_000).ok) {
    return jsonError(429, 'Too many ratings. Thank you for the feedback!');
  }

  let stars: unknown;
  let comment: unknown;
  let email: unknown;
  try {
    const parsed = JSON.parse(body) as { stars?: unknown; comment?: unknown; email?: unknown };
    stars = parsed.stars;
    comment = parsed.comment;
    email = parsed.email;
  } catch {
    return jsonError(400, 'Invalid request');
  }

  // A rating is exactly 1..5 — anything else is a broken or hostile client.
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return jsonError(400, 'A rating must be a whole number from 1 to 5.');
  }
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 1000)) {
    return jsonError(400, 'Comment must be 1000 characters or fewer.');
  }
  if (email !== undefined && email !== null) {
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
      return jsonError(400, 'That email does not look right.');
    }
  }

  const db = admin(env);
  const { error } = await db.from('ratings').insert({
    stars,
    comment: comment ?? null,
    email: email ?? null,
  });

  if (error) {
    console.error('[rating] insert failed', error);
    return jsonError(500, 'Could not save the rating.');
  }

  return jsonOk({ ok: true });
}
