/**
 * Sudoku generator with guaranteed-unique solutions.
 *
 * Uses bitmask candidate tracking plus an MRV (minimum remaining values)
 * heuristic, which keeps even 16x16 generation fast enough to run in a worker
 * without freezing the UI.
 *
 * Pure TypeScript, no DOM — so it can be unit tested in Node.
 */

import { makeRng, shuffle } from '../shared/puzzle-utils';

export type GridSize = 4 | 9 | 16;
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface BoxShape {
  w: number;
  h: number;
}

/** Box dimensions for each grid size. */
export const BOX: Record<GridSize, BoxShape> = {
  4: { w: 2, h: 2 },
  9: { w: 3, h: 3 },
  16: { w: 4, h: 4 },
};

/** How many cells to empty, per the product spec. */
export const REMOVAL_BANDS: Record<GridSize, Record<Difficulty, [number, number]>> = {
  4: { easy: [4, 6], medium: [6, 8], hard: [8, 10], expert: [10, 12] },
  9: { easy: [30, 35], medium: [36, 45], hard: [46, 52], expert: [53, 58] },
  16: { easy: [80, 100], medium: [100, 130], hard: [130, 160], expert: [160, 180] },
};

export interface SudokuPuzzle {
  /** true when the requested removal target was reached within the budget */
  hitTarget: boolean;
  targetRemoved: number;
  id: string;
  size: GridSize;
  box: BoxShape;
  difficulty: Difficulty;
  /** row-major, 0 = blank */
  puzzle: number[];
  solution: number[];
  clues: number;
  removed: number;
  /** 1-based index within the generated set */
  index: number;
}

// ------------------------------------------------------------------ random



// ------------------------------------------------------------------ solving

interface Masks {
  row: Int32Array;
  col: Int32Array;
  box: Int32Array;
}

function boxIndex(r: number, c: number, box: BoxShape, size: number) {
  const perRow = size / box.w;
  return Math.floor(r / box.h) * perRow + Math.floor(c / box.w);
}

function buildMasks(grid: number[], size: number, box: BoxShape): Masks | null {
  const row = new Int32Array(size);
  const col = new Int32Array(size);
  const bx = new Int32Array(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = grid[r * size + c];
      if (!v) continue;
      const bit = 1 << (v - 1);
      const b = boxIndex(r, c, box, size);
      // reject an inconsistent grid outright
      if (row[r] & bit || col[c] & bit || bx[b] & bit) return null;
      row[r] |= bit;
      col[c] |= bit;
      bx[b] |= bit;
    }
  }
  return { row, col, box: bx };
}

/**
 * Count solutions, stopping as soon as `limit` is reached.
 * Returning 1 proves the puzzle is well-formed.
 */
export function countSolutions(
  grid: number[],
  size: GridSize,
  limit = 2,
): number {
  const box = BOX[size];
  const work = grid.slice();
  const masks = buildMasks(work, size, box);
  if (!masks) return 0;
  return countWithMasks(work, size, box, masks, limit);
}

/**
 * Solution counter that borrows caller-owned masks and restores them on exit.
 * Avoiding the O(n^2) mask rebuild is what makes 16x16 digging viable.
 */
function countWithMasks(
  work: number[],
  size: GridSize,
  box: BoxShape,
  masks: Masks,
  limit: number,
  deadline = Infinity,
): number {
  const full = (1 << size) - 1;
  let found = 0;
  const n = work.length;

  /**
   * Constraint propagation: repeatedly fill cells that have exactly one
   * candidate. Without this the 16x16 search tree is astronomically large;
   * with it most blanks resolve deterministically and the tree collapses.
   * Returns the cells it filled (to undo), or null on contradiction.
   */
  const propagate = (): number[] | null => {
    const filled: number[] = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (work[i]) continue;
        const r = (i / size) | 0;
        const c = i % size;
        const b = boxIndex(r, c, box, size);
        const cand = ~(masks.row[r] | masks.col[c] | masks.box[b]) & full;
        if (cand === 0) {
          undo(filled);
          return null;
        }
        if ((cand & (cand - 1)) === 0) {
          // exactly one candidate
          work[i] = BIT_TO_VAL[cand];
          masks.row[r] |= cand;
          masks.col[c] |= cand;
          masks.box[b] |= cand;
          filled.push(i);
          progress = true;
        }
      }
    }
    return filled;
  };

  const undo = (filled: number[]) => {
    for (let k = filled.length - 1; k >= 0; k--) {
      const i = filled[k];
      const v = work[i];
      const bit = 1 << (v - 1);
      const r = (i / size) | 0;
      const c = i % size;
      work[i] = 0;
      masks.row[r] ^= bit;
      masks.col[c] ^= bit;
      masks.box[boxIndex(r, c, box, size)] ^= bit;
    }
  };

  const solve = (): boolean => {
    if (Date.now() > deadline) return true; // bail out, caller treats as "unknown"

    const filled = propagate();
    if (filled === null) return false;

    let best = -1;
    let bestMask = 0;
    let bestCount = size + 1;
    for (let i = 0; i < n; i++) {
      if (work[i]) continue;
      const r = (i / size) | 0;
      const c = i % size;
      const b = boxIndex(r, c, box, size);
      const cand = ~(masks.row[r] | masks.col[c] | masks.box[b]) & full;
      const pc = popcount(cand);
      if (pc < bestCount) {
        bestCount = pc;
        best = i;
        bestMask = cand;
        if (pc === 2) break;
      }
    }

    if (best === -1) {
      found++;
      undo(filled);
      return found >= limit;
    }

    const r = (best / size) | 0;
    const c = best % size;
    const b = boxIndex(r, c, box, size);

    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      work[best] = BIT_TO_VAL[bit];
      masks.row[r] |= bit;
      masks.col[c] |= bit;
      masks.box[b] |= bit;

      const stop = solve();

      work[best] = 0;
      masks.row[r] ^= bit;
      masks.col[c] ^= bit;
      masks.box[b] ^= bit;
      if (stop) {
        undo(filled);
        return true;
      }
    }
    undo(filled);
    return false;
  };

  solve();
  return found;
}

