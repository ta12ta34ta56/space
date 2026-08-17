/**
 * Unit 06 — guide geometry (spec 06, guides.test.mjs).
 *
 * Pure, no DOM. Proves:
 *  - every guide rect sits inside the page at all six trims
 *  - recto/verso: gutter is on the left for odd pages, right for even
 *  - bleed on/off changes the bleed rect and nothing else
 *  - cover guides include spine fold and barcode keep-out; interior never does
 *  - crossing a gutter band (150 -> 151 pages) moves the gutter guide
 */

import assert from 'node:assert/strict';
import {
  BLEED_IN,
  GUIDE_KINDS,
  TRIM_IDS,
  TRIM_SIZE_IN,
  coverSpecFor,
  guidesFor,
  gutterInchesFor,
} from './print.built.mjs';

const EPS = 1e-9;
const book = (trimId) => ({ trimId, paper: 'bw-white', binding: 'paperback' });

const rectInside = (rect, box) =>
  rect.xIn >= box.xIn - EPS &&
  rect.yIn >= box.yIn - EPS &&
  rect.xIn + rect.wIn <= box.xIn + box.wIn + EPS &&
  rect.yIn + rect.hIn <= box.yIn + box.hIn + EPS;

/* --------------- every guide rect sits inside the page, all six trims -- */

console.log('=== every guide rect sits inside the page at all six trims ===');
for (const trimId of TRIM_IDS) {
  const size = TRIM_SIZE_IN[trimId];
  for (const pageIndex of [0, 1]) {
    for (const bleedOn of [false, true]) {
      // With bleed on, the page's drawable extent includes the bleed band on
      // the top, bottom and outside edges; that extent is the outermost box.
      const isRecto = (pageIndex + 1) % 2 === 1;
      const box = bleedOn
        ? {
            xIn: isRecto ? 0 : -BLEED_IN,
            yIn: -BLEED_IN,
            wIn: size.widthIn + BLEED_IN,
            hIn: size.heightIn + BLEED_IN * 2,
          }
        : { xIn: 0, yIn: 0, wIn: size.widthIn, hIn: size.heightIn };

      const guides = guidesFor(book(trimId), pageIndex, 100, { surface: 'interior', bleedOn });
      for (const g of guides) {
        assert.ok(
          rectInside(g.rectIn, box),
          `${trimId} p${pageIndex + 1} bleed=${bleedOn}: ${g.kind} inside the page`,
        );
        assert.ok(GUIDE_KINDS.includes(g.kind), `${trimId}: known kind ${g.kind}`);
      }
    }
  }
}
console.log('PASS all guide rects inside the page');

/* --------------------------------------------- cover rects inside cover -- */

console.log('\n=== every cover guide rect sits inside the flat cover at all six trims ===');
for (const trimId of TRIM_IDS) {
  const spec = coverSpecFor(trimId, 'bw-white', 200, 'paperback');
  const box = { xIn: 0, yIn: 0, wIn: spec.widthIn, hIn: spec.heightIn };
  const guides = guidesFor(book(trimId), 0, 200, { surface: 'cover', bleedOn: false });
  for (const g of guides) {
    assert.ok(rectInside(g.rectIn, box), `${trimId} cover: ${g.kind} inside the flat cover`);
  }
}
console.log('PASS all cover guide rects inside the flat cover');

/* ------------------------------------------- recto/verso gutter placement -- */

console.log('\n=== gutter is on the left for odd pages, right for even ===');
for (const trimId of TRIM_IDS) {
  const size = TRIM_SIZE_IN[trimId];
  const gutterIn = gutterInchesFor(100);

  // pageIndex 0 -> page 1, recto, gutter LEFT.
  const recto = guidesFor(book(trimId), 0, 100, { surface: 'interior', bleedOn: false });
  const rectoGutter = recto.find((g) => g.kind === 'gutter');
  assert.ok(rectoGutter, `${trimId}: recto has a gutter guide`);
  assert.equal(rectoGutter.rectIn.xIn, 0, `${trimId}: recto gutter starts at the left edge`);
  assert.ok(Math.abs(rectoGutter.rectIn.wIn - gutterIn) < EPS, `${trimId}: recto gutter width`);

  // pageIndex 1 -> page 2, verso, gutter RIGHT.
  const verso = guidesFor(book(trimId), 1, 100, { surface: 'interior', bleedOn: false });
  const versoGutter = verso.find((g) => g.kind === 'gutter');
  assert.ok(versoGutter, `${trimId}: verso has a gutter guide`);
  assert.ok(
    Math.abs(versoGutter.rectIn.xIn + versoGutter.rectIn.wIn - size.widthIn) < EPS,
    `${trimId}: verso gutter ends at the right edge`,
  );

  // The safe area hugs the gutter on the matching side.
  const rectoSafe = recto.find((g) => g.kind === 'safe');
  const versoSafe = verso.find((g) => g.kind === 'safe');
  assert.ok(rectoSafe.rectIn.xIn >= gutterIn - EPS, `${trimId}: recto safe area clears the gutter`);
  assert.ok(
    versoSafe.rectIn.xIn + versoSafe.rectIn.wIn <= size.widthIn - gutterIn + EPS,
    `${trimId}: verso safe area clears the gutter`,
  );
}
console.log('PASS recto/verso gutter placement');

/* ------------------------------- bleed toggles the bleed rect and only it -- */

