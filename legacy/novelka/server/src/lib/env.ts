/**
 * Environment access.
 *
 * Two rules enforced here rather than by convention:
 *   1. Secrets are read through `serverEnv()`, which throws at boot if one is
 *      missing. A missing STRIPE_WEBHOOK_SECRET or GRANT_SIGNING_SECRET must
 *      stop the deploy, not silently disable signature checking at 3am.
 *   2. Nothing in this file may be imported by `src/` (the browser bundle).
 *      The build check in `npm run verify:secrets` asserts that.
 */

export interface ServerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  GRANT_SIGNING_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  APP_URL: string;
  /** price id -> tier, e.g. { price_123: 'pro' } */
  STRIPE_PRICE_BASIC: string;
  STRIPE_PRICE_PRO: string;
  STRIPE_PRICE_ENTERPRISE: string;
  NODE_ENV?: string;
}

const REQUIRED: (keyof ServerEnv)[] = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'APP_URL',
  'STRIPE_PRICE_BASIC',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_ENTERPRISE',
];

const DEV_TEST_GRANT_SECRET = 'dev-grant-signing-secret-novelka-test-only-32bytes-min';

/**
 * Read and validate every secret.
 *
 * `source` is the platform's env object: `process.env` on Node/Vercel, or the
 * bindings object on Cloudflare Workers (which has no `process`).
 */
export function serverEnv(source: Record<string, string | undefined>): ServerEnv {
  const missing: string[] = [];
  const out = {} as ServerEnv;

  for (const key of REQUIRED) {
    const v = source[key];
    if (!v || !v.trim()) {
      missing.push(key);
    } else {
      out[key] = v.trim();
    }
  }

  // Handle GRANT_SIGNING_SECRET
  const isProd = (source.NODE_ENV ?? process?.env?.NODE_ENV) === 'production';
  const grantSecret = source.GRANT_SIGNING_SECRET?.trim();
  if (!grantSecret) {
    if (isProd) {
      missing.push('GRANT_SIGNING_SECRET');
    } else {
      out.GRANT_SIGNING_SECRET = DEV_TEST_GRANT_SECRET;
    }
  } else {
    out.GRANT_SIGNING_SECRET = grantSecret;
  }

  if (missing.length) {
    // Names only — never values, and this must not reach a client response.
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // ---- shape checks: catch a swapped key before it reaches production ----
  //
  // Supabase now issues two key formats:
  //   legacy  — JWTs, "eyJ..." with two dots
  //   current — "sb_publishable_..." and "sb_secret_..."
  // Accept both, but insist the SECRET slot never holds a PUBLIC key.

  if (out.STRIPE_SECRET_KEY.startsWith('pk_')) {
    throw new Error('STRIPE_SECRET_KEY holds a publishable key (pk_…). Use the secret key (sk_…).');
  }
  if (!/^(sk_|rk_)/.test(out.STRIPE_SECRET_KEY)) {
    throw new Error('STRIPE_SECRET_KEY should start with sk_ or rk_.');
  }
  if (!out.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET should start with whsec_ (Webhooks → Signing secret).');
  }

  const svc = out.SUPABASE_SERVICE_ROLE_KEY;
  if (svc.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY holds the PUBLISHABLE key. It must be the secret key ' +
        '(sb_secret_…), which is never sent to a browser.',
    );
  }
  const svcLooksValid = svc.startsWith('sb_secret_') || svc.split('.').length === 3;
  if (!svcLooksValid) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a recognised Supabase key format.');
  }

  const anonKey = out.SUPABASE_ANON_KEY;
  if (anonKey.startsWith('sb_secret_')) {
    throw new Error(
      'SUPABASE_ANON_KEY holds the SECRET key. Use the publishable key here — ' +
        'the anon key is safe to expose, the secret key is not.',
    );
  }
  if (svc === anonKey) {
    throw new Error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are identical.');
  }

  // Grant signing secret separation: MUST NOT be the service role key or anon key
  if (out.GRANT_SIGNING_SECRET === svc) {
    throw new Error('GRANT_SIGNING_SECRET must be a distinct dedicated secret, not SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (out.GRANT_SIGNING_SECRET === anonKey) {
    throw new Error('GRANT_SIGNING_SECRET must not be identical to SUPABASE_ANON_KEY.');
  }
  if (isProd && out.GRANT_SIGNING_SECRET.length < 32) {
    throw new Error('GRANT_SIGNING_SECRET must be at least 32 random characters (preferably 32 random bytes as 64 hex characters) in production.');
  }

  if (!/^https:\/\//.test(out.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL must start with https://');
  }
  // The REST path is appended by the client; a trailing /rest/v1 double-appends.
  if (/\/rest\/v1\/?$/.test(out.SUPABASE_URL)) {
    throw new Error(
      'SUPABASE_URL should be the bare project URL (https://xxx.supabase.co), not the /rest/v1 endpoint.',
    );
  }

  return out;
}

/** Map a Stripe price id to the tier it grants. */
export function tierForPrice(env: ServerEnv, priceId: string): 'basic' | 'pro' | 'enterprise' | null {
  if (priceId === env.STRIPE_PRICE_BASIC) return 'basic';
  if (priceId === env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === env.STRIPE_PRICE_ENTERPRISE) return 'enterprise';
  return null;
}

/** Reverse: the price id for a tier the client asked to buy. */
export function priceForTier(env: ServerEnv, tier: string): string | null {
  switch (tier) {
    case 'basic': return env.STRIPE_PRICE_BASIC;
    case 'pro': return env.STRIPE_PRICE_PRO;
    case 'enterprise': return env.STRIPE_PRICE_ENTERPRISE;
    default: return null;
  }
}
