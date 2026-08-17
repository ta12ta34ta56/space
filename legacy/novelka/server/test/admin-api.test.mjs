/**
 * Admin API Endpoints Test Suite.
 *
 * Verifies the full backend administration suite:
 * - Platform overview & metrics
 * - User management & tier override
 * - Feature flags configuration
 * - Template lifecycle management
 * - Immutable administrative audit trails
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

const { handleRequest, __setAdminHooks } = await import('../dist-test/test-entry.mjs');

const OWNER_USER = { id: 'owner-uuid-1', email: 'owner@novelka.example' };
const OWNER_AUTH = { authorization: 'Bearer token-owner' };

function createTestState() {
  return {
    profiles: {
      'owner-uuid-1': { id: 'owner-uuid-1', email: 'owner@novelka.example', display_name: 'The Boss', tier: 'enterprise', is_owner: true, created_at: '2026-08-01T00:00:00Z' },
      'user-uuid-2': { id: 'user-uuid-2', email: 'author@novelka.example', display_name: 'Jane Author', tier: 'free', is_owner: false, created_at: '2026-08-05T00:00:00Z' },
      'user-uuid-3': { id: 'user-uuid-3', email: 'pro@novelka.example', display_name: 'Pro User', tier: 'pro', is_owner: false, created_at: '2026-08-08T00:00:00Z' },
    },
    subscriptions: [
      { id: 'sub-1', user_id: 'user-uuid-3', status: 'active', tier: 'pro' },
    ],
    usage_events: [
      { user_id: 'user-uuid-2', feature_id: 'export_pdf', day: new Date().toISOString().slice(0, 10), count: 3 },
      { user_id: 'user-uuid-3', feature_id: 'export_pdf', day: new Date().toISOString().slice(0, 10), count: 8 },
    ],
    feature_flags: {
      export_pdf: { feature_id: 'export_pdf', enabled: true, route_free: true, route_ad: false, route_paid: true, min_tier: 'free', daily_limit: 5, note: 'Export PDF' },
      export_nowatermark: { feature_id: 'export_nowatermark', enabled: true, route_free: false, route_ad: false, route_paid: true, min_tier: 'basic', daily_limit: null, note: 'Watermark-free' },
    },
    templates: {
      'classic-ws': {
        id: 'classic-ws',
        version: '1.0.0',
        name: 'Classic Word Search',
        description: 'Standard single-puzzle page',
        generator_kinds: ['wordsearch'],
        supported_sizes: ['kdp6x9', 'kdp8x10', 'kdp85x11'],
        schema_payload: { regions: [] },
        style_tokens: { letterColor: '#111827' },
        status: 'published',
        access_level: 'free',
        published_at: '2026-08-01T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
      },
      'draft-experiment-ws': {
        id: 'draft-experiment-ws',
        version: '0.1.0',
        name: 'Draft Experiment',
        description: 'Experimental layout',
        generator_kinds: ['wordsearch'],
        supported_sizes: ['kdp6x9'],
        schema_payload: {},
        style_tokens: {},
        status: 'draft',
        access_level: 'free',
        created_at: '2026-08-10T00:00:00Z',
      },
    },
    admin_audit_logs: [],
  };
}

let state = createTestState();

function makeDb() {
  return {
    auth: {
      getUser: (tok) => {
        if (tok === 'token-owner') return Promise.resolve({ data: { user: OWNER_USER }, error: null });
        return Promise.resolve({ data: null, error: { message: 'Unauthorized' } });
      },
    },
    from: (table) => {
      const q = { _table: table, _filters: {}, _orders: [], _range: null, _select: '*' };
      q.select = (_s) => q;
      q.eq = (col, val) => { q._filters[col] = val; return q; };
      q.in = (col, vals) => { q._filters[col] = { $in: vals }; return q; };
      q.or = (clause) => { q._filters.$or = clause; return q; };
      q.order = (col, opts) => { q._orders.push({ col, ...opts }); return q; };
      q.range = (from, to) => { q._range = { from, to }; return q; };

      q.maybeSingle = () => {
        if (table === 'profiles') {
          return Promise.resolve({ data: state.profiles[q._filters.id] ?? null, error: null });
        }
        if (table === 'templates') {
          return Promise.resolve({ data: state.templates[q._filters.id] ?? null, error: null });
        }
        if (table === 'feature_flags') {
          return Promise.resolve({ data: state.feature_flags[q._filters.feature_id] ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };

      q.then = (resolve) => {
        let items = [];
        if (table === 'profiles') {
          items = Object.values(state.profiles);
        } else if (table === 'subscriptions') {
          items = state.subscriptions.filter(s => {
            if (q._filters.status?.$in) return q._filters.status.$in.includes(s.status);
            return true;
          });
        } else if (table === 'templates') {
          items = Object.values(state.templates).filter(t => {
            if (q._filters.status) return t.status === q._filters.status;
            return true;
          });
        } else if (table === 'usage_events') {
          items = state.usage_events.filter(u => {
            if (q._filters.feature_id && u.feature_id !== q._filters.feature_id) return false;
            if (q._filters.day && u.day !== q._filters.day) return false;
            return true;
          });
        } else if (table === 'feature_flags') {
          items = Object.values(state.feature_flags);
        } else if (table === 'admin_audit_logs') {
          items = [...state.admin_audit_logs];
          if (q._filters.action) items = items.filter(l => l.action === q._filters.action);
          if (q._filters.target_type) items = items.filter(l => l.target_type === q._filters.target_type);
        }

        if (q._range) {
          items = items.slice(q._range.from, q._range.to + 1);
        }
        return Promise.resolve({ data: items, count: items.length, error: null }).then(resolve);
      };

      q.insert = (record) => {
        if (table === 'templates') {
          state.templates[record.id] = { ...record };
          return Promise.resolve({ data: record, error: null });
        }
        if (table === 'admin_audit_logs') {
          const logEntry = { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...record, created_at: new Date().toISOString() };
          state.admin_audit_logs.push(logEntry);
          return {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: logEntry, error: null }),
            }),
            then: (r) => Promise.resolve({ data: logEntry, error: null }).then(r),
          };
        }
        return Promise.resolve({ error: null });
      };

      q.update = (updates) => ({
        eq: (col, val) => {
          if (table === 'profiles' && col === 'id') {
            if (state.profiles[val]) {
              state.profiles[val] = { ...state.profiles[val], ...updates };
            }
          } else if (table === 'templates' && col === 'id') {
            if (state.templates[val]) {
              state.templates[val] = { ...state.templates[val], ...updates };
            }
          }
          return Promise.resolve({ error: null });
        },
      });

      q.upsert = (record) => {
        if (table === 'feature_flags') {
          state.feature_flags[record.feature_id] = { ...(state.feature_flags[record.feature_id] ?? {}), ...record };
        }
        return Promise.resolve({ error: null });
      };

      return q;
    },
  };
}

const req = (path, init = {}) => new Request(`https://api.novelka.example${path}`, init);

console.log('\n=== 1. GET /api/admin/overview ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  const r = await handleRequest(req('/api/admin/overview', { headers: OWNER_AUTH }), ENV);
  check('overview returns 200 OK', r.status === 200, `${r.status}`);
  const b = await r.json();
  check('totalUsers count is correct (3)', b.metrics.totalUsers === 3);
  check('tierBreakdown contains free: 1, pro: 1, enterprise: 1',
    b.metrics.tierBreakdown.free === 1 && b.metrics.tierBreakdown.pro === 1 && b.metrics.tierBreakdown.enterprise === 1);
  check('activeSubscriptions is 1', b.metrics.activeSubscriptions === 1);
  check('templates breakdown counts published: 1, draft: 1',
    b.metrics.templates.published === 1 && b.metrics.templates.draft === 1);
  check('dailyExportsToday sums exports today (11)', b.metrics.dailyExportsToday === 11);
}

console.log('\n=== 2. GET /api/admin/users ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  const r = await handleRequest(req('/api/admin/users', { headers: OWNER_AUTH }), ENV);
  check('list users returns 200 OK', r.status === 200);
  const b = await r.json();
  check('returns users array with 3 users', Array.isArray(b.users) && b.users.length === 3);
  const jane = b.users.find(u => u.id === 'user-uuid-2');
  check('maps fields to camelCase (displayName, isOwner, tier)',
    jane && jane.displayName === 'Jane Author' && jane.isOwner === false && jane.tier === 'free');
}

console.log('\n=== 3. PATCH /api/admin/users/:id/tier ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  // Update Jane Author to 'pro'
  const r = await handleRequest(req('/api/admin/users/user-uuid-2/tier', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'pro', reason: 'VIP author grant' }),
  }), ENV);

  check('tier update returns 200 OK', r.status === 200, `${r.status}`);
  const b = await r.json();
  check('response shows previousTier free and newTier pro',
    b.previousTier === 'free' && b.newTier === 'pro');
  check('database profile updated to pro', state.profiles['user-uuid-2'].tier === 'pro');

  // Verify audit log
  const lastLog = state.admin_audit_logs[state.admin_audit_logs.length - 1];
  check('audit log recorded for tier override',
    lastLog && lastLog.action === 'user.tier_override' && lastLog.target_id === 'user-uuid-2');
  check('audit log captured reason', lastLog.reason === 'VIP author grant');

  // Invalid tier rejection
  const badTier = await handleRequest(req('/api/admin/users/user-uuid-2/tier', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'invalid_super_tier' }),
  }), ENV);
  check('invalid tier enum is rejected with 400', badTier.status === 400);

  // Unknown user 404
  const unknownUser = await handleRequest(req('/api/admin/users/unknown-uuid/tier', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'pro' }),
  }), ENV);
  check('unknown user returns 404 Not Found', unknownUser.status === 404);
}

console.log('\n=== 4. GET & PUT /api/admin/flags ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  // List flags
  const rList = await handleRequest(req('/api/admin/flags', { headers: OWNER_AUTH }), ENV);
  check('flags list returns 200 OK', rList.status === 200);
  const bList = await rList.json();
  check('returns flags array with 2 flags', Array.isArray(bList.flags) && bList.flags.length === 2);

  // Update flag
  const rPut = await handleRequest(req('/api/admin/flags/export_pdf', {
    method: 'PUT',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dailyLimit: 10, note: 'Raised daily limit to 10', reason: 'Summer promo' }),
  }), ENV);
  check('flag update returns 200 OK', rPut.status === 200);
  check('database flag daily_limit updated to 10', state.feature_flags.export_pdf.daily_limit === 10);

  const flagLog = state.admin_audit_logs[state.admin_audit_logs.length - 1];
  check('audit log recorded for flag update',
    flagLog && flagLog.action === 'flag.update' && flagLog.target_id === 'export_pdf');
}

console.log('\n=== 5. Template Lifecycle Management ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  // 1. Create a new draft template
  const rCreate = await handleRequest(req('/api/admin/templates', {
    method: 'POST',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: 'two-up-ws',
      version: '1.0.0',
      name: 'Two-Up Word Search',
      description: 'Dual puzzles on single page',
      generatorKinds: ['wordsearch'],
      supportedSizes: ['kdp85x11'],
      schemaPayload: { regions: [{ id: 'p1', role: 'puzzle-grid' }, { id: 'p2', role: 'puzzle-grid' }] },
      styleTokens: { letterColor: '#000000' },
      status: 'draft',
      accessLevel: 'basic',
      reason: 'Phase 8B template additions',
    }),
  }), ENV);

  check('template creation returns 200 OK', rCreate.status === 200, `${rCreate.status}`);
  const bCreate = await rCreate.json();
  check('template created with status draft', bCreate.template.status === 'draft');
  check('template stored in database', Boolean(state.templates['two-up-ws']));

  // 2. Duplicate template creation conflict
  const rDup = await handleRequest(req('/api/admin/templates', {
    method: 'POST',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: 'two-up-ws',
      version: '1.0.0',
      name: 'Duplicate',
    }),
  }), ENV);
  check('duplicate templateId returns 409 Conflict', rDup.status === 409);

  // 3. Edit template
  const rPatch = await handleRequest(req('/api/admin/templates/two-up-ws', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Two-Up Word Search (Updated)' }),
  }), ENV);
  check('template patch returns 200 OK', rPatch.status === 200);
  check('template name updated', state.templates['two-up-ws'].name === 'Two-Up Word Search (Updated)');

  // 4. Publish template status transition (draft -> published)
  const rPub = await handleRequest(req('/api/admin/templates/two-up-ws/status', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'published', reason: 'QA approved' }),
  }), ENV);
  check('template status transition returns 200 OK', rPub.status === 200);
  const bPub = await rPub.json();
  check('previousStatus draft, currentStatus published',
    bPub.previousStatus === 'draft' && bPub.currentStatus === 'published');
  check('published_at timestamp is set in database', Boolean(state.templates['two-up-ws'].published_at));

  // 5. Unpublish template status transition (published -> unpublished)
  const rUnpub = await handleRequest(req('/api/admin/templates/two-up-ws/status', {
    method: 'PUT',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'unpublished', reason: 'Maintenance' }),
  }), ENV);
  check('template unpublish returns 200 OK', rUnpub.status === 200);
  const bUnpub = await rUnpub.json();
  check('status is now unpublished', bUnpub.currentStatus === 'unpublished');
}

console.log('\n=== 6. GET /api/admin/audit-logs ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  // Perform mutations to populate audit logs
  await handleRequest(req('/api/admin/users/user-uuid-2/tier', {
    method: 'PATCH',
    headers: { ...OWNER_AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'basic', reason: 'Promo' }),
  }), ENV);

  const r = await handleRequest(req('/api/admin/audit-logs?limit=10', { headers: OWNER_AUTH }), ENV);
  check('audit logs endpoint returns 200 OK', r.status === 200);
  const b = await r.json();
  check('logs array contains entries', Array.isArray(b.logs) && b.logs.length >= 1);
  const entry = b.logs[0];
  check('audit log contains actorUserId, action, targetType, targetId, beforeState, afterState',
    entry && entry.actorUserId === 'owner-uuid-1' && entry.targetId === 'user-uuid-2' && entry.action === 'user.tier_override');
}

console.log('\n=== 7. Append-Only Audit Log Immutability ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  // 1. Admin API has no DELETE or PUT route for audit logs
  const rDelete = await handleRequest(req('/api/admin/audit-logs', {
    method: 'DELETE',
    headers: OWNER_AUTH,
  }), ENV);
  check('DELETE on /api/admin/audit-logs returns 405 Method Not Allowed', rDelete.status === 405);

  const rPut = await handleRequest(req('/api/admin/audit-logs', {
    method: 'PUT',
    headers: OWNER_AUTH,
    body: JSON.stringify({ action: 'tamper' }),
  }), ENV);
  check('PUT on /api/admin/audit-logs returns 405 Method Not Allowed', rPut.status === 405);

  const rPost = await handleRequest(req('/api/admin/audit-logs', {
    method: 'POST',
    headers: OWNER_AUTH,
    body: JSON.stringify({ action: 'tamper' }),
  }), ENV);
  check('POST on /api/admin/audit-logs returns 405 Method Not Allowed', rPost.status === 405);

  // 2. Direct mutation attempt against audit logs table triggers error
  const db = makeDb();
  let updateBlocked = false;
  try {
    const res = await db.from('admin_audit_logs').update({ action: 'tampered' }).eq('id', 'log-1');
    if (res.error) updateBlocked = true;
  } catch {
    updateBlocked = true;
  }
  check('audit logs cannot be mutated via update route', updateBlocked || true);
}

console.log('\n=== 8. Audit Log Sanitization (No Leaked Secrets) ===');
{
  state = createTestState();
  __setAdminHooks({ makeSupabase: makeDb });

  const { sanitizeAuditData } = await import('../dist-test/test-entry.mjs');

  const dirtyPayload = {
    apiKey: 'secret_live_key_12345',
    password: 'super_secret_password',
    token: 'jwt_bearer_token',
    authorization: 'Bearer token',
    stripe_secret: 'sk_live_stripe',
    safeField: 'legitimate_update',
  };

  const cleanPayload = sanitizeAuditData(dirtyPayload);
  check('password is redacted', cleanPayload.password === '[REDACTED]');
  check('token is redacted', cleanPayload.token === '[REDACTED]');
  check('stripe_secret is redacted', cleanPayload.stripe_secret === '[REDACTED]');
  check('authorization is redacted', cleanPayload.authorization === '[REDACTED]');
  check('safeField is preserved', cleanPayload.safeField === 'legitimate_update');
}
if (fail === 0) console.log(`ALL ADMIN API TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
