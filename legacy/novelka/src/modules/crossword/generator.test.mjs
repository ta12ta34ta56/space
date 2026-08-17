/**
 * Crossword generator tests.
 *   npm run test:crossword
 *
 * Bundled to generator.built.mjs by esbuild first, so the TypeScript source is
 * exercised directly.
 */
import {
  CW_PROFILES,
  cleanWord,
  generateCrossword,
  isConnected,
  parseClueList,
  verifyCrossword,
} from './generator.built.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const ANIMALS = [
  ['ELEPHANT', 'Largest land mammal'],
  ['GIRAFFE', 'Tallest animal'],
  ['DOLPHIN', 'Clever sea mammal'],
  ['PENGUIN', 'Flightless polar bird'],
  ['TIGER', 'Striped big cat'],
  ['ZEBRA', 'Stripy horse relative'],
  ['MONKEY', 'Swinging primate'],
  ['RABBIT', 'Long-eared hopper'],
  ['HORSE', 'Ridden animal'],
  ['LEOPARD', 'Spotted big cat'],
  ['OCTOPUS', 'Eight-armed sea creature'],
  ['TORTOISE', 'Slow shelled reptile'],
  ['CHEETAH', 'Fastest land animal'],
  ['FLAMINGO', 'Pink wading bird'],
  ['WALRUS', 'Tusked sea mammal'],
  ['PANDA', 'Bamboo-eating bear'],
  ['OTTER', 'Playful river mammal'],
  ['BADGER', 'Striped burrower'],
  ['LIZARD', 'Scaly basker'],
  ['CAMEL', 'Desert humped animal'],
  ['FALCON', 'Fast bird of prey'],
  ['BUFFALO', 'Large wild bovine'],
  ['RACCOON', 'Masked night raider'],
  ['HEDGEHOG', 'Spiny garden visitor'],
  ['SQUIRREL', 'Nut-burying climber'],
].map(([word, clue]) => ({ word, clue }));

console.log('\n=== clue list parsing ===');
{
  const list = parseClueList(
    'ELEPHANT: Largest land mammal\nTIGER - Striped big cat\nZEBRA | Stripy\nHORSE,Ridden animal\nPANDA',
  );
  check('parses colon form', list[0].word === 'ELEPHANT' && list[0].clue === 'Largest land mammal');
  check('parses dash form', list[1].word === 'TIGER' && list[1].clue === 'Striped big cat');
  check('parses pipe form', list[2].word === 'ZEBRA' && list[2].clue === 'Stripy');
  check('parses comma form', list[3].word === 'HORSE' && list[3].clue === 'Ridden animal');
  check('word with no clue still accepted', list[4].word === 'PANDA' && list[4].clue.length > 0);
  check('five entries parsed', list.length === 5, String(list.length));
}
{
  const list = parseClueList('CAT: feline\ncat: duplicate\n\n  \nDOG: canine');
  check('duplicates dropped', list.length === 2, JSON.stringify(list.map((l) => l.word)));
}
check('cleanWord strips accents and punctuation', cleanWord("St. Bernard's") === 'STBERNARDS');

console.log('\n=== structural validity ===');
for (const diff of ['easy', 'medium', 'hard', 'expert']) {
  const prof = CW_PROFILES[diff];
  let worst = null;
  let allOk = true;
  for (let s = 0; s < 25; s++) {
    const p = generateCrossword(
      { words: ANIMALS, difficulty: diff, seed: 2000 + s, maxWords: prof.words },
      s + 1,
    );
    const problems = verifyCrossword(p);
    if (problems.length) {
      check(`${diff} seed ${2000 + s} is a valid crossword`, false, problems.slice(0, 3).join('; '));
      allOk = false;
      break;
    }
    if (!isConnected(p)) {
      check(`${diff} seed ${2000 + s} is fully connected`, false);
      allOk = false;
      break;
    }
    const placedPct = p.placements.length / Math.min(prof.words, ANIMALS.length);
    if (worst === null || placedPct < worst) worst = placedPct;
  }
  if (allOk) {
    check(`${diff}: 25 puzzles all structurally valid and connected`, true);
    check(
      `${diff}: always interlocks at least 70% of the words`,
      worst >= 0.7,
      `worst was ${Math.round(worst * 100)}%`,
    );
  }
}

console.log('\n=== crossing letters agree ===');
{
  const p = generateCrossword({ words: ANIMALS, difficulty: 'hard', seed: 55 }, 1);
  let ok = true;
  for (const a of p.placements) {
    for (const b of p.placements) {
      if (a === b || a.orientation === b.orientation) continue;
      const shared = a.cells.filter((c) => b.cells.includes(c));
      for (const cellIdx of shared) {
        const ai = a.cells.indexOf(cellIdx);
        const bi = b.cells.indexOf(cellIdx);
        if (a.clean[ai] !== b.clean[bi]) ok = false;
        if (p.grid[cellIdx] !== a.clean[ai]) ok = false;
      }
    }
  }
  check('every crossing agrees with both answers and the grid', ok);
}

console.log('\n=== no accidental adjacency ===');
{
  // Any two-letter-or-longer run in the grid must be a declared answer;
  // verifyCrossword checks this, so hammer it across many seeds.
  let bad = 0;
  for (let s = 0; s < 40; s++) {
    const p = generateCrossword({ words: ANIMALS, difficulty: 'expert', seed: 7000 + s }, s + 1);
    if (verifyCrossword(p).some((x) => x.startsWith('stray'))) bad++;
  }
  check('40 dense puzzles contain no stray runs', bad === 0, `${bad} had strays`);
}

