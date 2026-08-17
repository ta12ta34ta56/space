import { handleRequest } from '../src/handler';

/**
 * Cloudflare Workers entry point.
 *
 * Cloudflare's free tier permits commercial use (Vercel's Hobby tier does not),
 * which is why this is the primary target.
 *
 * `env` is the bindings object — there is no `process.env` on Workers.
 */
export default {
  async fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> {
    return handleRequest(request, env);
  },
};
