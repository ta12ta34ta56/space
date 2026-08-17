import assert from 'node:assert/strict';
import { computeCanvasDimensions, pixelScaleFor } from './resolution.built.mjs';

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

/* --------------------------------------------------- 2x supersample below cap -- */

console.log('\n=== 2x supersample applied below the cap ===');
{
  const res1 = pixelScaleFor({ cssW: 500, cssH: 500, dpr: 1 });
  check('dpr 1 supersamples 2x', res1.supersample === 2 && res1.pixelScale === 2);

  const res2 = pixelScaleFor({ cssW: 600, cssH: 900, dpr: 2 });
  // 900 * 2 * 2 = 3600 <= 4096 -> ss = 2, pixelScale = 4
  check('dpr 2 supersamples 2x when long side fits in 4096', res2.supersample === 2 && res2.pixelScale === 4);

  const res3 = pixelScaleFor({ cssW: 432, cssH: 648, dpr: 1.5 });
  // 648 * 1.5 * 2 = 1944 <= 4096 -> ss = 2, pixelScale = 3
  check('fractional dpr 1.5 supersamples 2x', res3.supersample === 2 && res3.pixelScale === 3);
}

/* ---------------------------------------------------- cap engages at 4096px -- */

console.log('\n=== the cap engages: a 3000x3000 CSS page at dpr 2 yields a long side of exactly 4096 ===');
{
  const res = pixelScaleFor({ cssW: 3000, cssH: 3000, dpr: 2 });
  // 3000 * 2 * 2 = 12000 > 4096 -> ss = 4096 / (3000 * 2) = 4096 / 6000
  // pixelScale = 2 * (4096 / 6000) = 4096 / 3000
  // longSide = 3000 * pixelScale = 4096
  const resultingLongSide = Math.round(3000 * res.pixelScale);
  check('cap engages at 4096 on 3000x3000 at dpr 2', resultingLongSide === 4096, `got ${resultingLongSide}`);
  check('supersample is scaled down below 2', res.supersample < 2);
}

/* ------------------------------------------------ pixelScale never below 1 -- */

console.log('\n=== pixelScale never drops below 1 ===');
{
  const huge1 = pixelScaleFor({ cssW: 10000, cssH: 10000, dpr: 1 });
  check('huge page at dpr 1 has pixelScale >= 1', huge1.pixelScale >= 1, `got ${huge1.pixelScale}`);

  const huge2 = pixelScaleFor({ cssW: 8000, cssH: 12000, dpr: 2 });
  check('huge page at dpr 2 has pixelScale >= 1', huge2.pixelScale >= 1, `got ${huge2.pixelScale}`);

  const huge3 = pixelScaleFor({ cssW: 5000, cssH: 5000, dpr: 0.5 });
  check('dpr below 1 is clamped and pixelScale >= 1', huge3.pixelScale >= 1, `got ${huge3.pixelScale}`);
}

/* -------------------------------------------------- integer CSS dimensions -- */

console.log('\n=== dpr 1, 2, 3 and fractional 1.5 all produce integer CSS dimensions ===');
{
  const dprs = [1, 1.5, 2, 3];
  const zooms = [0.5, 0.73, 1, 1.37, 1.73, 2];

  for (const dpr of dprs) {
    for (const zoom of zooms) {
      const dims = computeCanvasDimensions({
        widthIn: 6,
        heightIn: 9,
        zoom,
        dpr,
      });
      assert.equal(Number.isInteger(dims.cssW), true, `cssW must be integer for dpr ${dpr} zoom ${zoom}`);
      assert.equal(Number.isInteger(dims.cssH), true, `cssH must be integer for dpr ${dpr} zoom ${zoom}`);
      assert.ok(dims.pixelScale >= 1, `pixelScale >= 1 for dpr ${dpr} zoom ${zoom}`);
    }
  }
  check('all tested dpr and fractional zooms produce integer CSS dimensions', true);
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL RESOLUTION TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
