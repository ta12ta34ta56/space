import assert from 'node:assert/strict';
import {
  BLEED_IN,
  GUTTER_BY_PAGE_COUNT,
  KDP_MIN_PAGE_COUNT,
  OUTER_MARGIN_MIN_IN,
  OUTER_MARGIN_SAFE_IN,
  OUTER_MARGIN_WITH_BLEED_MIN_IN,
  TRIM_IDS,
  TRIM_SIZE_IN,
  gutterBandFor,
  gutterInchesFor,
  kdpMarginsFor,
  pageCountLimitFor,
  printedPageCount,
  safeAreaFor,
} from './print.built.mjs';
import {
  BLEED_IN as LEGACY_BLEED_IN,
  GUTTER_BY_PAGE_COUNT as LEGACY_GUTTER_BY_PAGE_COUNT,
  KDP_MIN_PAGE_COUNT as LEGACY_KDP_MIN_PAGE_COUNT,
  OUTER_MARGIN_MIN_IN as LEGACY_OUTER_MARGIN_MIN_IN,
  OUTER_MARGIN_SAFE_IN as LEGACY_OUTER_MARGIN_SAFE_IN,
  OUTER_MARGIN_WITH_BLEED_MIN_IN as LEGACY_OUTER_MARGIN_WITH_BLEED_MIN_IN,
  gutterInchesFor as legacyGutterInchesFor,
  kdpMarginsFor as legacyKdpMarginsFor,
  safeAreaFor as legacySafeAreaFor,
} from '../../legacy/novelka/src/services/kdp.built.mjs';

/** Points tolerance for comparing the port against the legacy bundle. */
const PT_EPSILON = 1e-6;

console.log('\n=== gutter band boundaries ===');
{
  const bands = [
    [150, 0.375],
    [151, 0.5],
    [300, 0.5],
    [301, 0.625],
    [500, 0.625],
    [501, 0.75],
    [700, 0.75],
    [701, 0.875],
    [828, 0.875],
  ];
  for (const [count, expected] of bands) {
    assert.equal(gutterInchesFor(count), expected, `gutterInchesFor(${count})`);
  }

  assert.deepEqual(gutterBandFor(150), { maxPages: 150, gutterIn: 0.375 });
  assert.deepEqual(gutterBandFor(301), { maxPages: 500, gutterIn: 0.625 });
  assert.deepEqual(gutterBandFor(828), { maxPages: 828, gutterIn: 0.875 });
  // A count past every band keeps the widest band — the honest fallback.
  assert.deepEqual(gutterBandFor(900), { maxPages: 828, gutterIn: 0.875 });
}
console.log('PASS gutter bands');

console.log('\n=== printed page count rounds up to even, as KDP requires ===');
{
  assert.equal(printedPageCount(23), 24);
  assert.equal(printedPageCount(24), 24);
  assert.equal(printedPageCount(25), 26);
  assert.equal(printedPageCount(0), 0);
  assert.equal(printedPageCount(151), 152);
}

console.log('\n=== recto pages put the gutter on the LEFT; verso on the right ===');
{
  // 301 pages → gutter 0.625 in; safe outer 0.375 in.
  const recto = safeAreaFor('6x9', 'bw-white', 301, 1);
  const verso = safeAreaFor('6x9', 'bw-white', 301, 2);

  assert.equal(recto.isRecto, true);
  assert.equal(verso.isRecto, false);
  assert.equal(recto.xIn, 0.625, 'recto: the gutter is on the LEFT');
  assert.equal(verso.xIn, 0.375, 'verso: the outer margin is on the left');
  assert.equal(recto.xIn + recto.wIn, 6 - 0.375, 'recto: the right edge is the outer margin');
  assert.equal(verso.xIn + verso.wIn, 6 - 0.625, 'verso: the right edge is the gutter');
  assert.equal(recto.wIn, verso.wIn, 'the usable width is the same either way');
}
console.log('PASS recto/verso');

console.log('\n=== safe area is inside the trim on all four sides, every trim × every band ===');
{
  const bands = [24, 150, 151, 300, 301, 500, 501, 700, 701, 828];
  for (const trimId of TRIM_IDS) {
    const size = TRIM_SIZE_IN[trimId];
    const max = pageCountLimitFor(trimId, 'bw-white').maxPages;
    for (const band of bands) {
      const pageCount = Math.min(band, max); // 8.5x11 caps at 590, a4 at 780
      for (const pageNumber of [1, 2]) {
        const safe = safeAreaFor(trimId, 'bw-white', pageCount, pageNumber);
        assert.ok(safe.xIn >= 0 && safe.yIn >= 0, `${trimId} ${pageCount} p${pageNumber}: origin not negative`);
        assert.ok(safe.wIn > 0 && safe.hIn > 0, `${trimId} ${pageCount} p${pageNumber}: has positive size`);
        assert.ok(
          safe.xIn + safe.wIn <= size.widthIn + 1e-9,
          `${trimId} ${pageCount} p${pageNumber}: right edge inside the trim`,
        );
        assert.ok(
          safe.yIn + safe.hIn <= size.heightIn + 1e-9,
          `${trimId} ${pageCount} p${pageNumber}: bottom edge inside the trim`,
        );
      }
    }
  }
}
console.log('PASS safe area inside trim');

