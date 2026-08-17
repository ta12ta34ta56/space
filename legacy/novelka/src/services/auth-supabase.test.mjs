/**
 * Supabase adapter tests.  npm run test:auth-supabase
 *
 * The sibling auth.test.mjs exercises the local mock backend. This file
 * exercises the real-Supabase path of the same module, with a fake client
 * injected through __setAuthHooks — so the mapping, error handling and
 * session shaping are tested without a network call.
 *
 * The build defines VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, and the
 * harness also overrides them via hooks.env, so every branch that checks
 * isSupabaseConfigured() takes the Supabase path.
 */
const { auth, isSupabaseConfigured, __setAuthHooks, onAuthChange } =
  await import('./auth.built.mjs');

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/** A fake Supabase client with just enough surface for the adapter. */
function fakeSupabase(overrides = {}) {
  let session = overrides.session ?? null;
  let profile = overrides.profile ?? { tier: 'free', is_owner: false };
  const state = { signUpError: null, signInError: null };

  const authApi = {
    async signUp({ email, options }) {
      if (state.signUpError) return { data: { session: null }, error: { message: state.signUpError } };
      const user = {
        id: 'sb-user-1',
        email,
        created_at: '2026-01-01T00:00:00.000Z',
        user_metadata: options?.data ?? {},
      };
      const s = {
        access_token: 'sb-token-1',
        user,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      session = s;
      return { data: { session: s, user }, error: null };
    },
    async signInWithPassword({ email, password }) {
      if (state.signInError) return { data: { session: null }, error: { message: state.signInError } };
      if (password === 'wrong-password') {
        return { data: { session: null }, error: { message: 'Invalid login credentials' } };
      }
      const user = {
        id: 'sb-user-1',
        email,
        created_at: '2026-01-01T00:00:00.000Z',
        user_metadata: {},
      };
      const s = {
        access_token: 'sb-token-2',
        user,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      session = s;
      return { data: { session: s, user }, error: null };
    },
    async signOut() {
      session = null;
      return { error: null };
    },
    async getSession() {
      return { data: { session } };
    },
    onAuthStateChange(cb) {
      // remember the callback so tests can fire session events
      state.listener = cb;
      return { data: { subscription: { unsubscribe() { state.listener = null; } } } };
    },
  };

  const from = () => {
    const q = { _filters: {} };
    q.select = () => q;
    q.eq = (c, v) => { q._filters[c] = v; return q; };
    q.maybeSingle = async () => ({ data: profile, error: null });
    return q;
  };

  return {
    auth: authApi,
    from,
    state,
    setProfile(p) { profile = p; },
  };
}

let fake;
__setAuthHooks({
  env: { url: 'https://fake.supabase.co', anonKey: 'anon-fake' },
  makeClient: () => fake,
});

console.log('\n=== configuration ===');
{
  check('isSupabaseConfigured() is true with hooks.env', isSupabaseConfigured() === true);
}

console.log('\n=== sign up ===');
{
  fake = fakeSupabase();
  const r = await auth.signUp('new@example.com', 'password123', 'New Person');
  check('creates the account', r.ok && !!r.session);
  check('returns the supabase token', r.session?.token === 'sb-token-1');
  check('keeps the display name', r.session?.user.displayName === 'New Person');
  check('falls back to email prefix for the name',
    (await auth.signUp('noname@example.com', 'password123')).session?.user.displayName === 'noname');
  check('tier starts free', r.session?.user.tier === 'free');
  check('role starts user', r.session?.user.role === 'user');
  check('expiry is in the future', (r.session?.expiresAt ?? 0) > Date.now());

  fake.state.signUpError = 'User already registered';
  const dup = await auth.signUp('new@example.com', 'password123');
  check('duplicate email maps to a friendly error',
    !dup.ok && dup.error === 'There is already an account with that email.');

  fake.state.signUpError = 'Password should be at least 8 characters.';
  const short = await auth.signUp('x@y.com', 'password123');
  check('short-password error maps to the same message as the client rule',
    !short.ok && short.error === 'Use a password of at least 8 characters.');
  fake.state.signUpError = null;

  check('a bad email is rejected before reaching the server',
    !(await auth.signUp('nope', 'password123')).ok);
  check('a short password is rejected before reaching the server',
    !(await auth.signUp('x@y.com', 'short')).ok);
}

console.log('\n=== sign in ===');
{
  fake = fakeSupabase();
  const good = await auth.signIn('a@b.com', 'password123');
  check('correct password signs in', good.ok && !!good.session);
  check('token comes from supabase', good.session?.token === 'sb-token-2');

  fake.state.signInError = 'Invalid login credentials';
  const bad = await auth.signIn('a@b.com', 'wrong-password');
  check('wrong password is rejected', !bad.ok);
  check('the error is deliberately vague', bad.error === 'That email or password is not right.');
  fake.state.signInError = null;

  fake.state.signInError = 'Email not confirmed';
  const unconfirmed = await auth.signIn('a@b.com', 'password123');
  check('unconfirmed email gets a specific message', unconfirmed.error?.includes('confirm'));
  fake.state.signInError = null;
}

console.log('\n=== session ===');
{
  fake = fakeSupabase();
  check('no session before sign-in', (await auth.getSession()) === null);
  await auth.signIn('a@b.com', 'password123');
  check('session persists', (await auth.getSession())?.user.email === 'a@b.com');

  // The profile is authoritative for tier and role.
  fake.setProfile({ tier: 'pro', is_owner: true });
  const s = await auth.getSession();
  check('tier is read from the profile', s?.user.tier === 'pro');
  check('owner role is read from the profile', s?.user.role === 'owner');

  await auth.signOut();
  check('sign-out clears the session', (await auth.getSession()) === null);
}

console.log('\n=== what the client cannot do ===');
{
  fake = fakeSupabase();
  check('setTier refuses: the tier is subscription-managed',
    !(await auth.setTier('sb-user-1', 'pro')).ok);
  check('listUsers returns empty (admin API is a known gap)',
    (await auth.listUsers()).length === 0);
  check('adminSetTier refuses', !(await auth.adminSetTier('sb-user-1', 'pro')).ok);
  check('adminDeleteUser refuses', !(await auth.adminDeleteUser('sb-user-1')).ok);
}

console.log('\n=== session-change subscription ===');
{
  fake = fakeSupabase();
  const seen = [];
  const unsub = await onAuthChange((s) => seen.push(s?.user.email ?? null));
  // Fire a sign-in through supabase's listener (as a refresh would).
  const listener = fake.state.listener;
  check('onAuthChange subscribes with real auth', typeof listener === 'function');
  const user = {
    id: 'sb-user-1',
    email: 'live@x.com',
    created_at: '2026-01-01T00:00:00.000Z',
    user_metadata: {},
  };
  listener('SIGNED_IN', {
    access_token: 'sb-token-9',
    user,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await new Promise((r) => setTimeout(r, 5));
  check('the listener receives mapped sessions', seen[0] === 'live@x.com');
  unsub();
  check('unsubscribe is a function', typeof unsub === 'function');
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
