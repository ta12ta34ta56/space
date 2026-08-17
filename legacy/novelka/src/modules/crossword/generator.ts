/**
 * Crossword generator (freeform / criss-cross).
 *
 * Pure TypeScript, no DOM — the same code runs in a worker, in the renderer and
 * in the Node test harness.
 *
 * ## Why freeform rather than dense American-style
 *
 * A dense American grid (every white cell belongs to both an across and a down
 * answer, with 180-degree symmetric blocks) can only be filled from a very large
 * curated dictionary, and even then needs backtracking over tens of thousands of
 * candidates. It also takes the clue-writing out of the author's hands.
 *
 * KDP crossword and activity books are overwhelmingly *freeform*: the author
 * supplies word + clue pairs on a theme, and the generator interlocks as many of
 * them as it can. That is what this builds, and it is honest about the words it
 * could not place.
 *
 * ## Guarantees
 *
 * - every placed word reads correctly in the finished grid
 * - crossing cells always agree on their letter
 * - no two words run side by side forming unintended letter pairs
 * - words never touch end-to-end (there is always a gap or edge)
 * - numbering follows standard crossword convention (reading order, shared
 *   numbers where an across and a down answer start in the same cell)
 */

import { cleanWord, makeRng, shuffle } from '../shared/puzzle-utils';

export type CWDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type Orientation = 'across' | 'down';

export interface ClueWord {
  /** the answer, as the author typed it */
  word: string;
  /** the clue shown to the solver */
  clue: string;
}

export interface CWProfile {
  /** how many words to aim for */
  words: number;
  /** starting grid side */
  size: number;
  label: string;
  note: string;
}

/**
 * Difficulty for a freeform crossword is about how much the solver is given:
 * grid density, word count and how much the words interlock.
 */
export const CW_PROFILES: Record<CWDifficulty, CWProfile> = {
  easy: { words: 8, size: 13, label: 'Easy', note: 'Few words, short answers, lots of space' },
  medium: { words: 12, size: 15, label: 'Medium', note: 'A balanced themed grid' },
  hard: { words: 18, size: 17, label: 'Hard', note: 'More words, tighter interlock' },
  expert: { words: 25, size: 21, label: 'Expert', note: 'Dense grid, long answers' },
};

export interface Placement {
  /** as typed by the author */
  word: string;
  /** letters actually in the grid (A-Z only) */
  clean: string;
  clue: string;
  row: number;
  col: number;
  orientation: Orientation;
  /** clue number assigned during numbering */
  number: number;
  /** cell indices (row * size + col) in order */
  cells: number[];
}

export interface CrosswordPuzzle {
  id: string;
  index: number;
  /** grid side after trimming */
  size: number;
  difficulty: CWDifficulty;
  theme?: string;
  /** row-major solution letters; null = black/empty cell */
  grid: (string | null)[];
  /** clue number for each cell, 0 = none */
  numbers: number[];
  placements: Placement[];
  across: Placement[];
  down: Placement[];
  /** words that could not be interlocked */
  unplaced: string[];
  complete: boolean;
}

export interface GenerateOptions {
  words: ClueWord[];
  difficulty: CWDifficulty;
  /** starting grid side; the generator grows it if needed */
  size?: number;
  /** cap the number of words used */
  maxWords?: number;
  theme?: string;
  seed?: number;
  /** how many full board attempts to make */
  attempts?: number;
}

// ------------------------------------------------------------------ random



// ------------------------------------------------------------------- words


/**
 * Parse an author's list into word + clue pairs.
 * Accepts `WORD: clue`, `WORD - clue`, `WORD,clue` or `WORD | clue`, one per line.
 */
export function parseClueList(raw: string): ClueWord[] {
  const out: ClueWord[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(.+?)\s*(?::|\||\s-\s|,)\s*(.+)$/);
    const word = (m ? m[1] : t).trim();
    const clue = m ? m[2].trim() : '';
    const key = cleanWord(word);
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push({ word, clue: clue || `(${key.length} letters)` });
  }
  return out;
}

// ------------------------------------------------------------------ engine

interface Board {
  size: number;
  cells: (string | null)[];
}

const idx = (r: number, c: number, size: number) => r * size + c;

function at(b: Board, r: number, c: number): string | null {
  if (r < 0 || c < 0 || r >= b.size || c >= b.size) return null;
  return b.cells[idx(r, c, b.size)];
}

/** Is this cell off the board? */
function outside(b: Board, r: number, c: number) {
  return r < 0 || c < 0 || r >= b.size || c >= b.size;
}

