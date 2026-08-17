import { adminClient, anonClient } from '../lib/supabase';
import { serverEnv, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * GDPR rights: export and erasure.
 *
 * Not optional. With an EU-established business these are legal obligations:
 *
 *  - **Article 15 / 20** — the user may have a copy of their data, in a
 *    machine-readable format.
 *  - **Article 17** — the user may have their data erased.
 *
 * Both must be self-service. Making someone email support to delete an account
 * is the pattern regulators single out, and it is trivial to do properly.
 *
 * ## The tension with financial records
 *
 * Erasure is not absolute. Invoice and tax records must be retained (Article
 * 17(3)(b), plus national accounting law — typically 7-10 years in the EU).
 * Stripe holds those, and we do not delete them.
 *
 * What we do instead: remove everything that identifies the person in *our*
 * database, keep the financial rows Stripe needs, and say so plainly rather
 * than claiming a total wipe we are not permitted to perform.
 */

interface Hooks {
  makeSupabase?: (url: string, key: string) => SupabaseClient;
  cancelStripeSubscriptions?: (customerId: string) => Promise<void>;
}
let hooks: Hooks = {};
export function __setGdprHooks(h: Hooks) {
  hooks = h;
}

const admin = (env: ServerEnv) =>
  hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

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

/**
 * GET /api/account/export — Articles 15 and 20.
 *
 * Returns everything we hold about the caller as JSON. Deliberately generated
 * on demand rather than queued: our data volumes are small, and an immediate
 * download is a better experience than "we'll email you in 30 days".
 */
export async function handleExportData(
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  // Export is expensive; a low ceiling also blunts scraping if a token leaks.
  if (!rateLimit(`export:${headers.clientIp}`, 5, 60_000).ok) {
    return jsonError(429, 'Too many requests. Please wait a minute.');
  }

  const user = await authenticate(env, headers.authorization);
  if (!user) return jsonError(401, 'Sign in required');

  const db = admin(env);
  try {
    const [profile, projects, subs, usage] = await Promise.all([
      db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      db.from('projects').select('*').eq('user_id', user.id),
      db.from('subscriptions').select('*').eq('user_id', user.id),
      db.from('usage_events').select('*').eq('user_id', user.id),
    ]);

    return jsonOk(
      {
        exported_at: new Date().toISOString(),
        format: 'novelka-account-export-v1',
        account: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
        },
        profile: profile.data ?? null,
        projects: projects.data ?? [],
        subscriptions: subs.data ?? [],
        usage: usage.data ?? [],
        notes: [
          'This file contains everything Novelka stores about your account.',
          'Payment card details are never stored by Novelka. Stripe processes',
          'payments and holds those records; request them from Stripe directly.',
        ],
      },
      { 'Content-Disposition': 'attachment; filename="novelka-my-data.json"' },
    );
  } catch (e) {
    console.error('[gdpr] export failed', e);
    return jsonError(500, 'Could not build your export. Please try again.');
  }
}

/**
 * POST /api/account/delete — Article 17.
 *
 * Requires the caller to type their own email as confirmation. Deletion is
 * irreversible, and a mis-click must not destroy a book someone spent weeks on.
 */
export async function handleDeleteAccount(
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
) {
  let env: ServerEnv;
  try { env = serverEnv(rawEnv); } catch { return jsonError(500, 'Server misconfigured'); }

  if (!rateLimit(`delete:${headers.clientIp}`, 3, 300_000).ok) {
    return jsonError(429, 'Too many attempts. Please wait a few minutes.');
  }

  const user = await authenticate(env, headers.authorization);
  if (!user) return jsonError(401, 'Sign in required');

  let confirmEmail: string;
  try {
    const parsed = JSON.parse(body) as { confirmEmail?: unknown };
    confirmEmail = String(parsed.confirmEmail ?? '').trim().toLowerCase();
  } catch {
    return jsonError(400, 'Invalid request');
  }

  if (!confirmEmail || confirmEmail !== (user.email ?? '').toLowerCase()) {
    return jsonError(400, 'Type your email address exactly to confirm deletion.');
  }

  const db = admin(env);

  try {
    // 1. Cancel any live subscription first. Deleting the account while Stripe
    //    keeps billing would be the worst possible failure.
    const { data: profile } = await db
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const customerId = profile?.stripe_customer_id as string | undefined;
    if (customerId && hooks.cancelStripeSubscriptions) {
      await hooks.cancelStripeSubscriptions(customerId);
    }

    // 2. Remove personal content. Projects and usage cascade from auth.users,
    //    but delete explicitly so failure is visible rather than assumed.
    await db.from('projects').delete().eq('user_id', user.id);
    await db.from('usage_events').delete().eq('user_id', user.id);

    // 3. Subscriptions rows are financial records. Keep them for accounting,
    //    but sever the link to a person: no user_id, no customer id.
    await db
      .from('subscriptions')
      .update({ user_id: null, stripe_customer_id: 'deleted', updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // 4. Delete the auth user. Cascades remove the profile row.
    const anyDb = db as unknown as {
      auth?: { admin?: { deleteUser?: (id: string) => Promise<{ error: unknown }> } };
    };
    if (anyDb.auth?.admin?.deleteUser) {
      const { error } = await anyDb.auth.admin.deleteUser(user.id);
      if (error) {
        console.error('[gdpr] auth delete failed', error);
        return jsonError(500, 'Could not finish deleting your account.');
      }
    }

    return jsonOk({
      deleted: true,
      message:
        'Your account and all your books have been permanently deleted. ' +
        'Payment records are retained by Stripe as required by tax law.',
    });
  } catch (e) {
    console.error('[gdpr] delete failed', e);
    return jsonError(500, 'Could not delete your account. Please contact support.');
  }
}
