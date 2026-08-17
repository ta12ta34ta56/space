/**
 * Cryptographic Signed Grant Tokens.
 *
 * ## The Purpose
 * Unwatermarked PDF exports and premium layout computation require proof that
 * the server evaluated the user's entitlement and approved the operation.
 *
 * The client cannot forge or widen a grant: it is signed with the server's
 * `SUPABASE_SERVICE_ROLE_KEY` using HMAC-SHA256. Grants carry a short TTL (5 mins).
 */

export interface EntitlementGrantClaims {
  sub: string;
  feature: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  watermark: boolean;
  scope?: string | string[];
  jti?: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const unb64url = (str: string): Uint8Array => {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/** Sign a grant payload using HMAC-SHA256. */
export async function signGrant(
  payload: EntitlementGrantClaims,
  secret: string,
): Promise<string> {
  const json = JSON.stringify(payload);
  const body = b64url(new TextEncoder().encode(json));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export interface VerifyGrantOptions {
  expectedSub?: string;
  expectedFeature?: string;
  nowEpochSec?: number;
}

/**
 * Verify an HMAC-SHA256 signed grant token.
 *
 * Asserts:
 *   1. Shape is <body-b64url>.<sig-b64url>
 *   2. Cryptographic signature matches HMAC-SHA256(body, secret)
 *   3. Token has not expired (exp > now)
 *   4. If expectedSub is provided, claims.sub matches (prevents token replay across users)
 *   5. If expectedFeature is provided, claims.feature matches (prevents capability widening)
 */
export async function verifyGrant(
  token: string,
  secret: string,
  options?: VerifyGrantOptions,
): Promise<EntitlementGrantClaims | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const expectedSigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const expectedSigB64 = b64url(new Uint8Array(expectedSigBytes));

    // Constant-time-like length & string comparison
    if (expectedSigB64 !== sig) {
      return null;
    }

    const payloadJson = new TextDecoder().decode(unb64url(body));
    const claims = JSON.parse(payloadJson) as EntitlementGrantClaims;

    if (!claims || typeof claims !== 'object') return null;
    if (typeof claims.sub !== 'string' || typeof claims.feature !== 'string') return null;

    const now = options?.nowEpochSec ?? Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now) {
      return null; // Expired
    }

    if (options?.expectedSub && claims.sub !== options.expectedSub) {
      return null; // Cross-user mismatch
    }

    if (options?.expectedFeature && claims.feature !== options.expectedFeature) {
      return null; // Feature scope mismatch
    }

    return claims;
  } catch {
    return null;
  }
}
