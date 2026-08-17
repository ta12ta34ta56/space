import { useEffect } from 'react';
import { engine } from '../engine/canvas-engine';
import { useCanvasStore } from '../stores/canvas-store';
import { useEditorUiStore } from '../stores/editor-ui-store';

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useShortcuts(openExport: () => void) {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const store = useCanvasStore.getState();
      const ui = useEditorUiStore.getState();
      // fabric is editing text — let it through
      const editing = engine.canvas
        ?.getActiveObjects()
        .some((o) => (o as { isEditing?: boolean }).isEditing);
      if (editing || isTyping(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        await store.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        await store.redo();
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        await engine.copy();
      } else if (mod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        await engine.cut();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        await engine.paste();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        await engine.duplicate();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        engine.selectAll();
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) engine.ungroup();
        else engine.group();
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        openExport();
      } else if (mod && e.key === '0') {
        e.preventDefault();
        ui.setZoom(1);
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        ui.setZoom(ui.zoom * 1.15);
      } else if (mod && e.key === '-') {
        e.preventDefault();
        ui.setZoom(ui.zoom / 1.15);
      } else if (e.key === 'c' || e.key === 'C') {
        // Toggle the phantom cover guides — only meaningful while on the cover.
        if (store.activePage()?.role === 'cover') {
          e.preventDefault();
          useEditorUiStore.getState().toggleCoverGuides();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (engine.getActive().length) {
          e.preventDefault();
          engine.deleteSelection();
        } else if (document.body.dataset.pageFocused) {
          // A page thumbnail has focus and nothing is selected on the canvas —
          // Delete removes that page.
          e.preventDefault();
          void store.deletePage(document.body.dataset.pageFocused);
        }
      } else if (e.key === 'Escape') {
        engine.canvas?.discardActiveObject();
        engine.canvas?.requestRenderAll();
      } else if (e.key === 'PageDown') {
        e.preventDefault();
        store.nextPage();
      } else if (e.key === 'PageUp') {
        e.preventDefault();
        store.prevPage();
      } else if (e.key === 'Home' && !mod) {
        e.preventDefault();
        store.firstPage();
      } else if (e.key === 'End' && !mod) {
        e.preventDefault();
        store.lastPage();
      } else if (e.key.startsWith('Arrow')) {
        const objs = engine.getActive();

        // Nothing selected? Left/Right flips pages, the way a reader expects.
        if (!objs.length) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            store.nextPage();
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            store.prevPage();
          }
          return;
        }

        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        objs.forEach((o) => {
          o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
          o.setCoords();
        });
        engine.canvas?.requestRenderAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openExport]);
}
