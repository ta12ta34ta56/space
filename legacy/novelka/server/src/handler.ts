import { handleStripeWebhook } from './routes/stripe-webhook';
import { handleCreateCheckout, handleBillingPortal } from './routes/checkout';
import { handleGetEntitlement, handleConsume } from './routes/entitlement';
import { handleExportData, handleDeleteAccount } from './routes/gdpr';
import { handleRating } from './routes/rating';
import { handleGetPublishedTemplates } from './routes/templates';
import {
  handleAdminOverview,
  handleAdminListUsers,
  handleAdminUpdateUserTier,
  handleAdminListFlags,
  handleAdminUpdateFlag,
  handleAdminListTemplates,
  handleAdminCreateTemplate,
  handleAdminUpdateTemplate,
  handleAdminUpdateTemplateStatus,
  handleAdminListAuditLogs,
} from './routes/admin';
import { corsHeaders, jsonError, SECURITY_HEADERS } from './lib/http';

/**
 * Platform-agnostic request router.
 *
 * Every route handler is a pure function of (body, headers, env). This file is
 * the only place that knows about `Request`/`Response`, so the same code runs
 * on Cloudflare Workers, Vercel Edge, Deno or Bun with a three-line wrapper.
 *
 * ## The one thing that must not be broken
 *
 * The Stripe webhook needs the **raw body bytes**. Stripe signs the exact bytes
 * it sent; parsing to JSON and re-serialising changes whitespace and key order,
 * the signature no longer matches, and every real payment starts failing while
 * forgeries are indistinguishable. `request.text()` is read once, before any
 * parsing, and passed through untouched.
 */

/** Origins allowed to call this API with credentials. */
function allowedOrigins(env: Record<string, string | undefined>): string[] {
  const list = [env.APP_URL, env.APP_URL_ALT].filter(Boolean) as string[];
  if (env.NODE_ENV !== 'production') {
    list.push('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173');
  }
  return list;
}

/** Maximum allowed body size for JSON payloads (64 KB). */
const MAX_BODY_BYTES = 65_536;

/**
 * Best-effort client IP, used only for rate-limit bucketing.
 *
 * These headers are forgeable in general, but on Cloudflare and Vercel the
 * edge overwrites them, so they are trustworthy there. Rate limiting is a
 * speed bump, never an authorisation decision — nothing here grants access.
 */
function clientIp(headers: Headers): string {
  const raw =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  const cleaned = raw.trim().slice(0, 45);
  if (/^[a-fA-F0-9:.]+$/.test(cleaned)) {
    return cleaned;
  }
  return 'unknown';
}

async function readBodySafely(request: Request): Promise<{ ok: true; body: string } | { ok: false; status: number; message: string }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Payload too large. Maximum allowed size is 64 KB.' };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Payload too large. Maximum allowed size is 64 KB.' };
  }
  return { ok: true, body: text };
}

