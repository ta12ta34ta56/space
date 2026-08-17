/**
 * The row model behind the Layers tab (Unit 08, D18).
 *
 * Pure. One row per element on the page, in z order, front-most first, exactly
 * as the legacy panel showed them.
 *
 * **The bug this file closes.** The legacy panel guessed what each row was by
 * inspecting Fabric objects: one predicate ran a regex over a concatenated
 * string, another did twelve truthiness checks, and everything that fell
 * through became "shape". `ElementsPanel` inserted dividers, stickers, icons,
 * borders and patterns all tagged the same, so six visually unrelated families
 * shared one generic row and a 1400x41 divider was treated like a square
 * sticker.
 *
 * In the new Document, `kind` is stored at insertion (D18, invariant 8), so
 * there is nothing to infer. `kindMetaFor` is a lookup; `layerRowsFor` is a
 * sort and a map. Every appearance-sniffing predicate, every puzzle-tag
 * lookup, and the whole clustering mechanism are deleted, not ported: they
 * existed only because the information had been thrown away.
 *
 * **One puzzle is one row (D3).** A puzzle is already one element, so there is
 * nothing to cluster. A row is expandable only if the element genuinely has
 * children, and today no element type does.
 */

import { ELEMENT_KINDS, type Element, type ElementKind, type Page } from '../../model';
import type { IconName } from '../kit/Icon';

/** Icon, colour class and label for one kind. All eleven, no fallback. */
export type KindMeta = {
  readonly icon: IconName;
  readonly className: string;
  readonly label: string;
};

/**
 * The legacy `KIND_META` (six entries) extended to eleven (D18). The six
 * originals keep their exact icon, class and label; the five new families get
 * their own, because "a divider must be recognisable as a divider at a glance"
 * is the owner-visible point of D18.
 *
 * Labels are words. Never "Object".
 */
export const KIND_META: Readonly<Record<ElementKind, KindMeta>> = {
  puzzle: { icon: 'puzzle', className: 'lk-puzzle', label: 'Puzzle' },
  solution: { icon: 'check', className: 'lk-solution', label: 'Solution' },
  template: { icon: 'layoutTemplate', className: 'lk-template', label: 'Template' },
  text: { icon: 'type', className: 'lk-text', label: 'Text' },
  image: { icon: 'image', className: 'lk-image', label: 'Image' },
  shape: { icon: 'shapes', className: 'lk-shape', label: 'Shape' },
  divider: { icon: 'divider', className: 'lk-divider', label: 'Divider' },
  border: { icon: 'border', className: 'lk-border', label: 'Border' },
  pattern: { icon: 'pattern', className: 'lk-pattern', label: 'Pattern' },
  sticker: { icon: 'sticker', className: 'lk-sticker', label: 'Sticker' },
  icon: { icon: 'icon', className: 'lk-icon', label: 'Icon' },
};

/** The presentation for a kind. A total lookup: every kind has its own entry. */
export function kindMetaFor(kind: ElementKind): KindMeta {
  return KIND_META[kind];
}

/** One row of the Layers tab. */
export type LayerRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: ElementKind;
  readonly hidden: boolean;
  readonly locked: boolean;
  /** The element's stacking order, carried through so reorder can compute a z. */
  readonly z: number;
  /** Children exist only when the element genuinely has them. Nothing is synthesised. */
  readonly children: readonly LayerRow[];
};

/**
 * The row's name. Read from the element, never guessed from its appearance:
 * text shows its own words (truncated as the legacy panel did), everything
 * else shows its kind's label.
 */
function nameFor(element: Element): string {
  if (element.type === 'text') {
    const trimmed = element.text.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 28);
  }
  return kindMetaFor(element.kind).label;
}

function rowFor(element: Element): LayerRow {
  return {
    id: element.id,
    name: nameFor(element),
    kind: element.kind,
    hidden: element.hidden,
    locked: element.locked,
    z: element.z,
    // A puzzle is ONE element and therefore ONE row (D3). No element type in
    // the model carries children today, so no row is expandable; when one
    // does, its children come from the Document, not from clustering.
    children: [],
  };
}

/**
 * Every element on a page as a row, in z order, front-most first.
 *
 * Ties are broken by document order, so the list is stable: two elements at
 * the same z never swap places between renders.
 */
export function layerRowsFor(page: Page): readonly LayerRow[] {
  return page.elements
    .map((element, index) => ({ element, index }))
    .sort((a, b) => (b.element.z - a.element.z) || (a.index - b.index))
    .map((entry) => rowFor(entry.element));
}

/**
 * The z value that moves the row at `from` to position `to` in the displayed
 * (front-most first) list.
 *
 * Reorder is an array move on immutable data, then one `element/reorder`
 * command carrying the new z. The legacy version rebuilt Fabric's object order
 * by hand, which is exactly what could desync from the Document.
 */
export function zForMove(rows: readonly LayerRow[], from: number, to: number): number | null {
  if (from < 0 || from >= rows.length) return null;
  if (to < 0 || to >= rows.length) return null;
  if (to === from) return null;

  const moving = rows[from];
  if (moving === undefined) return null;

  const remaining = rows.filter((_, index) => index !== from);
  const above = remaining[to - 1];
  const below = remaining[to];

  // Front-most first, so "above" in the list means a HIGHER z.
  if (above === undefined && below === undefined) return moving.z;
  if (above === undefined && below !== undefined) return below.z + 1;
  if (above !== undefined && below === undefined) return above.z - 1;
  if (above !== undefined && below !== undefined) return (above.z + below.z) / 2;
  return null;
}

/** Every kind has presentation. Asserted here so a new kind cannot be forgotten. */
export const KIND_COUNT = ELEMENT_KINDS.length;
