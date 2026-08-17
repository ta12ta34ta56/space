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

const rail = pg.locator('.rail-btn', { hasText: 'Mazes' });
ok(await rail.count() > 0, 'Mazes appears in the tool rail');
await rail.first().click();
await pg.waitForTimeout(700);
ok(await pg.locator('.panel-head', { hasText: 'Maze maker' }).count() > 0, 'maze panel opens');

const shapes = await pg.locator('.panel .opt-grid .opt').count();
ok(shapes >= 4, 'four shapes offered', `${shapes}`);
const tpls = await pg.locator('.tpl-pick').count();
ok(tpls >= 3, 'page designs listed', `${tpls}`);

// Small run so the test is quick.
await pg.locator('.panel input[type=number]').first().fill('4');
await pg.waitForTimeout(200);
await pg.locator('.panel button', { hasText: /^Create 4 mazes$/ }).click();
for (let i = 0; i < 40; i++) {
  if (await pg.evaluate(() => window.__store?.getState().pages.length ?? 0) > 1) break;
  await pg.waitForTimeout(500);
}
const total = await pg.evaluate(() => window.__store.getState().pages.length);
// 1 blank + 4 puzzle pages + 1 answers page
ok(total === 6, 'four maze pages plus an answer key', `${total} pages`);
ok(errs.length === 0, 'no errors during generation', errs.slice(0, 2).join(';'));

const info = await pg.evaluate(async () => {
  const st = window.__store.getState();
  const metas = st.pages.map((p) => {
    const d = p.data ?? {};
    const k = Object.keys(d).find((x) => x.includes('maze-page'));
    return k ? d[k] : null;
  }).filter(Boolean);
  await st.gotoPage(st.pages[1].id);
  await new Promise((r) => setTimeout(r, 2000));
  const objs = window.__eng.canvas.getObjects();
  const roles = {};
  for (const o of objs) if (o.mzRole) roles[o.mzRole] = (roles[o.mzRole] ?? 0) + 1;
  return {
    metas, kinds: metas.map((m) => m.kind),
    objectCount: objs.length,
    tagged: objs.filter((o) => o.mzPuzzle).length,
    roles,
  };
});
console.log('   kinds:', JSON.stringify(info.kinds));
console.log('   roles:', JSON.stringify(info.roles));

ok(info.metas.length === 5, 'every generated page carries maze metadata', `${info.metas.length}`);
ok(info.kinds.filter((k) => k === 'puzzle').length === 4, 'four puzzle pages');
ok(info.kinds.filter((k) => k === 'solution').length === 1, 'one answers page');
ok(info.metas.every((m) => m.seeds.length > 0), 'seeds stored for rebuilding');
ok(info.objectCount > 40, 'the page has real content', `${info.objectCount} objects`);
ok((info.roles['mz-wall'] ?? 0) > 30, 'walls were drawn', `${info.roles['mz-wall'] ?? 0}`);
ok((info.roles['mz-start'] ?? 0) === 1 && (info.roles['mz-end'] ?? 0) === 1,
  'start and end markers drawn');
ok(!info.roles['mz-solution'], 'the puzzle page does NOT leak the solution');

// The critical one: tags must survive serialisation.
const saved = await pg.evaluate(() => {
  const st = window.__store.getState();
  st.syncActivePage();
  const page = st.pages.find((p) => p.id === st.activePageId);
  const objs = page.data.objects ?? [];
  return {
    total: objs.length,
    withRole: objs.filter((o) => o.mzRole).length,
    withPuzzle: objs.filter((o) => o.mzPuzzle).length,
  };
});
console.log('   saved:', JSON.stringify(saved));
ok(saved.withRole === saved.total && saved.total > 0,
  'mzRole survives serialisation (BOTH allow-lists correct)',
  `${saved.withRole}/${saved.total}`);
ok(saved.withPuzzle === saved.total, 'mzPuzzle survives too',
  `${saved.withPuzzle}/${saved.total}`);

// The answer key page must show solutions.
const answer = await pg.evaluate(async () => {
  const st = window.__store.getState();
  await st.gotoPage(st.pages[st.pages.length - 1].id);
  await new Promise((r) => setTimeout(r, 1800));
  const objs = window.__eng.canvas.getObjects();
  return { solutions: objs.filter((o) => o.mzRole === 'mz-solution').length };
});
ok(answer.solutions === 4, 'the answer key draws all four solutions', `${answer.solutions}`);

// Live adjust.
await pg.evaluate(async () => {
  const st = window.__store.getState();
  await st.gotoPage(st.pages[1].id);
  await new Promise((r) => setTimeout(r, 1500));
});
const slider = pg.locator('.live-adjust input[type=range]').first();
ok(await slider.count() > 0, 'live adjust appears on a maze page');
if (await slider.count()) {
  const before = await pg.evaluate(() => window.__eng.canvas.getObjects().length);
  const max = Number(await slider.getAttribute('max'));
  await slider.fill(String(Math.round(max * 0.6)));
  await pg.waitForTimeout(1200);
  const after = await pg.evaluate(() => window.__eng.canvas.getObjects().length);
  ok(after > 20, 'resizing rebuilds the maze', `${before} -> ${after}`);
  ok(errs.length === 0, 'no errors while resizing', errs.slice(0, 2).join(';'));
}

await pg.screenshot({ path: '/tmp/t/maze-page.png' });
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURES'}`);
await b.close();
process.exit(fails ? 1 : 0);
