/**
 * Entitlement tests — the server-side replacement for client-side gating.
 *
 * The question each test answers: "can a user who has not paid get in anyway?"
 */
let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); }
};

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'head.payload.sig-secret-key',
  SUPABASE_ANON_KEY: 'head.payload.anon',
  GRANT_SIGNING_SECRET: 'grant_secret_32_characters_long_for_hmac_test',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'a'.repeat(32),
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_basic',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
};

const { handleConsume, handleGetEntitlement, verifyGrant, __setEntitlementHooks } =
  await import('../dist-test/entitlement.mjs');

/** Fake DB whose contents each test controls. */
function makeDb(state) {
  return {
    from(table) {
      const q = { _table: table, _filters: {} };
      q.select = () => q;
      q.eq = (c, v) => { q._filters[c] = v; return q; };
      q.maybeSingle = () => {
        if (table === 'feature_flags') {
          return Promise.resolve({ data: state.flags[q._filters.feature_id] ?? null });
        }
        if (table === 'profiles') return Promise.resolve({ data: state.profile });
        return Promise.resolve({ data: null });
      };
      q.then = (res) => {
        if (table === 'feature_flags') return Promise.resolve({ data: Object.values(state.flags) }).then(res);
        if (table === 'usage_events') return Promise.resolve({ data: state.usage ?? [] }).then(res);
        return Promise.resolve({ data: [] }).then(res);
      };
      return q;
    },
    auth: {
      getUser: (tok) =>
        Promise.resolve(
          tok === 'valid-token'
            ? { data: { user: { id: 'user-1', email: 'u@x.com' } }, error: null }
            : { data: null, error: { message: 'bad token' } },
        ),
    },
    rpc: (_fn, args) => {
      state.consumed = (state.consumed ?? 0) + 1;
      const used = (state.usedToday ?? 0) + state.consumed;
      if (args.p_limit !== null && used > args.p_limit) {
        return Promise.resolve({ error: { message: 'quota_exceeded' } });
      }
      return Promise.resolve({ data: used, error: null });
    },
  };
}

const FLAG_PAID = {
  export_pdf: { feature_id: 'export_pdf', enabled: true, route_free: false, route_paid: true, min_tier: 'basic', daily_limit: null },
};
const FLAG_FREE_LIMITED = {
  export_pdf: { feature_id: 'export_pdf', enabled: true, route_free: true, route_paid: true, min_tier: 'basic', daily_limit: 3 },
};

const H = { authorization: 'Bearer valid-token', clientIp: '1.2.3.4' };
const setDb = (s) => __setEntitlementHooks({ makeSupabase: () => makeDb(s) });

console.log('\n=== a free user cannot reach paid features ===');
{
  setDb({ flags: FLAG_PAID, profile: { tier: 'free', is_owner: false } });
  const r = await handleConsume(JSON.stringify({ featureId: 'export_pdf' }), H, ENV);
  check('free user is refused a paid feature', r.status === 402, `${r.status} ${r.body}`);
  check('the refusal names no internals', !r.body.includes('supabase') && !r.body.includes('sk_'));
}

console.log('\n=== a paying user gets through ===');
{
  setDb({ flags: FLAG_PAID, profile: { tier: 'pro', is_owner: false } });
  const r = await handleConsume(JSON.stringify({ featureId: 'export_pdf' }), H, ENV);
  const d = JSON.parse(r.body);
  check('pro user is allowed', r.status === 200 && d.allowed === true, r.body);
  check('and gets no watermark', d.watermark === false);
  check('and receives a signed grant', typeof d.grant === 'string' && d.grant.includes('.'));
}

console.log('\n=== the watermark decision is the server\'s ===');
{
  setDb({ flags: FLAG_FREE_LIMITED, profile: { tier: 'free', is_owner: false } });
  const r = await handleConsume(JSON.stringify({ featureId: 'export_pdf' }), H, ENV);
  const d = JSON.parse(r.body);
  check('free user on a free route is allowed', r.status === 200, r.body);
  check('but the grant says watermark:true', d.watermark === true);

  const claims = await verifyGrant(d.grant, ENV.GRANT_SIGNING_SECRET);
  check('the grant verifies with GRANT_SIGNING_SECRET', claims !== null);
  check('watermark is inside the SIGNED payload', claims.watermark === true);
  check('the grant names the user', claims.sub === 'user-1');
  check('the grant expires', typeof claims.exp === 'number');

  // Verify that service-role key CANNOT verify the grant
  const serviceRoleAttempt = await verifyGrant(d.grant, ENV.SUPABASE_SERVICE_ROLE_KEY);
  check('service role key CANNOT verify grant (proves key separation)', serviceRoleAttempt === null);
}

