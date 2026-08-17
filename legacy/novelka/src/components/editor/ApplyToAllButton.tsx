import { Icon } from '../Icon';

/**
 * Intelligent "apply to all" for generators — replaces the old checkbox.
 *
 * It only appears when the user has actually made a change on the current
 * puzzle (pending), lets them push it to every puzzle of the same kind in one
 * undoable action, then shows "Applied" and stays quiet until they change
 * something again.
 */
export function ApplyToAllButton({
  label,
  pending,
  applied,
  onApply,
  busy,
}: {
  label: string;
  pending: boolean;
  applied: boolean;
  onApply: () => void;
  busy?: boolean;
}) {
  if (!pending && !applied) return null;

  if (applied && !pending) {
    return (
      <div className="apply-all-row applied">
        <Icon name="check" size={14} />
        <span>Applied to all {label} puzzles</span>
      </div>
    );
  }

  return (
    <button className="apply-all-row btn primary" onClick={onApply} disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
      <Icon name="wandSparkles" size={14} />
      {busy ? 'Updating…' : `Update all ${label} puzzles`}
    </button>
  );
}
