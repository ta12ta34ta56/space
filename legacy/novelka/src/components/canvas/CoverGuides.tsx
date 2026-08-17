import { useSelection } from '../../hooks/useSelection';
import { rectInBleed, type CoverGuideGeom, type Rect } from '../../services/cover-guides';

/**
 * Phantom cover guidelines — a sleek SVG overlay on top of the canvas (which is
 * already full-bleed). Crisp, thin, non-intrusive phantom lines:
 *
 *   RED    #EF4444 — the bleed / trim boundary (the trim rectangle, inset by bleed)
 *   BLUE   #3B82F6 — the spine fold lines (left & right edges of the spine)
 *   GREEN  #22C55E — the safe / live-area inner margins on the back & front panels
 *   AMBER  #F59E0B — the KDP barcode keep-out box (2" x 1.2", bottom-right of back)
 *
 * All strokes are 1.5px, opacity 0.65, dash 4 4. The container is a pointer-events:
 * none SVG overlay (z-index 10) so user clicks pass straight through to the design
 * elements below. It is DOM-only — never in the fabric canvas — so it does NOT
 * print or export and never appears in thumbnails/preview/selection.
 *
 * Magnetic-snap highlight: while an element is moved/resized, the engine reports
 * which guideline positions are snapped (activeSnapV/H); any guideline line being
 * snapped to gets opacity 1.0 (briefly highlighted).
 *
 * Intelligent guard: if TEXT is placed in the bleed band, a quiet warning appears
 * telling the author it will be trimmed. Backgrounds / images / shapes in the
 * bleed are exempt (no warning).
 */

type Props = {
  pageWidth: number;
  pageHeight: number;
  zoom: number;
  geom: CoverGuideGeom;
  /** active vertical snap positions (page pts) — lines currently snapped to */
  activeSnapV?: number[];
  /** active horizontal snap positions (page pts) — lines currently snapped to */
  activeSnapH?: number[];
};

const NEAR = 0.5;

export function CoverGuides({
  pageWidth,
  pageHeight,
  geom,
  activeSnapV,
  activeSnapH,
}: Props) {
  const selection = useSelection();

  // Text-in-bleed guard: warn only when a TEXT object extends into the bleed.
  const primary = selection.primary as { getBoundingRect?: () => Rect } | null;
  const rect = primary?.getBoundingRect?.() ?? null;
  const textInBleed = selection.isText && !!rect && rectInBleed(geom, rect);

  const snapV = new Set(activeSnapV ?? []);
  const snapH = new Set(activeSnapH ?? []);

  // A rect is "snapped" when any of its four edges is currently snapped.
  const rectSnapped = (r: Rect) => {
    const hitV = [...snapV].some(
      (s) => Math.abs(s - r.left) <= NEAR || Math.abs(s - (r.left + r.width)) <= NEAR,
    );
    const hitH = [...snapH].some(
      (s) => Math.abs(s - r.top) <= NEAR || Math.abs(s - (r.top + r.height)) <= NEAR,
    );
    return hitV || hitH;
  };

  // Rect outline -> SVG path.
  const rectPath = (r: Rect) =>
    `M ${r.left} ${r.top} H ${r.left + r.width} V ${r.top + r.height} H ${r.left} Z`;

  // Spine fold lines are vertical segments over the trim height.
  const foldTop = geom.bleed;
  const foldBottom = geom.bleed + geom.trim.height;

  return (
    <>
      <svg
        className="cover-guides"
        style={{ width: pageWidth, height: pageHeight }}
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        aria-hidden="true"
      >
        {/* RED — bleed / trim boundary */}
        <path
          className="cover-line-bleed"
          d={rectPath(geom.trim)}
          data-snapped={rectSnapped(geom.trim)}
        />
        {/* BLUE — spine fold lines */}
        <line
          className="cover-line-spine"
          x1={geom.spineFoldLeft} y1={foldTop}
          x2={geom.spineFoldLeft} y2={foldBottom}
          data-snapped={[...snapV].some((s) => Math.abs(s - geom.spineFoldLeft) <= NEAR)}
        />
        <line
          className="cover-line-spine"
          x1={geom.spineFoldRight} y1={foldTop}
          x2={geom.spineFoldRight} y2={foldBottom}
          data-snapped={[...snapV].some((s) => Math.abs(s - geom.spineFoldRight) <= NEAR)}
        />
        {/* GREEN — safe / live-area inner margins */}
        <path
          className="cover-line-safe"
          d={rectPath(geom.safeBack)}
          data-snapped={rectSnapped(geom.safeBack)}
        />
        <path
          className="cover-line-safe"
          d={rectPath(geom.safeFront)}
          data-snapped={rectSnapped(geom.safeFront)}
        />
        {/* AMBER — barcode keep-out box */}
        <path
          className="cover-line-barcode"
          d={rectPath(geom.barcode)}
          data-snapped={rectSnapped(geom.barcode)}
        />
      </svg>

      {textInBleed && (
        <div className="cover-bleed-warning">
          Text is in the bleed area — it will be trimmed off in print.
        </div>
      )}
    </>
  );
}