console.log('\n=== grants cannot be forged or edited ===');
{
  setDb({ flags: FLAG_FREE_LIMITED, profile: { tier: 'free', is_owner: false } });
  const r = await handleConsume(JSON.stringify({ featureId: 'export_pdf' }), H, ENV);
  const { grant } = JSON.parse(r.body);

  const [body, sig] = grant.split('.');
  // Flip watermark to false and re-encode — the classic client-side patch.
  const json = JSON.parse(Buffer.from(body.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString());
  json.watermark = false;
  json.tier = 'enterprise';
  const forgedBody = Buffer.from(JSON.stringify(json)).toString('base64url');
  const forged = `${forgedBody}.${sig}`;

  check('an edited grant fails verification',
    (await verifyGrant(forged, ENV.GRANT_SIGNING_SECRET)) === null);
  check('a grant signed with the wrong key fails',
    (await verifyGrant(grant, 'attacker-guess-key-that-is-wrong-32')) === null);
  check('garbage fails', (await verifyGrant('not.a.grant', ENV.GRANT_SIGNING_SECRET)) === null);

  const expired = await verifyGrant(grant, ENV.GRANT_SIGNING_SECRET);
  check('a fresh grant is still valid', expired !== null);
}

console.log('\n=== daily quota is enforced server-side ===');
{
  const state = { flags: FLAG_FREE_LIMITED, profile: { tier: 'free', is_owner: false }, usedToday: 0 };
  setDb(state);
  const body = JSON.stringify({ featureId: 'export_pdf' });
  const a = await handleConsume(body, H, ENV);
  const b = await handleConsume(body, H, ENV);
  const c = await handleConsume(body, H, ENV);
  const d = await handleConsume(body, H, ENV);
  check('first three exports allowed', a.status === 200 && b.status === 200 && c.status === 200,
    `${a.status}/${b.status}/${c.status}`);
  check('the fourth is refused', d.status === 429, `${d.status} ${d.body}`);
  check('the refusal is human-readable', JSON.parse(d.body).error.includes('limit'));
}

console.log('\n=== paying users are never quota-capped ===');
{
  const state = { flags: FLAG_FREE_LIMITED, profile: { tier: 'pro', is_owner: false }, usedToday: 0 };
  setDb(state);
  const body = JSON.stringify({ featureId: 'export_pdf' });
  let allOk = true;
  for (let i = 0; i < 10; i++) {
    const r = await handleConsume(body, H, ENV);
    if (r.status !== 200) { allOk = false; break; }
  }
  check('pro user exports 10 times without being capped', allOk);
}

console.log('\n=== fail closed ===');
{
  setDb({ flags: {}, profile: { tier: 'pro', is_owner: false } });
  const r = await handleConsume(JSON.stringify({ featureId: 'no_such_feature' }), H, ENV);
  check('an unknown feature is DENIED, not allowed', r.status === 403, `${r.status}`);

  setDb({ flags: { x: { feature_id: 'x', enabled: false, route_free: true, route_paid: true, min_tier: 'free', daily_limit: null } },
          profile: { tier: 'pro', is_owner: false } });
  const off = await handleConsume(JSON.stringify({ featureId: 'x' }), H, ENV);
  check('a disabled feature is denied even for pro', off.status === 403, `${off.status}`);
}

console.log('\n=== authentication ===');
{
  setDb({ flags: FLAG_PAID, profile: { tier: 'pro', is_owner: false } });
  const body = JSON.stringify({ featureId: 'export_pdf' });
  const noAuth = await handleConsume(body, { authorization: null, clientIp: '9.9.9.9' }, ENV);
  check('no token is rejected', noAuth.status === 401, `${noAuth.status}`);

  const badAuth = await handleConsume(body, { authorization: 'Bearer forged', clientIp: '9.9.9.8' }, ENV);
  check('a forged token is rejected', badAuth.status === 401, `${badAuth.status}`);

  const notBearer = await handleConsume(body, { authorization: 'valid-token', clientIp: '9.9.9.7' }, ENV);
  check('a non-Bearer header is rejected', notBearer.status === 401);
}

console.log('\n=== input validation ===');
{
  setDb({ flags: FLAG_PAID, profile: { tier: 'pro', is_owner: false } });
  const evil = ["'; drop table profiles; --", '../../etc/passwd', 'a'.repeat(500), '<script>'];
  let allRejected = true;
  for (const f of evil) {
    const r = await handleConsume(JSON.stringify({ featureId: f }), H, ENV);
    if (r.status !== 400 && r.status !== 403) { allRejected = false; console.log('   leaked:', f, r.status); }
  }
  check('sql/path/oversized/script feature ids are all rejected', allRejected);

  const bad = await handleConsume('not json', H, ENV);
  check('malformed json is a clean 400', bad.status === 400);
}

console.log('\n=== rate limiting ===');
{
  setDb({ flags: FLAG_PAID, profile: { tier: 'pro', is_owner: false } });
  const ip = { authorization: 'Bearer valid-token', clientIp: '5.5.5.5' };
  let got429 = false;
  for (let i = 0; i < 60; i++) {
    const r = await handleConsume(JSON.stringify({ featureId: 'export_pdf' }), ip, ENV);
    if (r.status === 429 && JSON.parse(r.body).error.includes('Too many')) { got429 = true; break; }
  }
  check('a flood from one IP is throttled', got429);
}

console.log('\n=== anonymous read ===');
{
  setDb({ flags: FLAG_PAID, profile: null });
  const r = await handleGetEntitlement({ authorization: null, clientIp: '3.3.3.3' }, ENV);
  const d = JSON.parse(r.body);
  check('anonymous entitlement returns free', r.status === 200 && d.tier === 'free');
  check('and is not marked signed in', d.signedIn === false);
  check('no service key leaks into the payload', !r.body.includes(ENV.SUPABASE_SERVICE_ROLE_KEY));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
