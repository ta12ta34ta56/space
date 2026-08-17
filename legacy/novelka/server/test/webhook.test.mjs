/**
 * Stripe webhook security tests.
 *
 * These use a REAL Stripe signature implementation and a fake Supabase, so the
 * signature checks are genuine. The attacks are what someone would actually try
 * against a public webhook URL.
 */
import Stripe from 'stripe';
import crypto from 'node:crypto';

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const WEBHOOK_SECRET = 'whsec_' + 'a'.repeat(32);

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'header.payload.signature',
  SUPABASE_ANON_KEY: 'header.payload.sig',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_basic',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
};

/** Sign a payload exactly the way Stripe does. */
function sign(payload, secret = WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const signed = `${timestamp}.${payload}`;
  // Stripe HMACs with the FULL secret string, prefix included.
  const sig = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

// ---- fake Supabase -------------------------------------------------------
function makeFakeSupabase() {
  const state = { events: new Set(), profiles: new Map(), subs: new Map(), writes: [] };
  const api = {
    from(table) {
      return {
        insert(row) {
          if (table === 'webhook_events') {
            if (state.events.has(row.id)) {
              return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
            }
            state.events.add(row.id);
            return Promise.resolve({ error: null });
          }
          return Promise.resolve({ error: null });
        },
        upsert(row) {
          if (table === 'subscriptions') state.subs.set(row.stripe_subscription_id, row);
          state.writes.push({ table, op: 'upsert', row });
          return Promise.resolve({ error: null });
        },
        update(row) {
          return {
            eq(_col, val) {
              if (table === 'profiles') {
                state.profiles.set(val, { ...(state.profiles.get(val) ?? {}), ...row });
              }
              state.writes.push({ table, op: 'update', row, id: val });
              return Promise.resolve({ error: null });
            },
          };
        },
        delete() {
          return { eq: (_c, v) => { state.events.delete(v); return Promise.resolve({ error: null }); } };
        },
        select() {
          const chain = {
            eq(_c, v) {
              chain._v = v;
              return chain;
            },
            maybeSingle: () => Promise.resolve({ data: { id: 'user-1' } }),
            then(res) {
              const rows = [...state.subs.values()].map((s) => ({ tier: s.tier, status: s.status }));
              return Promise.resolve({ data: rows }).then(res);
            },
          };
          return chain;
        },
      };
    },
    _state: state,
  };
  return api;
}

// ---- import the handler with injected fakes ------------------------------
const mod = await import('../dist-test/stripe-webhook.mjs');
const { handleStripeWebhook, __setTestHooks } = mod;
// A real database persists between requests; a per-call fake would make the
// idempotency test vacuous. One shared instance.
const SHARED_DB = makeFakeSupabase();
__setTestHooks({
  makeSupabase: () => SHARED_DB,
  makeStripe: (key) => {
    const real = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
    return {
      webhooks: real.webhooks, // REAL signature verification
      subscriptions: {
        retrieve: async (id) => ({
          id,
          status: 'active',
          customer: 'cus_1',
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          metadata: { supabase_user_id: 'user-1' },
          items: { data: [{ price: { id: 'price_pro' } }] },
        }),
      },
      customers: { retrieve: async () => ({ deleted: false, metadata: { supabase_user_id: 'user-1' } }) },
    };
  },
});

const subEvent = (id = 'evt_1') => JSON.stringify({
  id, type: 'customer.subscription.updated',
  data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1',
    metadata: { supabase_user_id: 'user-1' },
    items: { data: [{ price: { id: 'price_pro' } }] } } },
});

console.log('\n=== signature verification ===');
{
  const body = subEvent('evt_sig1');
  let r = await handleStripeWebhook(body, null, ENV);
  check('missing signature is rejected', r.status === 400, `got ${r.status}`);

  r = await handleStripeWebhook(body, 't=1,v1=deadbeef', ENV);
  check('forged signature is rejected', r.status === 400, `got ${r.status}`);

  r = await handleStripeWebhook(body, sign(body, 'whsec_' + 'b'.repeat(32)), ENV);
  check('signature from the WRONG secret is rejected', r.status === 400, `got ${r.status}`);

  // Tamper with the body after signing — the classic attack.
  const good = sign(body);
  const tampered = body.replace('price_pro', 'price_ent');
  r = await handleStripeWebhook(tampered, good, ENV);
  check('body tampered after signing is rejected', r.status === 400, `got ${r.status}`);

  // An old signature replayed much later must fail Stripe's tolerance window.
  const oldTs = Math.floor(Date.now() / 1000) - 7200;
  r = await handleStripeWebhook(body, sign(body, WEBHOOK_SECRET, oldTs), ENV);
  check('stale timestamp is rejected (replay window)', r.status === 400, `got ${r.status}`);

  r = await handleStripeWebhook(body, sign(body), ENV);
  check('a genuine signature is accepted', r.status === 200, `got ${r.status} ${r.body}`);
}

console.log('\n=== idempotency ===');
{
  const body = subEvent('evt_dup');
  const sig = sign(body);
  const first = await handleStripeWebhook(body, sig, ENV);
  const second = await handleStripeWebhook(body, sig, ENV);
  check('first delivery is processed', first.status === 200 && !JSON.parse(first.body).duplicate);
  check('replay returns 200 (so Stripe stops retrying)', second.status === 200);
  check('replay is flagged as duplicate, not reprocessed',
    JSON.parse(second.body).duplicate === true, second.body);
}

console.log('\n=== unhandled events ===');
{
  const body = JSON.stringify({ id: 'evt_other', type: 'customer.created', data: { object: {} } });
  const r = await handleStripeWebhook(body, sign(body), ENV);
  check('unknown event type is acknowledged, not errored', r.status === 200, r.body);
  check('and marked ignored', JSON.parse(r.body).ignored === 'customer.created');
}

console.log('\n=== error leakage ===');
{
  const body = subEvent('evt_leak');
  const r = await handleStripeWebhook(body, 't=1,v1=bad', ENV);
  const text = r.body.toLowerCase();
  check('no stack trace in the response', !text.includes('at ') && !text.includes('.ts:'));
  check('the webhook secret is never echoed', !r.body.includes(WEBHOOK_SECRET));
  check('no supabase key in the response', !r.body.includes(ENV.SUPABASE_SERVICE_ROLE_KEY));
}

console.log('\n=== env validation ===');
{
  const { serverEnv } = await import('../dist-test/env.mjs');
  let threw = false;
  try { serverEnv({ ...ENV, STRIPE_WEBHOOK_SECRET: '' }); } catch { threw = true; }
  check('boot fails when the webhook secret is missing', threw);

  threw = false;
  try { serverEnv({ ...ENV, STRIPE_SECRET_KEY: 'pk_live_oops' }); } catch { threw = true; }
  check('a publishable key in the secret slot is caught', threw);

  let msg = '';
  try { serverEnv({}); } catch (e) { msg = e.message; }
  check('missing vars are named', msg.includes('STRIPE_SECRET_KEY'), msg);
  check('but their VALUES are never printed', !msg.includes('sk_test'));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1; }
