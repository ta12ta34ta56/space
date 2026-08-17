import assert from 'node:assert/strict';
import {
  PAPER_STOCKS,
  PAPER_STOCKS_INFO,
  PageCountError,
  TRIM_IDS,
  TRIM_SIZE_IN,
  assertPageCountFor,
  pageCountLimitFor,
} from './print.built.mjs';
import { TRIM_IDS as MODEL_TRIM_IDS } from '../model/model.built.mjs';

console.log('\n=== the six trims, matching the model exactly ===');
{
  // A mismatch between the print layer and the Document model is a failing
  // test, not a runtime surprise.
  assert.deepEqual([...TRIM_IDS], [...MODEL_TRIM_IDS], 'TRIM_IDS must match model/types.ts exactly');
  assert.equal(TRIM_IDS.length, 6, 'exactly six trims (D7)');
  assert.deepEqual([...TRIM_IDS], ['6x9', '5.5x8.5', '7x10', '8x10', '8.5x11', 'a4']);

  const expected = {
    '6x9': { widthIn: 6, heightIn: 9 },
    '5.5x8.5': { widthIn: 5.5, heightIn: 8.5 },
    '7x10': { widthIn: 7, heightIn: 10 },
    '8x10': { widthIn: 8, heightIn: 10 },
    '8.5x11': { widthIn: 8.5, heightIn: 11 },
    a4: { widthIn: 8.27, heightIn: 11.69 },
  };
  for (const id of TRIM_IDS) {
    assert.deepEqual(TRIM_SIZE_IN[id], expected[id], `trim ${id}`);
  }
  assert.equal(Object.keys(TRIM_SIZE_IN).length, 6, 'no extra trims in the size table');
}
console.log('PASS trims');

console.log('\n=== the five paper stocks with the thicknesses above ===');
{
  assert.equal(PAPER_STOCKS.length, 5, 'exactly five paper stocks');
  assert.deepEqual(
    [...PAPER_STOCKS],
    ['bw-white', 'bw-cream', 'bw-groundwood', 'color-standard', 'color-premium'],
    'the one vocabulary (D8 defect 4 is gone)',
  );

  const expected = {
    'bw-white': { perPageIn: 0.002252, minPages: 24, maxPages: 828 },
    'bw-cream': { perPageIn: 0.0025, minPages: 24, maxPages: 776 },
    'bw-groundwood': { perPageIn: 0.00235, minPages: 24, maxPages: 812 },
    'color-standard': { perPageIn: 0.002252, minPages: 72, maxPages: 600 },
    'color-premium': { perPageIn: 0.002347, minPages: 24, maxPages: 828 },
  };
  for (const id of PAPER_STOCKS) {
    assert.deepEqual(PAPER_STOCKS_INFO[id], expected[id], `paper ${id}`);
  }

  // D8 defect 1: colour-standard is 0.002252, never premium's 0.002347.
  assert.equal(
    PAPER_STOCKS_INFO['color-standard'].perPageIn,
    0.002252,
    'color-standard perPageIn is 0.002252 — regression test for D8 defect 1',
  );
  assert.notEqual(
    PAPER_STOCKS_INFO['color-standard'].perPageIn,
    PAPER_STOCKS_INFO['color-premium'].perPageIn,
    'standard colour and premium colour are different thicknesses',
  );
}
console.log('PASS paper stocks');

console.log('\n=== a4 does not offer color-standard — unavailable, not limited ===');
{
  assert.equal(pageCountLimitFor('a4', 'color-standard'), null, 'a4 + color-standard is unavailable');
  assert.throws(() => assertPageCountFor('a4', 'color-standard', 100), PageCountError);
  assert.throws(
    () => assertPageCountFor('a4', 'color-standard', 100),
    /a4 does not offer color-standard on KDP/,
    'the message names the trim and the paper',
  );

  // Every other a4 paper is available (limited, not unavailable).
  for (const paper of PAPER_STOCKS) {
    if (paper === 'color-standard') continue;
    assert.ok(pageCountLimitFor('a4', paper) !== null, `a4 + ${paper} is available`);
  }
}
console.log('PASS a4 unavailable');

console.log('\n=== page counts outside the limits are rejected, naming the limit and the paper ===');
{
  // Below the paper minimum.
  assert.throws(() => assertPageCountFor('6x9', 'bw-white', 23), PageCountError);
  assert.throws(() => assertPageCountFor('6x9', 'bw-white', 23), /below the minimum of 24/);
  assert.throws(() => assertPageCountFor('6x9', 'bw-white', 23), /bw-white/);

  // Colour starts at 72 pages, not 24.
  assert.throws(() => assertPageCountFor('6x9', 'color-standard', 71), /below the minimum of 72/);

  // Above the stock maximum.
  assert.throws(() => assertPageCountFor('6x9', 'bw-white', 829), /above the maximum of 828/);
  assert.throws(() => assertPageCountFor('6x9', 'bw-white', 829), /bw-white/);

  // Above the per-trim maximum: 8.5x11 caps bw-white at 590.
  assert.throws(() => assertPageCountFor('8.5x11', 'bw-white', 591), /above the maximum of 590/);
  assert.throws(() => assertPageCountFor('8.5x11', 'bw-white', 591), /8\.5x11/);
  assert.doesNotThrow(() => assertPageCountFor('8.5x11', 'bw-white', 590), '590 itself is legal');
  assert.doesNotThrow(() => assertPageCountFor('6x9', 'bw-white', 828), '828 is legal at 6x9');

  // Garbage counts are refused before any limit comparison.
  for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => assertPageCountFor('6x9', 'bw-white', bad), PageCountError, `count ${String(bad)}`);
  }
}
console.log('PASS page-count rejection');

console.log('\n=== per-trim ceilings, ported from the legacy limit table ===');
{
  assert.equal(pageCountLimitFor('8.5x11', 'bw-white').maxPages, 590);
  assert.equal(pageCountLimitFor('8.5x11', 'bw-cream').maxPages, 550);
  assert.equal(pageCountLimitFor('8.5x11', 'bw-groundwood').maxPages, 578);
  assert.equal(pageCountLimitFor('8.5x11', 'color-standard').maxPages, 600);
  assert.equal(pageCountLimitFor('8.5x11', 'color-premium').maxPages, 590);

  assert.equal(pageCountLimitFor('a4', 'bw-white').maxPages, 780);
  assert.equal(pageCountLimitFor('a4', 'bw-cream').maxPages, 730);
  assert.equal(pageCountLimitFor('a4', 'bw-groundwood').maxPages, 764);
  assert.equal(pageCountLimitFor('a4', 'color-premium').maxPages, 590);

  // The other four trims use the stock defaults.
  for (const trimId of ['6x9', '5.5x8.5', '7x10', '8x10']) {
    assert.equal(pageCountLimitFor(trimId, 'bw-white').maxPages, 828, `${trimId} bw-white`);
    assert.equal(pageCountLimitFor(trimId, 'bw-cream').maxPages, 776, `${trimId} bw-cream`);
  }
  assert.equal(pageCountLimitFor('6x9', 'color-premium').maxPages, 828);
  assert.equal(pageCountLimitFor('6x9', 'color-standard').minPages, 72);
}
console.log('PASS per-trim ceilings');

console.log('\nALL TRIMS TESTS PASSED');
