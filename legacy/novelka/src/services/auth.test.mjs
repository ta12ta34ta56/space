/**
 * Auth tests.  npm run test:auth
 *
 * These guard the things that would actually hurt: someone else becoming
 * owner, a signed-out user keeping access, or an account being enumerable
 * through the login form.
 */
import { auth, claimOwnership, checkRecoveryCode, isOwnerEmail, loadOwnerConfig } from './auth.built.mjs';

// ---- minimal localStorage + crypto for Node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
if (!globalThis.crypto?.subtle) {
  const { webcrypto } = await import('node:crypto');
  globalThis.crypto = webcrypto;
}

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
const reset = () => store.clear();

console.log('\n=== sign up ===');
{
  reset();
  const r = await auth.signUp('a@b.com', 'password123', 'Ann');
  check('creates an account', r.ok && !!r.session);
  check('returns a session token', !!r.session?.token && r.session.token.length > 20);
  check('defaults to the free tier', r.session?.user.tier === 'free');
  check('defaults to the user role', r.session?.user.role === 'user');
  check('keeps the display name', r.session?.user.displayName === 'Ann');
  check('never returns the password hash',
    !JSON.stringify(r.session?.user ?? {}).toLowerCase().includes('password'));
}
{
  reset();
  await auth.signUp('a@b.com', 'password123');
  const dup = await auth.signUp('A@B.com', 'other12345');
  check('rejects a duplicate email, case-insensitively', !dup.ok, dup.error);
  check('falls back to a name from the email',
    (await auth.getSession())?.user.displayName === 'a');
}
{
  reset();
  check('rejects a bad email', !(await auth.signUp('nope', 'password123')).ok);
  check('rejects a short password', !(await auth.signUp('c@d.com', 'short')).ok);
  const r = await auth.signUp('  MiXeD@Case.COM ', 'password123');
  check('normalises the email', r.session?.user.email === 'mixed@case.com');
}

console.log('\n=== sign in ===');
{
  reset();
  await auth.signUp('a@b.com', 'password123');
  await auth.signOut();
  check('signed out means no session', (await auth.getSession()) === null);

  const good = await auth.signIn('a@b.com', 'password123');
  check('correct password signs in', good.ok && !!good.session);
  check('email is case-insensitive on sign-in',
    (await auth.signIn('A@B.COM', 'password123')).ok);

  const bad = await auth.signIn('a@b.com', 'wrongpassword');
  check('wrong password is rejected', !bad.ok);
  const missing = await auth.signIn('nobody@x.com', 'password123');
  check('unknown account is rejected', !missing.ok);
  // account enumeration: both failures must look identical
  check('unknown account and wrong password give the same error',
    bad.error === missing.error, `${bad.error} vs ${missing.error}`);
}

console.log('\n=== sessions ===');
{
  reset();
  const r = await auth.signUp('a@b.com', 'password123');
  check('session persists', (await auth.getSession())?.user.email === 'a@b.com');
  check('expiry is in the future', (r.session?.expiresAt ?? 0) > Date.now());

  // expired session must not grant access
  const s = JSON.parse(store.get('novelka.session.v1'));
  s.expiresAt = Date.now() - 1000;
  store.set('novelka.session.v1', JSON.stringify(s));
  check('an expired session is refused', (await auth.getSession()) === null);
  check('the expired session is cleared', !store.has('novelka.session.v1'));
}
{
  reset();
  const r = await auth.signUp('a@b.com', 'password123');
  // a session for a deleted account must not keep working
  store.set('novelka.users.v1', '[]');
  check('session dies with the account', (await auth.getSession()) === null);
  void r;
}
{
  reset();
  await auth.signUp('a@b.com', 'password123');
  check('garbage session data does not throw', await (async () => {
    store.set('novelka.session.v1', '{{{not json');
    try { return (await auth.getSession()) === null; } catch { return false; }
  })());
}

console.log('\n=== ownership ===');
{
  reset();
  check('no owner before setup', !(await loadOwnerConfig()).configured);
  const c = await claimOwnership('me@shop.com', 'super-secret-code');
  check('ownership can be claimed', c.ok);
  check('claiming twice is refused', !(await claimOwnership('other@x.com', 'another-code')).ok);
  check('owner email recognised', await isOwnerEmail('me@shop.com'));
  check('owner email is case-insensitive', await isOwnerEmail('ME@SHOP.COM'));
  check('a different email is not the owner', !(await isOwnerEmail('someone@else.com')));
  check('the recovery code is not stored in the clear',
    !store.get('novelka.owner.v1').includes('super-secret-code'));
  check('correct recovery code accepted', await checkRecoveryCode('super-secret-code'));
  check('wrong recovery code rejected', !(await checkRecoveryCode('guess')));
  check('short recovery codes are refused', (await (async () => {
    store.delete('novelka.owner.v1');
    return !(await claimOwnership('me@shop.com', 'short')).ok;
  })()));
}
{
  // claim first, then sign up
  reset();
  await claimOwnership('me@shop.com', 'super-secret-code');
  const r = await auth.signUp('me@shop.com', 'password123');
  check('the owner email gets the owner role', r.session?.user.role === 'owner');
  const other = await auth.signUp('someone@else.com', 'password123');
  check('everyone else is a plain user', other.session?.user.role === 'user');
}
{
  // sign up first, then claim — the role must be repaired on next sign-in
  reset();
  await auth.signUp('me@shop.com', 'password123');
  await claimOwnership('me@shop.com', 'super-secret-code');
  const again = await auth.signIn('me@shop.com', 'password123');
  check('ownership is granted retroactively on sign-in',
    again.session?.user.role === 'owner');
}