console.log('\n=== bleed on/off changes the bleed rect and nothing else ===');
for (const trimId of TRIM_IDS) {
  for (const pageIndex of [0, 1]) {
    const off = guidesFor(book(trimId), pageIndex, 100, { surface: 'interior', bleedOn: false });
    const on = guidesFor(book(trimId), pageIndex, 100, { surface: 'interior', bleedOn: true });

    assert.equal(off.filter((g) => g.kind === 'bleed').length, 0, `${trimId}: no bleed guide when off`);
    assert.equal(on.filter((g) => g.kind === 'bleed').length, 1, `${trimId}: one bleed guide when on`);

    // Every non-bleed guide is identical with bleed on and off. (KDP's outer
    // margin with bleed equals Novelka's safe default, so the safe area does
    // not move — margins.ts, OUTER_MARGIN_SAFE_IN.)
    const offRest = off.filter((g) => g.kind !== 'bleed');
    const onRest = on.filter((g) => g.kind !== 'bleed');
    assert.deepEqual(onRest, offRest, `${trimId} p${pageIndex + 1}: only the bleed rect changed`);
  }
}
console.log('PASS bleed toggles only the bleed rect');

/* ------------------------------- cover has spine + barcode, interior never -- */

console.log('\n=== cover guides include spine fold and barcode keep-out; interior includes neither ===');
for (const trimId of TRIM_IDS) {
  const cover = guidesFor(book(trimId), 0, 200, { surface: 'cover', bleedOn: false });
  const kinds = cover.map((g) => g.kind);
  assert.ok(kinds.includes('spine'), `${trimId}: cover has a spine fold guide`);
  assert.ok(kinds.includes('barcode'), `${trimId}: cover has a barcode keep-out guide`);
  assert.ok(kinds.includes('bleed'), `${trimId}: cover has a bleed guide`);
  assert.ok(kinds.includes('trim'), `${trimId}: cover has a trim guide`);
  assert.equal(cover.filter((g) => g.kind === 'safe').length, 2, `${trimId}: back and front safe areas`);

  // The spine guide matches the cover spec exactly.
  const spec = coverSpecFor(trimId, 'bw-white', 200, 'paperback');
  const spine = cover.find((g) => g.kind === 'spine');
  assert.ok(Math.abs(spine.rectIn.xIn - spec.spineLeftIn) < EPS, `${trimId}: spine fold left edge`);
  assert.ok(Math.abs(spine.rectIn.wIn - spec.spineIn) < EPS, `${trimId}: spine width`);

  for (const pageIndex of [0, 1]) {
    for (const bleedOn of [false, true]) {
      const interior = guidesFor(book(trimId), pageIndex, 100, { surface: 'interior', bleedOn });
      const interiorKinds = interior.map((g) => g.kind);
      assert.ok(!interiorKinds.includes('spine'), `${trimId}: interior has no spine guide`);
      assert.ok(!interiorKinds.includes('barcode'), `${trimId}: interior has no barcode guide`);
    }
  }
}
console.log('PASS spine and barcode are cover-only');

/* ----------------------------------- crossing a gutter band moves the guide -- */

console.log('\n=== crossing a gutter band (150 -> 151 pages) moves the gutter guide ===');
{
  const at150 = guidesFor(book('6x9'), 0, 150, { surface: 'interior', bleedOn: false });
  const at151 = guidesFor(book('6x9'), 0, 151, { surface: 'interior', bleedOn: false });
  const g150 = at150.find((g) => g.kind === 'gutter');
  const g151 = at151.find((g) => g.kind === 'gutter');
  assert.ok(Math.abs(g150.rectIn.wIn - 0.375) < EPS, '150 pages: gutter is 0.375 in');
  assert.ok(Math.abs(g151.rectIn.wIn - 0.5) < EPS, '151 pages: gutter is 0.5 in');

  // The safe area moves with it.
  const s150 = at150.find((g) => g.kind === 'safe');
  const s151 = at151.find((g) => g.kind === 'safe');
  assert.ok(s151.rectIn.xIn > s150.rectIn.xIn, 'safe area moves inward across the band');
}
console.log('PASS gutter band crossing moves the guide');

/* ------------------------------------------------- labels carry units -- */

console.log('\n=== every numeric label carries a unit ===');
{
  const all = [
    ...guidesFor(book('6x9'), 0, 100, { surface: 'interior', bleedOn: true }),
    ...guidesFor(book('6x9'), 0, 100, { surface: 'cover', bleedOn: false }),
  ];
  for (const g of all) {
    assert.equal(typeof g.label, 'string');
    assert.ok(g.label.length > 0, `${g.kind}: label exists`);
    if (/\d/.test(g.label)) {
      assert.ok(/\d(\.\d+)? in\b/.test(g.label), `${g.kind}: number carries "in" — "${g.label}"`);
    }
    assert.ok(!g.label.includes('\u2014'), `${g.kind}: no em dash in "${g.label}"`);
  }
}
console.log('PASS labels carry units');

/* --------------------------------------------------------- refusals -- */

console.log('\n=== impossible requests are refused, not guessed ===');
{
  assert.throws(
    () => guidesFor(book('6x9'), 5, 3, { surface: 'interior', bleedOn: false }),
    (e) => e.name === 'GuideError',
    'page index outside the book is refused',
  );
  assert.throws(
    () => guidesFor(book('6x9'), -1, 10, { surface: 'interior', bleedOn: false }),
    (e) => e.name === 'GuideError',
    'negative page index is refused',
  );
  assert.throws(
    () => guidesFor({ trimId: '6x9', paper: 'bw-white', binding: 'hardcover' }, 0, 100, { surface: 'cover', bleedOn: false }),
    (e) => e.name === 'UnsupportedBindingError',
    'hardcover cover guides are refused by Unit 03, passed through',
  );
}
console.log('PASS refusals');

console.log('\nALL GUIDES TESTS PASSED');
