/**
 * Unit 07b — guides with bleed on (spec 07b, guides-bleed.test.mjs).
 *
 * Pure, no DOM. This is the regression suite for the defect the owner found
 * in the Unit 06 shell: with bleed on, the bleed guide was drawn OUTSIDE the
 * paper, floating on the grey, and the trim guide sat on the paper's edge.
 *
 * Proves:
 *  - with bleed on, every guide rect is inside the paper
 *  - the trim guide is inset 0.125 in on outer/top/bottom, flush at the gutter
 *  - the safe area is measured from the trim line, not from the paper edge
 *  - with bleed off, trim and paper edge coincide
 */

import assert from 'node:assert/strict';
import {
  BLEED_IN,
  TRIM_IDS,
  TRIM_SIZE_IN,
  guidesFor,
  pageSizeIn,
  safeAreaFor,
} from './print.built.mjs';

const EPS = 1e-9;
const PAGE_COUNT = 100;
const book = (trimId, bleed) => ({ trimId, paper: 'bw-white', binding: 'paperback', bleed });

const find = (guides, kind) => guides.find((g) => g.kind === kind);

/* ------------------------------- nothing is ever drawn outside the paper -- */

console.log('=== with bleed on, every guide rect is inside the paper ===');
for (const trimId of TRIM_IDS) {
  for (const pageIndex of [0, 1, 2, 3]) {
    const paper = pageSizeIn(book(trimId, true), pageIndex);
    const guides = guidesFor(book(trimId, true), pageIndex, PAGE_COUNT, { surface: 'interior' });

    assert.ok(guides.length > 0, `${trimId} p${pageIndex + 1}: guides exist`);
    for (const g of guides) {
      const r = g.rectIn;
      assert.ok(r.xIn >= -EPS, `${trimId} p${pageIndex + 1}: ${g.kind} does not start left of the paper`);
      assert.ok(r.yIn >= -EPS, `${trimId} p${pageIndex + 1}: ${g.kind} does not start above the paper`);
      assert.ok(
        r.xIn + r.wIn <= paper.widthIn + EPS,
        `${trimId} p${pageIndex + 1}: ${g.kind} does not run off the right of the paper`,
      );
      assert.ok(
        r.yIn + r.hIn <= paper.heightIn + EPS,
        `${trimId} p${pageIndex + 1}: ${g.kind} does not run off the bottom of the paper`,
      );
    }
  }
}
console.log('PASS no guide floats outside the paper');

/* --------------------------------------- the bleed guide IS the paper edge -- */

console.log('\n=== the bleed guide is the paper edge itself ===');
for (const trimId of TRIM_IDS) {
  for (const pageIndex of [0, 1]) {
    const paper = pageSizeIn(book(trimId, true), pageIndex);
    const bleed = find(guidesFor(book(trimId, true), pageIndex, PAGE_COUNT, { surface: 'interior' }), 'bleed');
    assert.ok(bleed, `${trimId} p${pageIndex + 1}: a bleed guide exists`);
    assert.deepEqual(
      bleed.rectIn,
      { xIn: 0, yIn: 0, wIn: paper.widthIn, hIn: paper.heightIn },
      `${trimId} p${pageIndex + 1}: the bleed guide is the paper, never outside it`,
    );
  }
}
console.log('PASS the bleed guide is the paper edge');

/* --------------- the trim guide is inset on outer/top/bottom, flush at gutter -- */

console.log('\n=== the trim guide is inset 0.125 in on outer, top and bottom, flush at the gutter ===');
for (const trimId of TRIM_IDS) {
  const size = TRIM_SIZE_IN[trimId];

  for (const pageIndex of [0, 1, 2, 3]) {
    const isRecto = (pageIndex + 1) % 2 === 1;
    const paper = pageSizeIn(book(trimId, true), pageIndex);
    const trim = find(guidesFor(book(trimId, true), pageIndex, PAGE_COUNT, { surface: 'interior' }), 'trim');
    assert.ok(trim, `${trimId} p${pageIndex + 1}: a trim guide exists`);

    // The trim box is always the trim SIZE. Bleed makes the paper bigger; it
    // never changes what the finished page measures.
    assert.ok(Math.abs(trim.rectIn.wIn - size.widthIn) < EPS, `${trimId}: the trim box is the trim width`);
    assert.ok(Math.abs(trim.rectIn.hIn - size.heightIn) < EPS, `${trimId}: the trim box is the trim height`);

    // Top and bottom always bleed.
    assert.ok(Math.abs(trim.rectIn.yIn - BLEED_IN) < EPS, `${trimId} p${pageIndex + 1}: inset from the top`);
    assert.ok(
      Math.abs(paper.heightIn - (trim.rectIn.yIn + trim.rectIn.hIn) - BLEED_IN) < EPS,
      `${trimId} p${pageIndex + 1}: inset from the bottom`,
    );

    if (isRecto) {
      // Recto: gutter on the left, outer on the right.
      assert.ok(Math.abs(trim.rectIn.xIn - 0) < EPS, `${trimId} p${pageIndex + 1}: flush at the left gutter edge`);
      assert.ok(
        Math.abs(paper.widthIn - (trim.rectIn.xIn + trim.rectIn.wIn) - BLEED_IN) < EPS,
        `${trimId} p${pageIndex + 1}: inset from the right outer edge`,
      );
    } else {
      // Verso: outer on the left, gutter on the right.
      assert.ok(
        Math.abs(trim.rectIn.xIn - BLEED_IN) < EPS,
        `${trimId} p${pageIndex + 1}: inset from the left outer edge`,
      );
      assert.ok(
        Math.abs(paper.widthIn - (trim.rectIn.xIn + trim.rectIn.wIn)) < EPS,
        `${trimId} p${pageIndex + 1}: flush at the right gutter edge`,
      );
    }
  }
}
console.log('PASS the trim guide is inset on the cut edges only');

