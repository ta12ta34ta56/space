import * as fabric from 'fabric';
import { useEffect, useRef } from 'react';
import type { GeneratorKind, Page } from '../../types/canvas.types';
import { pageKindOf } from './page-kind';
import { PUZZLE_EXTRA_PROPS } from './puzzle-utils';

/**
 * Shared machinery for POST-generation live editing (Phase 8E).
 *
 * Every generator panel owns Fabric objects on the page, tagged with
 * `moduleId` + a module-specific role (`wsRole`, `cwRole`, `mzRole`,
 * `hwRole`, `sudokuRole`). When the user changes an Advanced Setting after
 * generation, the panel walks those objects and applies a surgical
 * `obj.set()` patch — no regeneration, no relayout, nothing else on the page
 * is touched.
 *
 * Two things are shared so all five modules behave identically:
 *  - `forEachObjectDeep` — the deep search: objects may live inside Groups
 *    (e.g. Sudoku's furniture icons), so we descend into `_objects`.
 *  - `applyPatcherToModulePages` — the "apply to all pages" engine: replay the
 *    same patch onto every page of the document off-screen, preserving module
 *    metadata.
 */

type Any = Record<string, unknown>;

/** Walk every object on a page, descending into Groups (deep search). */
export function forEachObjectDeep(
  objects: fabric.FabricObject[],
  fn: (o: fabric.FabricObject) => void,
): number {
  let visited = 0;
  const stack = [...objects];
  while (stack.length) {
    const o = stack.pop()!;
    fn(o);
    visited++;
    const kids = (o as unknown as Any)._objects;
    if (Array.isArray(kids)) {
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push(kids[i] as fabric.FabricObject);
      }
    }
  }
  return visited;
}

/** Serialize a page's canvas back to page data, preserving module metadata. */
function serializePage(page: Page, c: fabric.StaticCanvas): Page {
  const json = c.toObject(PUZZLE_EXTRA_PROPS) as { objects: unknown[] };
  // Fabric only serializes what it knows about, so carry over any custom
  // page-level keys (module metadata such as `novelka:wordsearch-page`).
  const prev = (page.data ?? {}) as Record<string, unknown>;
  const carried: Record<string, unknown> = {};
  for (const k of Object.keys(prev)) {
    if (k.includes(':') && !(k in json)) carried[k] = prev[k];
  }
  return {
    ...page,
    data: {
      version: '6.0.0',
      background: page.background ?? '#ffffff',
      objects: json.objects,
      ...carried,
    },
  };
}

/**
 * Apply a style patcher to every page in the document that owns objects of a
 * given module, off-screen. The active page is skipped (`skipPageId`) — it is
 * already correct on screen; call `syncActivePage()` first so its store data
 * is current too.
 */
export async function applyPatcherToModulePages(
  pages: Page[],
  isModuleObject: (o: fabric.FabricObject) => boolean,
  patcher: (o: fabric.FabricObject) => void,
  skipPageId?: string,
  afterAll?: (c: fabric.StaticCanvas, objects: fabric.FabricObject[]) => void,
  /** When given, ONLY pages with this generator kind tag are touched — the
   *  page `kind` is the sole basis for "apply to all", never object heuristics. */
  kind?: GeneratorKind,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (const page of pages) {
    if (page.role === 'cover') {
      // The cover is an isolated surface — module "apply to all" never touches it.
      out.push(page);
      continue;
    }
    if (page.id === skipPageId) {
      out.push(page);
      continue;
    }
    const pageK = pageKindOf(page);
    if (kind && pageK && pageK !== kind) {
      // A page whose persisted generator tag differs from this one is untouched
      // — the kind tag is the authority. Pages without a tag (legacy projects,
      // test fixtures) fall through to the object-based check below.
      out.push(page);
      continue;
    }
    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) {
      try {
        await c.loadFromJSON(page.data);
      } catch {
        c.dispose();
        out.push(page);
        continue;
      }
    }

    let hit = 0;
    forEachObjectDeep(c.getObjects(), (o) => {
      if (isModuleObject(o)) {
        patcher(o);
        hit++;
      }
    });

    if (!hit) {
      c.dispose();
      out.push(page);
      continue;
    }
    // Page-level reconciliation (e.g. crossword block squares) runs after the
    // per-object pass so it can create objects from the patched state.
    afterAll?.(c, c.getObjects());
    c.requestRenderAll();
    out.push(serializePage(page, c));
    c.dispose();
    changed++;
  }

  return { pages: out, changed };
}

/**
 * Trailing-debounce for the "apply to all pages" push. The active page updates
 * instantly on every slider tick; the all-pages replay is queued so a drag
 * doesn't re-render and re-save every page dozens of times.
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void | Promise<void>,
  ms = 200,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return (...args: A) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void fnRef.current(...args);
    }, ms);
  };
}
