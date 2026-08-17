/**
 * BottomBar — zoom, fit, page nav, bleed (spec 06 §6). 36px.
 *
 * Structure and behaviour ported from the legacy EditorFooter (D17): the
 * zoom group, the page control that swaps to an inline number input for
 * jump-to-page (Enter commits, Escape cancels, blur commits), and the same
 * aria labelling. Colours retokenised to D23. The legacy footer's KDP/grid/
 * snap toggles are not reproduced here: guide toggles live on the left rail,
 * and grid/snap arrive with Unit 09.
 *
 * The page indicator reads "9 of 10" and opens jump-to-page when clicked
 * (D21). Bleed lives HERE, not in New Book (D9): at creation the user does
 * not yet know whether they want bleed; in the editor, with the page in
 * front of them, they do.
 */

import { useRef, useState } from 'react';
import { store } from '../../state/store';
import { useUiStore } from '../../state/ui-store';
import { Button } from '../kit/Button';
import { Icon } from '../kit/Icon';
import { Toggle } from '../kit/Toggle';
import { Tooltip } from '../kit/Tooltip';

export type BottomBarProps = {
  /** Fit needs the workspace's measured size, which the shell owns. */
  readonly onFit: () => void;
};

export function BottomBar({ onFit }: BottomBarProps) {
  const pageCount = store((s) => s.doc.pages.length);
  const zoom = useUiStore((s) => s.zoom);
  const zoomIn = useUiStore((s) => s.zoomIn);
  const zoomOut = useUiStore((s) => s.zoomOut);
  const setZoom = useUiStore((s) => s.setZoom);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);
  const setCurrentPageIndex = useUiStore((s) => s.setCurrentPageIndex);
  const bleedOn = useUiStore((s) => s.bleedOn);
  const toggleBleed = useUiStore((s) => s.toggleBleed);

  const [jump, setJump] = useState<string | null>(null);
  const jumpRef = useRef<HTMLInputElement | null>(null);

  const currentPage = pageCount === 0 ? 0 : Math.min(currentPageIndex, pageCount - 1) + 1;

  const openJump = () => {
    setJump(String(currentPage));
    // Focus after the input exists; ported from the legacy footer.
    requestAnimationFrame(() => jumpRef.current?.select());
  };

  const commitJump = () => {
    if (jump !== null && pageCount > 0) {
      const n = Number.parseInt(jump, 10);
      if (!Number.isNaN(n)) {
        setCurrentPageIndex(Math.min(pageCount - 1, Math.max(0, n - 1)));
      }
    }
    setJump(null);
  };

  return (
    <footer className="shell-bottom">
      <div className="bar-group" role="toolbar" aria-label="Zoom">
        <Button onClick={zoomOut} ariaLabel="Zoom out">
          <Icon name="minus" size={14} />
        </Button>
        <Button onClick={() => setZoom(1)} ariaLabel="Reset zoom to 100%" className="bar-zoom-readout">
          {Math.round(zoom * 100)}%
        </Button>
        <Button onClick={zoomIn} ariaLabel="Zoom in">
          <Icon name="plus" size={14} />
        </Button>
        <Button onClick={onFit} ariaLabel="Fit the page in the window">
          Fit
        </Button>
      </div>

      {pageCount > 0 && (
        <>
          <span className="bar-divider" aria-hidden="true" />
          {jump === null ? (
            <button
              type="button"
              className="bar-page"
              onClick={openJump}
              aria-label={`Page ${currentPage} of ${pageCount}. Jump to another page.`}
            >
              {currentPage} of {pageCount}
            </button>
          ) : (
            <input
              ref={jumpRef}
              className="bar-jump"
              type="number"
              min={1}
              max={pageCount}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitJump();
                if (e.key === 'Escape') setJump(null);
              }}
              onBlur={commitJump}
              aria-label="Jump to page number"
            />
          )}
        </>
      )}

      <span className="bar-spacer" />

      <Tooltip text="Bleed. Art meant to run off the page must extend 0.125 in past the trim line. Turning bleed on changes the page geometry, the guides and the export together.">
        <Toggle label="Bleed" on={bleedOn} onToggle={toggleBleed} />
      </Tooltip>
    </footer>
  );
}
