/**
 * Router tests — real Request/Response objects.
 *
 * The critical one: the Stripe webhook must receive the RAW body. If the
 * router parses and re-serialises, signatures break, every real payment fails,
 * and forgeries become indistinguishable from genuine events.
 */
import crypto from 'node:crypto';

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); }
};

const WHSEC = 'whsec_' + 'a'.repeat(32);
const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'head.payload.secret',
  SUPABASE_ANON_KEY: 'head.payload.anon',
  GRANT_SIGNING_SECRET: 'grant_secret_32_characters_long_for_hmac_test',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: WHSEC,
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_basic',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
  NODE_ENV: 'production',
};

// One bundle so the router and the webhook share module state.
const { handleRequest, __setTestHooks, __setRatingHooks } = await import('../dist-test/test-entry.mjs');

// The router test is about routing, not persistence. Point the Supabase client
// at a stub so a valid signature reaches the handler body instead of dying on
// a network call to a fake host. Signature verification stays REAL.
const seen = new Set();
const mockSupabase = () => ({
  from: () => ({
    insert: (row) => {
      if (seen.has(row?.id)) return Promise.resolve({ error: { code: '23505' } });
      if (row?.id) seen.add(row.id);
      return Promise.resolve({ error: null });
    },
    upsert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    select: () => { const q={ eq:()=>q, maybeSingle:()=>Promise.resolve({data:null}), then:(r)=>Promise.resolve({data:[]}).then(r) }; return q; },
  }),
});

__setTestHooks({ makeSupabase: mockSupabase });
__setRatingHooks({ makeSupabase: mockSupabase });

