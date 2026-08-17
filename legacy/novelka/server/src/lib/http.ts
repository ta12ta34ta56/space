/**
 * HTTP helpers.
 *
 * Every response goes through here so that error handling is uniform and no
 * route can accidentally leak an exception message, a stack trace, or a key.
 */

/** Headers applied to every response. */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  // No caching of authenticated API responses, ever — a shared cache must not
  // hand one user's entitlement to another.
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
};

export function jsonOk(data: unknown, extra: Record<string, string> = {}) {
  return {
    status: 200,
    body: JSON.stringify(data),
    headers: { ...SECURITY_HEADERS, ...extra },
  };
}

/**
 * An error the client is allowed to see.
 *
 * `message` must be written for a user, never derived from an exception.
 * Internal detail belongs in the server log only.
 */
export function jsonError(status: number, message: string, extra: Record<string, string> = {}) {
  return {
    status,
    body: JSON.stringify({ error: message }),
    headers: { ...SECURITY_HEADERS, ...extra },
  };
}

/**
 * CORS.
 *
 * An allow-list, not `*`. With credentials enabled `*` is both invalid and
 * dangerous: any site could call our API with the user's session.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key, X-Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
