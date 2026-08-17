import { useEditorUiStore } from '../../stores/editor-ui-store';
import { Icon, type IconName } from '../Icon';

/**
 * The "work rail" foundation group at the top of the left rail.
 *
 * These are the document-level controls that define how the canvas behaves and
 * how the page is prepared for print — KDP safe area, bleed, rulers, grid,
 * snap, smart guides, margins, page resize, the KDP cover creator, and the
 * live page count. They sit above the content tools so the KDP-first identity
 * of the app is always one glance away.
 */
export function FoundationRail({
  onOpenCover,
  onOpenNumbers,
  onResize,
}: {
  onOpenCover: () => void;
  onOpenNumbers: () => void;
  onResize: () => void;
}) {
  const {
    showKdpGuides,
    toggleKdpGuides,
    showBleed,
    toggleBleed,
    showRulers,
    toggleRulers,
    showGrid,
    toggleGrid,
    snapToGrid,
    toggleSnap,
    smartGuides,
    toggleGuides,
    showMargins,
    toggleMargins,
  } = useEditorUiStore();

  type ToggleDef = {
    id: string;
    label: string;
    icon: IconName;
    on: boolean;
    toggle: () => void;
    title: string;
  };

  const toggles: ToggleDef[] = [
    {
      id: 'kdp',
      label: 'KDP',
      icon: 'shield',
      on: showKdpGuides,
      toggle: toggleKdpGuides,
      title: 'KDP safe area & gutter guides',
    },
    {
      id: 'bleed',
      label: 'Bleed',
      icon: 'crop',
      on: showBleed,
      toggle: toggleBleed,
      title: 'Show 0.125in bleed zone',
    },
    {
      id: 'rulers',
      label: 'Rulers',
      icon: 'ruler',
      on: showRulers,
      toggle: toggleRulers,
      title: 'Show rulers',
    },
    {
      id: 'grid',
      label: 'Grid',
      icon: 'grid',
      on: showGrid,
      toggle: toggleGrid,
      title: 'Show grid',
    },
    {
      id: 'snap',
      label: 'Snap',
      icon: 'magnet',
      on: snapToGrid,
      toggle: toggleSnap,
      title: 'Snap to grid',
    },
    {
      id: 'guides',
      label: 'Guides',
      icon: 'position',
      on: smartGuides,
      toggle: toggleGuides,
      title: 'Smart guides',
    },
    {
      id: 'margins',
      label: 'Margins',
      icon: 'layoutTemplate',
      on: showMargins,
      toggle: toggleMargins,
      title: 'Show margin guides',
    },
  ];

  return (
    <>
      {toggles.map((t) => (
        <button
          key={t.id}
          className={`rail-btn rail-btn-found ${t.on ? 'active' : ''}`}
          onClick={t.toggle}
          title={t.title}
          aria-label={t.title}
          aria-pressed={t.on}
        >
          <Icon name={t.icon} size={18} />
        </button>
      ))}

      <button
        className="rail-btn rail-btn-found"
        onClick={onResize}
        title="Resize page"
        aria-label="Resize page"
      >
        <Icon name="fit" size={18} />
      </button>

      <button
        className="rail-btn rail-btn-found"
        onClick={onOpenCover}
        title="KDP cover creator"
        aria-label="KDP cover creator"
      >
        <Icon name="book" size={18} />
      </button>

      <button
        className="rail-btn rail-btn-found"
        onClick={onOpenNumbers}
        title="Add page numbers"
        aria-label="Add page numbers"
      >
        <Icon name="bookOpen" size={18} />
      </button>
    </>
  );
}
