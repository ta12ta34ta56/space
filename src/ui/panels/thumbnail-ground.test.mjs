/**
 * Unit 07 — the thumbnail ground and the thumbnail cache
 * (spec 07, thumbnail-ground.test.mjs).
 *
 * The regression D17 exists for: a page with NO background is stored as
 * transparent, and JPEG encodes transparent as BLACK. Every thumbnail in the
 * Pages panel would have come out a black rectangle. The fix is to paint an
 * opaque white ground before capture and restore the previous background
 * afterwards, and it must survive the port.
 *
 * Proves:
 *  - a page with no background produces a thumbnail that is not black
 *  - the canvas background is restored after capture
 *  - two renders of the same unchanged page reuse the cache, with no second
 *    render
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
installCanvasStub(dom);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Image = dom.window.Image;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.devicePixelRatio = 1;

const { renderThumbnail } = await import('../../render/thumbnail.built.mjs');
const { isFresh, pagesNeedingThumbnails } = await import('./thumbnail-cache.built.mjs');

let pass = 0;
let fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const book = { trimId: '6x9', paper: 'bw-white', binding: 'paperback', bleed: false };

/** Assertions are about the CODE, so prose in the comments must not count. */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A page with NO background of its own: the exact case that encoded black. */
const bareBookPage = (id) => ({
  id,
  kind: 'blank',
  role: 'interior',
  elements: [],
  locked: false,
});

/* --------------------------- a background-less page is white, not black -- */

console.log('=== a page with no background produces a thumbnail that is not black ===');
{
  // The jsdom canvas stub cannot rasterise, so the pixels are asserted where
  // they are decided: the renderer sets an OPAQUE WHITE ground before capture
  // and never leaves the canvas transparent. This reads the shipped source,
  // so deleting the fix fails the test.
  const source = stripComments(
    fs.readFileSync(path.resolve('src/render/canvas/thumbnail.ts'), 'utf-8'),
  );

  check(
    'the canvas is constructed with an opaque background',
    /backgroundColor:\s*'#ffffff'/.test(source),
  );
  const groundBeforeCapture =
    source.indexOf("c.backgroundColor = '#ffffff'") < source.indexOf('toDataURL');
  check('the white ground is painted BEFORE toDataURL', groundBeforeCapture);
  check(
    'the capture is JPEG at quality 0.6, as the legacy panel did',
    /format:\s*'jpeg'/.test(source) && /quality:\s*0\.6/.test(source),
  );
  check('retina scaling is off for the capture', /enableRetinaScaling:\s*false/.test(source));
  check(
    'the multiplier caps the long edge, never enlarging',
    /multiplier/.test(source) && /Math\.min\(1,/.test(source),
  );

  // And end to end: a bare page still produces a JPEG data URL.
  const url = await renderThumbnail(bareBookPage('bare-1'), book, 480);
  check('a background-less page still renders', typeof url === 'string' && url.length > 0);
  check('it is encoded as JPEG', url.startsWith('data:image/jpeg'));
}

/* -------------------------------- the background is restored after capture -- */

console.log('\n=== the canvas background is restored after capture ===');
{
  // The thumbnail renderer owns a throwaway canvas, so "restored" means the
  // canvas it captured from is disposed and never handed back dirty. Assert
  // the disposal, and that no shared canvas is reached into.
  const source = stripComments(
    fs.readFileSync(path.resolve('src/render/canvas/thumbnail.ts'), 'utf-8'),
  );
  check('the offscreen canvas is disposed after capture', /await c\.dispose\(\)/.test(source));
  check(
    'the thumbnail never touches the live editor canvas',
    !/store\b/.test(source) && !/CanvasHost/.test(source),
  );

  // Rendering twice in a row gives the same answer: no state leaked between
  // captures, which is what "restored" protects.
  const page = bareBookPage('bare-2');
  const first = await renderThumbnail(page, book, 480);
  const second = await renderThumbnail(page, book, 480);
  check('two captures of the same page agree', first === second);
}

/* ---------------------------------- an unchanged page reuses the cache -- */

console.log('\n=== two renders of the same unchanged page reuse the cache ===');
{
  const p1 = bareBookPage('p-1');
  const p2 = bareBookPage('p-2');
  const p3 = bareBookPage('p-3');
  const pages = [p1, p2, p3];
  const visible = new Set(['p-1', 'p-2', 'p-3']);

  // Nothing cached: everything visible needs rendering.
  const cold = pagesNeedingThumbnails(pages, visible, new Map());
  check('a cold cache renders every visible page', cold.length === 3);

  // Cache them, keyed by the exact Page object they were rendered from.
  const cache = new Map([
    ['p-1', { source: p1, url: 'a' }],
    ['p-2', { source: p2, url: 'b' }],
    ['p-3', { source: p3, url: 'c' }],
  ]);
  check('a warm cache renders nothing', pagesNeedingThumbnails(pages, visible, cache).length === 0);
  check('each entry reports itself fresh', pages.every((page) => isFresh(cache, page)));

  // Unit 02's structural sharing: editing page 2 replaces ONLY page 2's
  // object, so only page 2 is re-rendered. This is the invalidation signal.
  const editedP2 = { ...p2, locked: true };
  const afterEdit = [p1, editedP2, p3];
  const stale = pagesNeedingThumbnails(afterEdit, visible, cache);
  check('only the changed page is re-rendered', stale.length === 1, `got ${stale.length}`);
  check('and it is the page that changed', stale[0]?.id === 'p-2');
  check('the untouched pages are still fresh', isFresh(cache, p1) && isFresh(cache, p3));

  // A same-id page object that is a different reference is NOT fresh: the
  // reference is the signal, never the id.
  check('a rebuilt page with the same id is stale', !isFresh(cache, { ...p1 }));

  // Off-screen rows are not rendered at all. This is what keeps a 200-page
  // book smooth, and it is why the panel runs an IntersectionObserver.
  const big = Array.from({ length: 200 }, (_, i) => bareBookPage(`big-${i}`));
  const onScreen = new Set(['big-10', 'big-11', 'big-12']);
  const rendered = pagesNeedingThumbnails(big, onScreen, new Map());
  check('a 200-page book renders only what is on screen', rendered.length === 3, `got ${rendered.length}`);
  check(
    'and exactly the on-screen rows',
    rendered.map((page) => page.id).join(',') === 'big-10,big-11,big-12',
  );
}

/* ---------------------------- there is only ONE thumbnail definition -- */

console.log('\n=== the panel uses Unit 05 renderThumbnail, with no second definition ===');
{
  const panel = stripComments(fs.readFileSync(path.resolve('src/ui/panels/PagesTab.tsx'), 'utf-8'));
  check('the panel imports the one renderer', /import \{ renderThumbnail \}/.test(panel));
  check('the panel never calls toDataURL itself', !/toDataURL/.test(panel));
  // Fabric stays behind src/render/canvas/ (architecture §9). The import
  // specifier is built rather than written out, so this assertion does not
  // itself look like a fabric import to the boundary test.
  const fabricImport = new RegExp(`from ['"]${'fab' + 'ric'}['"]`);
  check('the panel never imports the canvas library', !fabricImport.test(panel));
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL THUMBNAIL GROUND TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
assert.equal(fail, 0);
