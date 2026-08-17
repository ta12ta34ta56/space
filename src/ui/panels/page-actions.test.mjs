/**
 * Unit 07 — page actions and row labels (pure).
 *
 * The decisions the Pages panel makes before it touches the Document, tested
 * without a DOM: which Command an action produces, and when it refuses with a
 * reason instead. Plus the row labels, audited at all six trims.
 */

import assert from 'node:assert/strict';
import { createDocument, ELEMENT_KINDS } from '../../model/model.built.mjs';
import {
  PAPER_STOCKS,
  TRIM_IDS,
  KDP_MIN_PAGE_COUNT,
  coverSpecFor,
  pageCountLimitFor,
} from '../../print/print.built.mjs';
import { addPageAt, blankPage, deletePage, duplicatePage, reorderPage } from './page-actions.built.mjs';
import { coverSpineLabelFor, pageNameFor, sideMarkerFor } from './pages-rows.built.mjs';

const CREATED_AT = 1_700_000_000_000;

function makeDoc(pageCount, over = {}) {
  let n = 0;
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount,
    now: () => CREATED_AT,
    id: () => `p-${(n += 1)}`,
    ...over,
  });
}

/* ------------------------------------------------------------- add -- */

console.log('=== adding a page produces one page/add at the right index ===');
{
  const doc = makeDoc(30);

  const middle = addPageAt(doc, 5, 'new-1');
  assert.equal(middle.ok, true);
  assert.equal(middle.command.t, 'page/add');
  assert.equal(middle.command.index, 5);
  assert.deepEqual(middle.command.page, {
    id: 'new-1',
    kind: 'blank',
    role: 'interior',
    elements: [],
    locked: false,
  });

  // The page is blank, interior and unlocked. Its kind is assigned at
  // creation, never inferred (invariant 8).
  assert.equal(blankPage('x').kind, 'blank');
  assert.equal(blankPage('x').role, 'interior');

  // Appending is index === length, and out-of-range indices are clamped
  // rather than throwing at the user.
  assert.equal(addPageAt(doc, 30, 'n').command.index, 30);
  assert.equal(addPageAt(doc, 999, 'n').command.index, 30, 'past the end appends');
  assert.equal(addPageAt(doc, -4, 'n').command.index, 0, 'before the start prepends');

  // Nothing is mutated: these are descriptions of a change, not the change.
  assert.equal(doc.pages.length, 30);
}
console.log('PASS add');

/* ------------------------------------------------------- duplicate -- */

console.log('\n=== duplicating a page names the page and its copy ===');
{
  const doc = makeDoc(30);
  const action = duplicatePage(doc, 'p-4', 'copy-1');
  assert.equal(action.ok, true);
  assert.deepEqual(action.command, { t: 'page/duplicate', id: 'p-4', newId: 'copy-1' });

  const missing = duplicatePage(doc, 'p-nope', 'copy-1');
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /no longer in this book/);
}
console.log('PASS duplicate');

/* ---------------------------------------------------------- delete -- */

console.log('\n=== deleting below the KDP minimum is refused with a reason ===');
{
  // Above the minimum: allowed.
  const roomy = makeDoc(30);
  const ok = deletePage(roomy, 'p-1');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.command, { t: 'page/delete', ids: ['p-1'] });

  // Exactly at the minimum: refused, and the refusal explains itself.
  const atLimit = makeDoc(KDP_MIN_PAGE_COUNT);
  const refused = deletePage(atLimit, 'p-1');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /24/, 'the reason names the limit');
  assert.match(refused.reason, /Amazon will not print/, 'it says what happened');
  assert.match(refused.reason, /Add a page/, 'it says what to do instead');
  assert.equal(refused.reason.includes('\u2014'), false, 'no em dash in user-facing copy');

  // One above the minimum is the boundary: still allowed.
  assert.equal(deletePage(makeDoc(KDP_MIN_PAGE_COUNT + 1), 'p-1').ok, true);

  // An unknown id is refused before any limit is considered.
  assert.equal(deletePage(roomy, 'p-nope').ok, false);
}
console.log('PASS delete');

/* --------------------------------------------------------- reorder -- */