function sign(payload, secret = WHSEC, ts = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

const req = (path, init = {}) =>
  new Request(`https://api.novelka.example${path}`, init);

console.log('\n=== raw body preservation (the payment-breaking bug) ===');
{
  // Body with awkward whitespace and key order — exactly what re-serialising
  // would silently normalise.
  const raw = '{"id":"evt_raw",  "type":"customer.created",\n  "data":{"object":{}}}';
  const sig = sign(raw);

  const res = await handleRequest(
    req('/api/stripe/webhook', { method: 'POST', body: raw, headers: { 'stripe-signature': sig } }),
    ENV,
  );
  const text = await res.text();
  check('webhook accepts a signature over awkwardly-formatted raw bytes',
    res.status === 200, `${res.status} ${text}`);

  // Prove the test is meaningful: normalised JSON must FAIL the same signature.
  const normalised = JSON.stringify(JSON.parse(raw));
  const res2 = await handleRequest(
    req('/api/stripe/webhook', { method: 'POST', body: normalised, headers: { 'stripe-signature': sig } }),
    ENV,
  );
  check('and re-serialised JSON is rejected (proves rawness matters)',
    res2.status === 400, `${res2.status}`);
}

console.log('\n=== webhook auth ===');
{
  const body = '{"id":"evt_a","type":"customer.created","data":{"object":{}}}';
  let r = await handleRequest(req('/api/stripe/webhook', { method: 'POST', body }), ENV);
  check('missing stripe-signature is rejected', r.status === 400, `${r.status}`);

  r = await handleRequest(req('/api/stripe/webhook', {
    method: 'POST', body, headers: { 'stripe-signature': 't=1,v1=deadbeef' } }), ENV);
  check('forged signature is rejected', r.status === 400, `${r.status}`);

  r = await handleRequest(req('/api/stripe/webhook', { method: 'GET' }), ENV);
  check('GET on the webhook is 405', r.status === 405, `${r.status}`);
}

console.log('\n=== method enforcement ===');
{
  const cases = [
    ['/api/checkout', 'GET', 405],
    ['/api/entitlement', 'POST', 405],
    ['/api/entitlement/consume', 'GET', 405],
    ['/api/billing-portal', 'GET', 405],
  ];
  let allOk = true;
  for (const [path, method, want] of cases) {
    const r = await handleRequest(req(path, { method }), ENV);
    if (r.status !== want) { allOk = false; console.log(`   ${method} ${path} → ${r.status}, wanted ${want}`); }
  }
  check('wrong HTTP methods are all 405', allOk);
}

console.log('\n=== auth required ===');
{
  let r = await handleRequest(req('/api/checkout', {
    method: 'POST', body: JSON.stringify({ tier: 'pro' }) }), ENV);
  check('checkout without a token is 401', r.status === 401, `${r.status}`);

  r = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST', body: JSON.stringify({ featureId: 'export_pdf' }) }), ENV);
  check('consume without a token is 401', r.status === 401, `${r.status}`);
}

console.log('\n=== CORS is an allow-list, never * ===');
{
  const good = await handleRequest(req('/api/health', {
    headers: { origin: 'https://novelka.example' } }), ENV);
  check('the real app origin is allowed',
    good.headers.get('access-control-allow-origin') === 'https://novelka.example');

  const evil = await handleRequest(req('/api/health', {
    headers: { origin: 'https://evil.example' } }), ENV);
  const acao = evil.headers.get('access-control-allow-origin');
  check('an unknown origin gets NO allow-origin header', acao === null, String(acao));
  check('and never a wildcard', acao !== '*');

  const pre = await handleRequest(req('/api/checkout', {
    method: 'OPTIONS', headers: { origin: 'https://novelka.example' } }), ENV);
  check('pre-flight returns 204', pre.status === 204, `${pre.status}`);
  check('pre-flight names allowed methods',
    (pre.headers.get('access-control-allow-methods') ?? '').includes('POST'));
}

console.log('\n=== security headers on every response ===');
{
  const r = await handleRequest(req('/api/health'), ENV);
  const h = (k) => r.headers.get(k);
  check('Cache-Control: no-store (a shared cache must not leak entitlement)',
    (h('cache-control') ?? '').includes('no-store'), String(h('cache-control')));
  check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff');
  check('X-Frame-Options: DENY (clickjacking)', h('x-frame-options') === 'DENY');
  check('Referrer-Policy: no-referrer', h('referrer-policy') === 'no-referrer');
  check('JSON content type', (h('content-type') ?? '').includes('application/json'));
}

console.log('\n=== no information leakage ===');
{
  const r = await handleRequest(req('/api/health'), ENV);
  const body = await r.text();
  check('health reveals no config', !body.includes('supabase') && !body.includes('sk_'));

  const nf = await handleRequest(req('/api/does-not-exist'), ENV);
  check('unknown route is a clean 404', nf.status === 404);
  const nfBody = await nf.text();
  check('404 leaks no paths or versions',
    !nfBody.includes('/') || nfBody === JSON.stringify({ error: 'Not found' }), nfBody);

  // Every error response across the API must be free of secrets.
  const probes = ['/api/checkout', '/api/entitlement/consume', '/api/billing-portal'];
  let clean = true;
  for (const p of probes) {
    const res = await handleRequest(req(p, { method: 'POST', body: '{}' }), ENV);
    const t = await res.text();
    if (t.includes(ENV.SUPABASE_SERVICE_ROLE_KEY) || t.includes(ENV.STRIPE_SECRET_KEY)
        || t.includes(WHSEC) || t.includes('at ') || t.includes('.ts:')) {
      clean = false; console.log('   leaked in', p, t.slice(0, 120));
    }
  }
  check('no secrets or stack traces in any error response', clean);
}

console.log('\n=== localhost is allowed only outside production ===');
{
  const prod = await handleRequest(req('/api/health', {
    headers: { origin: 'http://localhost:5173' } }), ENV);
  check('localhost is NOT allowed in production',
    prod.headers.get('access-control-allow-origin') === null);

  const dev = await handleRequest(req('/api/health', {
    headers: { origin: 'http://localhost:5173' } }), { ...ENV, NODE_ENV: 'development' });
  check('but IS allowed in development',
    dev.headers.get('access-control-allow-origin') === 'http://localhost:5173');
}

console.log('\n=== payload size limit (64 KB) ===');
{
  const hugeBody = JSON.stringify({ data: 'x'.repeat(70_000) });
  const r = await handleRequest(req('/api/rating', { method: 'POST', body: hugeBody }), ENV);
  check('oversized body (>64 KB) is rejected with 413 Payload Too Large', r.status === 413);

  const normalBody = JSON.stringify({ stars: 5, comment: 'Great tool' });
  const rOk = await handleRequest(req('/api/rating', { method: 'POST', body: normalBody }), ENV);
  check('normal size body is accepted', rOk.status === 200);
}

console.log('\n=== client IP sanitization & spoofing resilience ===');
{
  const weirdHeaders = [
    '1.2.3.4, 5.6.7.8, evil.com',
    '../../etc/passwd',
    'x'.repeat(500),
    '192.168.1.1',
    '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  ];
  let allHandled = true;
  for (const ip of weirdHeaders) {
    const res = await handleRequest(req('/api/health', { headers: { 'x-forwarded-for': ip } }), ENV);
    if (res.status !== 200) allHandled = false;
  }
  check('spoofed or malformed IP headers are handled safely without crashing', allHandled);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
