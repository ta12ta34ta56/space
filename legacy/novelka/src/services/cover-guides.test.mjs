/**
 * Cover guideline geometry — npm run test:cover-guides
 *
 * Verifies the phantom cover guidelines (RED bleed/trim boundary, BLUE spine
 * fold lines, GREEN safe-area) derive from the EXISTING cover spec
 * (calculateCover + coverZones) without ever changing it, and that the canvas
 * is already full-bleed (canvas boundary == bleed boundary).
 */
const IN = 72;

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const { calculateCover } = await import('./kdp-cover.built.mjs');
const { coverGuideGeom, coverSnapLinesX, coverSnapLinesY, rectInBleed } = await import('./cover-guides.built.mjs');

console.log('\n=== canvas is full-bleed (boundary IS the bleed boundary) ===');
{
  const spec = calculateCover(6, 9, 100, 'white', 'paperback');
  const w = spec.totalWidth;
  const h = spec.totalHeight;
  check('totalWidth = trim*2 + spine + bleed*2',
    Math.abs(w - (6 * 2 + spec.spineInches + 0.125 * 2) * IN) < 1e-9, `w=${w}`);
  check('totalHeight = trimHeight + bleed*2',
    Math.abs(h - (9 + 0.125 * 2) * IN) < 1e-9, `h=${h}`);
  check('no extra slug/offset beyond bleed (canvas==trim+bleed)',
    Math.abs((spec.bleed * 2 + 2 * spec.trimWidth + spec.spine) - w) < 1e-9);
}

console.log('\n=== phantom guideline geometry derives from the cover spec ===');
{
  const spec = calculateCover(6, 9, 100, 'white', 'paperback');
  const geom = coverGuideGeom(spec, spec.totalWidth, spec.totalHeight);
  check('scale 1 when page matches spec', geom.sx === 1 && geom.sy === 1);
  check('RED trim rectangle = canvas inset by bleed',
    Math.abs(geom.trim.left - spec.bleed) < 1e-9 &&
    Math.abs(geom.trim.top - spec.bleed) < 1e-9 &&
    Math.abs(geom.trim.width - (spec.totalWidth - spec.bleed * 2)) < 1e-9 &&
    Math.abs(geom.trim.height - (spec.totalHeight - spec.bleed * 2)) < 1e-9);
  check('BLUE spine folds at left & right spine edges',
    Math.abs(geom.spineFoldLeft - geom.spine.left) < 1e-9 &&
    Math.abs(geom.spineFoldRight - (geom.spine.left + geom.spine.width)) < 1e-9);
  check('spine sits between back and front',
    geom.spine.left === geom.back.left + geom.back.width &&
    geom.front.left === geom.spine.left + geom.spine.width);
  check('GREEN safe area is inset inside back & front panels',
    geom.safeBack.left > geom.back.left && geom.safeBack.top > geom.back.top &&
    geom.safeBack.left + geom.safeBack.width < geom.back.left + geom.back.width &&
    geom.safeFront.left > geom.front.left && geom.safeFront.top > geom.front.top);
  check('AMBER barcode box is 2" x 1.2" at the bottom-right of the back cover',
    Math.abs(geom.barcode.width - 2 * IN) < 1e-9 &&
    Math.abs(geom.barcode.height - 1.2 * IN) < 1e-9 &&
    Math.abs((geom.barcode.left + geom.barcode.width) - (geom.back.left + geom.back.width - 0.25 * IN)) < 1e-9 &&
    Math.abs((geom.barcode.top + geom.barcode.height) - (geom.back.top + geom.back.height - 0.25 * IN)) < 1e-9);
}

console.log('\n=== geometry is unchanged by the overlay (no math rewrite) ===');
{
  const spec = calculateCover(6, 9, 100, 'white', 'paperback');
  check('spine width from kdp-cover math is untouched', Math.abs(spec.spineInches - 100 * 0.002252) < 1e-9, String(spec.spineInches));
  check('bleed is 0.125in', Math.abs(spec.bleed / IN - 0.125) < 1e-9, String(spec.bleed / IN));
  const geom = coverGuideGeom(spec, spec.totalWidth, spec.totalHeight);
  check('guide bleed equals spec bleed', Math.abs(geom.bleed - spec.bleed) < 1e-9);
}

console.log('\n=== text-in-bleed guard warns only in the bleed band ===');
{
  const spec = calculateCover(6, 9, 100, 'white', 'paperback');
  const geom = coverGuideGeom(spec, spec.totalWidth, spec.totalHeight);
  const W = spec.totalWidth;
  const b = geom.bleed;

  check('text inside the trim area is safe',
    !rectInBleed(geom, { left: b + 40, top: b + 40, width: 100, height: 30 }));
  check('text crossing into the left bleed is flagged',
    rectInBleed(geom, { left: b / 2, top: b + 40, width: 100, height: 30 }));
  check('text crossing into the right bleed is flagged',
    rectInBleed(geom, { left: W - b - 50, top: b + 40, width: 100, height: 30 }));
}

console.log('\n=== magnetic snap targets cover the guideline positions ===');
{
  const spec = calculateCover(6, 9, 100, 'white', 'paperback');
  const geom = coverGuideGeom(spec, spec.totalWidth, spec.totalHeight);
  const sx = coverSnapLinesX(geom);
  const sy = coverSnapLinesY(geom);
  const near = (arr, v) => arr.some((a) => Math.abs(a - v) < 0.01);
  check('X snap includes both spine fold lines',
    near(sx, geom.spineFoldLeft) && near(sx, geom.spineFoldRight));
  check('X snap includes trim left/right edges',
    near(sx, geom.trim.left) && near(sx, geom.trim.left + geom.trim.width));
  check('X snap includes safe-area left/right edges',
    near(sx, geom.safeFront.left) && near(sx, geom.safeFront.left + geom.safeFront.width));
  check('Y snap includes trim top/bottom edges',
    near(sy, geom.trim.top) && near(sy, geom.trim.top + geom.trim.height));
  check('Y snap includes barcode top/bottom edges',
    near(sy, geom.barcode.top) && near(sy, geom.barcode.top + geom.barcode.height));
  check('X snap includes barcode left/right edges',
    near(sx, geom.barcode.left) && near(sx, geom.barcode.left + geom.barcode.width));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL COVER-GUIDE CHECKS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  process.exitCode = 1;
}
