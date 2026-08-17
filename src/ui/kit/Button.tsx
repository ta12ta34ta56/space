/**
 * Button — the one button primitive (ui-context.md §5).
 *
 * Tokenised, dense, 1px border, 3px radius, 120ms state change. `variant`
 * covers the two looks the shell needs: the quiet default and the single
 * accent primary. The accent appears on the primary action only (D15).
 */

import type { ReactNode } from 'react';

export type ButtonProps = {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly variant?: 'default' | 'primary';
  /** Required when the visible content does not name the action. */
  readonly ariaLabel?: string;
  readonly ariaPressed?: boolean;
  readonly className?: string;
};

export function Button({ children, onClick, variant = 'default', ariaLabel, ariaPressed, className }: ButtonProps) {
  const classes = ['kit-btn'];
  if (variant === 'primary') classes.push('kit-btn-primary');
  if (className !== undefined) classes.push(className);
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
      {...(ariaPressed !== undefined ? { 'aria-pressed': ariaPressed } : {})}
    >
      {children}
    </button>
  );
}
