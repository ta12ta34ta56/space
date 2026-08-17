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
