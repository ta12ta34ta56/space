/**
 * Tooltip — a real explanatory tooltip (ui-context.md §6, §8).
 *
 * Print vocabulary (gutter, bleed, recto, trim) is unfamiliar to beginners,
 * so the terms are used correctly and explained, never dumbed down. The tip
 * shows on hover and on keyboard focus (`:focus-within`), and it is plain
 * DOM: no portal, no library, no delay games.
 */

import type { ReactNode } from 'react';

export type TooltipProps = {
  readonly text: string;
  readonly children: ReactNode;
  /** Which side the tip appears on. The left rail needs `right`. */
  readonly side?: 'top' | 'right';
};

export function Tooltip({ text, children, side = 'top' }: TooltipProps) {
  return (
    <span className={`kit-tipwrap kit-tipwrap-${side}`}>
      {children}
      <span role="tooltip" className="kit-tip">
        {text}
      </span>
    </span>
  );
}