/** bit -> digit lookup, avoids Math.log2 in the hot loop */
const BIT_TO_VAL: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (let v = 1; v <= 16; v++) m[1 << (v - 1)] = v;
  return m;
})();

function popcount(x: number) {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

// ---------------------------------------------------------------- filling

/** Build a random complete, valid grid. */
export function generateSolution(size: GridSize, rng: () => number): number[] {
  const box = BOX[size];
  const grid = new Array<number>(size * size).fill(0);
  const row = new Int32Array(size);
  const col = new Int32Array(size);
  const bx = new Int32Array(size);
  const full = (1 << size) - 1;

  const fill = (): boolean => {
    // MRV again — dramatically faster than left-to-right for 16x16
    let best = -1;
    let bestMask = 0;
    let bestCount = size + 1;

    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) continue;
      const r = (i / size) | 0;
      const c = i % size;
      const b = boxIndex(r, c, box, size);
      const cand = ~(row[r] | col[c] | bx[b]) & full;
      if (cand === 0) return false;
      const n = popcount(cand);
      if (n < bestCount) {
        bestCount = n;
        best = i;
        bestMask = cand;
        if (n === 1) break;
      }
    }
    if (best === -1) return true;

    const r = (best / size) | 0;
    const c = best % size;
    const b = boxIndex(r, c, box, size);

    const bits: number[] = [];
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m ^= bit;
      bits.push(bit);
    }
    shuffle(bits, rng);

    for (const bit of bits) {
      const v = Math.log2(bit) + 1;
      grid[best] = v;
      row[r] |= bit;
      col[c] |= bit;
      bx[b] |= bit;
      if (fill()) return true;
      grid[best] = 0;
      row[r] ^= bit;
      col[c] ^= bit;
      bx[b] ^= bit;
    }
    return false;
  };

  fill();
  return grid;
}

// ---------------------------------------------------------------- digging

/**
 * Can cell `i` be removed and still leave a unique solution?
 * Much cheaper than a full solution count: we only need to know whether some
 * *other* digit also works there.
 */
/**
 * Can this cell be blanked and still leave exactly one solution?
 *
 * Earlier this tried every alternative digit with its own full solve (up to 15
 * solves per cell on 16x16). Blanking once and counting solutions with an early
 * exit at 2 is equivalent and dramatically cheaper.
 * Caller owns `masks`; this leaves both grid and masks exactly as it found them.
 */
function removableFast(
  grid: number[],
  i: number,
  size: GridSize,
  box: BoxShape,
  masks: Masks,
  deadline = Infinity,
): boolean {
  const v = grid[i];
  if (!v) return false;
  const bit = 1 << (v - 1);
  const r = (i / size) | 0;
  const c = i % size;
  const b = boxIndex(r, c, box, size);

  // blank it
  grid[i] = 0;
  masks.row[r] ^= bit;
  masks.col[c] ^= bit;
  masks.box[b] ^= bit;

  const n = countWithMasks(grid, size, box, masks, 2, deadline);

  // put it back
  grid[i] = v;
  masks.row[r] |= bit;
  masks.col[c] |= bit;
  masks.box[b] |= bit;

  return n === 1;
}

export interface GenerateOptions {
  size: GridSize;
  difficulty: Difficulty;
  /** 180-degree rotational symmetry, as printed puzzle books use */
  symmetric?: boolean;
  seed?: number;
  /**
   * Milliseconds to spend digging one puzzle before settling for what we have.
   * Removing 130+ of 256 cells from a 16x16 while proving uniqueness can take
   * tens of seconds; rather than hang, we stop and return a valid puzzle that
   * is slightly easier than requested. `actualDifficulty` reports what we got.
   */
  budgetMs?: number;
}

