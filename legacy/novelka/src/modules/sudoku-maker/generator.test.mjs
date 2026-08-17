/**
 * Correctness tests for the Sudoku generator.
 *
 *   npm run test:sudoku
 *
 * The non-negotiable guarantee is that EVERY generated puzzle has exactly one
 * solution. These tests prove that independently, by running a fresh solution
 * counter over the finished puzzle.
 */
import {
  generatePuzzle,
  generateSet,
  countSolutions,
  isValidSolution,
  REMOVAL_BANDS,
  cellLabel,
} from './generator.built.mjs';

let failures = 0;
const t0 = Date.now();

function check(ok, label, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

// ---------------------------------------------------------------- 4x4 & 9x9
for (const size of [4, 9]) {
  for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
    const t = Date.now();
    const set = generateSet({ size, difficulty, count: 5, seed: 12345 });
    const ms = Date.now() - t;
    const [lo, hi] = REMOVAL_BANDS[size][difficulty];

    let ok = set.length === 5;
    for (const p of set) {
      if (!isValidSolution(p.solution, size)) ok = false;
      if (countSolutions(p.puzzle, size, 2) !== 1) ok = false;
      if (p.removed < lo || p.removed > hi) ok = false;
      for (let i = 0; i < p.puzzle.length; i++) {
        if (p.puzzle[i] && p.puzzle[i] !== p.solution[i]) ok = false;
      }
    }
    check(ok, `${size}x${size} ${difficulty.padEnd(7)}`,
      `removed=${set.map((p) => p.removed).join(',')} band=${lo}-${hi} ${ms}ms`);
  }
}

// ------------------------------------------------------------------- 16x16
for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
  const t = Date.now();
  const set = generateSet({ size: 16, difficulty, count: 2, seed: 99 });
  const ms = Date.now() - t;

  let ok = set.length === 2;
  for (const p of set) {
    if (!isValidSolution(p.solution, 16)) ok = false;
    // uniqueness is required even when the difficulty target was not reached
    if (countSolutions(p.puzzle, 16, 2) !== 1) ok = false;
  }
  check(ok, `16x16 ${difficulty.padEnd(7)}`,
    `removed=${set.map((p) => p.removed).join(',')} ${(ms / 2).toFixed(0)}ms/puzzle`);
}

// ------------------------------------------------------------------- extras
const book = generateSet({ size: 9, difficulty: 'medium', count: 30, seed: 777 });
check(new Set(book.map((p) => p.solution.join())).size === 30,
  'no duplicate puzzles in one book');

const a = generatePuzzle({ size: 9, difficulty: 'hard', seed: 42 });
const b = generatePuzzle({ size: 9, difficulty: 'hard', seed: 42 });
check(a.puzzle.join() === b.puzzle.join(), 'same seed reproduces the same puzzle');

const sym = generatePuzzle({ size: 9, difficulty: 'medium', seed: 5, symmetric: true });
let symmetric = true;
for (let i = 0; i < 81; i++) {
  const mirror = 80 - i;
  if (!sym.puzzle[i] !== !sym.puzzle[mirror]) symmetric = false;
}
check(symmetric, '180-degree symmetry holds when requested');

check(cellLabel(10, 16, true) === 'A' && cellLabel(16, 16, true) === 'G',
  '16x16 hex labels (10 -> A, 16 -> G)');
check(cellLabel(12, 16, false) === '12', '16x16 numeric labels');

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURE(S)'} in ${Date.now() - t0}ms`);
process.exit(failures === 0 ? 0 : 1);
