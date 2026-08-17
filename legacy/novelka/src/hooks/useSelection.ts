import { useEffect, useState } from 'react';
import { engine, type FabricAny } from '../engine/canvas-engine';

export interface SelectionSnapshot {
  count: number;
  primary: FabricAny | null;
  isText: boolean;
  isImage: boolean;
  isGroup: boolean;
  isMultiple: boolean;
  version: number;
}

const EMPTY: SelectionSnapshot = {
  count: 0,
  primary: null,
  isText: false,
  isImage: false,
  isGroup: false,
  isMultiple: false,
  version: 0,
};

/** Bridges fabric's imperative selection into React state. */
export function useSelection(): SelectionSnapshot {
  const [snap, setSnap] = useState<SelectionSnapshot>(EMPTY);

  useEffect(() => {
    let version = 0;
    const read = () => {
      const objs = engine.getActive();
      const primary = (objs[0] as FabricAny) ?? null;
      const t = primary?.type as string | undefined;
      version += 1;
      setSnap({
        count: objs.length,
        primary,
        isText: t === 'textbox' || t === 'i-text' || t === 'text',
        isImage: t === 'image',
        isGroup: t === 'group',
        isMultiple: objs.length > 1,
        version,
      });
    };
    const offs = [
      engine.on('selection', read),
      engine.on('modified', read),
      engine.on('added', read),
      engine.on('removed', read),
    ];
    read();
    return () => offs.forEach((o) => o());
  }, []);

  return snap;
}
