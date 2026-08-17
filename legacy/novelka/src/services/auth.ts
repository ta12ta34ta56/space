import type { Tier } from './feature-flags';
import { readStorage, writeStorage, removeStorage } from './storage-keys';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Accounts, sessions and roles.
 *
 * ## Two backends, one contract
 *
 * Everything here is shaped like a real auth provider — async, token-based,
 * with server-issued roles. The functions in the "backend" section choose
 * their implementation at call time:
 *
 *  - **Supabase** (when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are
 *    configured): real accounts, real sessions, tokens that the Novelka
 *    server verifies. This is the path that runs in production.
 *  - **local mock** (otherwise): backed by `localStorage` so the whole flow
 *    can be built and tested without touching any service, and so the editor
 *    stays fully usable in a checkout with no keys. This is the path the unit
 *    tests exercise — the exported function signatures are identical.
 *
 * ## The honest limitation
 *
 * The mock is **not security**. Passwords are hashed but the store is the
 * user's own browser, so anyone can edit it. Real enforcement happens on the
 * Novelka server, which verifies the Supabase token on every entitlement
 * call — see `server/src/routes/entitlement.ts` and the note on `Role` below.
 */

export type Role = 'user' | 'owner';

export interface User {
  id: string;
  email: string;
  displayName: string;
  /**
   * Server-issued in production. Never trust a role read from the client for
   * anything that costs money or exposes data.
   */
  role: Role;
  tier: Tier;
  createdAt: string;
}

export interface Session {
  token: string;
  user: User;
  expiresAt: number;
}

export interface AuthResult {
  ok: boolean;
  session?: Session;
  error?: string;
}

/** Errors are deliberately vague about *which* half was wrong. */
const BAD_CREDENTIALS = 'That email or password is not right.';

const USERS_KEY = 'novelka.users.v1';
const SESSION_KEY = 'novelka.session.v1';
const OWNER_KEY = 'novelka.owner.v1';

/** How long a session lasts before the user must sign in again. */
const SESSION_DAYS = 30;

// ------------------------------------------------------------ backend select

/**
 * Supabase configuration comes from build-time env vars, never from storage:
 * a user who could edit the project URL could point the app at a server that
 * answers with whatever tier they typed.
 */
