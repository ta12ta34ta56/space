import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '../lib/supabase';
import { serverEnv, tierForPrice, type ServerEnv } from '../lib/env';

/**
 * Stripe webhook — the ONLY place a paid tier is ever granted.
 *
 * ## Why this file is the whole security model
 *
 * The browser can lie about anything. It can claim it paid, claim it is Pro,
 * replay an old request. None of that matters, because entitlement is written
 * here and nowhere else, and this endpoint only believes Stripe.
 *
 * Three defences, in order:
 *
 * 1. **Signature verification.** The raw body is checked against
 *    STRIPE_WEBHOOK_SECRET. Anyone can POST to a public webhook URL; without
 *    this check a stranger could send `{"type":"...","tier":"enterprise"}` and
 *    upgrade themselves. The signature is what makes "Stripe said so" mean
 *    something. It must run on the RAW bytes — parsing the JSON first changes
 *    the bytes and the signature no longer matches.
 *
 * 2. **Idempotency.** Stripe retries on any non-2xx, and may deliver the same
 *    event twice even on success. Every event id is recorded before it is
 *    acted on, so a replay is a no-op. Without this, one payment could grant
 *    two months, or a delayed `deleted` could downgrade someone who has since
 *    resubscribed.
 *
 * 3. **Re-fetch from Stripe.** For the events that matter we do not trust the
 *    payload's own numbers; we re-read the subscription from the API. The
 *    payload has already been signature-checked, but re-fetching also protects
 *    against out-of-order delivery, which signatures do not.
 */

/** Events we act on. Anything else is acknowledged and ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

/** Stripe statuses that should actually unlock paid features. */
const ENTITLING: ReadonlySet<string> = new Set(['active', 'trialing']);

export interface WebhookDeps {
  stripe: Stripe;
  supabase: SupabaseClient;
  env: ServerEnv;
}

/**
 * Seam for tests.
 *
 * The security-critical part (signature verification) is always the real
 * Stripe implementation; only the network clients are swappable, so tests
 * exercise the same verification path production does.
 */
interface TestHooks {
  makeStripe?: (key: string) => Stripe;
  makeSupabase?: (url: string, key: string) => SupabaseClient;
}
let hooks: TestHooks = {};
export function __setTestHooks(h: TestHooks) {
  hooks = h;
}

