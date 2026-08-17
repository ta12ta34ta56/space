/**
 * Word search generator tests.
 *   npm run test:wordsearch
 *
 * Bundled to generator.built.mjs by esbuild first, so the TypeScript source is
 * exercised directly.
 */
import {
  DIRECTIONS,
  WS_PROFILES,
  cleanWord,
  generateWordSearch,
  minSizeFor,
  parseWordList,
  verifyPuzzle,
} from './generator.built.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ANIMALS = [
  'ELEPHANT', 'GIRAFFE', 'DOLPHIN', 'PENGUIN', 'TIGER', 'ZEBRA', 'MONKEY',
  'RABBIT', 'HORSE', 'KANGAROO', 'LEOPARD', 'OCTOPUS', 'SQUIRREL', 'TORTOISE',
  'BUFFALO', 'CHEETAH', 'HEDGEHOG', 'FLAMINGO', 'RACCOON', 'WALRUS', 'PANDA',
  'OTTER',
];

console.log('\n=== word list parsing ===');
check('cleanWord strips punctuation', cleanWord("St. John's-Wort") === 'STJOHNSWORT');
check('cleanWord strips accents', cleanWord('café') === 'CAFE');
check('cleanWord drops digits', cleanWord('area51') === 'AREA');
{
  const list = parseWordList('cat, dog\nbird; cat\n  \nFISH');
  check('parseWordList splits and dedupes', list.length === 4, list.join('|'));
  check('parseWordList keeps original casing', list[3] === 'FISH');
}
{
  const list = parseWordList('ice cream, hot dog');
  check('parseWordList keeps multi-word entries', list[0] === 'ice cream');
  check('multi-word entries hide as one run', cleanWord(list[0]) === 'ICECREAM');
}

console.log('\n=== placement correctness ===');
for (const diff of ['easy', 'medium', 'hard', 'expert']) {
  const prof = WS_PROFILES[diff];
  for (let s = 0; s < 25; s++) {
    const p = generateWordSearch(
      {
        size: prof.size,
        words: ANIMALS.slice(0, prof.words),
        difficulty: diff,
        seed: 1000 + s,
      },
      s + 1,
    );
    const problems = verifyPuzzle(p);
    if (problems.length) {
      check(`${diff} seed ${1000 + s} verifies`, false, problems.join('; '));
      break;
    }
    if (!p.complete) {
      check(`${diff} seed ${1000 + s} placed every word`, false, `missing ${p.unplaced.join(',')}`);
      break;
    }
    if (s === 24) {
      check(`${diff}: 25 puzzles all valid and complete`, true);
    }
  }
}

console.log('\n=== direction rules ===');
{
  const p = generateWordSearch(
    { size: 12, words: ANIMALS.slice(0, 8), difficulty: 'easy', seed: 7 },
    1,
  );
  const used = new Set(p.placements.map((x) => x.direction));
  check('easy uses only E and S', [...used].every((d) => d === 'E' || d === 'S'), [...used].join(','));
}
{
  const p = generateWordSearch(
    {
      size: 14,
      words: ANIMALS.slice(0, 10),
      difficulty: 'easy',
      directions: ['SE', 'NE'],
      seed: 11,
    },
    1,
  );
  const used = new Set(p.placements.map((x) => x.direction));
  check('explicit direction override wins', [...used].every((d) => d === 'SE' || d === 'NE'), [...used].join(','));
}
{
  // Every direction vector must actually walk the grid the way it claims.
  const p = generateWordSearch(
    { size: 16, words: ANIMALS, difficulty: 'expert', seed: 42 },
    1,
  );
  let ok = true;
  for (const pl of p.placements) {
    const d = DIRECTIONS[pl.direction];
    if (d.dr !== pl.dr || d.dc !== pl.dc) ok = false;
    for (let i = 0; i < pl.clean.length; i++) {
      const r = pl.row + pl.dr * i;
      const c = pl.col + pl.dc * i;
      if (r < 0 || c < 0 || r >= p.size || c >= p.size) ok = false;
      if (p.grid[r * p.size + c] !== pl.clean[i]) ok = false;
    }
  }
  check('placement vectors match the grid contents', ok);
}

