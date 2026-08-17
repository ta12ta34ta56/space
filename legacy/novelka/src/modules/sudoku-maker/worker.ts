/// <reference lib="webworker" />
import { generatePuzzle, type GenerateOptions, type SudokuPuzzle } from './generator';

/**
 * Generation worker. 16x16 hard/expert can take seconds per puzzle, so the
 * whole set is built off the main thread with progress reported after each one.
 */

export interface WorkerRequest {
  type: 'generate';
  options: Omit<GenerateOptions, 'difficulty'> & {
    count: number;
    /** one or more levels — the set is spread evenly across them */
    difficulties: GenerateOptions['difficulty'][];
  };
}

export type WorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; puzzles: SudokuPuzzle[]; degraded: number }
  | { type: 'error'; message: string };

const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;

  try {
    const { count, difficulties, ...opts } = msg.options;
    const levels = difficulties.length ? difficulties : ['medium' as const];
    const baseSeed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    const puzzles: SudokuPuzzle[] = [];
    const seen = new Set<string>();

    let attempts = 0;
    while (puzzles.length < count && attempts < count * 6) {
      attempts++;
      // Round-robin through the chosen levels so a mixed book is evenly spread.
      const difficulty = levels[puzzles.length % levels.length];
      const p = generatePuzzle(
        { ...opts, difficulty, seed: baseSeed + attempts * 7919 },
        puzzles.length + 1,
      );
      const key = p.solution.join(',');
      if (seen.has(key)) continue; // never repeat a puzzle inside one book
      seen.add(key);
      puzzles.push(p);
      post({ type: 'progress', done: puzzles.length, total: count });
    }

    post({
      type: 'done',
      puzzles,
      degraded: puzzles.filter((p) => !p.hitTarget).length,
    });
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Generation failed',
    });
  }
};
