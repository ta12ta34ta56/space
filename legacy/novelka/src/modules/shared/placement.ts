import type { Page } from '../../types/canvas.types';

/**
 * Placement for generated PUZZLE pages. Solution pages always follow their own
 * rule (the module's solutionPlacement), so this only decides where puzzle
 * pages land among the book's existing interior pages.
 *
 * Default is 'sequence' — puzzle pages append in order after the cover, which
 * is what a normal user gets without opening anything.
 */
export type PuzzlePlacement =
  | 'sequence'
  | 'odd'
  | 'even'
  | 'random'
  | 'first_half'
  | 'second_half';

export const PLACEMENT_OPTIONS: { v: PuzzlePlacement; label: string; hint: string }[] = [
  { v: 'sequence', label: 'In sequence', hint: 'Append after the cover (default)' },
  { v: 'odd', label: 'Odd pages', hint: 'Land on odd (right-hand) pages' },
  { v: 'even', label: 'Even pages', hint: 'Land on even (left-hand) pages' },
  { v: 'random', label: 'Random', hint: 'Scatter through the book' },
  { v: 'first_half', label: 'First half', hint: 'Place in the first half of the book' },
  { v: 'second_half', label: 'Second half', hint: 'Place in the second half of the book' },
];

/** Identify which kind a built page is (module-specific meta reader). */
export type BuiltPageKind = 'puzzle' | 'solution' | null;

function isCover(p: Page): boolean {
  return p.role === 'cover';
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Return the new full page array when generated pages must be placed into the
 * existing book (placement !== 'sequence'), or `null` when the caller should
 * just append (the sequence path keeps the module's exact build output,
 * including interleaved next-page solutions).
 */
export function placeGeneratedPages(opts: {
  built: Page[];
  current: Page[];
  placement: PuzzlePlacement;
  kindOf: (p: Page) => BuiltPageKind;
}): Page[] | null {
  const { built, current, placement, kindOf } = opts;
  if (placement === 'sequence') return null;

  const puzzles = built.filter((p) => kindOf(p) === 'puzzle');
  const solutions = built.filter((p) => kindOf(p) === 'solution');
  const other = built.filter((p) => kindOf(p) !== 'puzzle' && kindOf(p) !== 'solution');
  if (!puzzles.length) return null;

  const covers = current.filter(isCover);
  const interiors = current.filter((p) => !isCover(p));
  const n = interiors.length;

  // 1-based interior slots. For 'odd'/'even' the slot is the printed page
  // number of the interior (the cover, if any, is its own deliverable and does
  // not shift the interior numbering).
  let slots: number[];
  switch (placement) {
    case 'odd':
      slots = interiors.map((_, i) => i + 1).filter((i) => i % 2 === 1);
      break;
    case 'even':
      slots = interiors.map((_, i) => i + 1).filter((i) => i % 2 === 0);
      break;
    case 'random':
      slots = shuffle(interiors.map((_, i) => i + 1));
      break;
    case 'first_half':
      slots = interiors.map((_, i) => i + 1).slice(0, Math.ceil(n / 2));
      break;
    default: // second_half
      slots = interiors.map((_, i) => i + 1).slice(Math.floor(n / 2));
      break;
  }

  if (!slots.length) return null;

  // Map each chosen slot to the puzzle pages that land there (cycle if there
  // are more puzzles than slots, e.g. 10 puzzles, 3 odd slots).
  const bySlot = new Map<number, Page[]>();
  puzzles.forEach((p, pi) => {
    const slot = slots[pi % slots.length];
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push(p);
  });
  const placedIds = new Set<string>();
  bySlot.forEach((arr) => arr.forEach((p) => placedIds.add(p.id)));

  const result: Page[] = [...covers];
  interiors.forEach((pg, i) => {
    const slot = i + 1;
    const at = bySlot.get(slot);
    if (at) result.push(...at);
    result.push(pg);
  });

  // Any puzzles that could not be slotted plus solutions plus any heading pages
  // go to the back of the book — solutions are never mixed into odd/even/etc.
  const unplaced = puzzles.filter((p) => !placedIds.has(p.id));
  result.push(...unplaced, ...other, ...solutions);
  return result;
}

/**
 * The page whose size generated content is built at. This must ALWAYS be an
 * interior page — never the cover (the cover is a different, oversized flat
 * surface). When the active page is the cover, we fall back to the first
 * interior page's dimensions so generated puzzles/mazes/worksheets never come
 * out at cover size.
 */
export function generationPage(pages: Page[], activePageId?: string): Page {
  const active = pages.find((p) => p.id === activePageId) ?? pages[0];
  if (active.role !== 'cover') return active;
  return pages.find((p) => p.role !== 'cover') ?? active;
}
