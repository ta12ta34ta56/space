/**
 * Feature-flag / entitlement tests.
 *   npm run test:flags
 *
 * These matter more than most: this is the code that decides whether a paying
 * customer gets what they paid for, and whether a free user can be blocked out
 * of work they have already done.
 */
import {
  ANON,
  DEFAULT_FLAGS,
  FEATURES,
  TIERS,
  evaluate,
  evaluateContent,
  localFeatureIdToServer,
  serverFeatureIdToLocal,
  serverFlagRowToLocal,
} from './feature-flags.built.mjs';

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const ent = (over = {}) => ({ ...ANON, ...over });
/** unlocked-by-ad helper: the store keeps timestamps, not a list */
const unlocked = (...keys) => Object.fromEntries(keys.map((k) => [k, Date.now()]));
const R = (free, ad, paid) => ({ free, ad, paid });
const flags = (over = {}) => ({ ...DEFAULT_FLAGS, ...over });

console.log('\n=== table integrity ===');
{
  const ids = Object.keys(FEATURES);
  check('every feature has a default flag', ids.every((id) => DEFAULT_FLAGS[id]),
    ids.filter((id) => !DEFAULT_FLAGS[id]).join(','));
  check('no stray defaults without a label',
    Object.keys(DEFAULT_FLAGS).every((id) => FEATURES[id]),
    Object.keys(DEFAULT_FLAGS).filter((id) => !FEATURES[id]).join(','));
  check('four tiers defined', TIERS.length === 4);
  check('tiers ordered cheapest first',
    TIERS.map((t) => t.id).join(',') === 'free,basic,pro,enterprise');
}

console.log('\n=== the owner can kill anything ===');
{
  const f = flags({ 'module.sudoku': { enabled: false, routes: R(true, false, false), minTier: 'free' } });
  for (const tier of ['free', 'basic', 'pro', 'enterprise']) {
    const r = evaluate('module.sudoku', f, ent({ tier }));
    check(`disabled feature is hidden from ${tier}`, r.status === 'hidden' && !r.allowed);
  }
}
{
  // access:'disabled' must be as absolute as enabled:false
  const f = flags({ 'export.pdf': { enabled: true, routes: R(false, false, false), minTier: 'free' } });
  const r = evaluate('export.pdf', f, ent({ tier: 'enterprise' }));
  check('all routes off blocks even enterprise', r.status === 'hidden' && !r.allowed);
}

console.log('\n=== premium gating ===');
{
  const f = flags({ 'assets.premium': { enabled: true, routes: R(false, false, true), minTier: 'basic' } });
  check('free blocked', evaluate('assets.premium', f, ent()).status === 'needs_upgrade');
  check('basic allowed', evaluate('assets.premium', f, ent({ tier: 'basic' })).allowed);
  check('pro allowed', evaluate('assets.premium', f, ent({ tier: 'pro' })).allowed);
  check('enterprise allowed', evaluate('assets.premium', f, ent({ tier: 'enterprise' })).allowed);
  const r = evaluate('assets.premium', f, ent());
  check('blocked result names the tier that unlocks it', r.upgradeTo === 'basic', r.upgradeTo);
  check('blocked result carries a reason', !!r.reason && r.reason.length > 5);
}
{
  // a pro-only feature must not open at basic
  const f = flags({ 'export.300dpi': { enabled: true, routes: R(false, false, true), minTier: 'pro' } });
  check('basic blocked from a pro feature',
    evaluate('export.300dpi', f, ent({ tier: 'basic' })).status === 'needs_upgrade');
  check('pro allowed', evaluate('export.300dpi', f, ent({ tier: 'pro' })).allowed);
}

