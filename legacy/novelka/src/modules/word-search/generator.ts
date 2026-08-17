/**
 * Word search generator.
 *
 * Pure TypeScript, no DOM — so the same code runs in a worker, in the renderer
 * and in the Node test harness.
 *
 * Guarantees per puzzle:
 *  - every requested word is placed, or it is reported in `unplaced`
 *  - no word is placed twice
 *  - a word never sits on top of an identical duplicate run
 *  - solution coordinates are recorded so the answer key can be drawn exactly
 */

import { cleanWord, makeRng, shuffle } from '../shared/puzzle-utils';

export type WSDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** dr, dc, human name */
export interface Direction {
  dr: number;
  dc: number;
  id: DirectionId;
}

export type DirectionId = 'E' | 'S' | 'SE' | 'NE' | 'W' | 'N' | 'NW' | 'SW';

export const DIRECTIONS: Record<DirectionId, Direction> = {
  E: { dr: 0, dc: 1, id: 'E' },
  S: { dr: 1, dc: 0, id: 'S' },
  SE: { dr: 1, dc: 1, id: 'SE' },
  NE: { dr: -1, dc: 1, id: 'NE' },
  W: { dr: 0, dc: -1, id: 'W' },
  N: { dr: -1, dc: 0, id: 'N' },
  NW: { dr: -1, dc: -1, id: 'NW' },
  SW: { dr: 1, dc: -1, id: 'SW' },
};

export interface DifficultyProfile {
  /** direction set used when the user has not overridden it */
  directions: DirectionId[];
  /** suggested grid side */
  size: number;
  /** suggested word count */
  words: number;
  label: string;
  note: string;
}

/**
 * Difficulty in a word search is not "how hard is the search algorithm" — it is
 * which directions are legal and how dense the grid is. These bands are tuned
 * for printed KDP books.
 */
export const WS_PROFILES: Record<WSDifficulty, DifficultyProfile> = {
  easy: {
    directions: ['E', 'S'],
    size: 10,
    words: 8,
    label: 'Easy',
    note: 'Across and down only — perfect for kids',
  },
  medium: {
    directions: ['E', 'S', 'SE', 'NE'],
    size: 13,
    words: 12,
    label: 'Medium',
    note: 'Adds diagonals',
  },
  hard: {
    directions: ['E', 'S', 'SE', 'NE', 'W', 'N'],
    size: 15,
    words: 16,
    label: 'Hard',
    note: 'Backwards across and down too',
  },
  expert: {
    directions: ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'],
    size: 18,
    words: 22,
    label: 'Expert',
    note: 'All eight directions, dense grid',
  },
};

export interface Placement {
  /** as shown in the word bank */
  word: string;
  /** letters actually hidden in the grid (A–Z only) */
  clean: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
  direction: DirectionId;
  /** cell indices (row * size + col) in order */
  cells: number[];
}

export interface WordSearchPuzzle {
  id: string;
  index: number;
  size: number;
  difficulty: WSDifficulty;
  theme?: string;
  /** row-major letters, length size*size */
  grid: string[];
  placements: Placement[];
  /** words that would not fit */
  unplaced: string[];
  /** the hidden message, if leftover cells were used for one */
  secret?: string;
  /** true when every requested word was placed */
  complete: boolean;
}

export interface GenerateOptions {
  size: number;
  words: string[];
  difficulty: WSDifficulty;
  /** override the difficulty's direction set */
  directions?: DirectionId[];
  /** let words cross where letters match (denser, nicer puzzles) */
  allowOverlap?: boolean;
  /** leftover cells spell this out in reading order */
  secretMessage?: string;
  theme?: string;
  seed?: number;
  /** hard cap so a hopeless request cannot hang the worker */
  maxAttempts?: number;
}

// ------------------------------------------------------------------ random



// ------------------------------------------------------------------ words


/** Parse a textarea / comma list into a tidy word list, de-duplicated. */
export function parseWordList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,;]+/)) {
    const w = piece.trim().replace(/\s+/g, ' ');
    if (!w) continue;
    const key = cleanWord(w);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** Letter frequency of English, used so filler does not look obviously random. */
const FILLER = 'EEEEEEEEEEEETTTTTTTTTAAAAAAAAOOOOOOOIIIIIIINNNNNNSSSSSSHHHHHRRRRRDDDDLLLLCCCUUMMWWFFGGYYPPBBVKJXQZ';

// ------------------------------------------------------------------ engine

interface Grid {
  size: number;
  cells: (string | null)[];
}

function canPlace(
  g: Grid,
  clean: string,
  row: number,
  col: number,
  d: Direction,
  allowOverlap: boolean,
): number | null {
  const n = g.size;
  let overlaps = 0;
  for (let i = 0; i < clean.length; i++) {
    const r = row + d.dr * i;
    const c = col + d.dc * i;
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    const cur = g.cells[r * n + c];
    if (cur === null) continue;
    if (cur !== clean[i]) return null;
    if (!allowOverlap) return null;
    overlaps++;
  }
  // A word entirely on top of existing letters is a duplicate, not a placement.
  if (overlaps === clean.length) return null;
  return overlaps;
}

function write(g: Grid, clean: string, row: number, col: number, d: Direction): number[] {
  const cells: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = (row + d.dr * i) * g.size + (col + d.dc * i);
    g.cells[idx] = clean[i];
    cells.push(idx);
  }
  return cells;
}

