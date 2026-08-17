/// <reference lib="webworker" />
import {
  CW_PROFILES,
  generateCrossword,
  type ClueWord,
  type CrosswordPuzzle,
  type CWDifficulty,
} from './generator';

/**
 * Generation worker.
 *
 * Crosswords generate in about a millisecond each, but a 60-puzzle book with
 * repeated placement attempts still adds up — keeping it off the main thread
 * means the UI never stutters and gives free progress reporting.
 */

export interface CwThemeSpec {
  name: string;
  words: ClueWord[];
}

export interface CwWorkerRequest {
  type: 'generate';
  options: {
    count: number;
    difficulties: CWDifficulty[];
    themes: CwThemeSpec[];
    /** answers per puzzle; 0 = use the difficulty's suggestion */
    wordsPerPuzzle: number;
    /** starting grid side; 0 = use the difficulty's suggestion */
    gridSize: number;
    seed?: number;
  };
}

export type CwWorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; puzzles: CrosswordPuzzle[]; incomplete: number }
  | { type: 'error'; message: string };

const post = (m: CwWorkerResponse) => (self as unknown as Worker).postMessage(m);

/** Rotate a bank so consecutive puzzles on one theme use different answers. */
function pickWords(words: ClueWord[], count: number, offset: number): ClueWord[] {
  if (words.length <= count) return words;
  const out: ClueWord[] = [];
  for (let i = 0; i < count; i++) out.push(words[(offset + i) % words.length]);
  return out;
}

self.onmessage = (e: MessageEvent<CwWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;

  try {
    const {
      count, difficulties, themes, wordsPerPuzzle, gridSize, seed,
    } = msg.options;

    const levels: CWDifficulty[] = difficulties.length ? difficulties : ['medium'];
    const list = themes.filter((t) => t.words.length);
    if (!list.length) {
      post({ type: 'error', message: 'No clues to build from — pick a theme or type your own list.' });
      return;
    }

    const baseSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
    const puzzles: CrosswordPuzzle[] = [];
    const seen = new Set<string>();

    let attempts = 0;
    let themeOffset = 0;
    while (puzzles.length < count && attempts < count * 8) {
      attempts++;
      const difficulty = levels[puzzles.length % levels.length];
      const theme = list[puzzles.length % list.length];
      const profile = CW_PROFILES[difficulty];

      const nWords = wordsPerPuzzle || profile.words;
      const size = gridSize || profile.size;

      // advance through the bank each time we come back round to this theme
      if (puzzles.length > 0 && puzzles.length % list.length === 0) {
        themeOffset += nWords;
      }

      const words = pickWords(theme.words, nWords, themeOffset);

      const p = generateCrossword(
        {
          words,
          difficulty,
          size,
          maxWords: nWords,
          theme: theme.name || undefined,
          seed: baseSeed + attempts * 7919,
        },
        puzzles.length + 1,
      );

      const key = p.grid.join('|');
      if (seen.has(key)) continue; // never repeat a grid inside one book
      seen.add(key);
      puzzles.push(p);
      post({ type: 'progress', done: puzzles.length, total: count });
    }

    post({
      type: 'done',
      puzzles,
      incomplete: puzzles.filter((p) => !p.complete).length,
    });
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : 'Generation failed',
    });
  }
};
