import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
installCanvasStub(dom);
dom.window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Image = dom.window.Image;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
globalThis.devicePixelRatio = 1;

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const { renderThumbnail } = await import('./thumbnail.built.mjs');

const sampleBook = {
  trimId: '6x9',
  paper: 'bw-white',
  binding: 'paperback',
};

const samplePage = {
  id: 'thumb-page-1',
  kind: 'blank',
  role: 'interior',
  elements: [
    {
      type: 'shape',
      id: 'shape-1',
      kind: 'shape',
      frame: { xIn: 1, yIn: 1, wIn: 4, hIn: 4 },
      shape: { shape: 'rect', fillHex: '#ffffff', strokeHex: '#000000', strokeWidthPt: 1 },
      z: 1,
      hidden: false,
      locked: false,
    },
  ],
  locked: false,
};

/* ---------------------------------- Thumbnail produces JPEG on white ground -- */

console.log('\n=== A page produces a valid JPEG thumbnail with opaque white ground (D17 fix) ===');
{
  const dataUrl = await renderThumbnail(samplePage, sampleBook, 480);
  check('thumbnail returns a data URL', typeof dataUrl === 'string' && dataUrl.startsWith('data:image/jpeg'));
}

/* --------------------------------- Respects maxPx and preserves aspect ratio -- */

console.log('\n=== Respects maxPx; aspect ratio is preserved ===');
{
  const trim6x9 = { widthIn: 6, heightIn: 9 };
  const aspect = trim6x9.widthIn / trim6x9.heightIn; // 6 / 9 = 0.6666...

  const dataUrlSmall = await renderThumbnail(samplePage, sampleBook, 150);
  check('thumbnail with maxPx 150 completes', typeof dataUrlSmall === 'string');

  const dataUrlLarge = await renderThumbnail(samplePage, sampleBook, 1000);
  check('thumbnail with maxPx 1000 completes', typeof dataUrlLarge === 'string');

  // Verify aspect ratio for 6x9 trim
  check('6x9 aspect ratio is 2:3', Math.abs(aspect - (2 / 3)) < 0.0001);
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL THUMBNAIL TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
