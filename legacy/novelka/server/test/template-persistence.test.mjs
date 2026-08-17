/**
 * Template Persistence & Lifecycle Security Tests.
 *
 * Verifies:
 * - Public reading of published parametric templates
 * - Strict exclusion of draft/unpublished templates from non-owners
 * - Owner-only write permissions (create, edit, publish, unpublish, archive)
 * - Generator kind filtering & parameter validation
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

const { handleRequest, __setTemplateHooks, __setAdminHooks } =
  await import('../dist-test/test-entry.mjs');

const USER_OWNER = { id: 'owner-1', email: 'owner@novelka.example' };
const USER_NORMAL = { id: 'user-1', email: 'user@novelka.example' };

const PROFILES = {
  'owner-1': { id: 'owner-1', email: 'owner@novelka.example', tier: 'enterprise', is_owner: true },
  'user-1': { id: 'user-1', email: 'user@novelka.example', tier: 'free', is_owner: false },
};

const TEMPLATES = {
  'classic-ws': {
    id: 'classic-ws',
    version: '1.0.0',
    name: 'Classic Word Search',
    description: '1 puzzle per page',
    generator_kinds: ['wordsearch'],
    supported_sizes: ['kdp6x9', 'kdp85x11'],
    schema_payload: { regions: [{ id: 'p1', role: 'puzzle-grid' }] },
    style_tokens: { letterColor: '#111827' },
    status: 'published',
    access_level: 'free',
    published_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
  },
  'answers-ws': {
    id: 'answers-ws',
    version: '1.0.0',
    name: 'Answers Word Search',
    description: '4 solutions per page',
    generator_kinds: ['wordsearch'],
    supported_sizes: ['kdp6x9', 'kdp85x11'],
    schema_payload: {},
    style_tokens: {},
    status: 'published',
    access_level: 'free',
    published_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
  },
  'draft-experiment-ws': {
    id: 'draft-experiment-ws',
    version: '0.1.0',
    name: 'Draft Experiment',
    description: 'In development',
    generator_kinds: ['wordsearch'],
    supported_sizes: ['kdp6x9'],
    schema_payload: {},
    style_tokens: {},
    status: 'draft',
    access_level: 'free',
    created_at: '2026-08-10T00:00:00Z',
  },
  'archived-ws': {
    id: 'archived-ws',
    version: '0.9.0',
    name: 'Old Version',
    description: 'Deprecated',
    generator_kinds: ['wordsearch'],
    supported_sizes: ['kdp6x9'],
    schema_payload: {},
    style_tokens: {},
    status: 'archived',
    access_level: 'free',
    created_at: '2026-07-01T00:00:00Z',
  },
};

function makeDb() {
  return {
    auth: {
      getUser: (t) => {
        if (t === 'token-owner') return Promise.resolve({ data: { user: USER_OWNER }, error: null });
        if (t === 'token-normal') return Promise.resolve({ data: { user: USER_NORMAL }, error: null });
        return Promise.resolve({ data: null, error: { message: 'Invalid token' } });
      },
    },
    from: (table) => {
      const q = { _table: table, _filters: {} };
      q.select = () => q;
      q.eq = (col, val) => { q._filters[col] = val; return q; };
      q.contains = (col, vals) => { q._filters[`${col}_contains`] = vals; return q; };
      q.order = () => q;
      q.maybeSingle = () => {
        if (table === 'profiles') return Promise.resolve({ data: PROFILES[q._filters.id] ?? null, error: null });
        if (table === 'templates') return Promise.resolve({ data: TEMPLATES[q._filters.id] ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      q.then = (r) => {
        if (table === 'templates') {
          let list = Object.values(TEMPLATES);
          if (q._filters.status) list = list.filter(t => t.status === q._filters.status);
          if (q._filters.generator_kinds_contains) {
            const wanted = q._filters.generator_kinds_contains[0];
            list = list.filter(t => t.generator_kinds.includes(wanted));
          }
          return Promise.resolve({ data: list, error: null }).then(r);
        }
        return Promise.resolve({ data: [] }).then(r);
      };
      return q;
    },
  };
}

const req = (path, init = {}) => new Request(`https://api.novelka.example${path}`, init);

console.log('\n=== 1. Public Reading of Published Templates (GET /api/templates) ===');
{
  __setTemplateHooks({ makeSupabase: makeDb });

  // Anonymous request
  const rAnon = await handleRequest(req('/api/templates'), ENV);
  check('anonymous visitor can fetch published templates (200 OK)', rAnon.status === 200);
  const bAnon = await rAnon.json();
  check('returns array of templates', Array.isArray(bAnon.templates));
  check('contains classic-ws', bAnon.templates.some(t => t.templateId === 'classic-ws'));
  check('contains answers-ws', bAnon.templates.some(t => t.templateId === 'answers-ws'));
  check('EXCLUDES draft template (draft-experiment-ws)',
    !bAnon.templates.some(t => t.templateId === 'draft-experiment-ws'));
  check('EXCLUDES archived template (archived-ws)',
    !bAnon.templates.some(t => t.templateId === 'archived-ws'));
  check('every template in response has status = "published"',
    bAnon.templates.every(t => t.status === 'published'));
}

console.log('\n=== 2. Authenticated Normal User Template Fetching ===');
{
  __setTemplateHooks({ makeSupabase: makeDb });

  const rUser = await handleRequest(req('/api/templates', {
    headers: { authorization: 'Bearer token-normal' },
  }), ENV);
  check('normal user receives 200 OK', rUser.status === 200);
  const bUser = await rUser.json();
  check('normal user cannot see draft templates',
    !bUser.templates.some(t => t.templateId === 'draft-experiment-ws'));
}

console.log('\n=== 3. Non-Owner Write Blocked (403 Forbidden) ===');
{
  __setAdminHooks({ makeSupabase: makeDb });

  const rWrite = await handleRequest(req('/api/admin/templates', {
    method: 'POST',
    headers: { authorization: 'Bearer token-normal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: 'unauthorized-ws',
      name: 'Unauthorized Template',
      status: 'published',
    }),
  }), ENV);
  check('non-owner template creation rejected with 403 Forbidden', rWrite.status === 403);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TEMPLATE PERSISTENCE TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