const SUPABASE_URL = ((import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
const SUPABASE_ANON_KEY =
  ((import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();

interface AuthHooks {
  /** Test seam: return a fake client instead of the real one. */
  makeClient?: (url: string, anonKey: string) => SupabaseClient;
  /** Test seam: pretend these credentials were configured. */
  env?: { url: string; anonKey: string };
}
let authHooks: AuthHooks = {};
export function __setAuthHooks(h: AuthHooks) {
  authHooks = h;
}

/** Which Supabase installation to talk to (real env, or the test's fake). */
function activeConfig(): { url: string; anonKey: string } {
  if (authHooks.env) return authHooks.env;
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

/** true when the app should talk to real Supabase rather than the local mock. */
export const isSupabaseConfigured = (): boolean => {
  const c = activeConfig();
  return c.url !== '' && c.anonKey !== '';
};

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Load the Supabase client lazily. supabase-js is a large dependency and the
 * app runs fully without it (local mock), so it is fetched only when real
 * auth keys are configured — the main bundle stays lean for everyone else.
 */
function loadClient(): Promise<SupabaseClient> {
  const c = activeConfig();
  if (authHooks.makeClient) {
    return Promise.resolve(authHooks.makeClient(c.url, c.anonKey));
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(c.url, c.anonKey),
    );
  }
  return clientPromise;
}

/** Map a Supabase session onto our Session shape, reading tier/role from the profile. */
async function toSession(sb: Awaited<ReturnType<SupabaseClient['auth']['getSession']>>['data']['session']): Promise<Session | null> {
  if (!sb?.user) return null;
  const email = sb.user.email ?? '';
  const meta = (sb.user.user_metadata ?? {}) as {
    display_name?: string;
    name?: string;
  };
  let tier: Tier = 'free';
  let role: Role = 'user';
  try {
    // The profile row is created by the handle_new_user trigger and readable
    // by its owner (RLS). tier/is_owner are service-role-only to write, but a
    // user may read their own — that is what we show in the UI. The server
    // re-checks both on every entitlement call, so this is display, not trust.
    const { data } = await (await loadClient())
      .from('profiles')
      .select('tier, is_owner')
      .eq('id', sb.user.id)
      .maybeSingle();
    if (data) {
      tier = (data.tier as Tier) ?? 'free';
      role = data.is_owner === true ? 'owner' : 'user';
    }
  } catch {
    // profile read is best-effort; the session is still valid without it
  }
  return {
    token: sb.access_token,
    user: {
      id: sb.user.id,
      email,
      displayName: meta.display_name ?? meta.name ?? email.split('@')[0] ?? 'User',
      role,
      tier,
      createdAt: sb.user.created_at,
    },
    expiresAt: (sb.expires_at ?? 0) * 1000,
  };
}

/** Supabase error -> something a human can act on, or null to keep the default. */
function supabaseErrorDetail(err: { message?: string }): string | null {
  const m = err.message ?? '';
  if (/invalid login credentials/i.test(m)) return BAD_CREDENTIALS;
  if (/already registered/i.test(m)) return 'There is already an account with that email.';
  if (/at least 8 characters/i.test(m)) return 'Use a password of at least 8 characters.';
  if (/confirm/i.test(m) && /email/i.test(m)) {
    return 'Check your email to confirm your account, then sign in.';
  }
  if (/rate limit/i.test(m)) return 'Too many attempts — wait a moment and try again.';
  return m || 'Could not reach the sign-in server.';
}

// ------------------------------------------------------------------ owner

/**
 * Owner configuration.
 *
 * Two independent ways in, because locking yourself out of your own admin
 * panel with no recovery is a genuinely bad failure mode:
 *  - the owner email: that account gets the admin panel automatically
 *  - a recovery code: unlocks admin for the session even without an account
 */
export interface OwnerConfig {
  email: string;
  /** hashed, never stored in the clear */
  recoveryHash: string;
  /** false until the owner has completed first-run setup */
  configured: boolean;
}

const DEFAULT_OWNER: OwnerConfig = { email: '', recoveryHash: '', configured: false };

export async function loadOwnerConfig(): Promise<OwnerConfig> {
  try {
    const raw = readStorage(OWNER_KEY);
    if (!raw) return { ...DEFAULT_OWNER };
    return { ...DEFAULT_OWNER, ...(JSON.parse(raw) as Partial<OwnerConfig>) };
  } catch {
    return { ...DEFAULT_OWNER };
  }
}

export async function saveOwnerConfig(c: OwnerConfig): Promise<void> {
  writeStorage(OWNER_KEY, JSON.stringify(c));
}

/** Set up the owner on first run. */
export async function claimOwnership(email: string, recoveryCode: string): Promise<AuthResult> {
  const current = await loadOwnerConfig();
  if (current.configured) {
    return { ok: false, error: 'An owner is already set for this installation.' };
  }
  if (!isEmail(email)) return { ok: false, error: 'That does not look like an email address.' };
  if (recoveryCode.length < 8) {
    return { ok: false, error: 'Use a recovery code of at least 8 characters.' };
  }
  await saveOwnerConfig({
    email: email.trim().toLowerCase(),
    recoveryHash: await hashPassword(recoveryCode),
    configured: true,
  });
  return { ok: true };
}

/**
 * Does this code match the owner's recovery code?
 *
 * This is the key to the admin panel, so it gets the same PBKDF2 treatment as
 * a password, and legacy records are upgraded on first successful use.
 */
export async function checkRecoveryCode(code: string): Promise<boolean> {
  const cfg = await loadOwnerConfig();
  if (!cfg.configured || !cfg.recoveryHash) return false;
  const check = await verifyPassword(code, cfg.recoveryHash);
  if (check.ok && check.needsUpgrade) {
    await saveOwnerConfig({ ...cfg, recoveryHash: await hashPassword(code) });
  }
  return check.ok;
}

export async function isOwnerEmail(email: string): Promise<boolean> {
  const cfg = await loadOwnerConfig();
  return cfg.configured && cfg.email === email.trim().toLowerCase();
}

// ------------------------------------------------------------------ crypto

const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Legacy hash: bare SHA-256, no salt.
 *
 * Kept ONLY so accounts created before the PBKDF2 change can still sign in
 * once, at which point they are silently upgraded. Never used for new records.
 */
async function legacyHash(input: string): Promise<string> {
  // Deliberately NOT renamed: this is a hash domain separator. Changing it
  // would invalidate every password hash created before the Gridpress ->
  // Novelka rename.
  const data = new TextEncoder().encode(`gridpress:${input}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

/**
 * Password hashing — PBKDF2-SHA256, per-user random salt, 210,000 iterations.
 *
 * ## Why this shape
 *
 * Bare SHA-256 is a *fast* hash. A stolen list of bare-SHA-256 passwords can be
 * attacked at billions of guesses per second on a GPU, and common passwords
 * fall instantly to a precomputed table. Two properties fix that:
 *
 * - **Per-user salt** — every user's hash is different even if the passwords
 *   are identical, so one precomputed table cannot crack the whole list, and
 *   cracking must be redone from scratch for every single user.
 * - **Work factor** — 210,000 iterations makes each guess ~200,000x more
 *   expensive. Imperceptible once at login, brutal across billions of guesses.
 *
 * 210,000 is the OWASP recommendation for PBKDF2-HMAC-SHA256.
 *
 * PBKDF2 is used because `crypto.subtle` provides it natively in every browser.
 * Argon2id is stronger but needs a WASM dependency; when we move to a real
 * server, hashing moves there and can use Argon2id.
 *
 * Format: `pbkdf2$<iterations>$<salt-hex>$<hash-hex>` — self-describing, so the
 * iteration count can be raised later without breaking existing accounts.
 */
const PBKDF2_ITERATIONS = 210_000;

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return hex(bits);
}

/** Hash a password for storage. Always produces a fresh random salt. */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${hex(salt)}$${h}`;
}

const fromHex = (s: string) =>
  new Uint8Array((s.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

/**
 * Constant-time string compare.
 *
 * `===` on strings can bail out at the first differing byte, which in theory
 * leaks how much of a hash was correct. Comparing every byte regardless removes
 * that signal.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyResult {
  ok: boolean;
  /** true when the stored hash used the old format and should be rewritten */
  needsUpgrade: boolean;
}

/** Check a password against a stored hash, in either format. */
async function verifyPassword(password: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltHex, want] = stored.split('$');
    const iterations = Number(iterStr) || PBKDF2_ITERATIONS;
    const got = await derive(password, fromHex(saltHex), iterations);
    return {
      ok: timingSafeEqual(got, want),
      // re-hash if we have since raised the work factor
      needsUpgrade: iterations < PBKDF2_ITERATIONS,
    };
  }
  // legacy bare SHA-256 record — verify, then flag for upgrade
  const ok = timingSafeEqual(await legacyHash(password), stored);
  return { ok, needsUpgrade: ok };
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function token(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ records

interface StoredUser extends User {
  passwordHash: string;
}

function readUsers(): StoredUser[] {
  try {
    return JSON.parse(readStorage(USERS_KEY) ?? '[]') as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(list: StoredUser[]) {
  writeStorage(USERS_KEY, JSON.stringify(list));
}

const publicUser = (u: StoredUser): User => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  tier: u.tier,
  createdAt: u.createdAt,
});

// ------------------------------------------------------------------ backend

export const auth = {
  async signUp(email: string, password: string, displayName?: string): Promise<AuthResult> {
    const e = email.trim().toLowerCase();
    if (!isEmail(e)) return { ok: false, error: 'Enter a valid email address.' };
    if (password.length < 8) {
      return { ok: false, error: 'Use a password of at least 8 characters.' };
    }

    if (isSupabaseConfigured()) {
      const client = await loadClient();
      const { data, error } = await client.auth.signUp({
        email: e,
        password,
        options: { data: { display_name: displayName?.trim() ?? e.split('@')[0] } },
      });
      if (error) return { ok: false, error: supabaseErrorDetail(error) ?? 'Could not create the account.' };
      // With email confirmation on, Supabase returns no session — tell the
      // user to go check their inbox rather than pretending they are in.
      if (!data.session) {
        return { ok: false, error: 'Check your email to confirm your account, then sign in.' };
      }
      const session = await toSession(data.session);
      return { ok: true, session: session ?? undefined };
    }

    // ---- local mock
    const users = readUsers();
    if (users.some((u) => u.email === e)) {
      return { ok: false, error: 'There is already an account with that email.' };
    }

    // The owner email always gets the owner role, whichever order things
    // happen in — sign up first then claim, or claim then sign up.
    const owner = await isOwnerEmail(e);
    const user: StoredUser = {
      id: token().slice(0, 16),
      email: e,
      displayName: displayName?.trim() || e.split('@')[0],
      role: owner ? 'owner' : 'user',
      tier: 'free',
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
    };
    users.push(user);
    writeUsers(users);
    return startSession(user);
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    const e = email.trim().toLowerCase();

    if (isSupabaseConfigured()) {
      const client = await loadClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: e,
        password,
      });
      // Same message whether the email is unknown or the password is wrong, so
      // the form cannot be used to discover which accounts exist.
      if (error) {
        return { ok: false, error: supabaseErrorDetail(error) ?? BAD_CREDENTIALS };
      }
      const session = await toSession(data.session);
      return { ok: true, session: session ?? undefined };
    }

    // ---- local mock
    const users = readUsers();
    const u = users.find((x) => x.email === e);
    // Same message whether the email is unknown or the password is wrong, so
    // the form cannot be used to discover which accounts exist.
    if (!u) {
      // Spend the same work as a real verification so the response time does
      // not reveal whether the email exists.
      await hashPassword(password);
      return { ok: false, error: BAD_CREDENTIALS };
    }
    const check = await verifyPassword(password, u.passwordHash);
    if (!check.ok) return { ok: false, error: BAD_CREDENTIALS };

    // Silently migrate legacy SHA-256 records (and raise the work factor when
    // it has been increased) now that we hold the plaintext for one instant.
    if (check.needsUpgrade) {
      u.passwordHash = await hashPassword(password);
      writeUsers(users);
    }
    // Re-check ownership on every sign-in, in case the owner email changed.
    const shouldOwn = await isOwnerEmail(e);
    if (shouldOwn && u.role !== 'owner') {
      u.role = 'owner';
      writeUsers(users);
    }
    return startSession(u);
  },

  async signOut(): Promise<void> {
    if (isSupabaseConfigured()) {
      await (await loadClient()).auth.signOut();
      return;
    }
    removeStorage(SESSION_KEY);
  },

  /** Current session, or null when signed out or expired. */
  async getSession(): Promise<Session | null> {
    if (isSupabaseConfigured()) {
      try {
        const { data } = await (await loadClient()).auth.getSession();
        return await toSession(data.session);
      } catch {
        return null;
      }
    }

    // ---- local mock
    try {
      const raw = readStorage(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Session;
      if (!s?.token || !s.user) return null;
      if (Date.now() > s.expiresAt) {
        removeStorage(SESSION_KEY);
        return null;
      }
      // Re-read the user record so a tier change is picked up, and a deleted
      // account cannot keep browsing on an old session.
      const fresh = readUsers().find((u) => u.id === s.user.id);
      if (!fresh) {
        removeStorage(SESSION_KEY);
        return null;
      }
      return { ...s, user: publicUser(fresh) };
    } catch {
      return null;
    }
  },

  /**
   * Change the signed-in user's plan.
   *
   * With Supabase this is a no-op with a clear error: the tier column is
   * protected (service-role only), so the only way to change it is to pay —
   * the Stripe webhook writes the tier after a verified payment. The local
   * mock keeps simulating it so the UI can be exercised end to end.
   */
  async setTier(userId: string, tier: Tier): Promise<AuthResult> {
    if (isSupabaseConfigured()) {
      return { ok: false, error: 'Your plan is managed by your subscription.' };
    }
    const users = readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return { ok: false, error: 'Account not found.' };
    u.tier = tier;
    writeUsers(users);
    const s = await this.getSession();
    return { ok: true, session: s ?? undefined };
  },

  /** Every account — the owner's user list. */
  async listUsers(): Promise<User[]> {
    if (isSupabaseConfigured()) {
      // The owner-facing admin API is a known gap (§3.2 in STATUS.md). Until
      // it exists, the panel shows an empty list rather than lying.
      return [];
    }
    return readUsers()
      .map(publicUser)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Owner action: change someone's plan. */
  async adminSetTier(userId: string, tier: Tier): Promise<AuthResult> {
    if (isSupabaseConfigured()) {
      return { ok: false, error: 'The admin API is not connected yet.' };
    }
    return this.setTier(userId, tier);
  },

  /** Owner action: remove an account. */
  async adminDeleteUser(userId: string): Promise<AuthResult> {
    if (isSupabaseConfigured()) {
      return { ok: false, error: 'The admin API is not connected yet.' };
    }
    const users = readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return { ok: false, error: 'Account not found.' };
    if (u.role === 'owner') {
      return { ok: false, error: 'The owner account cannot be deleted.' };
    }
    writeUsers(users.filter((x) => x.id !== userId));
    return { ok: true };
  },
};

/**
 * Subscribe to session changes (sign-in, sign-out, refresh, expiry).
 *
 * No-op when the local mock is active — the store drives everything itself
 * there. Returns an unsubscribe function.
 */
export async function onAuthChange(cb: (session: Session | null) => void): Promise<() => void> {
  if (!isSupabaseConfigured()) return () => {};
  const { data } = (await loadClient()).auth.onAuthStateChange((_event, sbSession) => {
    void toSession(sbSession).then(cb);
  });
  return () => data.subscription.unsubscribe();
}

async function startSession(u: StoredUser): Promise<AuthResult> {
  const session: Session = {
    token: token(),
    user: publicUser(u),
    expiresAt: Date.now() + SESSION_DAYS * 86400_000,
  };
  writeStorage(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}
