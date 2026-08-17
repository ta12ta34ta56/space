import { useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { Icon, type IconName } from '../Icon';

/**
 * Bottom quick-action bar — icons only (tooltips on hover). No visible labels.
 * All toggle logic is the existing editor-ui-store state; zoom is buttons-only.
 * The bar is inset with `--strip-right` so it never overlaps the right panel.
 */
export function EditorFooter() {
  const { pages, activePageId, gotoPage } = useCanvasStore();
  const {
    zoom,
    setZoom,
    zoomToFit,
    showKdpGuides,
    toggleKdpGuides,
    showBleed,
    toggleBleed,
    showGrid,
    toggleGrid,
    snapToGrid,
    toggleSnap,
    smartGuides,
    toggleGuides,
    showMargins,
    toggleMargins,
    showCoverGuides,
    toggleCoverGuides,
    setRightDock,
    rightDock,
  } = useEditorUiStore();

  const [jump, setJump] = useState<string | null>(null);
  const jumpRef = useRef<HTMLInputElement>(null);
  const activeIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const page = pages[activeIndex] ?? pages[0];

  const goToNumber = () => {
    if (jump === null) return;
    const n = parseInt(jump, 10);
    if (!Number.isNaN(n)) {
      const target = pages[Math.max(0, Math.min(pages.length - 1, n - 1))];
      if (target) void gotoPage(target.id);
    }
    setJump(null);
  };

  const openJump = () => {
    setJump(String(activeIndex + 1));
    requestAnimationFrame(() => jumpRef.current?.select());
  };

  const iconBtn = (
    name: IconName,
    on: boolean,
    onClick: () => void,
    title: string,
  ) => (
    <button
      className={`qbar-toggle ${on ? 'active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={on}
    >
      <Icon name={name} size={15} />
    </button>
  );

  return (
    <footer className="editor-footer qbar">
      <div className="qbar-group">
        {iconBtn('shield', showKdpGuides, toggleKdpGuides, 'KDP safe area & gutter guides')}
        {iconBtn('layoutTemplate', showMargins, toggleMargins, 'Show margin & gutter guides')}
        {iconBtn('crop', showBleed, toggleBleed, 'Show 0.125in bleed zone')}
        {iconBtn('bookOpen', showCoverGuides, toggleCoverGuides, 'Show cover bleed reference line')}
      </div>

      <span className="qbar-divider" />

      <div className="qbar-group">
        {iconBtn('magnet', smartGuides, toggleGuides, 'Smart alignment guides')}
        {iconBtn('position', snapToGrid, toggleSnap, 'Snap to grid')}
        {iconBtn('grid', showGrid, toggleGrid, 'Show grid')}
      </div>

      <span className="qbar-divider" />

      <button
        className="qbar-toggle"
        onClick={openJump}
        title="Jump to page"
        aria-label="Jump to page"
      >
        {jump === null ? (
          <Icon name="pages" size={15} />
        ) : (
          <input
            ref={jumpRef}
            className="footer-jump"
            type="number"
            min={1}
            max={pages.length}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goToNumber();
              if (e.key === 'Escape') setJump(null);
            }}
            onBlur={goToNumber}
            aria-label="Jump to page number"
            style={{ width: 44 }}
          />
        )}
      </button>

      <span className="spacer" />

      <div className="qbar-group qbar-zoom">
        <button
          className="qbar-toggle"
          onClick={() => setZoom(zoom - 0.1)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Icon name="minus" size={15} />
        </button>
        <button
          className="qbar-toggle"
          onClick={() => setZoom(zoom + 0.1)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Icon name="plus" size={15} />
        </button>
        <button
          className="qbar-toggle"
          onClick={() => zoomToFit(page.width, page.height)}
          title="Fit page in view"
          aria-label="Fit page in view"
        >
          <Icon name="fit" size={15} />
        </button>
      </div>

      <span className="qbar-divider" />

      <button
        className={`qbar-toggle ${rightDock === 'kdp' ? 'active' : ''}`}
        onClick={() => setRightDock(rightDock === 'kdp' ? null : 'kdp')}
        title="Run KDP preflight checks"
        aria-label="Run KDP preflight checks"
      >
        <Icon name="shield" size={15} />
      </button>
    </footer>
  );
}
