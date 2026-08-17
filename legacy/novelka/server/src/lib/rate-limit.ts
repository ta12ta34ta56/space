/**
 * Rate limiting.
 *
 * In-memory fixed-window counter. Honest about its limits:
 *
 * - On serverless each instance has its own memory, so the real ceiling is
 *   roughly `limit x instances`. That still stops a single client hammering
 *   one endpoint, which is what this is for.
 * - For a hard global limit, back it with Upstash Redis or Cloudflare Durable
 *   Objects. `checkLimit` is deliberately the only thing to swap.
 *
 * It is applied before any expensive work — before Stripe calls, before
 * database reads — so an attacker cannot burn our quota or our money.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so a long-lived instance cannot grow without bound. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface LimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Consume one unit against `key`.
 *
 * @param key      identity to limit on — an IP, or `user:<id>` when known
 * @param limit    requests allowed per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }
  return { ok: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/** Test helper. */
export function __resetRateLimits() {
  buckets.clear();
}
