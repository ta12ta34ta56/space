import { useCanvasStore } from '../../stores/canvas-store';

export function HistoryPanel() {
  const { past, future, jumpToHistory, undo, redo } = useCanvasStore();

  return (
    <div className="panel-body">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn sm" disabled={past.length < 2} onClick={undo}>
          Undo
        </button>
        <button className="btn sm" disabled={!future.length} onClick={redo}>
          Redo
        </button>
        <div className="spacer" />
        <span className="badge">{past.length} steps</span>
      </div>

      <div className="stack" style={{ gap: 1 }}>
        {[...past].reverse().map((h, ri) => {
          const i = past.length - 1 - ri;
          return (
            <button
              key={`${h.at}-${i}`}
              className={`history-item ${i === past.length - 1 ? 'current' : ''}`}
              onClick={() => jumpToHistory(i)}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{h.label}</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>
                {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </button>
          );
        })}
        {future.map((h, i) => (
          <div key={`f-${h.at}-${i}`} className="history-item future">
            <span style={{ flex: 1 }}>{h.label}</span>
            <span style={{ fontSize: 10 }}>redo</span>
          </div>
        ))}
      </div>

      {past.length === 0 && <div className="empty">No history yet.</div>}
    </div>
  );
}
