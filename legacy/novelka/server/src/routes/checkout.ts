import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient } from '../lib/supabase';
import { serverEnv, priceForTier, type ServerEnv } from '../lib/env';
import { rateLimit } from '../lib/rate-limit';
import { jsonError, jsonOk } from '../lib/http';

/**
 * Create a Stripe Checkout session.
 *
 * ## PCI note
 *
 * We never see a card. Stripe hosts the payment page; the browser is redirected
 * there and back. No card data touches our servers, our logs, or our database,
 * which keeps us in the lightest PCI scope (SAQ A).
 *
 * ## What the client is NOT allowed to choose
 *
 * The client sends a tier name and nothing else. **The price is looked up on
 * the server** from that name. If the client could send an amount, it would
 * send 1 cent. This is the single most common way small SaaS apps get robbed.
 */

export interface CheckoutDeps {
  stripe: Stripe;
  supabase: SupabaseClient;
  env: ServerEnv;
}

interface Hooks {
  makeStripe?: (key: string) => Stripe;
  makeSupabase?: (url: string, key: string) => SupabaseClient;
}
let hooks: Hooks = {};
export function __setCheckoutHooks(h: Hooks) {
  hooks = h;
}

const VALID_TIERS = new Set(['basic', 'pro', 'enterprise']);

/**
 * Identify the caller from their Supabase access token.
 *
 * The token is verified against Supabase — we never take a user id from the
 * request body. A client that could name its own user id could buy a
 * subscription for someone else, or attach someone else's card to its account.
 */
async function authenticate(
  env: ServerEnv,
  authHeader: string | null,
): Promise<{ id: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const anon = hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
    : anonClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

export async function handleCreateCheckout(
  body: string,
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
  let env: ServerEnv;
  try {
    env = serverEnv(rawEnv);
  } catch (e) {
    console.error('[checkout] env error', e);
    return jsonError(500, 'Server misconfigured');
  }

  // Rate limit before doing any work, keyed by IP.
  const limited = rateLimit(`checkout:${headers.clientIp}`, 10, 60_000);
  if (!limited.ok) {
    return jsonError(429, 'Too many requests. Please wait a moment.', {
      'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)),
    });
  }

  const user = await authenticate(env, headers.authorization);
  if (!user) return jsonError(401, 'Sign in required');

  let tier: string;
  try {
    const parsed = JSON.parse(body) as { tier?: unknown };
    tier = String(parsed.tier ?? '');
  } catch {
    return jsonError(400, 'Invalid request');
  }

  if (!VALID_TIERS.has(tier)) return jsonError(400, 'Unknown plan');

  // Server-side price lookup. The client never sends an amount.
  const priceId = priceForTier(env, tier);
  if (!priceId) return jsonError(500, 'Plan not configured');

  const stripe = hooks.makeStripe
    ? hooks.makeStripe(env.STRIPE_SECRET_KEY)
    : new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  const admin = hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Reuse the Stripe customer if we already have one, so a user does not end
    // up with several customers and several parallel subscriptions.
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/?checkout=success`,
      cancel_url: `${env.APP_URL}/?checkout=cancelled`,
      // Carried onto the subscription so the webhook can attribute it even if
      // the customer lookup ever fails.
      metadata: { supabase_user_id: user.id, tier },
      subscription_data: { metadata: { supabase_user_id: user.id, tier } },
      allow_promotion_codes: true,
    });

    return jsonOk({ url: session.url });
  } catch (e) {
    // Log the detail server-side; return something generic to the client.
    console.error('[checkout] stripe error', e);
    return jsonError(502, 'Could not start checkout. Please try again.');
  }
}

/**
 * Stripe billing portal — lets a customer cancel or change card themselves.
 * Doing this ourselves would mean handling cancellation logic and dunning; the
 * portal is free and always correct.
 */
export async function handleBillingPortal(
  headers: { authorization: string | null; clientIp: string },
  rawEnv: Record<string, string | undefined>,
): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
  let env: ServerEnv;
  try {
    env = serverEnv(rawEnv);
  } catch {
    return jsonError(500, 'Server misconfigured');
  }

  const limited = rateLimit(`portal:${headers.clientIp}`, 10, 60_000);
  if (!limited.ok) return jsonError(429, 'Too many requests.');

  const user = await authenticate(env, headers.authorization);
  if (!user) return jsonError(401, 'Sign in required');

  const admin = hooks.makeSupabase
    ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) return jsonError(400, 'No billing account yet');

  const stripe = hooks.makeStripe
    ? hooks.makeStripe(env.STRIPE_SECRET_KEY)
    : new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id as string,
      return_url: env.APP_URL,
    });
    return jsonOk({ url: session.url });
  } catch (e) {
    console.error('[portal] stripe error', e);
    return jsonError(502, 'Could not open the billing portal.');
  }
}
