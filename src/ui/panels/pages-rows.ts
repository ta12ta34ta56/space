/**
 * The row model behind the Pages tab (spec 07 §3).
 *
 * Pure: what each row is called, which side of the spread it prints on, and
 * what the cover row says underneath its thumbnail. The component renders
 * these strings; it does not decide them, and it computes no geometry
 * (architecture.md §6, ownership rule 4).
 *
 * The two facts worth stating out loud:
 *
 *  - **Odd interior pages are recto (right-hand), even are verso.** The panel
 *    says "Odd" and "Even" exactly as the legacy panel did.
 *  - **The cover is not a page.** It lives in `document.cover` (invariant 6),
 *    so it is not numbered with the interior and it shows its spine width
 *    instead of a side marker.
 */

import type { BookSettings } from '../../model';
import { UnsupportedBindingError, coverSpecFor, pageCountLimitFor } from '../../print';

/** The side marker under an interior page thumbnail. */
export function sideMarkerFor(interiorNumber: number): 'Odd' | 'Even' {
  return interiorNumber % 2 === 1 ? 'Odd' : 'Even';
}

/** The name under a page thumbnail. Interior pages are numbered from 1. */
export function pageNameFor(interiorNumber: number): string {
  return `Page ${interiorNumber}`;
}

/**
 * The spine width shown under the cover thumbnail, or `null` when KDP cannot
 * print this book at all and the number would be a guess.
 *
 * Three decimal places, with the inch mark, exactly as the legacy panel showed
 * it: `Spine 0.225"`. The unit is present either way (ui-context §8), and
 * under D17 the legacy string wins the tie.
 */
export function coverSpineLabelFor(book: BookSettings, interiorPageCount: number): string | null {
  // Ask Unit 03 whether the combination is printable BEFORE asking it for a
  // number. An unprintable book gets no spine label rather than a made-up one.
  const limit = pageCountLimitFor(book.trimId, book.paper);
  if (limit === null) return null;
  if (interiorPageCount < limit.minPages || interiorPageCount > limit.maxPages) return null;

  try {
    const spec = coverSpecFor(book.trimId, book.paper, interiorPageCount, book.binding);
    return `Spine ${spec.spineIn.toFixed(3)}"`;
  } catch (error) {
    // Paperback only in v1 (D24.4). Unit 03 refuses hardcover rather than
    // approximating it, and that refusal is passed through as "no label".
    if (error instanceof UnsupportedBindingError) return null;
    throw error;
  }
}
