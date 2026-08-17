/**
 * GuideOverlay — the print guides, as DOM above the canvas (spec 06 §2).
 *
 * Guides are DOM overlays, never Fabric objects (architecture.md §9 rule 4).
 * Three reasons, all load-bearing:
 *
 *  1. They can never be selected, moved, or exported by accident.
 *  2. They cannot end up in the Document.
 *  3. `pointer-events: none` means they never intercept a click.
 *
 * This component computes nothing: `print/guides.ts` owns the geometry, and
 * the only arithmetic here is the inches→pixels conversion at the render
 * boundary via `model/units`. The six guide colours are fixed instrument
 * markings (`--guide-*` tokens), never themed.
 *
 * A hidden guide renders NOTHING — not an invisible element that could still
 * be hit. Guides render above all content, on interior pages and on the
 * cover; that is an explicit owner requirement.
 */

import type { BookSettings } from '../../model';
import { inToPx } from '../../model';
import type { GuideKind, GuideSurface } from '../../print/guides';
import { guidesFor } from '../../print/guides';

export type GuideOverlayProps = {
  readonly book: BookSettings;
  /** Zero-based print order; ignored for the cover. */
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly surface: GuideSurface;
  readonly visibleGuides: Readonly<Record<GuideKind, boolean>>;
  /** Pixels per inch at the current zoom — the one conversion input. */
  readonly pxPerIn: number;
};

export function GuideOverlay({
  book,
  pageIndex,
  pageCount,
  surface,
  visibleGuides,
  pxPerIn,
}: GuideOverlayProps) {
  const guides = guidesFor(book, pageIndex, pageCount, { surface });
  const shown = guides.filter((guide) => visibleGuides[guide.kind]);

  return (
    // pointer-events is set inline as well as in the stylesheet on purpose:
    // a guide intercepting a click is a product defect, not a styling bug,
    // so the rule must hold even if the stylesheet fails to load.
    <div className="guide-overlay" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      {shown.map((guide, index) => (
        <div
          key={`${guide.kind}-${index}`}
          className={`guide guide-${guide.kind}`}
          data-guide={guide.kind}
          data-label={guide.label}
          style={{
            pointerEvents: 'none',
            left: inToPx(guide.rectIn.xIn, pxPerIn),
            top: inToPx(guide.rectIn.yIn, pxPerIn),
            width: inToPx(guide.rectIn.wIn, pxPerIn),
            height: inToPx(guide.rectIn.hIn, pxPerIn),
          }}
        />
      ))}
    </div>
  );
}