/**
 * Can `clean` go at (row,col) in this orientation?
 * Returns the number of crossings, or null if the placement is illegal.
 *
 * The rules that stop a freeform grid turning into nonsense:
 *  - a crossing cell must already hold the same letter
 *  - a non-crossing cell must be empty
 *  - the cells immediately before and after the word must be empty or off-board
 *    (otherwise the answer runs into a neighbouring one)
 *  - a non-crossing cell must have empty neighbours to its sides, or two words
 *    sit flush against each other and create unintended letter pairs
 */
function canPlace(
  b: Board,
  clean: string,
  row: number,
  col: number,
  o: Orientation,
): number | null {
  const dr = o === 'down' ? 1 : 0;
  const dc = o === 'across' ? 1 : 0;
  const n = clean.length;

  // must fit
  const endR = row + dr * (n - 1);
  const endC = col + dc * (n - 1);
  if (outside(b, row, col) || outside(b, endR, endC)) return null;

  // gap (or edge) before and after
  if (at(b, row - dr, col - dc) !== null) return null;
  if (at(b, endR + dr, endC + dc) !== null) return null;

  let crossings = 0;
  for (let i = 0; i < n; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cur = at(b, r, c);

    if (cur !== null) {
      if (cur !== clean[i]) return null; // conflicting letter
      crossings++;
      continue;
    }

    // empty cell: its perpendicular neighbours must also be empty, or this
    // word would run flush alongside another and create junk pairs
    if (o === 'across') {
      if (at(b, r - 1, c) !== null || at(b, r + 1, c) !== null) return null;
    } else {
      if (at(b, r, c - 1) !== null || at(b, r, c + 1) !== null) return null;
    }
  }

  // a word must actually interlock (except the very first one)
  return crossings;
}

function write(b: Board, clean: string, row: number, col: number, o: Orientation): number[] {
  const dr = o === 'down' ? 1 : 0;
  const dc = o === 'across' ? 1 : 0;
  const cells: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    b.cells[idx(r, c, b.size)] = clean[i];
    cells.push(idx(r, c, b.size));
  }
  return cells;
}

interface Candidate {
  row: number;
  col: number;
  o: Orientation;
  score: number;
}

/**
 * Best placement for a word against the current board.
 * Prefers many crossings and a position close to the centre of mass, which
 * keeps the finished grid compact rather than sprawling.
 */
function bestPlacement(
  b: Board,
  clean: string,
  placed: Placement[],
  rng: () => number,
): Candidate | null {
  let best: Candidate | null = null;
  const mid = (b.size - 1) / 2;

  for (const p of placed) {
    for (let i = 0; i < p.clean.length; i++) {
      const pr = p.row + (p.orientation === 'down' ? i : 0);
      const pc = p.col + (p.orientation === 'across' ? i : 0);
      const letter = p.clean[i];

      // cross the existing word at right angles
      const o: Orientation = p.orientation === 'across' ? 'down' : 'across';

      for (let j = 0; j < clean.length; j++) {
        if (clean[j] !== letter) continue;
        const row = o === 'down' ? pr - j : pr;
        const col = o === 'across' ? pc - j : pc;
        const cross = canPlace(b, clean, row, col, o);
        if (cross === null || cross < 1) continue;

        const cr = row + (o === 'down' ? clean.length / 2 : 0);
        const cc = col + (o === 'across' ? clean.length / 2 : 0);
        const dist = Math.abs(cr - mid) + Math.abs(cc - mid);
        // crossings dominate; centrality breaks ties; jitter avoids ruts
        const score = cross * 100 - dist * 2 + rng();
        if (!best || score > best.score) best = { row, col, o, score };
      }
    }
  }
  return best;
}