console.log('\n=== numbering convention ===');
{
  const p = generateCrossword({ words: ANIMALS, difficulty: 'medium', seed: 123 }, 1);
  const size = p.size;

  // numbers ascend in reading order with no gaps
  const seq = [];
  for (let i = 0; i < p.numbers.length; i++) if (p.numbers[i]) seq.push(p.numbers[i]);
  const ascending = seq.every((n, i) => n === i + 1);
  check('numbers run 1..n in reading order', ascending, seq.slice(0, 12).join(','));

  // a cell starting both an across and a down shares one number
  let shared = 0;
  for (const a of p.across) {
    for (const d of p.down) {
      if (a.row === d.row && a.col === d.col) {
        if (a.number !== d.number) {
          check('shared start cell shares its number', false, `${a.word}/${d.word}`);
        }
        shared++;
      }
    }
  }
  check(`shared start cells use one number (${shared} found)`, true);

  // every answer's number matches the grid cell it starts on
  const match = p.placements.every((pl) => p.numbers[pl.row * size + pl.col] === pl.number);
  check('each answer number matches its start cell', match);

  // across and down lists are sorted
  check('across list sorted by number', p.across.every((x, i, arr) => i === 0 || arr[i - 1].number <= x.number));
  check('down list sorted by number', p.down.every((x, i, arr) => i === 0 || arr[i - 1].number <= x.number));
}

console.log('\n=== clues survive ===');
{
  const p = generateCrossword({ words: ANIMALS, difficulty: 'medium', seed: 9 }, 1);
  const withClue = p.placements.every((pl) => pl.clue && pl.clue.length > 0);
  check('every placed answer keeps its clue', withClue);
  const correct = p.placements.every((pl) => {
    const src = ANIMALS.find((a) => cleanWord(a.word) === pl.clean);
    return src && src.clue === pl.clue;
  });
  check('clues stay attached to the right answers', correct);
  check('across + down covers every placement',
    p.across.length + p.down.length === p.placements.length);
}

console.log('\n=== grid is trimmed and square ===');
{
  for (const diff of ['easy', 'medium', 'hard']) {
    const p = generateCrossword({ words: ANIMALS, difficulty: diff, seed: 31 }, 1);
    const size = p.size;
    // no fully empty edge row or column — the grid should be cropped tight
    const rowUsed = (r) => Array.from({ length: size }, (_, c) => p.grid[r * size + c]).some((v) => v !== null);
    const colUsed = (c) => Array.from({ length: size }, (_, r) => p.grid[r * size + c]).some((v) => v !== null);
    const tight = (rowUsed(0) || colUsed(0)) && (rowUsed(size - 1) || colUsed(size - 1));
    check(`${diff}: grid cropped to content (${size}x${size})`, tight);
    check(`${diff}: grid is square`, p.grid.length === size * size);
  }
}

console.log('\n=== auto-grow rather than drop answers ===');
{
  // A tiny board cannot hold these; the generator must grow it.
  const p = generateCrossword(
    { words: ANIMALS.slice(0, 10), difficulty: 'easy', size: 6, seed: 3 },
    1,
  );
  check('board grew past the longest answer', p.size >= 8, `size=${p.size}`);
  check('grown board still valid', verifyCrossword(p).length === 0);
}

console.log('\n=== unplaced words are reported honestly ===');
{
  // Words sharing no letters cannot interlock — they must be reported, not lost.
  const odd = [
    { word: 'AAAA', clue: 'a' },
    { word: 'BBBB', clue: 'b' },
    { word: 'CCCC', clue: 'c' },
  ];
  const p = generateCrossword({ words: odd, difficulty: 'easy', seed: 4 }, 1);
  const accounted = p.placements.length + p.unplaced.length;
  check('every input word is either placed or reported', accounted === odd.length,
    `placed ${p.placements.length}, unplaced ${p.unplaced.length}`);
  check('complete flag matches', p.complete === (p.unplaced.length === 0));
  check('no stray runs even with impossible input', verifyCrossword(p).length === 0);
}

console.log('\n=== determinism ===');
{
  const a = generateCrossword({ words: ANIMALS, difficulty: 'hard', seed: 4242 }, 1);
  const b = generateCrossword({ words: ANIMALS, difficulty: 'hard', seed: 4242 }, 1);
  check('same seed gives the same grid', a.grid.join('|') === b.grid.join('|'));
  const c = generateCrossword({ words: ANIMALS, difficulty: 'hard', seed: 4243 }, 1);
  check('different seed gives a different grid', a.grid.join('|') !== c.grid.join('|'));
}

console.log('\n=== distinct puzzles across a book ===');
{
  const grids = new Set();
  for (let i = 0; i < 30; i++) {
    const p = generateCrossword(
      { words: ANIMALS, difficulty: 'medium', seed: 6000 + i * 7919 },
      i + 1,
    );
    grids.add(p.grid.join('|'));
  }
  check('30 puzzles are all distinct', grids.size === 30, `${grids.size}/30`);
}

console.log('\n=== performance ===');
{
  const t0 = Date.now();
  const N = 30;
  let placedTotal = 0;
  for (let i = 0; i < N; i++) {
    const p = generateCrossword({ words: ANIMALS, difficulty: 'expert', seed: 500 + i }, i + 1);
    placedTotal += p.placements.length;
  }
  const ms = (Date.now() - t0) / N;
  console.log(`  expert, 25 words: ${ms.toFixed(1)}ms average, ${(placedTotal / N).toFixed(1)} words placed`);
  check('expert generation under 400ms per puzzle', ms < 400, `${ms.toFixed(1)}ms`);
  check('expert places 18+ words on average', placedTotal / N >= 18, `${(placedTotal / N).toFixed(1)}`);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL TESTS PASSED  (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