console.log('\n=== reordering produces one page/reorder, or nothing at all ===');
{
  const doc = makeDoc(30);

  const moved = reorderPage(doc, 4, 1);
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.command, { t: 'page/reorder', from: 4, to: 1 });

  // A move that changes nothing is refused, so it can never become an empty
  // undo entry.
  assert.equal(reorderPage(doc, 3, 3).ok, false);
  assert.equal(reorderPage(doc, 0, -1).ok, false, 'clamped to 0, which is where it already is');
  assert.equal(reorderPage(doc, 29, 99).ok, false, 'clamped to the end, where it already is');

  // A target past the end clamps to the end rather than throwing.
  assert.deepEqual(reorderPage(doc, 0, 99).command, { t: 'page/reorder', from: 0, to: 29 });

  // An index that is not a page at all is refused.
  assert.equal(reorderPage(doc, 30, 0).ok, false);
  assert.equal(reorderPage(doc, -1, 0).ok, false);
}
console.log('PASS reorder');

/* ------------------------------------------------------ row labels -- */

console.log('\n=== page names and recto/verso side markers ===');
{
  assert.equal(pageNameFor(1), 'Page 1');
  assert.equal(pageNameFor(200), 'Page 200');

  // Odd interior pages are recto (right-hand), even are verso. Getting this
  // backwards mirrors every guide on half the book.
  assert.equal(sideMarkerFor(1), 'Odd');
  assert.equal(sideMarkerFor(2), 'Even');
  assert.equal(sideMarkerFor(23), 'Odd');
  assert.equal(sideMarkerFor(24), 'Even');
}
console.log('PASS row labels');

/* -------------------------------- the cover spine, audited at six trims -- */

console.log('\n=== the cover spine label, at all six trims and every paper ===');
{
  for (const trimId of TRIM_IDS) {
    for (const paper of PAPER_STOCKS) {
      const limit = pageCountLimitFor(trimId, paper);
      const book = { trimId, paper, binding: 'paperback', bleed: false };

      if (limit === null) {
        // A4 has no colour-standard. No label rather than a made-up number.
        assert.equal(
          coverSpineLabelFor(book, 100),
          null,
          `${trimId} + ${paper} is unavailable, so no spine is shown`,
        );
        continue;
      }

      // Inside the limits: the label matches coverSpecFor exactly, in inches.
      const count = Math.max(limit.minPages, Math.min(limit.maxPages, 120));
      const spec = coverSpecFor(trimId, paper, count, 'paperback');
      const label = coverSpineLabelFor(book, count);
      assert.equal(label, `Spine ${spec.spineIn.toFixed(3)}"`, `${trimId} ${paper}`);
      assert.match(label, /"$/, `${trimId} ${paper}: the number carries its unit`);
      assert.match(label, /\d\.\d{3}"/, `${trimId} ${paper}: three decimal places, as the legacy panel showed`);

      // Outside the limits: refused, never approximated.
      assert.equal(
        coverSpineLabelFor(book, limit.minPages - 1),
        null,
        `${trimId} ${paper}: below the minimum has no spine`,
      );
      assert.equal(
        coverSpineLabelFor(book, limit.maxPages + 1),
        null,
        `${trimId} ${paper}: above the maximum has no spine`,
      );

      // Hardcover is out of scope in v1 (D24.4): Unit 03 refuses it, and the
      // refusal becomes "no label", never an approximate number.
      assert.equal(
        coverSpineLabelFor({ ...book, binding: 'hardcover' }, count),
        null,
        `${trimId} ${paper}: hardcover has no spine label in v1`,
      );

      // A thicker book has a wider spine, at every trim.
      if (limit.maxPages > count + 100) {
        const thin = coverSpineLabelFor(book, count);
        const thick = coverSpineLabelFor(book, count + 100);
        assert.notEqual(thin, thick, `${trimId} ${paper}: more pages, wider spine`);
      }
    }
  }
}
console.log('PASS cover spine at six trims');

/* -------------------------------------------- the model is untouched -- */

console.log('\n=== actions describe a change; they never make one ===');
{
  const doc = makeDoc(30);
  const before = JSON.stringify(doc);

  addPageAt(doc, 3, 'a');
  duplicatePage(doc, 'p-1', 'b');
  deletePage(doc, 'p-1');
  reorderPage(doc, 0, 5);
  coverSpineLabelFor(doc.book, 30);

  assert.equal(JSON.stringify(doc), before, 'the Document is byte-identical afterwards');
  assert.equal(ELEMENT_KINDS.length, 11, 'sanity: the model bundle is the real one');
}
console.log('PASS purity');

console.log('\nALL PAGE ACTION TESTS PASSED');