console.log('\n=== ad unlock ===');
{
  const f = flags({ 'pages.bulk': { enabled: true, routes: R(false, true, false), minTier: 'free' } });
  check('free must watch an ad', evaluate('pages.bulk', f, ent()).status === 'needs_ad');
  check('after watching, allowed',
    evaluate('pages.bulk', f, ent({ adUnlocked: unlocked('pages.bulk') })).allowed);
  check('an unrelated unlock does not help',
    evaluate('pages.bulk', f, ent({ adUnlocked: unlocked('export.pdf') })).status === 'needs_ad');
  check('ad-only never dangles an upgrade that does not apply',
    evaluate('pages.bulk', f, ent()).canUpgrade !== true);
}
{
  // paying users should never see an ad
  const f = flags({ 'pages.bulk': { enabled: true, routes: R(false, true, true), minTier: 'basic' } });
  for (const tier of ['basic', 'pro', 'enterprise']) {
    check(`${tier} skips the ad`, evaluate('pages.bulk', f, ent({ tier })).allowed);
  }
}

console.log('\n=== ad OR paid (the combined route) ===');
{
  const f = flags({ 'export.300dpi': { enabled: true, routes: R(false, true, true), minTier: 'basic' } });
  const r = evaluate('export.300dpi', f, ent());
  check('free is offered BOTH routes', r.status === 'needs_ad_or_upgrade', r.status);
  check('gate says an ad would work', r.canWatchAd === true);
  check('gate says upgrading would work', r.canUpgrade === true);
  check('gate names the tier', r.upgradeTo === 'basic');
  check('watching the ad gets you in',
    evaluate('export.300dpi', f, ent({ adUnlocked: unlocked('export.300dpi') })).allowed);
  check('subscribing also gets you in',
    evaluate('export.300dpi', f, ent({ tier: 'basic' })).allowed);
  check('a higher tier gets you in',
    evaluate('export.300dpi', f, ent({ tier: 'pro' })).allowed);
}
{
  // free + ad + paid all on: free wins, nobody is ever prompted
  const f = flags({ 'export.png': { enabled: true, routes: R(true, true, true), minTier: 'basic' } });
  check('free route short-circuits the rest', evaluate('export.png', f, ent()).allowed);
}
{
  // owner turning every route off is the same as disabling
  const f = flags({ 'module.crossword': { enabled: true, routes: R(false, false, false), minTier: 'free' } });
  check('no routes open = hidden', evaluate('module.crossword', f, ent({ tier: 'pro' })).status === 'hidden');
}

console.log('\n=== timed ad unlocks ===');
{
  const f = flags({ 'export.300dpi': { enabled: true, routes: R(false, true, false), minTier: 'free', adUnlockMinutes: 60 } });
  const fresh = { 'export.300dpi': Date.now() };
  const stale = { 'export.300dpi': Date.now() - 61 * 60000 };
  check('a fresh unlock works', evaluate('export.300dpi', f, ent({ adUnlocked: fresh })).allowed);
  check('an expired unlock does not',
    evaluate('export.300dpi', f, ent({ adUnlocked: stale })).status === 'needs_ad');
  const perm = flags({ 'export.300dpi': { enabled: true, routes: R(false, true, false), minTier: 'free' } });
  check('with no expiry set, the unlock lasts',
    evaluate('export.300dpi', perm, ent({ adUnlocked: stale })).allowed);
}

console.log('\n=== daily limits ===');
{
  const f = flags({ 'export.pdf': { enabled: true, routes: R(true, false, false), minTier: 'free', dailyLimit: 3 } });
  check('fresh free user allowed', evaluate('export.pdf', f, ent()).allowed);
  check('reports remaining', evaluate('export.pdf', f, ent()).remaining === 3);
  check('after 1 use, 2 left',
    evaluate('export.pdf', f, ent({ usedToday: { 'export.pdf': 1 } })).remaining === 2);
  const spent = evaluate('export.pdf', f, ent({ usedToday: { 'export.pdf': 3 } }));
  check('at the cap, blocked', spent.status === 'limit_reached' && !spent.allowed);
  check('cap suggests upgrading', spent.upgradeTo === 'basic');
  check('over the cap stays blocked',
    evaluate('export.pdf', f, ent({ usedToday: { 'export.pdf': 99 } })).status === 'limit_reached');

  // this is the one that would cost real money if wrong
  for (const tier of ['basic', 'pro', 'enterprise']) {
    const r = evaluate('export.pdf', f, ent({ tier, usedToday: { 'export.pdf': 500 } }));
    check(`${tier} is never capped`, r.allowed, `got ${r.status}`);
  }
}

