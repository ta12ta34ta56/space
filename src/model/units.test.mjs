import assert from 'node:assert/strict';
import { PT_PER_IN, UnitError, inToPt, inToPx, ptToIn, pxToIn, roundIn } from './units.built.mjs';

function throwsUnitError(fn, what) {
  assert.throws(fn, (error) => error instanceof UnitError && error.name === 'UnitError', what);
}

console.log('\n=== inches <-> points ===');
{
  assert.equal(PT_PER_IN, 72);
  assert.equal(inToPt(1), 72);
  assert.equal(ptToIn(72), 1);
  assert.equal(inToPt(0), 0);
  assert.equal(ptToIn(0), 0);
  assert.equal(inToPt(-0.5), -36);
  assert.equal(ptToIn(-36), -0.5);
  assert.equal(inToPt(6), 432);
  assert.equal(inToPt(0.375), 27);
}
console.log('PASS inches <-> points');

console.log('\n=== round-trips hold to 4 dp ===');
{
  for (const inches of [0.125, 0.375, 6, 8.27]) {
    assert.equal(roundIn(ptToIn(inToPt(inches))), inches, `pt round-trip at ${inches} in`);
  }
  // The trims and the bleed, the values that actually get printed.
  for (const inches of [5.5, 8.5, 7, 10, 8, 11, 9, 11.69, 0.125, 0.625]) {
    assert.equal(roundIn(ptToIn(inToPt(inches))), inches, `pt round-trip at ${inches} in`);
  }
}
console.log('PASS round-trips');

console.log('\n=== inches <-> pixels ===');
{
  assert.equal(inToPx(1, 96), 96);
  assert.equal(pxToIn(96, 96), 1);
  for (const scale of [1, 2, 3.5]) {
    for (const inches of [0.125, 0.375, 6, 8.27]) {
      assert.equal(
        roundIn(pxToIn(inToPx(inches, scale), scale)),
        inches,
        `px round-trip at ${inches} in, scale ${scale}`,
      );
    }
  }
}
console.log('PASS inches <-> pixels');

console.log('\n=== roundIn kills float drift ===');
{
  assert.equal(roundIn(0.1 + 0.2), 0.3);
  assert.equal(roundIn(1 / 3), 0.3333);
  assert.equal(roundIn(8.269999999), 8.27);
  assert.equal(roundIn(-0.12344), -0.1234);
  assert.equal(roundIn(0), 0);
}
console.log('PASS roundIn');

console.log('\n=== non-finite input throws, never returns NaN ===');
{
  const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined, null, '6', {}, []];
  for (const value of bad) {
    throwsUnitError(() => inToPt(value), `inToPt(${String(value)})`);
    throwsUnitError(() => ptToIn(value), `ptToIn(${String(value)})`);
    throwsUnitError(() => roundIn(value), `roundIn(${String(value)})`);
    throwsUnitError(() => inToPx(value, 2), `inToPx(${String(value)}, 2)`);
    throwsUnitError(() => inToPx(2, value), `inToPx(2, ${String(value)})`);
    throwsUnitError(() => pxToIn(value, 2), `pxToIn(${String(value)}, 2)`);
    throwsUnitError(() => pxToIn(2, value), `pxToIn(2, ${String(value)})`);
  }

  // A zero scale would divide to Infinity. It must be reported, not propagated.
  throwsUnitError(() => pxToIn(10, 0), 'pxToIn(10, 0)');

  // The message names the function and the argument.
  assert.throws(
    () => inToPt(Number.NaN),
    /inToPt: inches must be a finite number/,
    'the error says which function and which argument',
  );
}
console.log('PASS non-finite input');

console.log('\nALL UNITS TESTS PASSED');
