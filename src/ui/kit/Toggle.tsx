/**
 * Toggle — a labelled switch (ui-context.md §5).
 *
 * A real `role="switch"` with a visible text label; the pill shape is the one
 * permitted pill, because it is a true toggle switch. State changes are
 * instant and honest: the track colours with the accent when on.
 */

export type ToggleProps = {
  readonly label: string;
  readonly on: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
};

export function Toggle({ label, on, onToggle, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`kit-toggle${className !== undefined ? ` ${className}` : ''}`}
      onClick={onToggle}
    >
      <span className="kit-toggle-track" aria-hidden="true">
        <span className="kit-toggle-thumb" />
      </span>
      <span className="kit-toggle-label">{label}</span>
    </button>
  );
}
