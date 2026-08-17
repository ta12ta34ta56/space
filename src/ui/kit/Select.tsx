/**
 * Select — a labelled native select (ui-context.md §5).
 *
 * Native `<select>`, tokenised. No library, no custom dropdown: the options
 * this app offers are short, closed lists (trims, papers, fonts) and the
 * native control is the accessible one.
 */

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectProps = {
  readonly label: string;
  /** Visually hide the label; it stays as the select's accessible name. */
  readonly hideLabel?: boolean;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
};

export function Select({ label, hideLabel = false, value, options, onValueChange, className }: SelectProps) {
  const select = (
    <select
      className={`kit-select${className !== undefined ? ` ${className}` : ''}`}
      value={value}
      {...(hideLabel ? { 'aria-label': label } : {})}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  if (hideLabel) return select;

  return (
    <label className="kit-field">
      <span className="kit-field-label">{label}</span>
      {select}
    </label>
  );
}
