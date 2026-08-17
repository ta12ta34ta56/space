/**
 * Icon — the hand-drawn set (ui-context.md §6, D15).
 *
 * Drawn for this app's vocabulary on a 20×20 grid at 1.5px stroke. Not
 * Lucide, not an icon font. The set grows only when a control needs a glyph,
 * and every icon button carries a text label or a real `aria-label` — words
 * teach, glyphs do not.
 */

const ICON_PATHS = {
  // A minus and plus for the zoom controls.
  minus: 'M4.5 10h11',
  plus: 'M10 4.5v11M4.5 10h11',
  // Bleed: a frame pushed past crop marks — content running off the cut.
  bleed: 'M6.5 2.5v11h11M2.5 6.5h11v11',
  // Trim: the four corner cut marks of a trimmed sheet.
  trim: 'M2.5 6.5v-4h4M17.5 6.5v-4h-4M2.5 13.5v4h4M17.5 13.5v4h-4',
  // Safe area: a page with its protected inner box.
  safe: 'M3 3h14v14H3zM6.5 6.5h7v7h-7z',
  // Gutter: an open spread with the fold in the middle.
  gutter: 'M10 4.5v11.4M10 4.5C8.2 3.3 5.6 3.1 3.5 3.9v11.3c2.1-.8 4.7-.6 6.5.7 1.8-1.3 4.4-1.5 6.5-.7V3.9c-2.1-.8-4.7-.6-6.5.6',
  // Clone: one sheet lifted off another. The Pages tab's duplicate tool.
  clone: 'M6.5 6.5h11v11h-11zM13.5 6.5v-4h-11v11h4',
  // Trash: a bin with a lid and two staves.
  trash2: 'M3.5 5.5h13M8 5.5V3h4v2.5M5.5 5.5l.9 11h7.2l.9-11M8.5 8.5v5M11.5 8.5v5',
  // Eye, open and struck through: layer visibility.
  eye: 'M2 10c2.4-3.7 5.1-5.5 8-5.5s5.6 1.8 8 5.5c-2.4 3.7-5.1 5.5-8 5.5s-5.6-1.8-8-5.5zM10 7.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z',
  eyeoff: 'M3.5 3.5l13 13M6.6 6.7C4.9 7.6 3.3 8.7 2 10c2.4 3.7 5.1 5.5 8 5.5 1.3 0 2.6-.4 3.8-1.1M9 4.6a7 7 0 011-.1c2.9 0 5.6 1.8 8 5.5-.8 1.2-1.7 2.2-2.6 3',
  // A closed and an open padlock.
  lock: 'M4.5 9h11v8h-11zM7 9V6.5a3 3 0 016 0V9',
  unlock: 'M4.5 9h11v8h-11zM7 9V6.5a3 3 0 015.7-1.3',
  // Disclosure chevrons for a layer group.
  chevronDown: 'M5.5 8l4.5 4.5L14.5 8',
  chevronRight: 'M8 5.5l4.5 4.5L8 14.5',
  // Text: a serif capital T on a baseline.
  type: 'M4.5 5.5h11M10 5.5v9M7.5 14.5h5',
  // Image: a framed picture with a sun and a hill.
  image: 'M3 3.5h14v13H3zM7 8a1.2 1.2 0 100-2.4A1.2 1.2 0 007 8zM3 13l4-3.5 4 3.5 3-2.5 3 2.5',
  // Shapes: a square overlapped by a circle.
  shapes: 'M2.5 2.5h9v9h-9zM13 18a4.5 4.5 0 100-9 4.5 4.5 0 000 9z',
  // Puzzle: a jigsaw piece with one tab and one blank.
  puzzle: 'M3 3h5.2a1.8 1.8 0 113.6 0H17v5.2a1.8 1.8 0 100 3.6V17H3v-5.4a1.8 1.8 0 100-3.6z',
  // Check: the solution mark.
  check: 'M4 10.5l4 4 8-9',
  // Template: a page divided into a header and two columns.
  layoutTemplate: 'M3 3.5h14v13H3zM3 8h14M9 8v8.5',
  // Divider: a full-width rule with breathing space above and below.
  divider: 'M3 10h14M5.5 5.5h9M5.5 14.5h9',
  // Border: a decorative frame, doubled.
  border: 'M2.5 2.5h15v15h-15zM5.5 5.5h9v9h-9z',
  // Pattern: a repeating tile of dots.
  pattern: 'M5 5h.01M10 5h.01M15 5h.01M5 10h.01M10 10h.01M15 10h.01M5 15h.01M10 15h.01M15 15h.01',
  // Sticker: a rounded card with a peeled corner.
  sticker: 'M3 3.5h9.5L17 8v8.5H3zM12.5 3.5V8H17',
  // Icon: a small glyph inside its bounding box.
  icon: 'M3.5 3.5h13v13h-13zM10 6.5l1.6 3.3 3.4.5-2.5 2.4.6 3.4-3.1-1.7-3.1 1.7.6-3.4-2.5-2.4 3.4-.5z',
  // Pages and layers: the dock's own tabs.
  pages: 'M6 2.5h11v13h-11zM6 6H3v11.5h11V15',
  layers: 'M10 2.5l7.5 4-7.5 4-7.5-4zM3 11l7 3.7 7-3.7M3 14.5l7 3 7-3',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export type IconProps = {
  readonly name: IconName;
  readonly size?: number;
};

export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