console.log('\n=== content items (templates, assets) ===');
{
  check('free content always allowed', evaluateContent('free', ent(), 'x').allowed);
  check('disabled content hidden from enterprise',
    evaluateContent('disabled', ent({ tier: 'enterprise' }), 'x').status === 'hidden');
  check('premium content blocked for free',
    evaluateContent('premium_only', ent(), 'x').status === 'needs_upgrade');
  check('premium content allowed for basic',
    evaluateContent('premium_only', ent({ tier: 'basic' }), 'x').allowed);
  check('ad content offers both routes on free',
    evaluateContent('ad_unlock', ent(), 'tpl-1').status === 'needs_ad_or_upgrade');
  check('ad content allowed once unlocked',
    evaluateContent('ad_unlock', ent({ adUnlocked: unlocked('tpl-1') }), 'tpl-1').allowed);
  check('ad content free for payers',
    evaluateContent('ad_unlock', ent({ tier: 'basic' }), 'tpl-1').allowed);
}

console.log('\n=== defaults are sane for launch ===');
{
  const f = DEFAULT_FLAGS;
  const anon = ent();
  // a free user must be able to actually finish and export a book
  check('free can use every generator',
    ['module.sudoku', 'module.wordsearch', 'module.crossword']
      .every((id) => evaluate(id, f, anon).allowed));
  check('free can export a PDF', evaluate('export.pdf', f, anon).allowed);
  check('free can import a PDF', evaluate('doc.import', f, anon).allowed);
  check('free can use templates', evaluate('doc.templates', f, anon).allowed);
  check('free can make a cover', evaluate('kdp.cover', f, anon).allowed);
  // but the watermark is the thing they pay to remove
  check('free CANNOT remove the watermark',
    evaluate('export.nowatermark', f, anon).status === 'needs_upgrade');
  check('300 DPI offers ad or upgrade by default',
    evaluate('export.300dpi', f, anon).status === 'needs_ad_or_upgrade');
  check('basic CAN remove the watermark',
    evaluate('export.nowatermark', f, ent({ tier: 'basic' })).allowed);
}

console.log('\n=== unknown / malformed input must not crash ===');
{
  check('unknown feature id falls back rather than throwing', (() => {
    try { evaluate('nope.missing', DEFAULT_FLAGS, ent()); return true; }
    catch { return false; }
  })());
  check('missing flag row falls back to defaults',
    evaluate('export.pdf', {}, ent()).allowed);
  check('unknown tier is treated as free', (() => {
    const f = flags({ 'assets.premium': { enabled: true, routes: R(false, false, true), minTier: 'basic' } });
    return evaluate('assets.premium', f, ent({ tier: 'wizard' })).status === 'needs_upgrade';
  })());
}

