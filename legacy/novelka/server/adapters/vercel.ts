import { handleRequest } from '../src/handler';

/**
 * Vercel Edge Function entry point.
 *
 * NOTE: the Edge runtime is required, not Node serverless. The Node runtime
 * would need `bodyParser: false` on the webhook route to preserve the raw body;
 * Edge hands us the untouched Request, so the Stripe signature always matches.
 */
export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  return handleRequest(request, process.env as Record<string, string | undefined>);
}