console.log('\n=== bleed shifts the outer minimum to 0.375 in ===');
{
  const minimum = kdpMarginsFor(100, { intent: 'minimum' });
  assert.equal(minimum.outerIn, 0.25);
  assert.equal(minimum.topIn, 0.25);
  assert.equal(minimum.bottomIn, 0.25);

  const withBleed = kdpMarginsFor(100, { bleed: true, intent: 'minimum' });
  assert.equal(withBleed.outerIn, 0.375, 'bleed widens the outer margin to 0.375');
  assert.equal(withBleed.topIn, 0.375);
  assert.equal(withBleed.bottomIn, 0.375);
  assert.equal(withBleed.bleedIn, 0.125);

  const safe = kdpMarginsFor(100, { intent: 'safe' });
  assert.equal(safe.outerIn, 0.375, 'the safe intent already sits at 0.375');

  assert.equal(BLEED_IN, 0.125);
  assert.equal(OUTER_MARGIN_MIN_IN, 0.25);
  assert.equal(OUTER_MARGIN_SAFE_IN, 0.375);
  assert.equal(OUTER_MARGIN_WITH_BLEED_MIN_IN, 0.375);
  assert.equal(KDP_MIN_PAGE_COUNT, 24);
}
console.log('PASS bleed');

console.log('\n=== ported values match the legacy kdp.ts for the same inputs ===');
{
  // Constants.
  assert.equal(BLEED_IN, LEGACY_BLEED_IN);
  assert.equal(OUTER_MARGIN_MIN_IN, LEGACY_OUTER_MARGIN_MIN_IN);
  assert.equal(OUTER_MARGIN_SAFE_IN, LEGACY_OUTER_MARGIN_SAFE_IN);
  assert.equal(OUTER_MARGIN_WITH_BLEED_MIN_IN, LEGACY_OUTER_MARGIN_WITH_BLEED_MIN_IN);
  assert.equal(KDP_MIN_PAGE_COUNT, LEGACY_KDP_MIN_PAGE_COUNT);

  // Gutter bands — same boundaries, same widths.
  assert.deepEqual(
    GUTTER_BY_PAGE_COUNT.map((band) => [band.maxPages, band.gutterIn]),
    LEGACY_GUTTER_BY_PAGE_COUNT.map((band) => [band.max, band.inches]),
    'the band table is the legacy table verbatim',
  );
  for (const count of [24, 150, 151, 300, 301, 500, 501, 700, 701, 828]) {
    assert.equal(gutterInchesFor(count), legacyGutterInchesFor(count), `gutterInchesFor(${count})`);
  }

  // Margins, across intents and bleed.
  for (const count of [24, 100, 150, 300, 500, 700, 828]) {
    for (const options of [
      { intent: 'safe' },
      { intent: 'minimum' },
      { bleed: true, intent: 'safe' },
      { bleed: true, intent: 'minimum' },
    ]) {
      const mine = kdpMarginsFor(count, options);
      const theirs = legacyKdpMarginsFor(count, options);
      assert.equal(mine.gutterIn * 72, theirs.gutter, `gutter ${count}`);
      assert.equal(mine.outerIn * 72, theirs.outer, `outer ${count} ${JSON.stringify(options)}`);
      assert.equal(mine.topIn * 72, theirs.top, `top ${count}`);
      assert.equal(mine.bottomIn * 72, theirs.bottom, `bottom ${count}`);
      assert.equal(mine.bleedIn * 72, theirs.bleed, `bleed ${count}`);
    }
  }

  // Safe area — recto and verso, all trims, all bands.
  for (const trimId of TRIM_IDS) {
    const size = TRIM_SIZE_IN[trimId];
    const max = pageCountLimitFor(trimId, 'bw-white').maxPages;
    for (const count of [24, 150, 300, 500, 700, 828]) {
      if (count > max) continue;
      for (const pageNumber of [1, 2, 3, 4]) {
        const options = { intent: 'safe' };
        const mine = safeAreaFor(trimId, 'bw-white', count, pageNumber, options);
        const theirs = legacySafeAreaFor(
          size.widthIn * 72,
          size.heightIn * 72,
          pageNumber,
          legacyKdpMarginsFor(count, options),
        );
        assert.ok(Math.abs(mine.xIn * 72 - theirs.left) < PT_EPSILON, `x ${trimId} ${count} p${pageNumber}`);
        assert.ok(Math.abs(mine.yIn * 72 - theirs.top) < PT_EPSILON, `y ${trimId} ${count} p${pageNumber}`);
        assert.ok(Math.abs(mine.wIn * 72 - theirs.width) < PT_EPSILON, `w ${trimId} ${count} p${pageNumber}`);
        assert.ok(Math.abs(mine.hIn * 72 - theirs.height) < PT_EPSILON, `h ${trimId} ${count} p${pageNumber}`);
        assert.equal(mine.isRecto, theirs.isRecto, `recto ${trimId} ${count} p${pageNumber}`);
      }
    }
  }
}
console.log('PASS ported values match legacy');

console.log('\nALL MARGINS TESTS PASSED');
