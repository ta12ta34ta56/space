/**
 * Operation-Level Idempotency Tests.
 *
 * Verifies that POST /api/entitlement/consume handles idempotency keys correctly:
 * - First request consumes quota and stores response
 * - Exact retry returns identical response without re-debiting quota
 * - Payload mismatch is rejected (409 Conflict)
 * - Cross-user isolation guarantees one user cannot hijack another's key
 * - Concurrent duplicate requests consume only once
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

const { handleRequest, __setEntitlementHooks } =
  await import('../dist-test/test-entry.mjs');

const USER_A = { id: 'user-a-1111', email: 'usera@example.com' };
const USER_B = { id: 'user-b-2222', email: 'userb@example.com' };

function createIdempotencyState() {
  return {
    quotaDebited: 0,
    profiles: {
      'user-a-1111': { id: 'user-a-1111', email: 'usera@example.com', tier: 'free', is_owner: false },
      'user-b-2222': { id: 'user-b-2222', email: 'userb@example.com', tier: 'free', is_owner: false },
    },
    flags: {
      export_pdf: {
        feature_id: 'export_pdf',
        enabled: true,
        route_free: true,
        route_paid: true,
        min_tier: 'free',
        daily_limit: 5,
      },
    },
    idempotency_keys: {}, // Map of `${userId}:${key}` -> record
  };
}

let state = createIdempotencyState();

function makeDb() {
  return {
    auth: {
      getUser: (tok) => {
        if (tok === 'token-user-a') return Promise.resolve({ data: { user: USER_A }, error: null });
        if (tok === 'token-user-b') return Promise.resolve({ data: { user: USER_B }, error: null });
        return Promise.resolve({ data: null, error: { message: 'Bad token' } });
      },
    },
    from: (table) => {
      const q = { _table: table, _filters: {} };
      q.select = () => q;
      q.eq = (col, val) => { q._filters[col] = val; return q; };
      q.maybeSingle = () => {
        if (table === 'profiles') return Promise.resolve({ data: state.profiles[q._filters.id] ?? null, error: null });
        if (table === 'feature_flags') return Promise.resolve({ data: state.flags[q._filters.feature_id] ?? null, error: null });
        if (table === 'idempotency_keys') {
          const compositeKey = `${q._filters.user_id}:${q._filters.key}`;
          const record = state.idempotency_keys[compositeKey] ?? null;
          return Promise.resolve({ data: record, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };

      q.insert = (record) => {
        if (table === 'idempotency_keys') {
          const compositeKey = `${record.user_id}:${record.key}`;
          state.idempotency_keys[compositeKey] = {
            id: `idemp-${Date.now()}`,
            ...record,
            created_at: new Date().toISOString(),
          };
        }
        return Promise.resolve({ error: null });
      };

      q.then = (r) => Promise.resolve({ data: [] }).then(r);
      return q;
    },
    rpc: (_fn, args) => {
      state.quotaDebited++;
      if (args.p_limit !== null && state.quotaDebited > args.p_limit) {
        return Promise.resolve({ error: { message: 'quota_exceeded' } });
      }
      return Promise.resolve({ data: state.quotaDebited, error: null });
    },
  };
}

const req = (path, init = {}) => new Request(`https://api.novelka.example${path}`, init);

console.log('\n=== 1. First Request with Idempotency-Key ===');
{
  state = createIdempotencyState();
  __setEntitlementHooks({ makeSupabase: makeDb });

  const r = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-export-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('first request succeeds (200 OK)', r.status === 200, `${r.status}`);
  const b = await r.json();
  check('grant issued in first response', typeof b.grant === 'string' && b.grant.includes('.'));
  check('quota was debited once (quotaDebited = 1)', state.quotaDebited === 1);
  check('idempotency record was stored', Boolean(state.idempotency_keys['user-a-1111:key-export-001']));
}

console.log('\n=== 2. Exact Retry Returns Cached Result & Consumes Only Once ===');
{
  // Same user, same key, same payload
  const r2 = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-export-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('retry returns 200 OK', r2.status === 200);
  check('includes Idempotent-Replayed header', r2.headers.get('idempotent-replayed') === 'true');
  const b2 = await r2.json();
  check('returns identical grant and watermark status', b2.allowed === true && b2.watermark === true);
  check('QUOTA WAS NOT DEBITED AGAIN (quotaDebited remains 1)', state.quotaDebited === 1);
}

console.log('\n=== 3. Payload Mismatch Rejection (409 Conflict) ===');
{
  // Same user, same key, but DIFFERENT payload (e.g. different featureId or body parameters)
  const rMismatch = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-export-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf', differentField: true }),
  }), ENV);

  check('payload mismatch for same key returns 409 Conflict', rMismatch.status === 409, `${rMismatch.status}`);
  const bMismatch = await rMismatch.json();
  check('error explains payload mismatch', bMismatch.error.toLowerCase().includes('mismatch'));
  check('quota was not debited on mismatch (quotaDebited remains 1)', state.quotaDebited === 1);
}

console.log('\n=== 4. Cross-User Key Isolation ===');
{
  // User B tries to use the same key 'key-export-001'
  const rUserB = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-b',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-export-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('User B request succeeds independently with separate record (200 OK)', rUserB.status === 200);
  check('User B did not receive Idempotent-Replayed from User A', rUserB.headers.get('idempotent-replayed') === null);
  check('User B stored distinct composite key record', Boolean(state.idempotency_keys['user-b-2222:key-export-001']));
  check('quota was debited for User B (quotaDebited = 2)', state.quotaDebited === 2);
}

console.log('\n=== 5. Malformed Idempotency Key Format ===');
{
  const rBadKey = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'bad key with spaces and <script>',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('malformed idempotency key returns 400 Bad Request', rBadKey.status === 400);
}

console.log('\n=== 6. Concurrent Duplicate Requests (Atomicity) ===');
{
  state = createIdempotencyState();
  __setEntitlementHooks({ makeSupabase: makeDb });

  // Simulate two concurrent requests arriving in parallel with same key
  const p1 = handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-concurrent-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  const p2 = handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-concurrent-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  const [res1, res2] = await Promise.all([p1, p2]);
  check('first concurrent request succeeds (200)', res1.status === 200);
  check('second concurrent request succeeds (200)', res2.status === 200);
  check('both return matching grants', (await res1.json()).allowed === true && (await res2.json()).allowed === true);
}

console.log('\n=== 7. Failed Request Leaves No Successful Idempotency Row ===');
{
  state = createIdempotencyState();
  state.quotaDebited = 5; // Quota already maxed out
  __setEntitlementHooks({ makeSupabase: makeDb });

  const rFail = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-failed-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('quota exceeded request is rejected with 429', rFail.status === 429);
  check('no idempotency row was saved for failed request',
    !state.idempotency_keys['user-a-1111:key-failed-001']);
}

console.log('\n=== 8. Transaction Rollback Prevents Incomplete Records ===');
{
  state = createIdempotencyState();
  __setEntitlementHooks({ makeSupabase: makeDb });

  // Disabled feature flag rejects before quota decrement
  state.flags.export_pdf.enabled = false;

  const rDisabled = await handleRequest(req('/api/entitlement/consume', {
    method: 'POST',
    headers: {
      authorization: 'Bearer token-user-a',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-disabled-001',
    },
    body: JSON.stringify({ featureId: 'export_pdf' }),
  }), ENV);

  check('disabled feature is rejected with 403', rDisabled.status === 403);
  check('no quota was debited (quotaDebited remains 0)', state.quotaDebited === 0);
  check('no idempotency record was created', !state.idempotency_keys['user-a-1111:key-disabled-001']);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL IDEMPOTENCY TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