export async function handleRequest(
  request: Request,
  env: Record<string, string | undefined>,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin, allowedOrigins(env));

  // Pre-flight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, ...SECURITY_HEADERS } });
  }

  const respond = (r: { status: number; body: string; headers?: Record<string, string> }) =>
    new Response(r.body, {
      status: r.status,
      headers: { ...SECURITY_HEADERS, ...cors, ...(r.headers ?? {}) },
    });

  const ip = clientIp(request.headers);
  const auth = request.headers.get('authorization');
  const idempotencyKey =
    request.headers.get('idempotency-key') ||
    request.headers.get('x-idempotency-key') ||
    null;

  try {
    // ---- Stripe webhook --------------------------------------------------
    // No CORS: Stripe is not a browser. No auth header: the signature IS the
    // authentication.
    if (url.pathname === '/api/stripe/webhook') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      // RAW body. Do not parse. Do not re-serialise.
      const raw = await request.text();
      const sig = request.headers.get('stripe-signature');
      const r = await handleStripeWebhook(raw, sig, env);
      return new Response(r.body, { status: r.status, headers: SECURITY_HEADERS });
    }

    // ---- Checkout --------------------------------------------------------
    if (url.pathname === '/api/checkout') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      return respond(await handleCreateCheckout(bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    if (url.pathname === '/api/billing-portal') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleBillingPortal({ authorization: auth, clientIp: ip }, env));
    }

    // ---- Entitlement -----------------------------------------------------
    if (url.pathname === '/api/entitlement') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleGetEntitlement({ authorization: auth, clientIp: ip }, env));
    }

    if (url.pathname === '/api/entitlement/consume') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      return respond(await handleConsume(bRes.body, { authorization: auth, clientIp: ip, idempotencyKey }, env));
    }

    // ---- Templates (Public / Customer read of published templates) --------
    if (url.pathname === '/api/templates') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleGetPublishedTemplates(url, { authorization: auth, clientIp: ip }, env));
    }

    // ---- GDPR: the user's own data ---------------------------------------
    if (url.pathname === '/api/account/export') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleExportData({ authorization: auth, clientIp: ip }, env));
    }

    if (url.pathname === '/api/account/delete') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      return respond(await handleDeleteAccount(bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    // ---- Ratings ---------------------------------------------------------
    if (url.pathname === '/api/rating') {
      if (request.method !== 'POST') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      return respond(await handleRating(bRes.body, { clientIp: ip }, env));
    }

    // ---- Health ----------------------------------------------------------
    // Deliberately reveals nothing about configuration or versions.
    if (url.pathname === '/api/health') {
      return respond({ status: 200, body: JSON.stringify({ ok: true }) });
    }

    // ======================================================================
    // ADMIN ROUTES — Server Authority & Owner Control Plane
    // ======================================================================

    // 1. Overview metrics
    if (url.pathname === '/api/admin/overview') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleAdminOverview({ authorization: auth, clientIp: ip }, env));
    }

    // 2. User list
    if (url.pathname === '/api/admin/users') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleAdminListUsers(url, { authorization: auth, clientIp: ip }, env));
    }

    // 3. User tier override: PATCH /api/admin/users/:id/tier
    const userTierMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/tier$/);
    if (userTierMatch) {
      if (request.method !== 'PATCH') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      const targetUserId = decodeURIComponent(userTierMatch[1]);
      return respond(await handleAdminUpdateUserTier(targetUserId, bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    // 4. Feature flags list
    if (url.pathname === '/api/admin/flags') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleAdminListFlags({ authorization: auth, clientIp: ip }, env));
    }

    // 5. Feature flag update: PUT /api/admin/flags/:featureKey
    const flagMatch = url.pathname.match(/^\/api\/admin\/flags\/([^/]+)$/);
    if (flagMatch) {
      if (request.method !== 'PUT') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      const featureKey = decodeURIComponent(flagMatch[1]);
      return respond(await handleAdminUpdateFlag(featureKey, bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    // 6. Templates list & create: /api/admin/templates
    if (url.pathname === '/api/admin/templates') {
      if (request.method === 'GET') {
        return respond(await handleAdminListTemplates(url, { authorization: auth, clientIp: ip }, env));
      }
      if (request.method === 'POST') {
        const bRes = await readBodySafely(request);
        if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
        return respond(await handleAdminCreateTemplate(bRes.body, { authorization: auth, clientIp: ip }, env));
      }
      return respond(jsonError(405, 'Method not allowed'));
    }

    // 7. Template status update: PATCH / PUT /api/admin/templates/:id/status
    const tmplStatusMatch = url.pathname.match(/^\/api\/admin\/templates\/([^/]+)\/status$/);
    if (tmplStatusMatch) {
      if (request.method !== 'PATCH' && request.method !== 'PUT') {
        return respond(jsonError(405, 'Method not allowed'));
      }
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      const templateId = decodeURIComponent(tmplStatusMatch[1]);
      return respond(await handleAdminUpdateTemplateStatus(templateId, bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    // 8. Template edit: PATCH /api/admin/templates/:id
    const tmplMatch = url.pathname.match(/^\/api\/admin\/templates\/([^/]+)$/);
    if (tmplMatch) {
      if (request.method !== 'PATCH') return respond(jsonError(405, 'Method not allowed'));
      const bRes = await readBodySafely(request);
      if (!bRes.ok) return respond(jsonError(bRes.status, bRes.message));
      const templateId = decodeURIComponent(tmplMatch[1]);
      return respond(await handleAdminUpdateTemplate(templateId, bRes.body, { authorization: auth, clientIp: ip }, env));
    }

    // 9. Admin audit logs
    if (url.pathname === '/api/admin/audit-logs') {
      if (request.method !== 'GET') return respond(jsonError(405, 'Method not allowed'));
      return respond(await handleAdminListAuditLogs(url, { authorization: auth, clientIp: ip }, env));
    }

    return respond(jsonError(404, 'Not found'));
  } catch (e) {
    // Last line of defence. A thrown error must never reach the client as a
    // stack trace — that leaks file paths, dependency versions and sometimes
    // environment values.
    console.error('[handler] unhandled', e);
    return respond(jsonError(500, 'Something went wrong.'));
  }
}
