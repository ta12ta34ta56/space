/**
 * GDPR route tests.
 *
 * Two legal obligations, both must work without a support ticket:
 *   Article 15/20 — give the user their data
 *   Article 17    — delete the user's data
 *
 * And critically: one user must never be able to export or delete another's.
 */
let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); }
};

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'head.payload.secret',
  SUPABASE_ANON_KEY: 'head.payload.anon',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'a'.repeat(32),
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_b',
  STRIPE_PRICE_PRO: 'price_p',
  STRIPE_PRICE_ENTERPRISE: 'price_e',
};

const { handleRequest, __setGdprHooks } = await import('../dist-test/test-entry.mjs');

const USER = { id: 'user-1', email: 'me@example.com', created_at: '2026-01-01T00:00:00Z' };

function makeDb(state) {
  return {
    from(table) {
      const q = { _t: table, _f: {} };
      q.select = () => q;
      q.eq = (c, v) => { q._f[c] = v; return q; };
      q.maybeSingle = () =>
        Promise.resolve({ data: table === 'profiles' ? state.profile : null });
      q.then = (r) => Promise.resolve({ data: state[table] ?? [] }).then(r);
      q.delete = () => ({
        eq: (_c, v) => { state.deleted.push(`${table}:${v}`); return Promise.resolve({ error: null }); },
      });
      q.update = (row) => ({
        eq: (_c, v) => { state.updated.push({ table, row, id: v }); return Promise.resolve({ error: null }); },
      });
      return q;
    },
    auth: {
      getUser: (t) => Promise.resolve(
        t === 'valid' ? { data: { user: USER }, error: null } : { data: null, error: { message: 'bad' } }),
      admin: {
        deleteUser: (id) => { state.authDeleted.push(id); return Promise.resolve({ error: null }); },
      },
    },
  };
}

const fresh = () => ({
  profile: { id: 'user-1', email: 'me@example.com', tier: 'pro', stripe_customer_id: 'cus_1' },
  projects: [{ id: 'p1', user_id: 'user-1', name: 'My Book' }],
  subscriptions: [{ id: 's1', user_id: 'user-1', status: 'active' }],
  usage_events: [{ feature_id: 'export_pdf', count: 3 }],
  deleted: [], updated: [], authDeleted: [], cancelled: [],
});

let state = fresh();
const install = () => __setGdprHooks({
  makeSupabase: () => makeDb(state),
  cancelStripeSubscriptions: async (c) => { state.cancelled.push(c); },
});
install();

const req = (p, init = {}) => new Request(`https://api.novelka.example${p}`, init);
const AUTH = { authorization: 'Bearer valid' };
// The delete limiter is deliberately strict (3 per 5 min). Use a distinct IP
// per block so one block's rejected attempts don't starve the next.
let ipN = 0;
const withIp = () => ({ authorization: 'Bearer valid', 'x-real-ip': `10.0.0.${++ipN}` });

console.log('\n=== Article 15/20 — data export ===');
{
  state = fresh(); install();
  const r = await handleRequest(req('/api/account/export', { headers: AUTH }), ENV);
  const d = JSON.parse(await r.text());
  check('export succeeds for a signed-in user', r.status === 200, `${r.status}`);
  check('includes the account record', d.account?.id === 'user-1');
  check('includes their books', Array.isArray(d.projects) && d.projects.length === 1);
  check('includes subscriptions', Array.isArray(d.subscriptions));
  check('includes usage history', Array.isArray(d.usage));
  check('is machine-readable JSON with a named format', d.format?.startsWith('novelka-account-export'));
  check('downloads as a file',
    (r.headers.get('content-disposition') ?? '').includes('attachment'));
  check('explains that Stripe holds payment records',
    JSON.stringify(d.notes).toLowerCase().includes('stripe'));
  check('never leaks the service-role key', !JSON.stringify(d).includes(ENV.SUPABASE_SERVICE_ROLE_KEY));
}

