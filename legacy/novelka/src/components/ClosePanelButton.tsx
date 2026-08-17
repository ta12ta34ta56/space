import { Icon } from './Icon';

/**
 * Always-visible close (×) for a side panel. Dispatches a window event that
 * App.tsx listens for to close the current tool/inspector panel. Also listens
 * for Escape and clicks anywhere outside the panel to close.
 */
export function ClosePanelButton({ label = 'Close panel' }: { label?: string }) {
  return (
    <button
      className="mini-btn panel-close"
      onClick={() => window.dispatchEvent(new CustomEvent('novelka:close-tool'))}
      title={label}
      aria-label={label}
    >
      <Icon name="close" size={13} />
    </button>
  );
}