/** One full board attempt. */
function attempt(
  words: { word: string; clean: string; clue: string }[],
  size: number,
  rng: () => number,
): { board: Board; placed: Placement[]; unplaced: string[] } {
  const board: Board = { size, cells: new Array(size * size).fill(null) };
  const placed: Placement[] = [];
  const unplaced: string[] = [];

  // longest first — long answers are the hardest to fit later
  const ordered = [...words].sort((a, b2) => b2.clean.length - a.clean.length);
  if (!ordered.length) return { board, placed, unplaced };

  // Seed with one of the longest answers, chosen at random rather than always
  // the single longest. Always starting from the same word made different seeds
  // converge on the same grid, which produced duplicate puzzles inside a book.
  const longest = ordered[0].clean.length;
  const seedPool = ordered.filter((w) => w.clean.length >= longest - 1);
  const pick = Math.floor(rng() * seedPool.length);
  const first = seedPool[pick];
  const firstIdx = ordered.indexOf(first);
  if (first.clean.length > size) {
    return { board, placed, unplaced: words.map((w) => w.word) };
  }
  // vary the seed row slightly too, so the whole grid does not always grow
  // from the exact same origin
  const jitter = Math.floor(rng() * 3) - 1;
  const fRow = Math.max(1, Math.min(size - 2, Math.floor((size - 1) / 2) + jitter));
  const fCol = Math.floor((size - first.clean.length) / 2);
  placed.push({
    word: first.word,
    clean: first.clean,
    clue: first.clue,
    row: fRow,
    col: fCol,
    orientation: 'across',
    number: 0,
    cells: write(board, first.clean, fRow, fCol, 'across'),
  });

  // Repeatedly sweep the remaining words, placing whichever fits best. A word
  // that will not go now may well fit after another crossing appears, so keep
  // sweeping until a whole pass places nothing.
  const remaining = ordered.filter((_, i) => i !== firstIdx);
  let progress = true;
  while (remaining.length && progress) {
    progress = false;
    const order = shuffle([...remaining.keys()], rng);
    for (const k of order) {
      const w = remaining[k];
      if (!w) continue;
      const cand = bestPlacement(board, w.clean, placed, rng);
      if (!cand) continue;
      placed.push({
        word: w.word,
        clean: w.clean,
        clue: w.clue,
        row: cand.row,
        col: cand.col,
        orientation: cand.o,
        number: 0,
        cells: write(board, w.clean, cand.row, cand.col, cand.o),
      });
      remaining[k] = undefined as never;
      progress = true;
    }
    // compact the array
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (!remaining[i]) remaining.splice(i, 1);
    }
  }

  for (const w of remaining) unplaced.push(w.word);
  return { board, placed, unplaced };
}

/** Crop the board to its used area, returning the new board and the offset. */
function trim(board: Board, placed: Placement[]) {
  let minR = board.size, maxR = -1, minC = board.size, maxC = -1;
  for (let r = 0; r < board.size; r++) {
    for (let c = 0; c < board.size; c++) {
      if (board.cells[idx(r, c, board.size)] !== null) {
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return { board, placed, size: board.size };

  // keep it square so the printed grid stays a clean box
  const h = maxR - minR + 1;
  const w = maxC - minC + 1;
  const side = Math.max(h, w);
  const offR = minR - Math.floor((side - h) / 2);
  const offC = minC - Math.floor((side - w) / 2);

  const next: Board = { size: side, cells: new Array(side * side).fill(null) };
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++) {
      const sr = r + offR;
      const sc = c + offC;
      if (sr < 0 || sc < 0 || sr >= board.size || sc >= board.size) continue;
      next.cells[idx(r, c, side)] = board.cells[idx(sr, sc, board.size)];
    }
  }

  const moved = placed.map((p) => {
    const row = p.row - offR;
    const col = p.col - offC;
    const dr = p.orientation === 'down' ? 1 : 0;
    const dc = p.orientation === 'across' ? 1 : 0;
    return {
      ...p,
      row,
      col,
      cells: p.clean.split('').map((_, i) => idx(row + dr * i, col + dc * i, side)),
    };
  });

  return { board: next, placed: moved, size: side };
}

/**
 * Standard crossword numbering: walk the grid in reading order and number any
 * cell that begins an across answer, a down answer, or both — a cell that
 * starts both gets one shared number.
 */
function number(board: Board, placed: Placement[]) {
  const size = board.size;
  const numbers = new Array(size * size).fill(0);
  let n = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board.cells[idx(r, c, size)] === null) continue;

      const leftEmpty = c === 0 || board.cells[idx(r, c - 1, size)] === null;
      const hasRight = c + 1 < size && board.cells[idx(r, c + 1, size)] !== null;
      const upEmpty = r === 0 || board.cells[idx(r - 1, c, size)] === null;
      const hasDown = r + 1 < size && board.cells[idx(r + 1, c, size)] !== null;

      const startsAcross = leftEmpty && hasRight;
      const startsDown = upEmpty && hasDown;
      if (startsAcross || startsDown) {
        n++;
        numbers[idx(r, c, size)] = n;
      }
    }
  }

  const numbered = placed.map((p) => ({
    ...p,
    number: numbers[idx(p.row, p.col, size)] || 0,
  }));

  return { numbers, placed: numbered };
}