/* ------------------------------ safe area is measured from the trim line -- */

console.log('\n=== the safe area is measured from the trim line, not the paper edge ===');
for (const trimId of TRIM_IDS) {
  for (const pageIndex of [0, 1, 2, 3]) {
    const guides = guidesFor(book(trimId, true), pageIndex, PAGE_COUNT, { surface: 'interior' });
    const trim = find(guides, 'trim');
    const safe = find(guides, 'safe');
    assert.ok(safe, `${trimId} p${pageIndex + 1}: a safe guide exists`);

    // The same safe area Unit 03 computes, placed relative to the trim box.
    const expected = safeAreaFor(trimId, 'bw-white', PAGE_COUNT, pageIndex + 1, { bleed: true });
    assert.ok(
      Math.abs(safe.rectIn.xIn - (trim.rectIn.xIn + expected.xIn)) < EPS,
      `${trimId} p${pageIndex + 1}: safe x is measured from the trim line`,
    );
    assert.ok(
      Math.abs(safe.rectIn.yIn - (trim.rectIn.yIn + expected.yIn)) < EPS,
      `${trimId} p${pageIndex + 1}: safe y is measured from the trim line`,
    );
    assert.ok(Math.abs(safe.rectIn.wIn - expected.wIn) < EPS, `${trimId}: safe width is unchanged by bleed`);
    assert.ok(Math.abs(safe.rectIn.hIn - expected.hIn) < EPS, `${trimId}: safe height is unchanged by bleed`);

    // Which means it is strictly inside the trim box, not merely inside the paper.
    assert.ok(safe.rectIn.xIn >= trim.rectIn.xIn - EPS, `${trimId} p${pageIndex + 1}: safe starts inside the trim`);
    assert.ok(safe.rectIn.yIn >= trim.rectIn.yIn - EPS, `${trimId} p${pageIndex + 1}: safe starts below the trim top`);
    assert.ok(
      safe.rectIn.xIn + safe.rectIn.wIn <= trim.rectIn.xIn + trim.rectIn.wIn + EPS,
      `${trimId} p${pageIndex + 1}: safe ends inside the trim`,
    );
    assert.ok(
      safe.rectIn.yIn + safe.rectIn.hIn <= trim.rectIn.yIn + trim.rectIn.hIn + EPS,
      `${trimId} p${pageIndex + 1}: safe ends above the trim bottom`,
    );
  }
}
console.log('PASS the safe area is measured from the trim line');

/* ---------------------------- with bleed off, trim and paper coincide -- */

console.log('\n=== with bleed off, the trim guide and the paper edge coincide ===');
for (const trimId of TRIM_IDS) {
  for (const pageIndex of [0, 1, 2, 3]) {
    const paper = pageSizeIn(book(trimId, false), pageIndex);
    const guides = guidesFor(book(trimId, false), pageIndex, PAGE_COUNT, { surface: 'interior' });
    const trim = find(guides, 'trim');

    assert.deepEqual(
      trim.rectIn,
      { xIn: 0, yIn: 0, wIn: paper.widthIn, hIn: paper.heightIn },
      `${trimId} p${pageIndex + 1}: with no bleed the trim IS the paper`,
    );
    assert.equal(
      guides.filter((g) => g.kind === 'bleed').length,
      0,
      `${trimId} p${pageIndex + 1}: no bleed guide when the book does not bleed`,
    );
  }
}
console.log('PASS bleed off: trim and paper coincide');

console.log('\nALL GUIDES-BLEED TESTS PASSED');
