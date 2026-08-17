import type { GeneratorKind, Page } from '../../types/canvas.types';

/**
 * Machine-readable generator kind for a page — the SOLE basis for "apply to
 * all". Every generated page is stamped with `kind` at creation time; older
 * projects (or legacy pages) are read from their persisted module metadata.
 */

type AnyData = Record<string, unknown>;

const KIND_FROM_KEY: Record<string, GeneratorKind> = {
  'novelka:sudoku-page': 'sudoku',
  'minipdf:sudoku-page': 'sudoku',
  'gridpress:sudoku-page': 'sudoku',
  'novelka:wordsearch-page': 'wordsearch',
  'minipdf:wordsearch-page': 'wordsearch',
  'gridpress:wordsearch-page': 'wordsearch',
  'novelka:crossword-page': 'crossword',
  'minipdf:crossword-page': 'crossword',
  'gridpress:crossword-page': 'crossword',
  'novelka:maze-page': 'maze',
  'minipdf:maze-page': 'maze',
  'gridpress:maze-page': 'maze',
  'novelka:handwriting-page': 'handwriting',
  'minipdf:handwriting-page': 'handwriting',
  'gridpress:handwriting-page': 'handwriting',
};

/** The generator kind of a page (reads `kind`, then falls back to metadata). */
export function pageKindOf(page: Page | null | undefined): GeneratorKind {
  if (!page) return null;
  if (page.kind) return page.kind;
  const d = (page.data ?? {}) as AnyData;
  for (const k of Object.keys(d)) {
    const kind = KIND_FROM_KEY[k];
    if (kind) return kind;
  }
  return null;
}

/** True when two pages were produced by the same generator. */
export function sameGenerator(a: Page | null | undefined, b: Page | null | undefined): boolean {
  const ka = pageKindOf(a);
  const kb = pageKindOf(b);
  return !!ka && ka === kb;
}

/** A stable human label for a generator kind. */
export function kindLabel(kind: GeneratorKind): string {
  switch (kind) {
    case 'sudoku': return 'Sudoku';
    case 'wordsearch': return 'Word search';
    case 'crossword': return 'Crossword';
    case 'maze': return 'Maze';
    case 'handwriting': return 'Handwriting';
    case 'template': return 'Template';
    default: return '';
  }
}

/** A stable, machine-readable subtype for a page (e.g. "9×9", "15×15"). */
export function pageSubtypeOf(page: Page | null | undefined): string {
  if (!page) return '';
  const d = (page.data ?? {}) as AnyData;
  const find = (keys: string[]) => {
    for (const k of keys) {
      const v = d[k] as AnyData | undefined;
      if (v && typeof v === 'object') return v;
    }
    return null;
  };
  switch (pageKindOf(page)) {
    case 'sudoku': {
      const m = find(['novelka:sudoku-page']);
      if (m && typeof m.gridSize === 'number') return `${m.gridSize}×${m.gridSize}`;
      return 'Sudoku';
    }
    case 'wordsearch': {
      const m = find(['novelka:wordsearch-page']);
      if (m && typeof m.gridSize === 'number') return `${m.gridSize}×${m.gridSize}`;
      return 'Word search';
    }
    case 'crossword': {
      const m = find(['novelka:crossword-page']);
      if (m && typeof m.gridSize === 'number') return `${m.gridSize}×${m.gridSize}`;
      return 'Crossword';
    }
    default:
      return kindLabel(pageKindOf(page));
  }
}
