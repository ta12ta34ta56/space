/**
 * Build-time secret guard.  npm run verify:secrets
 *
 * Fails the build if anything that must stay server-side has reached the
 * browser bundle. This is the automated version of "never leak secret keys to
 * the client payload" — a rule that is easy to state and easy to break with a
 * single careless import.
 *
 * Two checks:
 *   1. No secret-shaped names or literals in dist/.
 *   2. No file under src/ imports anything from server/.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');

let failures = 0;
const fail = (m) => { console.log(`  FAIL  ${m}`); failures++; };
const ok = (m) => console.log(`  PASS  ${m}`);

/** Names that must never appear in client code. */
const FORBIDDEN_NAMES = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GRANT_SIGNING_SECRET',
  'SERVICE_ROLE',
  'service_role',
  'FIB_CLIENT_SECRET',
  'client_secret',
];

/** Literal shapes of real secrets. */
const FORBIDDEN_PATTERNS = [
  { re: /\bsk_live_[A-Za-z0-9]{10,}/, what: 'Stripe LIVE secret key' },
  { re: /\bsk_test_[A-Za-z0-9]{10,}/, what: 'Stripe test secret key' },
  { re: /\bwhsec_[A-Za-z0-9]{16,}/, what: 'Stripe webhook secret' },
  { re: /\brk_live_[A-Za-z0-9]{10,}/, what: 'Stripe restricted key' },
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('\n=== 1. no secrets in the shipped bundle ===');
if (!existsSync(DIST)) {
  fail('dist/ not found — run `npm run build` first');
} else {
  const files = walk(DIST).filter((f) => /\.(js|mjs|css|html|json|map)$/.test(f));
  console.log(`  scanning ${files.length} built files`);

  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);

    for (const name of FORBIDDEN_NAMES) {
      if (text.includes(name)) fail(`${rel} contains "${name}"`);
    }
    for (const { re, what } of FORBIDDEN_PATTERNS) {
      if (re.test(text)) fail(`${rel} contains a ${what}`);
    }
  }
  if (failures === 0) ok(`no forbidden names or key literals in ${files.length} files`);
}

console.log('\n=== 2. client code never imports server code ===');
{
  const clientFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  let bad = 0;
  for (const f of clientFiles) {
    const text = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    // any import that climbs into server/
    for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.includes('server/') || spec.includes('/server')) {
        fail(`${rel} imports "${spec}" — server code must not enter the bundle`);
        bad++;
      }
    }
    if (/\bstripe\b/i.test(text) && /import[^;]*from\s+['"]stripe['"]/.test(text)) {
      fail(`${rel} imports the Stripe server SDK`);
      bad++;
    }
  }
  if (bad === 0) ok(`${clientFiles.length} client files, none reach into server/`);
}

console.log('\n=== 3. .env files are gitignored at every depth ===');
{
  const gi = existsSync(join(ROOT, '.gitignore'))
    ? readFileSync(join(ROOT, '.gitignore'), 'utf8')
    : '';
  if (!/^\*\*\/\.env$/m.test(gi) && !/^\*\*\/\.env\b/m.test(gi)) {
    fail('.gitignore does not ignore **/.env — server/.env could be committed');
  } else {
    ok('**/.env is ignored (covers server/.env)');
  }
  if (!/!\*\*\/\.env\.example/.test(gi) && !/!\.env\.example/.test(gi)) {
    fail('.env.example is not un-ignored; contributors get no template');
  } else {
    ok('.env.example stays tracked');
  }
}

console.log('\n' + '-'.repeat(48));
if (failures === 0) {
  console.log('SECRET SCAN CLEAN');
  process.exit(0);
} else {
  console.log(`${failures} PROBLEM(S) FOUND — do not deploy`);
  process.exit(1);
}
