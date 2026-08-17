import { create } from 'zustand';
import { engine } from '../engine/canvas-engine';

/** Which surface the right-side dock is showing. `null` = collapsed to tabs. */
export type RightDockTab = 'pages' | 'layers' | 'kdp' | null;

interface EditorUiState {
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  smartGuides: boolean;
  gridSize: number;
  showRulers: boolean;
  showMargins: boolean;
  showKdpGuides: boolean;
  showBleed: boolean;
  /** Phantom cover-structure guides (front/spine/back/folds/bleed/safe text). */
  showCoverGuides: boolean;
  pageStripOpen: boolean;
  rightDock: RightDockTab;

  setZoom: (z: number) => void;
  /** Fit the current page inside the visible workspace (buttons-only zoom UI). */
  zoomToFit: (pageWidth: number, pageHeight: number) => void;
  setRightDock: (tab: RightDockTab) => void;
  /** Edge-tab behaviour: click opens, click again closes, other tab switches. */
  toggleRightDock: (tab: Exclude<RightDockTab, null>) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleGuides: () => void;
  toggleRulers: () => void;
  toggleMargins: () => void;
  toggleKdpGuides: () => void;
  toggleBleed: () => void;
  toggleCoverGuides: () => void;
  togglePageStrip: () => void;
  setGridSize: (n: number) => void;
}

export const useEditorUiStore = create<EditorUiState>((set) => ({
  zoom: 1,
  showGrid: false,
  snapToGrid: false,
  smartGuides: true,
  gridSize: 20,
  showRulers: true,
  showMargins: false,
  showKdpGuides: true,
  showBleed: false,
  // The phantom cover guide overlay is ON by default — the user wants to see
  // where front/spine/back/folds/bleed are the moment they open the cover.
  showCoverGuides: true,
  pageStripOpen: true,
  rightDock: 'pages',

  setZoom: (z) => {
    engine.setZoom(z);
    set({ zoom: engine.zoom });
  },

  zoomToFit: (pageWidth, pageHeight) => {
    // Fit the current page/cover inside the visible canvas workspace. Use the
    // stage-wrap (the scrollable area between the panels), accounting for its
    // padding so the page is fully visible with a little breathing room.
    const el =
      typeof document !== 'undefined'
        ? (document.querySelector('.stage-wrap') as HTMLElement | null)
        : null;
    const availW = (el?.clientWidth ?? window.innerWidth) - 56;
    const availH = (el?.clientHeight ?? window.innerHeight) - 56;
    const z = Math.min(availW / Math.max(1, pageWidth), availH / Math.max(1, pageHeight));
    engine.setZoom(Math.min(5, Math.max(0.1, z)));
    set({ zoom: engine.zoom });
    // Re-center the page after zooming so it is actually framed in view.
    requestAnimationFrame(() => {
      const scroller = el;
      if (!scroller) return;
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
      const pageEl = scroller.querySelector<HTMLElement>('.page-shell');
      if (pageEl) {
        pageEl.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
      }
    });
  },

  setRightDock: (tab) => set({ rightDock: tab }),

  toggleRightDock: (tab) =>
    set((s) => ({ rightDock: s.rightDock === tab ? null : tab })),

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  toggleSnap: () =>
    set((s) => {
      const next = !s.snapToGrid;
      engine.snapToGrid = next;
      return { snapToGrid: next };
    }),

  toggleGuides: () =>
    set((s) => {
      const next = !s.smartGuides;
      engine.snapEnabled = next;
      return { smartGuides: next };
    }),

  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  toggleMargins: () => set((s) => ({ showMargins: !s.showMargins })),
  toggleKdpGuides: () => set((s) => ({ showKdpGuides: !s.showKdpGuides })),
  toggleBleed: () => set((s) => ({ showBleed: !s.showBleed })),
  toggleCoverGuides: () => set((s) => ({ showCoverGuides: !s.showCoverGuides })),
  togglePageStrip: () => set((s) => ({ pageStripOpen: !s.pageStripOpen })),

  setGridSize: (gridSize) => {
    engine.gridSize = gridSize;
    set({ gridSize });
  },
}));
