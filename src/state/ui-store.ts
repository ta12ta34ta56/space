/**
 * The ephemeral UI store — the second store, deliberately separate from
 * `doc-store` (architecture.md §6, spec 06 §3).
 *
 * Different lifetime: nothing here is ever persisted, undone, or written to
 * the Document. Guide visibility in the Document would make "show gutter" an
 * undoable, autosaved edit (architecture.md §2) — `ui-store.test.mjs` asserts
 * the two stores share no keys, so the split cannot silently erode.
 *
 * Holds: zoom, the current page, guide visibility, the bleed toggle (D9),
 * the active dock panel, and the selection. The selection is declared here
 * and stays empty until Unit 09 populates it.
 */

import { create } from 'zustand';
import type { GuideKind } from '../print/guides';

/** Zoom bounds. `setZoom` clamps; nothing else needs to. */
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/**
 * The zoom ladder the +/- buttons walk. Includes fractional stops (73%, 137%)
 * because the renderer's 2× supersampling keeps them crisp (Unit 05).
 */
export const ZOOM_STEPS: readonly number[] = [
  0.25, 0.33, 0.5, 0.67, 0.73, 0.85, 1, 1.25, 1.37, 1.5, 1.73, 2, 2.5, 3,
];

/** The right dock's panels. Declared now; the dock is filled from Unit 07 on. */
export const PANEL_IDS = ['pages', 'layers', 'inspector', 'generator', 'template'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export type UiStore = {
  readonly zoom: number;
  readonly currentPageIndex: number;
  /** Per-guide visibility. Never in the Document (architecture.md §2). */
  readonly visibleGuides: Readonly<Record<GuideKind, boolean>>;
  /** The book-level bleed toggle (D9). Lives in the editor, not in New Book. */
  readonly bleedOn: boolean;
  readonly activePanel: PanelId | null;
  /** Selected element ids. Declared here, populated in Unit 09. */
  readonly selection: readonly string[];

  readonly setZoom: (zoom: number) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly setCurrentPageIndex: (index: number) => void;
  readonly toggleGuide: (kind: GuideKind) => void;
  readonly toggleBleed: () => void;
  readonly setActivePanel: (panel: PanelId | null) => void;
};

const clampZoom = (zoom: number): number =>
  Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

export const useUiStore = create<UiStore>((set) => ({
  zoom: 1,
  currentPageIndex: 0,
  // All six guides start visible: the guides are the product, and the owner's
  // "spy watching 24/7" is on duty from the first paint (spec 06, Goal).
  visibleGuides: {
    bleed: true,
    trim: true,
    safe: true,
    gutter: true,
    spine: true,
    barcode: true,
  },
  bleedOn: false,
  activePanel: null,
  selection: [],

  setZoom: (zoom) => {
    if (!Number.isFinite(zoom)) return;
    set({ zoom: clampZoom(zoom) });
  },

  zoomIn: () =>
    set((s) => {
      const next = ZOOM_STEPS.find((step) => step > s.zoom + 0.001);
      return { zoom: clampZoom(next ?? s.zoom + 0.25) };
    }),

  zoomOut: () =>
    set((s) => {
      const next = [...ZOOM_STEPS].reverse().find((step) => step < s.zoom - 0.001);
      return { zoom: clampZoom(next ?? s.zoom - 0.25) };
    }),

  setCurrentPageIndex: (index) => {
    if (!Number.isInteger(index) || index < 0) return;
    set({ currentPageIndex: index });
  },

  toggleGuide: (kind) =>
    set((s) => ({
      visibleGuides: { ...s.visibleGuides, [kind]: !s.visibleGuides[kind] },
    })),

  toggleBleed: () => set((s) => ({ bleedOn: !s.bleedOn })),

  setActivePanel: (panel) => set({ activePanel: panel }),
}));
