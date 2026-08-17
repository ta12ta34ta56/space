import { chromium } from 'playwright';
let fails = 0;
const ok = (c, m, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}${x ? '  ' + x : ''}`); if (!c) fails++; };

const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(e.message));

await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await pg.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('novelka'); indexedDB.deleteDatabase('minipdf'); });
await pg.reload({ waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(1800);

const open = pg.locator('button', { hasText: /^Open editor$/ }).first();
if (await open.count()) await open.click();
for (let i = 0; i < 40; i++) {
  if (await pg.evaluate(() => !!(window.__eng && window.__eng.canvas))) break;
  await pg.waitForTimeout(500);
}
ok(errs.length === 0, 'editor boots clean', errs.join(';'));

// open the Tracing panel
const rail = pg.locator('.rail-btn', { hasText: 'Tracing' });
ok(await rail.count() > 0, 'Tracing appears in the tool rail');
await rail.first().click();
await pg.waitForTimeout(700);
ok(await pg.locator('.panel-head', { hasText: 'Handwriting' }).count() > 0,
  'handwriting panel opens');

const tplCount = await pg.locator('.tpl-pick').count();
ok(tplCount >= 10, 'page designs are listed', `${tplCount}`);

// Restrict to a short custom set so the test is fast, then generate.
await pg.locator('.panel input[placeholder="e.g. Sara"]').fill('ABX');
await pg.waitForTimeout(300);
const hint = await pg.locator('.panel .hint').first().innerText();
ok(/3 pages/.test(hint), 'page count updates from the custom list', hint);

await pg.locator('.panel button', { hasText: /^Create 3 worksheets$/ }).click();
for (let i = 0; i < 40; i++) {
  const n = await pg.evaluate(() => window.__store?.getState().pages.length ?? 0);
  if (n > 1) break;
  await pg.waitForTimeout(500);
}
const total = await pg.evaluate(() => window.__store.getState().pages.length);
ok(total === 4, 'three worksheets added to the one blank page', `${total}`);
ok(errs.length === 0, 'no errors during generation', errs.slice(0, 2).join(';'));

// inspect the generated pages
const info = await pg.evaluate(async () => {
  const st = window.__store.getState();
  const metas = st.pages.map((p) => {
    const d = p.data ?? {};
    const k = Object.keys(d).find((x) => x.includes('handwriting-page'));
    return k ? d[k] : null;
  });
  await st.gotoPage(st.pages[1].id);
  await new Promise((r) => setTimeout(r, 2000));
  const objs = window.__eng.canvas.getObjects();
  const roles = {};
  for (const o of objs) {
    const r = o.hwRole;
    if (r) roles[r.replace(/-\d+$/, '')] = (roles[r.replace(/-\d+$/, '')] ?? 0) + 1;
  }
  return {
    metas: metas.filter(Boolean),
    objectCount: objs.length,
    taggedCount: objs.filter((o) => o.hwPuzzle).length,
    roles,
  };
});

console.log('   meta:', JSON.stringify(info.metas.map((m) => m.char)));
console.log('   roles:', JSON.stringify(info.roles));
ok(info.metas.length === 3, 'every page carries handwriting metadata', `${info.metas.length}`);
ok(info.metas.map((m) => m.char).join('') === 'ABX', 'the requested characters were used',
  info.metas.map((m) => m.char).join(''));
ok(info.objectCount > 30, 'the page has real content', `${info.objectCount} objects`);
ok(info.taggedCount === info.objectCount, 'every object is tagged for re-layout',
  `${info.taggedCount}/${info.objectCount}`);
ok((info.roles['hw-trace-dash'] ?? 0) > 20, 'dotted letters were drawn',
  `${info.roles['hw-trace-dash'] ?? 0} dashes`);
ok((info.roles['hw-guide-baseline'] ?? 0) >= 3, 'guide lines were drawn',
  `${info.roles['hw-guide-baseline'] ?? 0}`);

// the critical save test: tags must survive a round-trip
const survives = await pg.evaluate(async () => {
  const st = window.__store.getState();
  st.syncActivePage();
  const page = st.pages.find((p) => p.id === st.activePageId);
  const objs = page.data.objects ?? [];
  return {
    total: objs.length,
    withRole: objs.filter((o) => o.hwRole).length,
    withPuzzle: objs.filter((o) => o.hwPuzzle).length,
  };
});
console.log('   saved:', JSON.stringify(survives));
ok(survives.withRole === survives.total && survives.total > 0,
  'hwRole survives serialisation (EXTRA_PROPS is correct)',
  `${survives.withRole}/${survives.total}`);
ok(survives.withPuzzle === survives.total, 'hwPuzzle survives too',
  `${survives.withPuzzle}/${survives.total}`);

// live adjust
const slider = pg.locator('.live-adjust input[type=range]').first();
ok(await slider.count() > 0, 'live adjust appears on a worksheet page');
if (await slider.count()) {
  const before = await pg.evaluate(() => window.__eng.canvas.getObjects().length);
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round(max * 0.6)));
  await pg.waitForTimeout(900);
  const after = await pg.evaluate(() => window.__eng.canvas.getObjects().length);
  ok(after > 10, 'resizing rebuilds the rows', `${before} -> ${after}`);
  ok(errs.length === 0, 'no errors while resizing', errs.slice(0, 2).join(';'));
}

await pg.screenshot({ path: '/tmp/t/hw-page.png' });
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
await b.close();
process.exit(fails ? 1 : 0);
