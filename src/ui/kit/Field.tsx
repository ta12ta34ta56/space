/**
 * Field — a labelled text input (ui-context.md §5).
 *
 * The label can be visually hidden (the top bar's inline book name), but it
 * always exists for assistive tech. Enter commits, Escape cancels; both are
 * the caller's to define.
 */

export type FieldProps = {
  readonly label: string;
  /** Visually hide the label; it stays as the input's accessible name. */
  readonly hideLabel?: boolean;
  readonly value: string;
  readonly placeholder?: string;
  readonly onValueChange: (value: string) => void;
  /** Called on blur and on Enter. */
  readonly onCommit?: () => void;
  /** Called on Escape. */
  readonly onCancel?: () => void;
  readonly className?: string;
};

export function Field({
  label,
  hideLabel = false,
  value,
  placeholder,
  onValueChange,
  onCommit,
  onCancel,
  className,
}: FieldProps) {
  const input = (
    <input
      className={`kit-field-input${className !== undefined ? ` ${className}` : ''}`}
      type="text"
      value={value}
      {...(placeholder !== undefined ? { placeholder } : {})}
      {...(hideLabel ? { 'aria-label': label } : {})}
      onChange={(e) => onValueChange(e.target.value)}
      onBlur={() => onCommit?.()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') onCancel?.();
      }}
    />
  );

  if (hideLabel) return input;

  return (
    <label className="kit-field">
      <span className="kit-field-label">{label}</span>
      {input}
    </label>
  );
}
