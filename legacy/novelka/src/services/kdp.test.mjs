import assert from 'node:assert/strict';
import {
  BLEED_IN,
  POINTS_PER_INCH as IN,
  KDP_MIN_IMAGE_DPI,
  gutterInchesFor,
  isKdpTrim,
  kdpMarginsFor,
  kdpPageSizeForTrim,
  matchKdpPageSize,
  preflight,
  serializedObjectBounds,
  trimBoxForPage,
} from './kdp.built.mjs';
import { calculateCover } from './kdp-cover.built.mjs';

function page(width, height, objects = []) {
  return {
    width,
    height,
    role: 'interior',
    data: { version: '6.0.0', objects },
  };
}

function pages(n, width = 6 * IN, height = 9 * IN, objects = []) {
  return Array.from({ length: n }, () => page(width, height, objects));
}

function has(issues, code) {
  return issues.some((i) => i.code === code);
}

console.log('\n=== KDP dimensions ===');
{
  const bleed = kdpPageSizeForTrim(6 * IN, 9 * IN, true);
  assert.equal(bleed.width, 6.125 * IN);
  assert.equal(bleed.height, 9.25 * IN);
  assert.equal(BLEED_IN * IN, 9);
  assert.equal(matchKdpPageSize(bleed.width, bleed.height, { bleed: 'auto' }).bleed, 'bleed');
  assert.equal(matchKdpPageSize(6 * IN, 9 * IN, { bleed: 'auto' }).bleed, 'none');
  assert.equal(isKdpTrim(6 * IN, 9 * IN), true);
  assert.equal(isKdpTrim(9 * IN, 6 * IN), false, 'KDP does not list arbitrary rotated 6x9 as a paperback trim');
  assert.equal(isKdpTrim(8.25 * IN, 6 * IN), true, '8.25x6 is the listed landscape trim');
}

console.log('PASS dimensions');

console.log('\n=== KDP bleed trim boxes ===');
{
  const w = 6.125 * IN;
  const h = 9.25 * IN;
  const recto = trimBoxForPage(w, h, 1, true);
  const verso = trimBoxForPage(w, h, 2, true);
  assert.equal(recto.left, 0);
  assert.equal(recto.top, 9);
  assert.equal(recto.width, 6 * IN);
  assert.equal(recto.height, 9 * IN);
  assert.equal(verso.left, 9);
  assert.equal(verso.top, 9);
  assert.equal(verso.width, 6 * IN);
  assert.equal(verso.height, 9 * IN);
}

console.log('PASS trim boxes');

console.log('\n=== KDP margin bands ===');
{
  assert.equal(gutterInchesFor(24), 0.375);
  assert.equal(gutterInchesFor(151), 0.5);
  assert.equal(gutterInchesFor(301), 0.625);
  assert.equal(gutterInchesFor(501), 0.75);
  assert.equal(gutterInchesFor(701), 0.875);
  const noBleedMinimum = kdpMarginsFor(24, { bleed: false, intent: 'minimum' });
  assert.equal(noBleedMinimum.outer, 0.25 * IN);
  const withBleed = kdpMarginsFor(24, { bleed: true, intent: 'minimum' });
  assert.equal(withBleed.outer, 0.375 * IN);
  assert.equal(withBleed.top, 0.375 * IN);
}

console.log('PASS margins');

console.log('\n=== serialized object bounds ===');
{
  const centered = serializedObjectBounds({ type: 'textbox', left: 100, top: 100, width: 40, height: 20, originX: 'center', originY: 'center' });
  assert.equal(centered.left, 80);
  assert.equal(centered.top, 90);
  assert.equal(centered.width, 40);
  assert.equal(centered.height, 20);
  const rotated = serializedObjectBounds({ type: 'rect', left: 100, top: 100, width: 10, height: 20, angle: 90 });
  assert(Math.abs(rotated.left - 80) < 0.001);
  assert(Math.abs(rotated.top - 100) < 0.001);
  assert(Math.abs(rotated.width - 20) < 0.001);
  assert(Math.abs(rotated.height - 10) < 0.001);
}

console.log('PASS bounds');

console.log('\n=== KDP preflight ===');
{
  assert.deepEqual(preflight(pages(24)), []);
  assert(has(preflight(pages(23)), 'odd-page-count'));
  assert(has(preflight(pages(22)), 'too-few-pages'));
  assert(has(preflight(pages(24, 9 * IN, 6 * IN)), 'kdp-size'));
  assert(has(preflight(pages(700, 8.5 * IN, 11 * IN)), 'too-many-pages'));
  assert(has(preflight(pages(24), { dpi: KDP_MIN_IMAGE_DPI - 1 }), 'dpi-low'));

  const fullPageArt = { type: 'rect', left: 0, top: 0, width: 6 * IN, height: 9 * IN, fill: '#000' };
  assert(has(preflight(pages(24, 6 * IN, 9 * IN, [fullPageArt])), 'edge-art-no-bleed'));

  const bleedW = 6.125 * IN;
  const bleedH = 9.25 * IN;
  const bleedBackground = { type: 'rect', left: 0, top: 0, width: bleedW, height: bleedH, fill: '#000' };
  const bleedIssues = preflight(pages(24, bleedW, bleedH, [bleedBackground]));
  assert(!has(bleedIssues, 'kdp-size'));
  assert(!has(bleedIssues, 'edge-art-no-bleed'));

  const unsafeText = { type: 'textbox', left: 5, top: 5, width: 100, height: 20, text: 'unsafe' };
  assert(has(preflight(pages(24, 6 * IN, 9 * IN, [unsafeText])), 'text-outside-safe'));

  const thinLine = { type: 'line', left: 100, top: 100, width: 100, height: 0, stroke: '#000', strokeWidth: 0.4 };
  assert(has(preflight(pages(24, 6 * IN, 9 * IN, [thinLine])), 'thin-lines'));
}

console.log('PASS preflight');

console.log('\n=== KDP cover constants ===');
{
  const paperback = calculateCover(6, 9, 80, 'color-standard', 'paperback');
  assert.equal(paperback.spineInches, 80 * 0.002347);
  assert.equal(paperback.spineTextAllowed, true);
  const tooSmallSpine = calculateCover(6, 9, 79, 'white', 'paperback');
  assert.equal(tooSmallSpine.spineTextAllowed, false);
  assert(tooSmallSpine.warnings.some((w) => w.includes('more than 79 pages')));
  const tooManyCream = calculateCover(6, 9, 800, 'cream', 'paperback');
  assert(tooManyCream.warnings.some((w) => w.includes('776')));
}

console.log('PASS cover');

console.log('\nALL KDP TESTS PASSED');