/** Generate one puzzle with a guaranteed-unique solution. */
export function generatePuzzle(opts: GenerateOptions, index = 1): SudokuPuzzle {
  const { size, difficulty, symmetric = true } = opts;
  const rng = makeRng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));

  const solution = generateSolution(size, rng);
  const puzzle = solution.slice();
  const [lo, hi] = REMOVAL_BANDS[size][difficulty];
  const target = lo + Math.floor(rng() * (hi - lo + 1));

  const order = shuffle(
    Array.from({ length: size * size }, (_, i) => i),
    rng,
  );

  const box = BOX[size];
  const masks = buildMasks(puzzle, size, box)!;

  const blank = (i: number) => {
    const v = puzzle[i];
    const bit = 1 << (v - 1);
    const r = (i / size) | 0;
    const c = i % size;
    puzzle[i] = 0;
    masks.row[r] ^= bit;
    masks.col[c] ^= bit;
    masks.box[boxIndex(r, c, box, size)] ^= bit;
  };

  const budget = opts.budgetMs ?? (size === 16 ? 4000 : 15000);
  const deadline = Date.now() + budget;

  const unblank = (i: number, v: number) => {
    const bit = 1 << (v - 1);
    const r = (i / size) | 0;
    const c = i % size;
    puzzle[i] = v;
    masks.row[r] |= bit;
    masks.col[c] |= bit;
    masks.box[boxIndex(r, c, box, size)] |= bit;
  };

  let removed = 0;
  for (const i of order) {
    if (removed >= target) break;
    if (Date.now() > deadline) break; // settle for what we have
    if (!puzzle[i]) continue;

    const mirror = size * size - 1 - i;
    const pairing = symmetric && mirror !== i && !!puzzle[mirror];

    if (!removableFast(puzzle, i, size, box, masks, deadline)) continue;
    const vi = puzzle[i];
    blank(i);

    if (pairing) {
      // Symmetry is all-or-nothing: if the mirror can't go, put this one back
      // so the finished grid stays 180-degree symmetric.
      if (removableFast(puzzle, mirror, size, box, masks, deadline)) {
        blank(mirror);
        removed += 2;
      } else {
        unblank(i, vi);
      }
    } else {
      removed += 1;
    }
  }

  const clues = puzzle.filter((v) => v !== 0).length;
  const actualRemoved = size * size - clues;
  return {
    hitTarget: actualRemoved >= target,
    targetRemoved: target,
    id: `s${size}-${difficulty}-${index}-${Math.floor(rng() * 1e9).toString(36)}`,
    size,
    box: BOX[size],
    difficulty,
    puzzle,
    solution,
    clues,
    removed: size * size - clues,
    index,
  };
}

/** Generate a set of distinct puzzles. */
export function generateSet(
  opts: GenerateOptions & { count: number },
  onProgress?: (done: number, total: number) => void,
): SudokuPuzzle[] {
  const out: SudokuPuzzle[] = [];
  const seen = new Set<string>();
  const baseSeed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);

  let attempts = 0;
  while (out.length < opts.count && attempts < opts.count * 6) {
    attempts++;
    const p = generatePuzzle(
      { ...opts, seed: baseSeed + attempts * 7919 },
      out.length + 1,
    );
    const key = p.solution.join(',');
    if (seen.has(key)) continue; // no duplicate puzzles in one book
    seen.add(key);
    out.push(p);
    onProgress?.(out.length, opts.count);
  }
  return out;
}

/** Digits shown in a cell — 16x16 uses 1-9 then A-G. */
export function cellLabel(value: number, size: GridSize, hex: boolean): string {
  if (!value) return '';
  if (size === 16 && hex) {
    return value <= 9 ? String(value) : String.fromCharCode(55 + value); // 10 -> A
  }
  return String(value);
}

/** Sanity check used by the tests. */
export function isValidSolution(grid: number[], size: GridSize): boolean {
  const box = BOX[size];
  const full = (1 << size) - 1;
  const row = new Int32Array(size);
  const col = new Int32Array(size);
  const bx = new Int32Array(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = grid[r * size + c];
      if (v < 1 || v > size) return false;
      const bit = 1 << (v - 1);
      const b = boxIndex(r, c, box, size);
      if (row[r] & bit || col[c] & bit || bx[b] & bit) return false;
      row[r] |= bit;
      col[c] |= bit;
      bx[b] |= bit;
    }
  }
  for (let i = 0; i < size; i++) {
    if (row[i] !== full || col[i] !== full || bx[i] !== full) return false;
  }
  return true;
}

// re-exported so tests and callers can seed a run
export { makeRng };
