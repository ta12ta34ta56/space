import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Double-click-to-grab list reordering with a drop indicator and edge
 * auto-scroll. Used by both the Pages panel and the Layers panel so drag
 * reorder behaves identically everywhere (no permanent up/down buttons).
 *
 * Flow: double-click a row to grab it -> move the mouse (a line shows where it
 * will land; near the top/bottom of the list it auto-scrolls) -> click/release
 * to drop. Escape cancels.
 *
 * Rows must carry `data-reorder-id` and the hook is given a ref to the
 * scrollable list.
 */
export function useGrabReorder<T extends { id: string }>(
  items: T[],
  onReorder: (from: number, to: number) => void,
) {
  const [grabId, setGrabId] = useState<string | null>(null);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const grabIdRef = useRef<string | null>(null);
  grabIdRef.current = grabId;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  /** The element that actually scrolls (may be an ancestor of the list). */
  const scrollEl = () => {
    const list = listRef.current;
    if (!list) return null;
    let node: HTMLElement | null = list;
    // Walk up to find an overflow-y:auto scroll container.
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
      node = node.parentElement;
    }
    return list;
  };

  const grab = useCallback((id: string) => {
    setGrabId(id);
  }, []);

  const grabYRef = useRef(0);

  const computeIndex = useCallback(() => {
    const list = listRef.current;
    if (!list) return null;
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-reorder-id]'));
    let idx = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (grabYRef.current < r.top + r.height / 2) {
        idx = i;
        break;
      }
    }
    return idx;
  }, []);

  const cancel = useCallback(() => {
    setGrabId(null);
    setIndicatorTop(null);
  }, []);

  const finish = useCallback(() => {
    const from = itemsRef.current.findIndex((i) => i.id === grabIdRef.current);
    const over = computeIndex();
    cancel();
    if (from >= 0 && over !== null && from !== over) {
      onReorderRef.current(from, over);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeIndex, cancel]);

  useEffect(() => {
    if (!grabId) return;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const list = listRef.current;
      if (!list) return;
      grabYRef.current = e.clientY;
      const listRect = list.getBoundingClientRect();
      const y = e.clientY - listRect.top;
      setIndicatorTop(Math.max(0, Math.min(listRect.height, y)));
    };

    const onUp = (e: PointerEvent) => {
      // A click on the grabbed row itself is also a drop.
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-reorder-id]')) {
        finish();
      } else {
        finish();
      }
    };

    const tick = () => {
      const scroller = scrollEl();
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const edge = 40;
        const y = grabYRef.current;
        if (y < rect.top + edge) scroller.scrollTop -= 14;
        else if (y > rect.bottom - edge) scroller.scrollTop += 14;
      }
      raf = requestAnimationFrame(tick);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabId, cancel, finish]);

  return { listRef, grabId, indicatorTop, grab, cancel, finish };
}
