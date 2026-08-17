import { useEffect, useState } from 'react';
import { engine, type FabricAny } from '../engine/canvas-engine';
import type { LayerInfo } from '../types/canvas.types';

function labelFor(o: FabricAny): string {
  if (o.name) return String(o.name);
  switch (o.type) {
    case 'textbox':
    case 'i-text':
    case 'text':
      return String(o.text ?? 'Text').slice(0, 28) || 'Text';
    case 'image':
      return o.elementType === 'sticker' ? 'Sticker' : 'Image';
    case 'group':
      return `Group (${o._objects?.length ?? 0})`;
    default:
      return o.elementType ?? o.type ?? 'Object';
  }
}

export function useLayers(): LayerInfo[] {
  const [layers, setLayers] = useState<LayerInfo[]>([]);

  useEffect(() => {
    const read = () => {
      const c = engine.canvas;
      if (!c) return setLayers([]);
      const activeIds = new Set(c.getActiveObjects().map((o) => (o as FabricAny).id));
      const list = c.getObjects().map((o, i) => {
        const a = o as FabricAny;
        return {
          id: a.id ?? `idx-${i}`,
          name: labelFor(a),
          type: a.elementType ?? a.type ?? 'object',
          locked: !!a.locked,
          visible: o.visible !== false,
          index: i,
          isActive: activeIds.has(a.id),
        };
      });
      setLayers(list.reverse());
    };
    const offs = [
      engine.on('added', read),
      engine.on('removed', read),
      engine.on('modified', read),
      engine.on('selection', read),
      engine.on('history', read),
    ];
    read();
    const t = setInterval(read, 800);
    return () => {
      offs.forEach((o) => o());
      clearInterval(t);
    };
  }, []);

  return layers;
}