console.log('\n=== grid integrity ===');
{
  const p = generateWordSearch(
    { size: 15, words: ANIMALS, difficulty: 'hard', seed: 99 },
    1,
  );
  check('grid is fully filled', p.grid.every((c) => /^[A-Z]$/.test(c)));
  check('grid length is size^2', p.grid.length === p.size * p.size);
  const dupes = new Set();
  let hasDupe = false;
  for (const pl of p.placements) {
    if (dupes.has(pl.clean)) hasDupe = true;
    dupes.add(pl.clean);
  }
  check('no word placed twice', !hasDupe);
}

console.log('\n=== auto-grow instead of dropping words ===');
{
  // A 6x6 board cannot hold ELEPHANT; the generator must grow, not fail.
  const p = generateWordSearch(
    { size: 6, words: ANIMALS.slice(0, 12), difficulty: 'medium', seed: 3 },
    1,
  );
  check('grid grew past the long word', p.size >= 8, `size=${p.size}`);
  check('grown grid still verifies', verifyPuzzle(p).length === 0);
}
{
  const p = generateWordSearch(
    { size: 5, words: ['EXTRAORDINARILY'], difficulty: 'easy', seed: 5 },
    1,
  );
  check('single very long word forces a big grid', p.size >= 15, `size=${p.size}`);
  check('long word was placed', p.complete);
}

console.log('\n=== secret message ===');
{
  const p = generateWordSearch(
    {
      size: 13,
      words: ANIMALS.slice(0, 10),
      difficulty: 'medium',
      secretMessage: 'HIDDEN MESSAGE HERE',
      seed: 21,
    },
    1,
  );
  const used = new Set(p.placements.flatMap((x) => x.cells));
  const leftover = [];
  for (let i = 0; i < p.grid.length; i++) if (!used.has(i)) leftover.push(p.grid[i]);
  const msg = cleanWord('HIDDEN MESSAGE HERE');
  check(
    'secret reads out of the leftover cells',
    leftover.join('').startsWith(msg),
    leftover.join('').slice(0, 30),
  );
  check('secret is reported', p.secret === 'HIDDEN MESSAGE HERE');
}

console.log('\n=== determinism ===');
{
  const a = generateWordSearch({ size: 13, words: ANIMALS, difficulty: 'hard', seed: 777 }, 1);
  const b = generateWordSearch({ size: 13, words: ANIMALS, difficulty: 'hard', seed: 777 }, 1);
  check('same seed gives the same grid', a.grid.join('') === b.grid.join(''));
  const c = generateWordSearch({ size: 13, words: ANIMALS, difficulty: 'hard', seed: 778 }, 1);
  check('different seed gives a different grid', a.grid.join('') !== c.grid.join(''));
}

console.log('\n=== no duplicate puzzles across a book ===');
{
  const grids = new Set();
  for (let i = 0; i < 50; i++) {
    const p = generateWordSearch(
      { size: 13, words: ANIMALS.slice(0, 14), difficulty: 'medium', seed: 5000 + i * 7919 },
      i + 1,
    );
    grids.add(p.grid.join(''));
  }
  check('50 puzzles are all distinct', grids.size === 50, `${grids.size}/50`);
}

console.log('\n=== helpers ===');
check('minSizeFor respects the longest word', minSizeFor(['EXTRAORDINARILY']) >= 15);
check('minSizeFor scales with letter count', minSizeFor(ANIMALS) >= 12, String(minSizeFor(ANIMALS)));

console.log('\n=== performance ===');
{
  const t0 = Date.now();
  const N = 60;
  for (let i = 0; i < N; i++) {
    generateWordSearch(
      { size: 18, words: ANIMALS, difficulty: 'expert', seed: 9000 + i },
      i + 1,
    );
  }
  const ms = (Date.now() - t0) / N;
  console.log(`  18x18 expert, 22 words: ${ms.toFixed(1)}ms average`);
  check('expert generation is under 120ms per puzzle', ms < 120, `${ms.toFixed(1)}ms`);
}
{
  const t0 = Date.now();
  const N = 40;
  for (let i = 0; i < N; i++) {
    generateWordSearch(
      { size: 25, words: [...ANIMALS, ...ANIMALS.map((w) => w.split('').reverse().join(''))], difficulty: 'expert', seed: i },
      i + 1,
    );
  }
  const ms = (Date.now() - t0) / N;
  console.log(`  25x25, 44 words:        ${ms.toFixed(1)}ms average`);
  check('big grids stay under 400ms', ms < 400, `${ms.toFixed(1)}ms`);
}

console.log(`\n${'-'.repeat(46)}`);
if (fail === 0) {
  console.log(`ALL TESTS PASSED  (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
