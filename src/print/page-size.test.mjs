/**
 * Unit 07b — page size (spec 07b, page-size.test.mjs).
 *
 * Pure, no DOM. Proves the fact the defect got wrong:
 *  - bleed off at all six trims, the paper equals the trim
 *  - bleed on at 6 x 9, the paper is exactly 6.125 x 9.25
 *  - bleed adds width ONCE, not twice: the gutter edge gets none
 *  - recto and verso grow on opposite sides
 */

import assert from 'node:assert/strict';
import {
  BLEED_IN,
  TRIM_IDS,
  TRIM_SIZE_IN,
  isRectoPage,
  pageSizeIn,
  trimOffsetIn,
} from './print.built.mjs';

const EPS = 1e-9;
const book = (trimId, bleed) => ({ trimId, paper: 'bw-white', binding: 'paperback', bleed });

/* ------------------------------------------- bleed off: paper is the trim -- */

console.log('=== bleed off at all six trims: the paper equals the trim ===');
for (const trimId of TRIM_IDS) {
  const trim = TRIM_SIZE_IN[trimId];
  for (const pageIndex of [0, 1, 2, 3]) {
    const size = pageSizeIn(book(trimId, false), pageIndex);
    assert.deepEqual(size, { widthIn: trim.widthIn, heightIn: trim.heightIn }, `${trimId} p${pageIndex + 1}`);

    const offset = trimOffsetIn(book(trimId, false), pageIndex);
    assert.deepEqual(offset, { xIn: 0, yIn: 0 }, `${trimId}: trim and paper coincide with no bleed`);
  }
}
console.log('PASS bleed off equals trim');

/* --------------------------------------------------- bleed on at 6 x 9 -- */

console.log('\n=== bleed on at 6 x 9: the paper is exactly 6.125 x 9.25 ===');
{
  const size = pageSizeIn(book('6x9', true), 0);
  assert.equal(size.widthIn, 6.125, 'width grows by one bleed');
  assert.equal(size.heightIn, 9.25, 'height grows by two bleeds');
}
console.log('PASS 6 x 9 with bleed');

/* ------------------------------------ bleed adds width once, not twice -- */

console.log('\n=== bleed adds width once, not twice: the gutter edge gets none ===');
for (const trimId of TRIM_IDS) {
  const trim = TRIM_SIZE_IN[trimId];
  for (const pageIndex of [0, 1, 2, 3]) {
    const size = pageSizeIn(book(trimId, true), pageIndex);

    assert.ok(
      Math.abs(size.widthIn - (trim.widthIn + BLEED_IN)) < EPS,
      `${trimId} p${pageIndex + 1}: width is trim + one bleed, not two`,
    );
    assert.ok(
      Math.abs(size.heightIn - (trim.heightIn + BLEED_IN * 2)) < EPS,
      `${trimId} p${pageIndex + 1}: height is trim + two bleeds, top and bottom`,
    );

    // Stated the other way round, so a future "symmetrical" refactor fails here.
    assert.notEqual(size.widthIn, trim.widthIn + BLEED_IN * 2, `${trimId}: the gutter edge never bleeds`);

    // The page size does not depend on which page it is; only the side does.
    assert.deepEqual(size, pageSizeIn(book(trimId, true), 0), `${trimId}: every page is the same size`);
  }
}
console.log('PASS bleed adds width once');

/* --------------------------------- recto and verso grow opposite sides -- */

console.log('\n=== recto and verso grow on opposite sides ===');
for (const trimId of TRIM_IDS) {
  // pageIndex 0 -> page 1, recto: gutter on the LEFT, so the paper grows RIGHT
  // and the trim box starts at the paper's left edge.
  assert.equal(isRectoPage(0), true, 'page 1 is a recto');
  const recto = trimOffsetIn(book(trimId, true), 0);
  assert.equal(recto.xIn, 0, `${trimId}: a recto's trim is flush with the left (gutter) edge`);
  assert.equal(recto.yIn, BLEED_IN, `${trimId}: a recto's trim is inset from the top`);

  // pageIndex 1 -> page 2, verso: gutter on the RIGHT, so the paper grows LEFT
  // and the trim box is inset from the paper's left edge.
  assert.equal(isRectoPage(1), false, 'page 2 is a verso');
  const verso = trimOffsetIn(book(trimId, true), 1);
  assert.equal(verso.xIn, BLEED_IN, `${trimId}: a verso's trim is inset from the left (outer) edge`);
  assert.equal(verso.yIn, BLEED_IN, `${trimId}: a verso's trim is inset from the top`);

  // The two are mirror images: recto grows right, verso grows left.
  assert.notEqual(recto.xIn, verso.xIn, `${trimId}: recto and verso do not grow on the same side`);
  assert.equal(recto.xIn + verso.xIn, BLEED_IN, `${trimId}: between them they account for exactly one bleed`);

  // And the trim box always fits inside the paper, on every page.
  for (const pageIndex of [0, 1, 2, 3]) {
    const trim = TRIM_SIZE_IN[trimId];
    const paper = pageSizeIn(book(trimId, true), pageIndex);
    const offset = trimOffsetIn(book(trimId, true), pageIndex);
    assert.ok(offset.xIn + trim.widthIn <= paper.widthIn + EPS, `${trimId} p${pageIndex + 1}: trim fits across`);
    assert.ok(offset.yIn + trim.heightIn <= paper.heightIn + EPS, `${trimId} p${pageIndex + 1}: trim fits down`);
  }
}
console.log('PASS recto and verso grow on opposite sides');

/* ------------------------------------------------------------ refusals -- */

console.log('\n=== an impossible page index is refused, not guessed ===');
{
  for (const bad of [-1, 1.5, Number.NaN]) {
    assert.throws(
      () => pageSizeIn(book('6x9', true), bad),
      (e) => e.name === 'PageSizeError',
      `pageSizeIn refuses ${String(bad)}`,
    );
    assert.throws(
      () => trimOffsetIn(book('6x9', true), bad),
      (e) => e.name === 'PageSizeError',
      `trimOffsetIn refuses ${String(bad)}`,
    );
  }
}
console.log('PASS refusals');

console.log('\nALL PAGE SIZE TESTS PASSED');
