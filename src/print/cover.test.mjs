import assert from 'node:assert/strict';
import {
  BARCODE_H_IN,
  BARCODE_OFFSET_IN,
  BARCODE_W_IN,
  COVER_BLEED_IN,
  COVER_REFERENCE_TABLE,
  COVER_REFERENCE_TOLERANCE_IN,
  PAPER_STOCKS_INFO,
  SPINE_TEXT_MIN_PAGES,
  TRIM_IDS,
  TRIM_SIZE_IN,
  UnsupportedBindingError,
  barcodeKeepOutIn,
  coverSpecFor,
  pageCountLimitFor,
} from './print.built.mjs';

console.log('\n=== every reference row passes within 0.0005 in — the unit\'s headline test ===');
{
  assert.ok(COVER_REFERENCE_TABLE.length >= 12, 'the table holds the twelve locked rows');

  for (const row of COVER_REFERENCE_TABLE) {
    const spec = coverSpecFor(row.trimId, row.paper, row.pages);
    assert.ok(
      Math.abs(spec.spineIn - row.spineIn) <= COVER_REFERENCE_TOLERANCE_IN,
      `${row.trimId}/${row.paper}/${row.pages}: spine ${spec.spineIn} vs locked ${row.spineIn}`,
    );
    assert.ok(
      Math.abs(spec.widthIn - row.coverWidthIn) <= COVER_REFERENCE_TOLERANCE_IN,
      `${row.trimId}/${row.paper}/${row.pages}: width ${spec.widthIn} vs locked ${row.coverWidthIn}`,
    );
    assert.ok(
      Math.abs(spec.heightIn - row.coverHeightIn) <= COVER_REFERENCE_TOLERANCE_IN,
      `${row.trimId}/${row.paper}/${row.pages}: height ${spec.heightIn} vs locked ${row.coverHeightIn}`,
    );
  }

  // Spot-check the arithmetic behind the locked numbers.
  const row = COVER_REFERENCE_TABLE[0];
  assert.equal(row.trimId, '6x9');
  assert.equal(row.paper, 'bw-white');
  assert.ok(Math.abs(row.spineIn - 24 * PAPER_STOCKS_INFO['bw-white'].perPageIn) < 1e-9);
}
console.log('PASS reference table');

console.log('\n=== spine text is allowed at 79 pages or more (D8 defect 3) ===');
{
  assert.equal(SPINE_TEXT_MIN_PAGES, 79, 'the threshold is a named constant');
  assert.equal(coverSpecFor('6x9', 'bw-white', SPINE_TEXT_MIN_PAGES - 1).spineTextAllowed, false, '78 → not allowed');
  assert.equal(coverSpecFor('6x9', 'bw-white', SPINE_TEXT_MIN_PAGES).spineTextAllowed, true, '79 → allowed (legacy was off by one)');
  assert.equal(coverSpecFor('6x9', 'bw-white', SPINE_TEXT_MIN_PAGES + 1).spineTextAllowed, true, '80 → allowed');
}
console.log('PASS spine text threshold');

console.log('\n=== no +0.06 in allowance: spine is exactly pages × perPageIn ===');
{
  const spec = coverSpecFor('6x9', 'bw-white', 100);
  assert.equal(
    spec.spineIn,
    100 * PAPER_STOCKS_INFO['bw-white'].perPageIn,
    'spineIn is exactly pages × perPageIn — no +0.06 allowance (D8)',
  );
  assert.equal(coverSpecFor('6x9', 'bw-cream', 200).spineIn, 200 * PAPER_STOCKS_INFO['bw-cream'].perPageIn);
  assert.equal(coverSpecFor('a4', 'color-premium', 590).spineIn, 590 * PAPER_STOCKS_INFO['color-premium'].perPageIn);

  // And the cover envelope: bleed + trim + spine + trim + bleed.
  assert.equal(spec.widthIn, 0.125 + 6 + spec.spineIn + 6 + 0.125);
  assert.equal(spec.heightIn, 0.125 + 9 + 0.125);
  assert.equal(spec.spineLeftIn, 0.125 + 6, 'spine sits right after the back panel');
}
console.log('PASS no +0.06');

console.log('\n=== hardcover throws UnsupportedBindingError at every trim ===');
{
  for (const trimId of TRIM_IDS) {
    assert.throws(
      () => coverSpecFor(trimId, 'bw-white', 100, 'hardcover'),
      UnsupportedBindingError,
      `${trimId}: hardcover refused, not approximated`,
    );
  }
  // The error names the reason.
  assert.throws(
    () => coverSpecFor('6x9', 'bw-white', 100, 'hardcover'),
    /hardcover is not supported in v1/,
    'the message states what happened and the fix',
  );
}
console.log('PASS hardcover refusal');

console.log('\n=== barcode keep-out: inside the back cover, never crossing the spine ===');
{
  for (const trimId of TRIM_IDS) {
    const size = TRIM_SIZE_IN[trimId];
    const maxPages = pageCountLimitFor(trimId, 'bw-white').maxPages;
    for (const pages of [24, maxPages]) {
      const spec = coverSpecFor(trimId, 'bw-white', pages);
      const box = barcodeKeepOutIn(trimId);

      // The back cover panel is the left trim panel of the flat cover.
      const backLeft = COVER_BLEED_IN;
      const backRight = COVER_BLEED_IN + size.widthIn;
      const backTop = COVER_BLEED_IN;
      const backBottom = COVER_BLEED_IN + size.heightIn;

      assert.ok(box.xIn >= backLeft - 1e-9, `${trimId} p${pages}: box left inside the back cover`);
      assert.ok(box.yIn >= backTop - 1e-9, `${trimId} p${pages}: box top inside the back cover`);
      assert.ok(box.xIn + box.wIn <= backRight + 1e-9, `${trimId} p${pages}: box right inside the back cover`);
      assert.ok(box.yIn + box.hIn <= backBottom + 1e-9, `${trimId} p${pages}: box bottom inside the back cover`);

      // Never crosses the spine — at the thinnest spine (24 pages) and the
      // thickest (the trim's maximum page count).
      assert.ok(
        box.xIn + box.wIn <= spec.spineLeftIn - 1e-9,
        `${trimId} p${pages}: box clears the spine (spine ${spec.spineIn} in)`,
      );

      // Exact size and offset: 2 in × 1.2 in, 0.25 in inside the trim.
      assert.equal(box.wIn, BARCODE_W_IN);
      assert.equal(box.hIn, BARCODE_H_IN);
      assert.ok(Math.abs(box.xIn + box.wIn - (COVER_BLEED_IN + size.widthIn - BARCODE_OFFSET_IN)) < 1e-9, `${trimId} x`);
      assert.ok(Math.abs(box.yIn + box.hIn - (COVER_BLEED_IN + size.heightIn - BARCODE_OFFSET_IN)) < 1e-9, `${trimId} y`);
    }
  }
}
console.log('PASS barcode keep-out');

console.log('\nALL COVER TESTS PASSED');