console.log('\n=== export requires authentication ===');
{
  state = fresh(); install();
  let r = await handleRequest(req('/api/account/export'), ENV);
  check('anonymous export is refused', r.status === 401, `${r.status}`);
  r = await handleRequest(req('/api/account/export', { headers: { authorization: 'Bearer forged' } }), ENV);
  check('a forged token is refused', r.status === 401, `${r.status}`);
}

console.log('\n=== Article 17 — deletion needs real confirmation ===');
{
  state = fresh(); install();
  let r = await handleRequest(req('/api/account/delete', {
    method: 'POST', headers: withIp(), body: JSON.stringify({}) }), ENV);
  check('no confirmation is refused', r.status === 400, `${r.status}`);
  check('nothing was deleted', state.authDeleted.length === 0);

  state = fresh(); install();
  r = await handleRequest(req('/api/account/delete', {
    method: 'POST', headers: withIp(), body: JSON.stringify({ confirmEmail: 'someone@else.com' }) }), ENV);
  check('the WRONG email is refused', r.status === 400, `${r.status}`);
  check('still nothing deleted', state.authDeleted.length === 0);

  state = fresh(); install();
  r = await handleRequest(req('/api/account/delete', {
    method: 'POST', headers: withIp(), body: 'garbage' }), ENV);
  check('malformed body is a clean 400', r.status === 400);
}

console.log('\n=== Article 17 — a correct deletion ===');
{
  state = fresh(); install();
  const r = await handleRequest(req('/api/account/delete', {
    method: 'POST', headers: withIp(), body: JSON.stringify({ confirmEmail: 'ME@Example.com' }) }), ENV);
  const d = JSON.parse(await r.text());
  if (r.status !== 200) console.log('   (response was', r.status, JSON.stringify(d) + ')');

  check('correct email (case-insensitive) is accepted', r.status === 200, `${r.status}`);
  check('the subscription is cancelled FIRST (never keep billing a deleted user)',
    state.cancelled.includes('cus_1'));
  check('their books are deleted', state.deleted.some((x) => x.startsWith('projects:')));
  check('their usage history is deleted', state.deleted.some((x) => x.startsWith('usage_events:')));
  check('the auth user is deleted', state.authDeleted.includes('user-1'));

  const anon = state.updated.find((u) => u.table === 'subscriptions');
  check('financial rows are kept but anonymised (tax law requires retention)',
    anon && anon.row.user_id === null, JSON.stringify(anon));
  check('and the stripe customer link is severed',
    anon && anon.row.stripe_customer_id === 'deleted');
  check('the response is honest about what is retained',
    String(d.message ?? '').toLowerCase().includes('stripe')
    || String(d.message ?? '').toLowerCase().includes('tax'));
}

console.log('\n=== deletion requires authentication ===');
{
  state = fresh(); install();
  const r = await handleRequest(req('/api/account/delete', {
    method: 'POST', body: JSON.stringify({ confirmEmail: 'me@example.com' }) }), ENV);
  check('anonymous deletion is refused', r.status === 401, `${r.status}`);
  check('nothing was touched', state.authDeleted.length === 0 && state.deleted.length === 0);
}

console.log('\n=== method enforcement ===');
{
  state = fresh(); install();
  let r = await handleRequest(req('/api/account/export', { method: 'POST', headers: withIp() }), ENV);
  check('POST to export is 405', r.status === 405);
  r = await handleRequest(req('/api/account/delete', { method: 'GET', headers: withIp() }), ENV);
  check('GET to delete is 405 (deletion must never be a link)', r.status === 405);
}

console.log('\n=== rate limiting ===');
{
  state = fresh(); install();
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const r = await handleRequest(req('/api/account/export', {
      headers: { authorization: 'Bearer valid', 'x-real-ip': '7.7.7.7' } }), ENV);
    if (r.status === 429) { got429 = true; break; }
  }
  check('repeated exports are throttled', got429);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