/** One attempt at a full board. Returns null only if nothing at all worked. */
function attempt(
  words: { word: string; clean: string }[],
  size: number,
  dirs: Direction[],
  allowOverlap: boolean,
  rng: () => number,
): { grid: Grid; placements: Placement[]; unplaced: string[] } {
  const grid: Grid = { size, cells: new Array(size * size).fill(null) };
  const placements: Placement[] = [];
  const unplaced: string[] = [];

  // longest first — long words are the ones that stop fitting
  const ordered = [...words].sort((a, b) => b.clean.length - a.clean.length);

  for (const { word, clean } of ordered) {
    if (clean.length > size) {
      unplaced.push(word);
      continue;
    }

    // Collect candidate placements, preferring the ones that cross existing
    // letters — overlapping makes a tighter, better-looking puzzle.
    let best: { row: number; col: number; d: Direction; score: number } | null = null;
    const starts = shuffle(
      Array.from({ length: size * size }, (_, i) => i),
      rng,
    );
    const dirOrder = shuffle([...dirs], rng);

    outer: for (const s of starts) {
      const row = Math.floor(s / size);
      const col = s % size;
      for (const d of dirOrder) {
        const ov = canPlace(grid, clean, row, col, d, allowOverlap);
        if (ov === null) continue;
        const score = ov * 10 + rng();
        if (!best || score > best.score) best = { row, col, d, score };
        // A crossing placement is good enough; stop hunting.
        if (ov > 0) break outer;
      }
    }

    if (!best) {
      unplaced.push(word);
      continue;
    }

    const cells = write(grid, clean, best.row, best.col, best.d);
    placements.push({
      word,
      clean,
      row: best.row,
      col: best.col,
      dr: best.d.dr,
      dc: best.d.dc,
      direction: best.d.id,
      cells,
    });
  }

  return { grid, placements, unplaced };
}

/**
 * The smallest square that can reasonably hold this word list.
 * Used to auto-grow the grid rather than silently dropping words.
 */
export function minSizeFor(words: string[], count = words.length): number {
  const cleaned = words.map(cleanWord).filter(Boolean);
  if (!cleaned.length) return 8;
  const longest = Math.max(...cleaned.map((w) => w.length));
  const letters = cleaned.slice(0, count).reduce((s, w) => s + w.length, 0);
  // aim for words covering at most ~55% of the cells
  const byArea = Math.ceil(Math.sqrt(letters / 0.55));
  return Math.max(longest, byArea, 6);
}

export function generateWordSearch(
  opts: GenerateOptions,
  index = 1,
): WordSearchPuzzle {
  const profile = WS_PROFILES[opts.difficulty];
  const dirIds = opts.directions?.length ? opts.directions : profile.directions;
  const dirs = dirIds.map((id) => DIRECTIONS[id]);
  const allowOverlap = opts.allowOverlap ?? true;
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeRng(seed);

  const words = opts.words
    .map((w) => ({ word: w.trim(), clean: cleanWord(w) }))
    .filter((w) => w.clean.length >= 2);

  const maxAttempts = opts.maxAttempts ?? 40;
  let size = Math.max(opts.size, ...words.map((w) => w.clean.length), 5);

  let best: ReturnType<typeof attempt> | null = null;
  for (let a = 0; a < maxAttempts; a++) {
    const r = attempt(words, size, dirs, allowOverlap, rng);
    if (!best || r.unplaced.length < best.unplaced.length) best = r;
    if (!r.unplaced.length) break;
    // Every quarter of the budget, grow the board rather than give up.
    if (a > 0 && a % Math.max(4, Math.floor(maxAttempts / 4)) === 0) {
      size++;
      best = null;
    }
  }
  const result = best ?? attempt(words, size, dirs, allowOverlap, rng);
  size = result.grid.size;

  // ---- fill the blanks -----------------------------------------------------
  const secretLetters = opts.secretMessage ? cleanWord(opts.secretMessage) : '';
  let si = 0;
  const grid = result.grid.cells.map((c) => {
    if (c !== null) return c;
    if (si < secretLetters.length) return secretLetters[si++];
    return FILLER[Math.floor(rng() * FILLER.length)];
  });

  return {
    id: `ws-${seed.toString(36)}-${index}`,
    index,
    size,
    difficulty: opts.difficulty,
    theme: opts.theme,
    grid,
    placements: result.placements,
    unplaced: result.unplaced,
    secret: secretLetters && si >= secretLetters.length ? opts.secretMessage : undefined,
    complete: result.unplaced.length === 0,
  };
}

/** Verify a puzzle really contains each word where it claims. Used by tests. */
export function verifyPuzzle(p: WordSearchPuzzle): string[] {
  const problems: string[] = [];
  for (const pl of p.placements) {
    const read = pl.cells.map((i) => p.grid[i]).join('');
    if (read !== pl.clean) {
      problems.push(`${pl.word}: grid reads ${read}`);
    }
    if (pl.cells.length !== pl.clean.length) {
      problems.push(`${pl.word}: cell count mismatch`);
    }
  }
  const seen = new Set<string>();
  for (const pl of p.placements) {
    if (seen.has(pl.clean)) problems.push(`${pl.word}: placed twice`);
    seen.add(pl.clean);
  }
  if (p.grid.length !== p.size * p.size) problems.push('grid size mismatch');
  if (p.grid.some((c) => !/^[A-Z]$/.test(c))) problems.push('non-letter in grid');
  return problems;
}

// re-exported so tests and callers can seed a run
export { makeRng, cleanWord };
