import http from 'node:http';
import { handleRequest } from '../src/handler';

const port = Number(process.env.PORT) || 8787;
const host = '0.0.0.0';

const env: Record<string, string | undefined> = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'head.payload.secret-key-12345',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'head.payload.anon-key-67890',
  GRANT_SIGNING_SECRET: process.env.GRANT_SIGNING_SECRET || 'dev-grant-signing-secret-novelka-test-only-32bytes-min',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key_for_preview_testing_only',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock_key_for_preview_testing_only',
  APP_URL: process.env.APP_URL || 'http://localhost:5173',
  APP_URL_ALT: process.env.APP_URL_ALT || 'http://localhost:5173',
  STRIPE_PRICE_BASIC: 'price_basic',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
  NODE_ENV: 'development',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host || '127.0.0.1'}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    const request = new Request(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
    });

    const response = await handleRequest(request, env);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const resBody = await response.arrayBuffer();
    res.end(Buffer.from(resBody));
  } catch (err) {
    console.error('[node-adapter] error', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(port, host, () => {
  console.log(`[novelka-api] API Server listening on http://${host}:${port}`);
});
