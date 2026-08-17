/**
 * Rating route tests.
 *
 * The rating endpoint is the one public write in the API. It must accept a
 * genuine rating from anyone, refuse every malformed or abusive shape, and
 * never let one IP flood the table.
 */
let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`); }
};

const ENV = {
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'head.payload.secret',
  SUPABASE_ANON_KEY: 'head.payload.anon',
  STRIPE_SECRET_KEY: 'sk_test_' + 'x'.repeat(24),
  STRIPE_WEBHOOK_SECRET: 'whsec_' + 'a'.repeat(32),
  APP_URL: 'https://novelka.example',
  STRIPE_PRICE_BASIC: 'price_b',
  STRIPE_PRICE_PRO: 'price_p',
  STRIPE_PRICE_ENTERPRISE: 'price_e',
};

const { handleRating, __setRatingHooks } = await import('../dist-test/rating.mjs');

function makeDb() {
  const inserts = [];
  let failNext = false;
  return {
    inserts,
    failNext() { failNext = true; },
    from() {
      return {
        insert(row) {
          if (failNext) return { error: { message: 'db down' } };
          inserts.push(row);
          return { error: null };
        },
      };
    },
  };
}

let db;
__setRatingHooks({ makeSupabase: () => db });

const post = (body, ip = '1.2.3.4') =>
  handleRating(typeof body === 'string' ? body : JSON.stringify(body), { clientIp: ip }, ENV);

console.log('\n=== a genuine rating is accepted ===');
{
  db = makeDb();
  const r = await post({ stars: 5 }, '10.0.0.1');
  check('returns 200', r.status === 200);
  check('says ok', JSON.parse(r.body).ok === true);
  check('inserts exactly one row', db.inserts.length === 1);
  check('with the right stars', db.inserts[0].stars === 5);
  check('comment/email default to null', db.inserts[0].comment === null && db.inserts[0].email === null);

  db = makeDb();
  const rich = await post({ stars: 4, comment: 'Love it', email: 'fan@example.com' }, '10.0.0.1');
  check('a full rating is accepted', rich.status === 200);
  check('comment is stored', db.inserts[0].comment === 'Love it');
  check('email is stored', db.inserts[0].email === 'fan@example.com');

  db = makeDb();
  const edge = await post({ stars: 1 }, '10.0.0.1');
  check('1 star is accepted', edge.status === 200);
  db = makeDb();
  const edge5 = await post({ stars: 5 }, '10.0.0.1');
  check('5 stars is accepted', edge5.status === 200);
}

console.log('\n=== malformed ratings are refused ===');
{
  db = makeDb();
  const bad = [
    ['no body', ''],
    ['not JSON', 'hello'],
    ['stars missing', {}],
    ['stars as string', { stars: '5' }],
    ['stars 0', { stars: 0 }],
    ['stars 6', { stars: 6 }],
    ['stars fractional', { stars: 3.5 }],
    ['stars negative', { stars: -2 }],
  ];
  for (let i = 0; i < bad.length; i++) {
    // A fresh IP per request: the rate limiter allows only 5/hour per IP, and
    // this section is about shape validation, not throttling.
    const [label, body] = bad[i];
    const r = await post(body, `10.0.0.${100 + i}`);
    check(`${label} is a 400`, r.status === 400, String(r.status));
  }
  check('nothing was inserted', db.inserts.length === 0);

  const longComment = 'x'.repeat(1001);
  const r = await post({ stars: 3, comment: longComment }, '10.0.0.150');
  check('a 1001-char comment is refused', r.status === 400);

  const r2 = await post({ stars: 3, email: 'not-an-email' }, '10.0.0.151');
  check('a bad email is refused', r2.status === 400);

  const r3 = await post({ stars: 3, email: 'a'.repeat(300) + '@x.com' }, '10.0.0.152');
  check('an over-long email is refused', r3.status === 400);
}

console.log('\n=== rate limiting ===');
{
  db = makeDb();
  const results = [];
  for (let i = 0; i < 7; i++) {
    results.push((await post({ stars: 5 }, '9.9.9.9')).status);
  }
  check('the first five pass', results.slice(0, 5).every((s) => s === 200));
  check('the sixth is throttled', results[5] === 429);
  check('the seventh is throttled too', results[6] === 429);
  check('only five rows were written', db.inserts.length === 5, String(db.inserts.length));
  // a different IP is not throttled by the first one
  const other = await post({ stars: 5 }, '8.8.8.8');
  check('a different IP is unaffected', other.status === 200);
}

console.log('\n=== server errors fail cleanly ===');
{
  db = makeDb();
  db.failNext();
  const r = await post({ stars: 5 }, '10.0.0.3');
  check('a failed insert is a clean 500', r.status === 500);
  check('with no stack trace', !r.body.includes('at '));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
