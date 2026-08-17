/**
 * Test-only entry point.
 *
 * Bundling the router and test seams together guarantees they share module
 * state across all route modules and mock hooks.
 */
export { handleRequest } from './handler';
export { __setTestHooks } from './routes/stripe-webhook';
export { __setGdprHooks } from './routes/gdpr';
export { __setEntitlementHooks } from './routes/entitlement';
export { __setAdminHooks } from './routes/admin';
export { __setTemplateHooks } from './routes/templates';
export { __setRatingHooks } from './routes/rating';
export { requireOwner, authenticateUser } from './lib/auth';
export { signGrant, verifyGrant } from './lib/grants';
export { logAdminAction, sanitizeAuditData } from './lib/audit';
export {
  validateIdempotencyKey,
  hashPayload,
  getIdempotencyRecord,
  saveIdempotencyRecord,
} from './lib/idempotency';