console.log('\n=== tiers ===');
{
  reset();
  const r = await auth.signUp('a@b.com', 'password123');
  const id = r.session.user.id;
  await auth.setTier(id, 'pro');
  check('tier change is persisted', (await auth.getSession())?.user.tier === 'pro');
  check('an unknown account cannot be upgraded', !(await auth.setTier('nope', 'pro')).ok);
}

console.log('\n=== owner tools ===');
{
  reset();
  await claimOwnership('me@shop.com', 'super-secret-code');
  await auth.signUp('me@shop.com', 'password123');
  await auth.signUp('u1@x.com', 'password123');
  await auth.signUp('u2@x.com', 'password123');

  const list = await auth.listUsers();
  check('lists every account', list.length === 3, String(list.length));
  check('the list carries no password hashes',
    !JSON.stringify(list).toLowerCase().includes('passwordhash'));

  const u1 = list.find((u) => u.email === 'u1@x.com');
  await auth.adminSetTier(u1.id, 'basic');
  check('owner can change a plan',
    (await auth.listUsers()).find((u) => u.id === u1.id).tier === 'basic');

  check('owner can delete a user', (await auth.adminDeleteUser(u1.id)).ok);
  check('the user is gone', (await auth.listUsers()).length === 2);

  const owner = (await auth.listUsers()).find((u) => u.role === 'owner');
  const del = await auth.adminDeleteUser(owner.id);
  check('the owner account cannot be deleted', !del.ok, del.error);
}


console.log('\n=== password storage (PBKDF2) ===');
{
  reset();
  await auth.signUp('crypt@x.com', 'correct horse battery');
  const rec = JSON.parse(localStorage.getItem('novelka.users.v1'))[0];

  check('password is never stored in the clear',
    !JSON.stringify(rec).includes('correct horse battery'));
  check('hash uses the pbkdf2 format', rec.passwordHash.startsWith('pbkdf2$'),
    rec.passwordHash.slice(0, 24));

  const [, iters, salt, digest] = rec.passwordHash.split('$');
  check('work factor is at least the OWASP 210k', Number(iters) >= 210000, iters);
  check('salt is 16 bytes of hex', /^[0-9a-f]{32}$/.test(salt), salt);
  check('digest is 32 bytes of hex', /^[0-9a-f]{64}$/.test(digest));

  // The whole point of a salt: same password, different stored hash.
  await auth.signUp('twin@x.com', 'correct horse battery');
  const both = JSON.parse(localStorage.getItem('novelka.users.v1'));
  check('identical passwords produce different hashes (salt works)',
    both[0].passwordHash !== both[1].passwordHash);
  check('the salts themselves differ',
    both[0].passwordHash.split('$')[2] !== both[1].passwordHash.split('$')[2]);

  await auth.signOut();
  check('correct password still signs in',
    (await auth.signIn('crypt@x.com', 'correct horse battery')).ok);
  await auth.signOut();
  check('wrong password is rejected',
    !(await auth.signIn('crypt@x.com', 'correct horse batteru')).ok);
}

console.log('\n=== legacy accounts still work (silent upgrade) ===');
{
  reset();
  // Recreate exactly what the old bare-SHA-256 build wrote to disk.
  // The pre-rename hash domain is part of the fixture: these hashes were
  // created when the domain was `gridpress:` and must keep verifying.
  const enc = new TextEncoder().encode('gridpress:oldpassword1');
  const dg = await crypto.subtle.digest('SHA-256', enc);
  const legacy = [...new Uint8Array(dg)].map((b) => b.toString(16).padStart(2, '0')).join('');
  check('legacy fixture is a bare 64-char sha256', /^[0-9a-f]{64}$/.test(legacy));

  localStorage.setItem('novelka.users.v1', JSON.stringify([{
    id: 'legacy01', email: 'old@x.com', displayName: 'Old',
    role: 'user', tier: 'basic', createdAt: new Date().toISOString(),
    passwordHash: legacy,
  }]));

  const r = await auth.signIn('old@x.com', 'oldpassword1');
  check('an account made before the change can still sign in', r.ok, r.error);
  check('their plan survives the upgrade', r.session?.user.tier === 'basic');

  const after = JSON.parse(localStorage.getItem('novelka.users.v1'))[0];
  check('their hash was silently upgraded to pbkdf2',
    after.passwordHash.startsWith('pbkdf2$'), after.passwordHash.slice(0, 16));
  check('the old sha256 hash is gone', after.passwordHash !== legacy);

  await auth.signOut();
  check('they can sign in again after the upgrade',
    (await auth.signIn('old@x.com', 'oldpassword1')).ok);
  await auth.signOut();
  check('a wrong password is still rejected after upgrade',
    !(await auth.signIn('old@x.com', 'wrongpassword')).ok);
}

console.log('\n=== owner recovery code ===');
{
  reset();
  await claimOwnership('boss@x.com', 'my-recovery-code');
  const cfg = await loadOwnerConfig();
  check('recovery code is not stored in the clear',
    !JSON.stringify(cfg).includes('my-recovery-code'));
  check('recovery code uses pbkdf2 too', cfg.recoveryHash.startsWith('pbkdf2$'),
    cfg.recoveryHash.slice(0, 16));
  check('the right code opens the panel', await checkRecoveryCode('my-recovery-code'));
  check('a wrong code does not', !(await checkRecoveryCode('my-recovery-cod3')));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
