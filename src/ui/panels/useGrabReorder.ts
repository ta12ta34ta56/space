/**
 * Grab-reorder — the list reorder the owner built, ported from
 * `legacy/novelka/src/hooks/useGrabReorder.ts` (D17, D21).
 *
 * Double-click a row to grab it, move the pointer (a drop-line shows where it
 * will land, and the list auto-scrolls near its edges), release to drop.
 * Escape cancels. Rows carry `data-reorder-id`; the list carries `listRef`.
 *
 * This is NOT HTML5 drag-and-drop and NOT free-form canvas dragging (D21,
 * invariant 11). It is a list reorder, and it has a keyboard equivalent that
 * the panels wire to the arrow keys.
 *
 * Two things changed in the port, both forced by the new architecture:
 *
 *  1. **`onReorder` is called once, on release**, with a `from`/`to` pair the
 *     caller turns into ONE Command. A drag is one undo entry (spec 02 §3), so
 *     there is no per-pointermove commit here and never was.
 *  2. **The drop index is converted from an insertion point to a move
 *     target.** The legacy hook passed the raw insertion index straight into a
 *     splice-move, which lands a row one place short whenever it moves down
 *     the list. The drop-line is what the user is aiming at, so the index is
 *     corrected here to match it exactly. Same gesture, same line, same
 *     result the line promised.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type GrabReorder = {
  /** Attach to the scrollable list element that contains the rows. */
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  /** The id of the row currently grabbed, or null. */
  readonly grabId: string | null;
  /** Pixels from the top of the list to draw the drop-line at, or null. */
  readonly indicatorTop: number | null;
  readonly grab: (id: string) => void;
  readonly cancel: () => void;
};

/** How close to the list edge auto-scroll kicks in, and how fast it moves. */
const EDGE_PX = 40;
const EDGE_STEP_PX = 14;

export function useGrabReorder<T extends { readonly id: string }>(
  items: readonly T[],
  onReorder: (from: number, to: number) => void,
): GrabReorder {
  const [grabId, setGrabId] = useState<string | null>(null);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Live values for the window listeners, which are attached once per grab.
  const grabIdRef = useRef<string | null>(null);
  grabIdRef.current = grabId;
  const itemsRef = useRef<readonly T[]>(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const pointerYRef = useRef(0);

  /** The nearest scrolling ancestor; the list itself if there is none. */
  const scrollElement = (): HTMLElement | null => {
    const list = listRef.current;
    if (list === null) return null;
    let node: HTMLElement | null = list;
    while (node !== null && node !== document.body) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') return node;
      node = node.parentElement;
    }
    return list;
  };

  /** Which slot the drop-line is pointing at, in [0, rows.length]. */
  const insertionIndex = useCallback((): number | null => {
    const list = listRef.current;
    if (list === null) return null;
    const rows = [...list.querySelectorAll<HTMLElement>('[data-reorder-id]')];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row === undefined) continue;
      const rect = row.getBoundingClientRect();
      if (pointerYRef.current < rect.top + rect.height / 2) return index;
    }
    return rows.length;
  }, []);

  const grab = useCallback((id: string) => {
    setGrabId(id);
  }, []);

  const cancel = useCallback(() => {
    setGrabId(null);
    setIndicatorTop(null);
  }, []);

  const finish = useCallback(() => {
    const from = itemsRef.current.findIndex((item) => item.id === grabIdRef.current);
    const slot = insertionIndex();
    cancel();
    if (from < 0 || slot === null) return;
    // An insertion slot below the grabbed row closes up by one once the row
    // is lifted out, so the move target is one less than the slot.
    const to = slot > from ? slot - 1 : slot;
    if (to === from) return;
    onReorderRef.current(from, to);
  }, [cancel, insertionIndex]);

  useEffect(() => {
    if (grabId === null) return;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const list = listRef.current;
      if (list === null) return;
      pointerYRef.current = e.clientY;
      const rect = list.getBoundingClientRect();
      setIndicatorTop(Math.max(0, Math.min(rect.height, e.clientY - rect.top)));
    };

    const onUp = () => {
      finish();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };

    // Auto-scroll while the pointer sits near an edge, so a long list can be
    // reordered without letting go.
    const tick = () => {
      const scroller = scrollElement();
      if (scroller !== null) {
        const rect = scroller.getBoundingClientRect();
        const y = pointerYRef.current;
        if (y < rect.top + EDGE_PX) scroller.scrollTop -= EDGE_STEP_PX;
        else if (y > rect.bottom - EDGE_PX) scroller.scrollTop += EDGE_STEP_PX;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKeyDown);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [grabId, cancel, finish]);

  return { listRef, grabId, indicatorTop, grab, cancel };
}