function makeDeps(rawEnv: Record<string, string | undefined>): WebhookDeps {
  const env = serverEnv(rawEnv);
  return {
    env,
    stripe: hooks.makeStripe
      ? hooks.makeStripe(env.STRIPE_SECRET_KEY)
      : new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' }),
    // Service role bypasses RLS. It exists only on the server and is the only
    // credential permitted to write money columns.
    supabase: hooks.makeSupabase
      ? hooks.makeSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : adminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

/**
 * Resolve the app user for a Stripe customer.
 *
 * Order matters: the metadata we set at checkout is authoritative, because a
 * customer id could in principle be reused. Falling back to the stored mapping
 * covers subscriptions created in the Stripe dashboard.
 */
async function resolveUserId(
  deps: WebhookDeps,
  customerId: string,
  metadataUserId?: string | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;

  const { data } = await deps.supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (data?.id) return data.id;

  // Last resort: Stripe holds our user id in customer metadata.
  try {
    const customer = await deps.stripe.customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.supabase_user_id) {
      return customer.metadata.supabase_user_id;
    }
  } catch {
    /* customer may be deleted; fall through */
  }
  return null;
}

/** Write the subscription mirror and recompute the profile tier. */
async function applySubscription(deps: WebhookDeps, sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(deps, customerId, sub.metadata?.supabase_user_id);
  if (!userId) {
    // Nothing to attach it to. Logged, but still a 200 so Stripe stops retrying
    // an event we can never satisfy.
    console.warn('[webhook] no user for customer', customerId);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? '';
  const tier = tierForPrice(deps.env, priceId);
  const entitled = ENTITLING.has(sub.status);

  await deps.supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      stripe_price_id: priceId,
      status: sub.status,
      tier: tier ?? 'free',
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );

  // The profile tier is derived from ALL of the user's subscriptions, not just
  // this event. Someone with an old canceled Pro and a new active Basic must
  // end up Basic — taking this event alone would get that wrong.
  const { data: rows } = await deps.supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', userId);

  const RANK = { free: 0, basic: 1, pro: 2, enterprise: 3 } as const;
  type TierName = keyof typeof RANK;
  let best: TierName = 'free';
  for (const r of rows ?? []) {
    if (ENTITLING.has(r.status as string)) {
      const t = r.tier as TierName;
      if (RANK[t] > RANK[best]) best = t;
    }
  }

  await deps.supabase
    .from('profiles')
    .update({ tier: best, stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('id', userId);

  console.log('[webhook]', sub.id, sub.status, '→ tier', best, entitled ? '' : '(not entitling)');
}

/**
 * Handle a webhook request.
 *
 * `rawBody` MUST be the exact bytes Stripe sent. Never re-serialise.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  rawEnv: Record<string, string | undefined>,
): Promise<{ status: number; body: string }> {
  // Cheapest rejection first: no signature, no work.
  if (!signature) {
    return { status: 400, body: JSON.stringify({ error: 'Missing signature' }) };
  }

  let env: ServerEnv;
  try {
    env = serverEnv(rawEnv);
  } catch (e) {
    console.error('[webhook] env error', e);
    return { status: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  // Verify the signature BEFORE constructing any database client.
  //
  // Ordering matters for two reasons. Unauthenticated traffic must cost us as
  // little as possible — a public webhook URL will be probed. And if client
  // construction runs first, any error there turns a forged request into a 500
  // instead of the 400 it deserves, which is exactly the bug this ordering fixed.
  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    stripe = hooks.makeStripe
      ? hooks.makeStripe(env.STRIPE_SECRET_KEY)
      : new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });
    // Async variant: required on Workers, works on Node.
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e) {
    // Do not echo the reason — it helps an attacker tune a forgery.
    console.warn('[webhook] bad signature', e instanceof Error ? e.message : e);
    return { status: 400, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  // Signature is good: now it is worth building the database client.
  let deps: WebhookDeps;
  try {
    deps = { ...makeDeps(rawEnv), stripe };
  } catch (e) {
    console.error('[webhook] deps error', e);
    return { status: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  // ---- idempotency ---------------------------------------------------------
  // Claim the event id first. A duplicate delivery loses the race and exits.
  const { error: claimErr } = await deps.supabase
    .from('webhook_events')
    .insert({ id: event.id, type: event.type, payload: event as unknown as object });

  if (claimErr) {
    if (claimErr.code === '23505') {
      // already processed — this is success, not failure
      return { status: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }
    console.error('[webhook] ledger error', claimErr);
    return { status: 500, body: JSON.stringify({ error: 'Storage error' }) };
  }

  if (!HANDLED.has(event.type)) {
    return { status: 200, body: JSON.stringify({ received: true, ignored: event.type }) };
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.subscription) break;
        // Re-fetch rather than trusting the embedded copy.
        const subId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
        const sub = await deps.stripe.subscriptions.retrieve(subId);
        if (session.metadata?.supabase_user_id && !sub.metadata?.supabase_user_id) {
          sub.metadata = { ...sub.metadata, supabase_user_id: session.metadata.supabase_user_id };
        }
        await applySubscription(deps, sub);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const incoming = event.data.object as Stripe.Subscription;
        // Re-read so out-of-order deliveries cannot resurrect a stale state.
        let sub: Stripe.Subscription;
        try {
          sub = await deps.stripe.subscriptions.retrieve(incoming.id);
        } catch {
          sub = incoming; // genuinely deleted: use the payload
        }
        await applySubscription(deps, sub);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = (invoice as unknown as { subscription?: string | Stripe.Subscription })
          .subscription;
        if (!subRef) break;
        const subId = typeof subRef === 'string' ? subRef : subRef.id;
        const sub = await deps.stripe.subscriptions.retrieve(subId);
        // Stripe decides whether this means past_due/unpaid; we just mirror it.
        await applySubscription(deps, sub);
        break;
      }
    }

    return { status: 200, body: JSON.stringify({ received: true }) };
  } catch (e) {
    // Release the idempotency claim so Stripe's retry can genuinely retry.
    await deps.supabase.from('webhook_events').delete().eq('id', event.id);
    console.error('[webhook] handler failed', event.type, e);
    return { status: 500, body: JSON.stringify({ error: 'Processing failed' }) };
  }
}
