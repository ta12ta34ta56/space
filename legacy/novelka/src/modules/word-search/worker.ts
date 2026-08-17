/// <reference lib="webworker" />
import {
  WS_PROFILES,
  generateWordSearch,
  type GenerateOptions,
  type WordSearchPuzzle,
  type WSDifficulty,
} from './generator';

/**
 * Generation worker.
 *
 * Word searches are fast (well under a millisecond each) but a 100-puzzle book
 * with big grids still adds up, and keeping it off the main thread means the UI
 * never stutters — and gives us free progress reporting.
 */

export interface WsThemeSpec {
  /** shown on the page */
  name: string;
  words: string[];
}

export interface WsWorkerRequest {
  type: 'generate';
  options: Omit<GenerateOptions, 'difficulty' | 'words' | 'theme'> & {
    count: number;
    /** one or more levels — the set is spread evenly across them */
    difficulties: WSDifficulty[];
    /** themes are cycled so a book covers several subjects */
    themes: WsThemeSpec[];
    /** words per puzzle; 0 = use the difficulty's suggestion */
    wordsPerPuzzle: number;
    /** grid side; 0 = use the difficulty's suggestion */
    gridSize: number;
  };
}

export type WsWorkerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; puzzles: WordSearchPuzzle[]; incomplete: number }
  | { type: 'error'; message: string };

const post = (m: WsWorkerResponse) => (self as unknown as Worker).postMessage(m);

/** Rotate a theme's list so consecutive puzzles on one theme differ. */
function pickWords(words: string[], count: number, offset: number): string[] {
  if (words.length <= count) return words;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(words[(offset + i) % words.length]);
  return out;
}

self.onmessage = (e: MessageEvent<WsWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'generate') return;

  try {
    const {
      count, difficulties, themes, wordsPerPuzzle, gridSize, ...opts
    } = msg.options;

    const levels: WSDifficulty[] = difficulties.length ? difficulties : ['medium'];
    const list = themes.length ? themes : [{ name: '', words: [] }];
    const baseSeed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    const puzzles: WordSearchPuzzle[] = [];
    const seen = new Set<string>();

    let attempts = 0;
    let themeOffset = 0;
    while (puzzles.length < count && attempts < count * 8) {
      attempts++;
      const difficulty = levels[puzzles.length % levels.length];
      const theme = list[puzzles.length % list.length];
      const profile = WS_PROFILES[difficulty];

      const nWords = wordsPerPuzzle || profile.words;
      const size = gridSize || profile.size;

      // advance through the bank each time we come back to this theme
      if (puzzles.length > 0 && puzzles.length % list.length === 0) {
        themeOffset += nWords;
      }

      const words = theme.words.length
        ? pickWords(theme.words, nWords, themeOffset)
        : [];
      if (!words.length) {
        post({ type: 'error', message: 'No words to hide — pick a theme or type a list.' });
        return;
      }

      const p = generateWordSearch(
        {
          ...opts,
          size,
          words,
          difficulty,
          theme: theme.name || undefined,
          seed: baseSeed + attempts * 7919,
        },
        puzzles.length + 1,
      );

      const key = p.grid.join('');
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
