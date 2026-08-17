import * as fabric from 'fabric';

/**
 * Helpers shared by every puzzle module (Sudoku, Word search, Crossword).
 *
 * These were duplicated three times each. Keeping one copy means a fix — for
 * example to the serialization allow-list — lands in every module at once,
 * instead of being fixed in one and silently missed in the others.
 */

// ------------------------------------------------------------------ random

/**
 * Mulberry32 — a small, fast, seeded PRNG.
 *
 * Seeding matters for a puzzle book: the same seed must reproduce the same
 * book, so an author can regenerate a title they have already published.
 */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place, driven by a seeded rng so shuffles reproduce. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ------------------------------------------------------------------- lists

/** Split `arr` into consecutive runs of at most `n`. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const size = Math.max(1, n);
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
}

/** Strip everything that cannot be printed in a letter grid. */
export function cleanWord(w: string): string {
  return w
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z]/g, '');
}

// ----------------------------------------------------------- serialization

/**
 * Custom object properties that must survive a page save.
 *
 * Anything missing here is silently dropped the first time a page is
 * serialized — the bug that once made Sudoku's live-adjust stop working
 * because its role tags vanished. Must stay in step with
 * `CanvasEngine.EXTRA_PROPS`.
 */
export const PUZZLE_EXTRA_PROPS = [
  'id',
  'elementType',
  'name',
  'locked',
  'moduleId',
  // semantic instance tags
  'instanceId',
  'instanceRole',
  'contentId',
  'role',
  // sudoku
  'sudokuRole',
  'sudokuPuzzle',
  // word search
  'wsRole',
  'wsPuzzle',
  // handwriting
  'hwRole',
  'hwPuzzle',
  // maze
  'mzRole',
  'mzPuzzle',
  // crossword
  'cwRole',
  'cwPuzzle',
];

/**
 * Serialize fabric objects into page data without needing a live canvas.
 *
 * Modules build pages off-screen (a 50-puzzle book would be unusable if each
 * page had to be mounted), so this renders into a throwaway StaticCanvas and
 * takes the JSON.
 */
export function objectsToPageData(
  objs: fabric.FabricObject[],
  width: number,
  height: number,
  background: string,
) {
  const el = document.createElement('canvas');
  const c = new fabric.StaticCanvas(el, { width, height });
  objs.forEach((o) => c.add(o));
  const json = c.toObject(PUZZLE_EXTRA_PROPS) as { objects: unknown[] };
  c.dispose();
  return { version: '6.0.0', background, objects: json.objects };
}
