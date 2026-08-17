import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadJSON } from '../services/storage';
import { useCanvasStore } from '../stores/canvas-store';

/**
 * Catches a render crash so the whole app does not go white.
 *
 * The important part is not the apology screen — it is the **Download my work**
 * button. A crash used to take the user's book with it; now the document is
 * still in the Zustand store, so it can be written out to a file before
 * anything else happens.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  saved: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, saved: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console for a bug report; never lose the stack.
    console.error('Novelka crashed:', error, info.componentStack);
  }

  private rescue = () => {
    try {
      const file = useCanvasStore.getState().serialize();
      downloadJSON(file);
      this.setState({ saved: true });
    } catch {
      // Last resort: the store itself is unusable.
      this.setState({ saved: false });
    }
  };

  private reload = () => window.location.reload();

  render() {
    const { error, saved } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1>Something went wrong</h1>
          <p>
            The editor hit an unexpected error. <strong>Your work is still in
            memory</strong> — download a copy before reloading, and you can open
            it again straight away.
          </p>

          <div className="crash-actions">
            <button className="btn primary" onClick={this.rescue}>
              Download my work
            </button>
            <button className="btn" onClick={this.reload}>
              Reload the editor
            </button>
          </div>

          {saved && (
            <p className="crash-ok">
              Saved. Reload, then use <strong>Projects → Open a file</strong> to
              carry on.
            </p>
          )}

          <details className="crash-detail">
            <summary>Technical details</summary>
            <pre>{error.message}\n{error.stack?.slice(0, 1200)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
