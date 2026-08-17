/**
 * Admin Authorization Security Tests.
 *
 * Verifies that the server-side requireOwner guard rejects all unauthorized,
 * unauthenticated, or spoofed requests and only permits legitimate owners.
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
  GRANT_SIGNING_SECRET: 'grant_secret_32_characters_long_for_hmac_test',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'a'.repeat(32),
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_b',
  STRIPE_PRICE_PRO: 'price_p',
  STRIPE_PRICE_ENTERPRISE: 'price_e',
  NODE_ENV: 'production',
};

const { handleRequest, __setAdminHooks } =
  await import('../dist-test/test-entry.mjs');

const USERS = {
  owner: { id: 'owner-uuid-1', email: 'owner@novelka.example' },
  normal: { id: 'user-uuid-2', email: 'author@novelka.example' },
  attacker: { id: 'attacker-uuid-3', email: 'attacker@novelka.example' },
};

const PROFILES = {
  'owner-uuid-1': { id: 'owner-uuid-1', email: 'owner@novelka.example', tier: 'enterprise', is_owner: true },
  'user-uuid-2': { id: 'user-uuid-2', email: 'author@novelka.example', tier: 'pro', is_owner: false },
  'attacker-uuid-3': { id: 'attacker-uuid-3', email: 'attacker@novelka.example', tier: 'free', is_owner: false },
};

function makeMockSupabase(dbProfiles = PROFILES) {
  return {
    auth: {
      getUser: (token) => {
        if (token === 'token-owner') return Promise.resolve({ data: { user: USERS.owner }, error: null });
        if (token === 'token-normal') return Promise.resolve({ data: { user: USERS.normal }, error: null });
        if (token === 'token-attacker') return Promise.resolve({ data: { user: USERS.attacker }, error: null });
        return Promise.resolve({ data: null, error: { message: 'Invalid token' } });
      },
    },
    from: (table) => {
      const q = { _table: table, _filters: {} };
      q.select = () => q;
      q.eq = (col, val) => { q._filters[col] = val; return q; };
      q.in = (col, vals) => { q._filters[col] = vals; return q; };
      q.maybeSingle = () => {
        if (table === 'profiles') {
          const p = dbProfiles[q._filters.id] ?? null;
          return Promise.resolve({ data: p, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      q.then = (r) => {
        if (table === 'profiles') return Promise.resolve({ data: Object.values(dbProfiles) }).then(r);
        return Promise.resolve({ data: [] }).then(r);
      };
      return q;
    },
  };
}

const req = (path, init = {}) => new Request(`https://api.novelka.example${path}`, init);

console.log('\n=== 1. No Token / Unauthenticated Rejection ===');
{
  __setAdminHooks({ makeSupabase: () => makeMockSupabase() });

  const r1 = await handleRequest(req('/api/admin/overview', { method: 'GET' }), ENV);
  check('missing auth header returns 401', r1.status === 401, `${r1.status}`);

  const r2 = await handleRequest(req('/api/admin/users', { method: 'GET', headers: { authorization: '' } }), ENV);
  check('empty auth header returns 401', r2.status === 401);

  const r3 = await handleRequest(req('/api/admin/flags', { method: 'GET', headers: { authorization: 'Basic dXNlcjpwYXNz' } }), ENV);
  check('non-Bearer auth header returns 401', r3.status === 401);
}

console.log('\n=== 2. Malformed / Forged Token Rejection ===');
{
  __setAdminHooks({ makeSupabase: () => makeMockSupabase() });

  const r1 = await handleRequest(req('/api/admin/overview', {
    method: 'GET',
    headers: { authorization: 'Bearer forged-invalid-token' },
  }), ENV);
  check('forged JWT token returns 401', r1.status === 401);

  const r2 = await handleRequest(req('/api/admin/templates', {
    method: 'GET',
    headers: { authorization: 'Bearer ' },
  }), ENV);
  check('empty token string returns 401', r2.status === 401);
}

console.log('\n=== 3. Authenticated Non-Owner Rejection (403 Forbidden) ===');
{
  __setAdminHooks({ makeSupabase: () => makeMockSupabase() });

  const r1 = await handleRequest(req('/api/admin/overview', {
    method: 'GET',
    headers: { authorization: 'Bearer token-normal' },
  }), ENV);
  check('normal authenticated user receives 403 Forbidden', r1.status === 403, `${r1.status}`);
  const b1 = await r1.json();
  check('error response message is clear and safe', b1.error.includes('Forbidden'));

  const r2 = await handleRequest(req('/api/admin/users', {
    method: 'GET',
    headers: { authorization: 'Bearer token-attacker' },
  }), ENV);
  check('free tier attacker receives 403 Forbidden', r2.status === 403);
}

console.log('\n=== 4. Missing / Deleted Profile Fail-Closed ===');
{
  // User exists in auth but has no profile row in DB
  const missingProfiles = { ...PROFILES };
  delete missingProfiles['user-uuid-2'];
  __setAdminHooks({ makeSupabase: () => makeMockSupabase(missingProfiles) });

  const r = await handleRequest(req('/api/admin/overview', {
    method: 'GET',
    headers: { authorization: 'Bearer token-normal' },
  }), ENV);
  check('user with deleted profile fails closed (403)', r.status === 403, `${r.status}`);
}

console.log('\n=== 5. Legitimate Owner User Success (200 OK) ===');
{
  __setAdminHooks({ makeSupabase: () => makeMockSupabase() });

  const r = await handleRequest(req('/api/admin/overview', {
    method: 'GET',
    headers: { authorization: 'Bearer token-owner' },
  }), ENV);
  check('legitimate owner is granted access (200 OK)', r.status === 200, `${r.status}`);
  const b = await r.json();
  check('overview response has ok: true', b.ok === true);
  check('overview response contains metrics', typeof b.metrics === 'object');
}

console.log('\n=== 6. Attempted Role / Tier Spoofing Resistance ===');
{
  __setAdminHooks({ makeSupabase: () => makeMockSupabase() });

  // Attacker sends custom headers claiming is_owner: true
  const r1 = await handleRequest(req('/api/admin/overview', {
    method: 'GET',
    headers: {
      authorization: 'Bearer token-attacker',
      'X-Is-Owner': 'true',
      'X-Admin-Role': 'owner',
      'X-Superuser': '1',
    },
  }), ENV);
  check('client-submitted owner headers are ignored and rejected with 403', r1.status === 403);

  // Attacker tries client body spoofing on mutating endpoints
  const r2 = await handleRequest(req('/api/admin/flags/export_pdf', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer token-attacker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ is_owner: true, routeFree: true }),
  }), ENV);
  check('mutation with client-submitted is_owner in body is rejected with 403', r2.status === 403);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL ADMIN AUTH TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
