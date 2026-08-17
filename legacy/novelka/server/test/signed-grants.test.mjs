/**
 * Cryptographic Signed Grants Security Tests.
 *
 * Verifies:
 * - Server-only HMAC-SHA256 signing
 * - Verification and claims integrity
 * - Expiration / TTL enforcement
 * - Tamper resistance (payload modification, signature stripping)
 * - Cross-user replay prevention (expectedSub)
 * - Capability widening prevention (expectedFeature)
 */
let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); }
};

const { signGrant, verifyGrant } = await import('../dist-test/test-entry.mjs');

const SECRET = 'supabase-service-role-secret-key-12345';
const WRONG_SECRET = 'attacker-guessing-the-secret-key-99999';

const NOW = Math.floor(Date.now() / 1000);

const VALID_PAYLOAD = {
  sub: 'user-uuid-1',
  feature: 'export_pdf',
  tier: 'pro',
  watermark: false,
  scope: 'export:unwatermarked',
  iat: NOW,
  exp: NOW + 300, // 5 minutes TTL
  jti: 'grant-001',
};

console.log('\n=== 1. Legitimate Grant Issuance & Verification ===');
{
  const token = await signGrant(VALID_PAYLOAD, SECRET);
  check('token is generated as compact string with period', typeof token === 'string' && token.split('.').length === 2);

  const verified = await verifyGrant(token, SECRET);
  check('valid grant verifies successfully', verified !== null);
  check('verified claims sub matches', verified?.sub === 'user-uuid-1');
  check('verified claims feature matches', verified?.feature === 'export_pdf');
  check('verified claims watermark is false', verified?.watermark === false);
  check('verified claims tier is pro', verified?.tier === 'pro');
}

console.log('\n=== 2. Expiration Enforcement ===');
{
  const expiredPayload = {
    ...VALID_PAYLOAD,
    iat: NOW - 600,
    exp: NOW - 60, // Expired 1 minute ago
  };
  const expiredToken = await signGrant(expiredPayload, SECRET);
  const result = await verifyGrant(expiredToken, SECRET);
  check('expired grant returns null', result === null);
}

console.log('\n=== 3. Secret Verification ===');
{
  const token = await signGrant(VALID_PAYLOAD, SECRET);
  const result = await verifyGrant(token, WRONG_SECRET);
  check('grant verified with wrong secret returns null', result === null);
}

console.log('\n=== 4. Tampering & Client-Side Patch Resistance ===');
{
  const token = await signGrant({ ...VALID_PAYLOAD, watermark: true, tier: 'free' }, SECRET);
  const [bodyB64, sig] = token.split('.');

  // Attacker decodes body, flips watermark to false and tier to enterprise, then re-encodes
  const pad = bodyB64.length % 4 ? '='.repeat(4 - (bodyB64.length % 4)) : '';
  const decoded = JSON.parse(atob(bodyB64.replace(/-/g, '+').replace(/_/g, '/') + pad));
  decoded.watermark = false;
  decoded.tier = 'enterprise';

  const forgedBody = btoa(JSON.stringify(decoded)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const forgedToken = `${forgedBody}.${sig}`;

  const tamperedResult = await verifyGrant(forgedToken, SECRET);
  check('tampered grant payload fails signature verification', tamperedResult === null);
}

console.log('\n=== 5. Malformed Tokens ===');
{
  check('empty string returns null', (await verifyGrant('', SECRET)) === null);
  check('token without dot returns null', (await verifyGrant('singlePartToken', SECRET)) === null);
  check('token with three dots returns null', (await verifyGrant('a.b.c', SECRET)) === null);
  check('garbage string returns null', (await verifyGrant('not.a.valid.jwt.token', SECRET)) === null);
}

console.log('\n=== 6. Expected User ID / Cross-User Replay Prevention ===');
{
  const token = await signGrant(VALID_PAYLOAD, SECRET);

  const matchedUser = await verifyGrant(token, SECRET, { expectedSub: 'user-uuid-1' });
  check('matching expectedSub succeeds', matchedUser !== null);

  const wrongUser = await verifyGrant(token, SECRET, { expectedSub: 'user-victim-2' });
  check('mismatched expectedSub returns null (prevents token theft across accounts)', wrongUser === null);
}

console.log('\n=== 7. Expected Feature / Capability Widening Prevention ===');
{
  const token = await signGrant(VALID_PAYLOAD, SECRET);

  const matchedFeature = await verifyGrant(token, SECRET, { expectedFeature: 'export_pdf' });
  check('matching expectedFeature succeeds', matchedFeature !== null);

  const widenedFeature = await verifyGrant(token, SECRET, { expectedFeature: 'commercial_license' });
  check('mismatched expectedFeature returns null (prevents using export grant for other perks)', widenedFeature === null);
}

console.log('\n=== 8. Service-Role Key Independence (Key Separation) ===');
{
  const GRANT_SECRET = 'dedicated_grant_signing_secret_v1_32chars';
  const SERVICE_ROLE_KEY = 'head.payload.supabase-service-role-key';

  const token = await signGrant(VALID_PAYLOAD, GRANT_SECRET);
  const verifyWithServiceRole = await verifyGrant(token, SERVICE_ROLE_KEY);
  check('grant signed with GRANT_SIGNING_SECRET fails verification against service-role key',
    verifyWithServiceRole === null);

  const forgedWithServiceRole = await signGrant(VALID_PAYLOAD, SERVICE_ROLE_KEY);
  const verifyForged = await verifyGrant(forgedWithServiceRole, GRANT_SECRET);
  check('token signed with service-role key is rejected by grant verification',
    verifyForged === null);
}

console.log('\n=== 9. Secret Rotation Handling ===');
{
  const SECRET_V1 = 'grant_signing_secret_version_1_32ch';
  const SECRET_V2 = 'grant_signing_secret_version_2_32ch';

  const oldToken = await signGrant(VALID_PAYLOAD, SECRET_V1);
  check('token signed under secret V1 verifies under secret V1',
    (await verifyGrant(oldToken, SECRET_V1)) !== null);
  check('token signed under secret V1 fails under rotated secret V2',
    (await verifyGrant(oldToken, SECRET_V2)) === null);

  const newToken = await signGrant(VALID_PAYLOAD, SECRET_V2);
  check('fresh token signed under secret V2 verifies under secret V2',
    (await verifyGrant(newToken, SECRET_V2)) !== null);
}

console.log('\n=== 10. Missing or Blank Secret Handling ===');
{
  const token = await signGrant(VALID_PAYLOAD, SECRET);
  check('verification with empty secret returns null', (await verifyGrant(token, '')) === null);
}
if (fail === 0) console.log(`ALL SIGNED GRANTS TESTS PASSED  (${pass} checks)`);
else { console.log(`${pass} passed, ${fail} FAILED`); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
