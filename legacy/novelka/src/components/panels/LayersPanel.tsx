import { useState } from 'react';
import { engine, type FabricAny } from '../../engine/canvas-engine';
import { useLayers } from '../../hooks/useLayers';
import { useCanvasStore } from '../../stores/canvas-store';
import { Icon } from '../Icon';

export function LayersPanel() {
  const layers = useLayers();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const commit = useCanvasStore((s) => s.commit);

  const total = layers.length;

  const setProp = (id: string, prop: 'locked' | 'visible', value: boolean) => {
    const c = engine.canvas;
    if (!c) return;
    const obj = c.getObjects().find((o) => (o as FabricAny).id === id) as FabricAny;
    if (!obj) return;
    if (prop === 'locked') {
      obj.locked = value;
      obj.selectable = !value;
      obj.evented = !value;
      if (value) c.discardActiveObject();
    } else {
      obj.visible = value;
    }
    c.requestRenderAll();
    commit(prop === 'locked' ? (value ? 'Lock layer' : 'Unlock layer') : 'Toggle visibility');
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const target = layers.find((l) => l.id === targetId);
    if (!target) return;
    engine.moveTo(dragId, target.index);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Layers</span>
        <span className="badge">{total}</span>
      </div>
      <div className="panel-body">
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn icon" title="Bring to front" aria-label="Bring to front" onClick={() => engine.bringToFront()}>
            <Icon name="front" />
          </button>
          <button className="btn icon" title="Bring forward" aria-label="Bring forward" onClick={() => engine.bringForward()}>
            <Icon name="chevronUp" />
          </button>
          <button className="btn icon" title="Send backward" aria-label="Send backward" onClick={() => engine.sendBackwards()}>
            <Icon name="chevronDown" />
          </button>
          <button className="btn icon" title="Send to back" aria-label="Send to back" onClick={() => engine.sendToBack()}>
            <Icon name="back" />
          </button>
          <div className="spacer" />
          <button className="btn icon danger" title="Delete" aria-label="Delete" onClick={() => engine.deleteSelection()}>
            <Icon name="trash2" />
          </button>
        </div>

        {total === 0 ? (
          <div className="empty">
            This page is empty.
            <br />
            Add text, shapes or stickers from the left rail.
          </div>
        ) : (
          <div className="stack" style={{ gap: 2 }}>
            {layers.map((l) => (
              <div
                key={l.id}
                className={`layer-item ${l.isActive ? 'active' : ''} ${overId === l.id ? 'dragover' : ''}`}
                draggable
                onDragStart={() => setDragId(l.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(l.id);
                }}
                onDragLeave={() => setOverId(null)}
                onDrop={() => onDrop(l.id)}
                onClick={() => !l.locked && engine.selectById(l.id)}
              >
                <button
                  className={`mini-btn ${l.visible ? '' : 'on'}`}
                  title={l.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProp(l.id, 'visible', !l.visible);
                  }}
                >
                  <Icon name={l.visible ? 'eye' : 'eyeoff'} size={13} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="layer-name">{l.name}</div>
                  <div className="layer-type">{l.type}</div>
                </div>
                <button
                  className={`mini-btn ${l.locked ? 'on' : ''}`}
                  title={l.locked ? 'Unlock' : 'Lock'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProp(l.id, 'locked', !l.locked);
                  }}
                >
                  <Icon name={l.locked ? 'lock' : 'unlock'} size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="hint" style={{ marginTop: 12 }}>
          Drag a layer to reorder it. Top of the list = front of the page.
        </p>
      </div>
    </div>
  );
}