console.log('\n=== migration from the pre-routes format ===');
{
  // This is the exact shape that crashed a real browser: a row saved by the
  // first release, with `access` and no `routes`.
  const legacyRow = { enabled: true, access: 'premium_only', minTier: 'basic' };
  const f = { ...DEFAULT_FLAGS, 'export.nowatermark': legacyRow };

  check('a routes-less row does not throw', (() => {
    try { evaluate('export.nowatermark', f, ent()); return true; }
    catch { return false; }
  })());
  check('legacy premium_only still blocks free',
    evaluate('export.nowatermark', f, ent()).status === 'needs_upgrade');
  check('legacy premium_only still allows basic',
    evaluate('export.nowatermark', f, ent({ tier: 'basic' })).allowed);

  const legacyAd = { enabled: true, access: 'ad_unlock', minTier: 'free' };
  const f2 = { ...DEFAULT_FLAGS, 'pages.bulk': legacyAd };
  check('legacy ad_unlock does not throw', (() => {
    try { evaluate('pages.bulk', f2, ent()); return true; } catch { return false; }
  })());
  const r = evaluate('pages.bulk', f2, ent());
  check('legacy ad_unlock still gates', !r.allowed, r.status);

  // the browser caught this one: routes migrated, but minTier stayed 'free'
  const migratedAd = { enabled: true, routes: { free: false, ad: true, paid: true }, minTier: 'free' };
  const f2b = { ...DEFAULT_FLAGS, 'pages.bulk': migratedAd };
  check('a gated row with minTier free must not leak',
    !evaluate('pages.bulk', f2b, ent()).allowed,
    evaluate('pages.bulk', f2b, ent()).status);

  const legacyOff = { enabled: false, access: 'free', minTier: 'free' };
  const f3 = { ...DEFAULT_FLAGS, 'module.sudoku': legacyOff };
  check('legacy disabled stays disabled',
    evaluate('module.sudoku', f3, ent({ tier: 'enterprise' })).status === 'hidden');

  // completely malformed rows must also survive
  const junk = { ...DEFAULT_FLAGS, 'export.pdf': { enabled: true } };
  check('a row with no access AND no routes does not throw', (() => {
    try { evaluate('export.pdf', junk, ent()); return true; } catch { return false; }
  })());
}

console.log('\n=== server flag mirror ===');
{
  check('server export_pdf -> client export.pdf',
    serverFeatureIdToLocal('export_pdf') === 'export.pdf');
  check('server module_sudoku -> client module.sudoku',
    serverFeatureIdToLocal('module_sudoku') === 'module.sudoku');
  check('an unknown server flag maps to null', serverFeatureIdToLocal('future_feature') === null);

  check('client export.pdf -> server export_pdf',
    localFeatureIdToServer('export.pdf') === 'export_pdf');
  check('every local feature has a server spelling',
    Object.keys(FEATURES).every((id) => localFeatureIdToServer(id).length > 0));

  const row = serverFlagRowToLocal({
    feature_id: 'export_pdf',
    enabled: true,
    route_free: true,
    route_paid: true,
    min_tier: 'basic',
    daily_limit: 5,
  });
  check('a server row maps to the right local id', row?.id === 'export.pdf');
  check('routes are carried across', row?.flag.routes?.free === true && row?.flag.routes?.paid === true);
  check('daily limit is carried across', row?.flag.dailyLimit === 5);
  check('min tier is carried across', row?.flag.minTier === 'basic');

  const noLimit = serverFlagRowToLocal({
    feature_id: 'export_pdf',
    enabled: true,
    route_free: true,
    route_paid: true,
    min_tier: 'basic',
    daily_limit: null,
  });
  check('a null daily limit maps to unlimited', noLimit?.flag.dailyLimit === undefined);

  check('unknown server rows are ignored, not crashed',
    serverFlagRowToLocal({ feature_id: 'nope_thing', enabled: true, route_free: true, route_paid: false, min_tier: 'free', daily_limit: null }) === null);

  // A server row merged over the shipped default keeps the features the
  // server does not know about.
  const merged = { ...DEFAULT_FLAGS };
  const m = serverFlagRowToLocal({
    feature_id: 'export_pdf', enabled: true, route_free: true,
    route_paid: true, min_tier: 'basic', daily_limit: 3,
  });
  if (m) merged[m.id] = { ...merged[m.id], ...m.flag };
  check('merging preserves other flags', merged['module.sudoku'].enabled === true);
  check('merging applies the server cap', merged['export.pdf'].dailyLimit === 3);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