export function generateCrossword(
  opts: GenerateOptions,
  index = 1,
): CrosswordPuzzle {
  const profile = CW_PROFILES[opts.difficulty];
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);

  const wanted = opts.maxWords ?? profile.words;
  const words = opts.words
    .map((w) => ({ word: w.word.trim(), clean: cleanWord(w.word), clue: w.clue }))
    .filter((w) => w.clean.length >= 2)
    .slice(0, wanted);

  const longest = words.length ? Math.max(...words.map((w) => w.clean.length)) : 0;
  let size = Math.max(opts.size ?? profile.size, longest + 2, 7);

  const tries = opts.attempts ?? 24;
  let best: ReturnType<typeof attempt> | null = null;

  for (let a = 0; a < tries; a++) {
    const r = attempt(words, size, rng);
    if (!best || r.unplaced.length < best.unplaced.length) best = r;
    if (!r.unplaced.length) break;
    // grow the board periodically rather than quietly dropping answers
    if (a > 0 && a % 8 === 0) {
      size += 2;
      best = null;
    }
  }
  const result = best ?? attempt(words, size, rng);

  const cropped = trim(result.board, result.placed);
  const { numbers, placed } = number(cropped.board, cropped.placed);

  const across = placed
    .filter((p) => p.orientation === 'across')
    .sort((a, b) => a.number - b.number);
  const down = placed
    .filter((p) => p.orientation === 'down')
    .sort((a, b) => a.number - b.number);

  return {
    id: `cw-${seed.toString(36)}-${index}`,
    index,
    size: cropped.size,
    difficulty: opts.difficulty,
    theme: opts.theme,
    grid: cropped.board.cells,
    numbers,
    placements: placed,
    across,
    down,
    unplaced: result.unplaced,
    complete: result.unplaced.length === 0,
  };
}

/**
 * Check a finished puzzle really is a valid crossword.
 * Used by the test harness and worth keeping honest.
 */
export function verifyCrossword(p: CrosswordPuzzle): string[] {
  const problems: string[] = [];
  const size = p.size;
  const cell = (r: number, c: number) =>
    r < 0 || c < 0 || r >= size || c >= size ? null : p.grid[r * size + c];

  if (p.grid.length !== size * size) problems.push('grid length mismatch');

  // every placement reads correctly
  for (const pl of p.placements) {
    const read = pl.cells.map((i) => p.grid[i]).join('');
    if (read !== pl.clean) problems.push(`${pl.word}: grid reads "${read}"`);
    if (pl.cells.length !== pl.clean.length) problems.push(`${pl.word}: cell count`);
    if (pl.number < 1) problems.push(`${pl.word}: not numbered`);

    // gap before and after
    const dr = pl.orientation === 'down' ? 1 : 0;
    const dc = pl.orientation === 'across' ? 1 : 0;
    if (cell(pl.row - dr, pl.col - dc) !== null) problems.push(`${pl.word}: runs into a word before it`);
    const er = pl.row + dr * (pl.clean.length - 1);
    const ec = pl.col + dc * (pl.clean.length - 1);
    if (cell(er + dr, ec + dc) !== null) problems.push(`${pl.word}: runs into a word after it`);
  }

  // no duplicate answers
  const seen = new Set<string>();
  for (const pl of p.placements) {
    if (seen.has(pl.clean)) problems.push(`${pl.word}: placed twice`);
    seen.add(pl.clean);
  }

  // every maximal run of 2+ letters must be a real answer
  const runs = new Set<string>();
  for (const pl of p.placements) runs.add(`${pl.orientation}:${pl.row}:${pl.col}`);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cell(r, c) === null) continue;
      if ((c === 0 || cell(r, c - 1) === null) && cell(r, c + 1) !== null) {
        if (!runs.has(`across:${r}:${c}`)) problems.push(`stray across run at ${r},${c}`);
      }
      if ((r === 0 || cell(r - 1, c) === null) && cell(r + 1, c) !== null) {
        if (!runs.has(`down:${r}:${c}`)) problems.push(`stray down run at ${r},${c}`);
      }
    }
  }

  // numbering must ascend in reading order and be shared correctly
  let last = 0;
  for (let i = 0; i < p.numbers.length; i++) {
    const n = p.numbers[i];
    if (!n) continue;
    if (n !== last + 1) problems.push(`numbering jumps to ${n} after ${last}`);
    last = n;
  }

  // every numbered cell must start at least one answer
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const n = p.numbers[r * size + c];
      if (!n) continue;
      const starts = p.placements.some((pl) => pl.row === r && pl.col === c);
      if (!starts) problems.push(`number ${n} at ${r},${c} starts nothing`);
    }
  }

  // isolated single letters are a symptom of a broken placement
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cell(r, c) === null) continue;
      const connected =
        cell(r - 1, c) !== null || cell(r + 1, c) !== null ||
        cell(r, c - 1) !== null || cell(r, c + 1) !== null;
      if (!connected) problems.push(`isolated letter at ${r},${c}`);
    }
  }

  return problems;
}

/** Are all placed words reachable from the first — i.e. one connected puzzle? */
export function isConnected(p: CrosswordPuzzle): boolean {
  const size = p.size;
  const start = p.grid.findIndex((v) => v !== null);
  if (start < 0) return true;
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / size);
    const c = i % size;
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of nb) {
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      const j = nr * size + nc;
      if (p.grid[j] === null || seen.has(j)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  const filled = p.grid.reduce((n, v) => n + (v !== null ? 1 : 0), 0);
  return seen.size === filled;
}

// re-exported so tests and callers can seed a run
export { makeRng, cleanWord };
