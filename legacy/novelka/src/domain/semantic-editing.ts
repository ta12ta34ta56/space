import * as fabric from 'fabric';
import type { Page } from '../types/canvas.types';
import type {
  GeneratedInstance,
  PageGeometry,
  StyleConfiguration,
  WordSearchContentSpec,
  WordSearchLayoutResult,
} from './types';
import { computePageGeometry } from './geometry';
import { layoutWordSearchPage } from './word-search-solver';
import { applyInstanceOverride, resetInstanceOverride } from './instance-manager';
import { wsInstancesOf, wsMetaOf, NOVELKA_INSTANCES } from '../modules/word-search/build-pages';
import { patchWsObject } from '../modules/word-search/layout';
import type { WordSearchStyle } from '../modules/word-search/renderer';

export type SemanticScope =
  | 'this_instance'
  | 'all_puzzles_on_page'
  | 'all_puzzles_in_book'
  | 'all_solutions_in_book'
  | 'matching_template';

export interface SemanticSelectionResult {
  instance: GeneratedInstance | null;
  objects: fabric.FabricObject[];
  instanceId: string | null;
  role: string | null;
  isOverridden: boolean;
}

type AnyObj = Record<string, unknown>;

/** Collect every object recursively, descending into Groups (deep search). */
function collectDeep(objects: fabric.FabricObject[] | AnyObj[]): (fabric.FabricObject | AnyObj)[] {
  const out: (fabric.FabricObject | AnyObj)[] = [];
  const stack = [...objects];
  while (stack.length) {
    const o = stack.pop()!;
    out.push(o);
    const kids = (o as AnyObj)._objects;
    if (Array.isArray(kids)) stack.push(...(kids as AnyObj[]));
  }
  return out;
}

/** The top-level canvas objects that contain any of the given members. */
function topLevelUnits(
  canvas: fabric.Canvas | fabric.StaticCanvas,
  members: fabric.FabricObject[],
): fabric.FabricObject[] {
  const memberSet = new Set<fabric.FabricObject>(members);
  return canvas.getObjects().filter((o) => collectDeep([o]).some((m) => memberSet.has(m as fabric.FabricObject)));
}

/**
 * Identify the logical instance for a selected canvas object.
 */
export function resolveInstanceForObject(
  object: fabric.FabricObject | null | undefined,
  page: Page,
): GeneratedInstance | null {
  if (!object) return null;
  const anyObj = object as unknown as AnyObj;
  const targetId = (anyObj.instanceId as string) || (anyObj.wsPuzzle as string);
  if (!targetId) return null;

  const instances = wsInstancesOf(page);
  const found = instances.find(
    (inst) =>
      inst.instanceId === targetId ||
      inst.contentId === targetId ||
      inst.objectIds.includes(anyObj.id as string),
  );

  return found ?? null;
}

/**
 * Find all canvas objects belonging to a specific instance.
 */
export function getObjectsForInstance(
  canvas: fabric.Canvas | fabric.StaticCanvas,
  instance: GeneratedInstance | null | undefined,
): fabric.FabricObject[] {
  if (!instance) return [];
  // Descend into groups: generated puzzles are real Groups, so their letters,
  // rules and bank objects are nested. We return the loose members so style
  // patches and geometry reads work exactly as before.
  const allObjects = collectDeep(canvas.getObjects()) as fabric.FabricObject[];
  const idSet = new Set(instance.objectIds ?? []);

  return allObjects.filter((o) => {
    const any = o as unknown as AnyObj;
    if (any.instanceId && any.instanceId === instance.instanceId) return true;
    if (any.id && idSet.has(any.id as string)) return true;
    if (any.wsPuzzle && any.wsPuzzle === instance.contentId) return true;
    return false;
  });
}

/**
 * Select all objects belonging to a logical instance on the live canvas.
 */
export function selectSemanticInstance(
  canvas: fabric.Canvas,
  instance: GeneratedInstance,
): SemanticSelectionResult {
  const memberObjects = getObjectsForInstance(canvas, instance);
  if (!memberObjects.length) {
    return {
      instance: null,
      objects: [],
      instanceId: null,
      role: null,
      isOverridden: false,
    };
  }

  canvas.discardActiveObject();

  // If the puzzle is a real group, select the containing group(s) so the whole
  // unit (letters + clues) is selected and moves/scales as one.
  const units = topLevelUnits(canvas, memberObjects);
  const selectables = units.filter((o) => o.selectable !== false);

  if (selectables.length === 1) {
    canvas.setActiveObject(selectables[0]);
  } else if (selectables.length > 1) {
    const sel = new fabric.ActiveSelection(selectables, { canvas });
    (sel as unknown as AnyObj).borderDashArray = [6, 4];
    (sel as unknown as AnyObj).borderColor = '#6366f1';
    canvas.setActiveObject(sel);
  } else if (memberObjects.length === 1) {
    canvas.setActiveObject(memberObjects[0]);
  } else {
    const sel = new fabric.ActiveSelection(memberObjects, { canvas });
    (sel as unknown as AnyObj).borderDashArray = [6, 4];
    (sel as unknown as AnyObj).borderColor = '#6366f1';
    canvas.setActiveObject(sel);
  }

  canvas.requestRenderAll();

  return {
    instance,
    objects: memberObjects,
    instanceId: instance.instanceId,
    role: instance.role,
    isOverridden: !!instance.overrides?.isOverridden,
  };
}

/**
 * Move all objects of a logical instance by (dx, dy).
 * Updates instance layout offset and object coordinates without touching unrelated objects.
 */
export function moveSemanticInstance(
  canvas: fabric.Canvas,
  page: Page,
  instanceId: string,
  dx: number,
  dy: number,
): { page: Page; movedCount: number } {
  const instances = wsInstancesOf(page);
  const inst = instances.find((i) => i.instanceId === instanceId);
  if (!inst) return { page, movedCount: 0 };

  // Move the top-level group (or the loose members) so the whole puzzle shifts.
  const memberObjects = getObjectsForInstance(canvas, inst);
  const units = topLevelUnits(canvas, memberObjects);
  const targets = units.length ? units : memberObjects;
  targets.forEach((o) => {
    o.set({
      left: (o.left ?? 0) + dx,
      top: (o.top ?? 0) + dy,
    });
    o.setCoords();
    o.dirty = true;
  });
  canvas.requestRenderAll();

  const currentOffsetX = (inst.overrides?.layout?.offsetX ?? 0) + dx;
  const currentOffsetY = (inst.overrides?.layout?.offsetY ?? 0) + dy;

  const updatedInst = applyInstanceOverride(inst, {
    layout: { offsetX: currentOffsetX, offsetY: currentOffsetY },
  });

  const nextInstances = instances.map((i) => (i.instanceId === instanceId ? updatedInst : i));

  const nextData = {
    ...(page.data as Record<string, unknown>),
    [NOVELKA_INSTANCES]: nextInstances,
    instances: nextInstances,
  };

  return {
    page: { ...page, data: nextData },
    movedCount: memberObjects.length,
  };
}

/**
 * Apply a style patch to a single instance on canvas and update its override.
 */
export function styleSemanticInstance(
  canvas: fabric.Canvas,
  page: Page,
  instanceId: string,
  stylePatch: Partial<StyleConfiguration>,
): { page: Page; patchedCount: number } {
  const instances = wsInstancesOf(page);
  const inst = instances.find((i) => i.instanceId === instanceId);
  if (!inst) return { page, patchedCount: 0 };

  const effectiveStyle: StyleConfiguration = {
    ...inst.style,
    ...inst.overrides?.style,
    ...stylePatch,
  };

  const memberObjects = getObjectsForInstance(canvas, inst);
  memberObjects.forEach((o) => {
    patchWsObject(o, effectiveStyle as unknown as WordSearchStyle);
  });
  canvas.requestRenderAll();

  const updatedInst = applyInstanceOverride(inst, {
    style: stylePatch,
  });

  const nextInstances = instances.map((i) => (i.instanceId === instanceId ? updatedInst : i));

  const nextData = {
    ...(page.data as Record<string, unknown>),
    [NOVELKA_INSTANCES]: nextInstances,
    instances: nextInstances,
  };

  return {
    page: { ...page, data: nextData },
    patchedCount: memberObjects.length,
  };
}

/**
 * Apply style overrides across a specific semantic scope (e.g. all puzzles in book, all on page, all solutions).
 */
export function applyStyleToScope(
  pages: Page[],
  activePageId: string,
  targetInstance: GeneratedInstance,
  stylePatch: Partial<StyleConfiguration>,
  scope: SemanticScope,
  activeCanvas?: fabric.Canvas | null,
): { pages: Page[]; changedInstances: number } {
  let changedInstances = 0;

  const nextPages = pages.map((page) => {
    const instances = wsInstancesOf(page);
    if (!instances.length) return page;

    let pageModified = false;
    const nextInstances = instances.map((inst) => {
      let matches = false;

      switch (scope) {
        case 'this_instance':
          matches = inst.instanceId === targetInstance.instanceId;
          break;
        case 'all_puzzles_on_page':
          matches = page.id === activePageId && inst.role === 'puzzle';
          break;
        case 'all_puzzles_in_book':
          matches = inst.role === 'puzzle';
          break;
        case 'all_solutions_in_book':
          matches = inst.role === 'solution';
          break;
        case 'matching_template':
          matches = inst.source.rawMetadata?.legacyTemplateId === targetInstance.source.rawMetadata?.legacyTemplateId;
          break;
      }

      if (!matches) return inst;

      pageModified = true;
      changedInstances++;

      // If active canvas is provided and we're on the active page, patch objects directly
      if (page.id === activePageId && activeCanvas) {
        const objs = getObjectsForInstance(activeCanvas, inst);
        const mergedStyle = { ...inst.style, ...inst.overrides?.style, ...stylePatch };
        objs.forEach((o) => patchWsObject(o, mergedStyle as unknown as WordSearchStyle));
      }

      return applyInstanceOverride(inst, { style: stylePatch });
    });

    if (!pageModified) return page;

    // Offscreen page serialization update
    const prevData = (page.data ?? {}) as Record<string, unknown>;
    const objects = (prevData.objects ?? []) as AnyObj[];

    const effectivePatch = stylePatch as Record<string, unknown>;
    const updatedObjects = objects.map((obj) => {
      const isMember = nextInstances.some(
        (inst) =>
          inst.overrides?.isOverridden &&
          (obj.instanceId === inst.instanceId || inst.objectIds.includes(obj.id as string)),
      );
      if (!isMember) return obj;

      const nextObj = { ...obj };
      if (effectivePatch.fontFamily) nextObj.fontFamily = effectivePatch.fontFamily;
      if (effectivePatch.letterColor && (obj.wsRole === 'ws-letter' || obj.wsRole === 'ws-label' || obj.wsRole === 'ws-title')) {
        nextObj.fill = effectivePatch.letterColor;
      }
      if (effectivePatch.gridLineColor && (obj.wsRole === 'ws-rule' || obj.wsRole === 'ws-frame')) {
        nextObj.stroke = effectivePatch.gridLineColor;
      }
      if (effectivePatch.bankColor && obj.wsRole === 'ws-bank') {
        nextObj.fill = effectivePatch.bankColor;
      }
      return nextObj;
    });

    return {
      ...page,
      data: {
        ...prevData,
        objects: updatedObjects,
        [NOVELKA_INSTANCES]: nextInstances,
        instances: nextInstances,
      },
    };
  });

  if (activeCanvas) {
    activeCanvas.requestRenderAll();
  }

  return { pages: nextPages, changedInstances };
}

/**
 * Reset overrides on an instance and restore default layout/style.
 */
export function resetSemanticInstance(
  canvas: fabric.Canvas,
  page: Page,
  instanceId: string,
): { page: Page; reset: boolean } {
  const instances = wsInstancesOf(page);
  const inst = instances.find((i) => i.instanceId === instanceId);
  if (!inst) return { page, reset: false };

  const resetInst = resetInstanceOverride(inst);

  const memberObjects = getObjectsForInstance(canvas, inst);
  memberObjects.forEach((o) => {
    patchWsObject(o, resetInst.style as unknown as WordSearchStyle);
  });
  canvas.requestRenderAll();

  const nextInstances = instances.map((i) => (i.instanceId === instanceId ? resetInst : i));

  const nextData = {
    ...(page.data as Record<string, unknown>),
    [NOVELKA_INSTANCES]: nextInstances,
    instances: nextInstances,
  };

  return {
    page: { ...page, data: nextData },
    reset: true,
  };
}

/**
 * Reset all matching instances in a given scope.
 */
export function resetScope(
  pages: Page[],
  activePageId: string,
  targetInstance: GeneratedInstance,
  scope: SemanticScope,
  activeCanvas?: fabric.Canvas | null,
): { pages: Page[]; resetCount: number } {
  let resetCount = 0;

  const nextPages = pages.map((page) => {
    const instances = wsInstancesOf(page);
    if (!instances.length) return page;

    let modified = false;
    const nextInstances = instances.map((inst) => {
      let matches = false;
      switch (scope) {
        case 'this_instance':
          matches = inst.instanceId === targetInstance.instanceId;
          break;
        case 'all_puzzles_on_page':
          matches = page.id === activePageId && inst.role === 'puzzle';
          break;
        case 'all_puzzles_in_book':
          matches = inst.role === 'puzzle';
          break;
        case 'all_solutions_in_book':
          matches = inst.role === 'solution';
          break;
        case 'matching_template':
          matches = inst.source.rawMetadata?.legacyTemplateId === targetInstance.source.rawMetadata?.legacyTemplateId;
          break;
      }

      if (!matches || !inst.overrides?.isOverridden) return inst;

      modified = true;
      resetCount++;

      const resetInst = resetInstanceOverride(inst);

      if (page.id === activePageId && activeCanvas) {
        const objs = getObjectsForInstance(activeCanvas, inst);
        objs.forEach((o) => patchWsObject(o, resetInst.style as unknown as WordSearchStyle));
      }

      return resetInst;
    });

    if (!modified) return page;

    return {
      ...page,
      data: {
        ...(page.data as Record<string, unknown>),
        [NOVELKA_INSTANCES]: nextInstances,
        instances: nextInstances,
      },
    };
  });

  if (activeCanvas) {
    activeCanvas.requestRenderAll();
  }

  return { pages: nextPages, resetCount };
}

/**
 * Reposition canvas objects according to exact solver layout frames.
 */
export function applyFramesToObjects(
  objects: (fabric.FabricObject | AnyObj)[],
  frames: import('./types').WordSearchFrames,
): void {
  // Title
  if (frames.titleFrame) {
    const tf = frames.titleFrame;
    const titleObj = objects.find((o) => (o as AnyObj).wsRole === 'ws-title');
    if (titleObj) {
      if (typeof (titleObj as fabric.FabricObject).set === 'function') {
        (titleObj as fabric.FabricObject).set({ left: tf.left, top: tf.top, width: tf.width });
        (titleObj as fabric.FabricObject).setCoords();
      } else {
        (titleObj as AnyObj).left = tf.left;
        (titleObj as AnyObj).top = tf.top;
        (titleObj as AnyObj).width = tf.width;
      }
    }
  }

  // Subtitle
  if (frames.subtitleFrame) {
    const sf = frames.subtitleFrame;
    const subObj = objects.find((o) => (o as AnyObj).wsRole === 'ws-subtitle');
    if (subObj) {
      if (typeof (subObj as fabric.FabricObject).set === 'function') {
        (subObj as fabric.FabricObject).set({ left: sf.left, top: sf.top, width: sf.width });
        (subObj as fabric.FabricObject).setCoords();
      } else {
        (subObj as AnyObj).left = sf.left;
        (subObj as AnyObj).top = sf.top;
        (subObj as AnyObj).width = sf.width;
      }
    }
  }

  // Folio / Page Number
  if (frames.pageNumberFrame) {
    const fn = frames.pageNumberFrame;
    const folioObj = objects.find((o) => (o as AnyObj).wsRole === 'ws-folio');
    if (folioObj) {
      if (typeof (folioObj as fabric.FabricObject).set === 'function') {
        (folioObj as fabric.FabricObject).set({ left: fn.left, top: fn.top, width: fn.width });
        (folioObj as fabric.FabricObject).setCoords();
      } else {
        (folioObj as AnyObj).left = fn.left;
        (folioObj as AnyObj).top = fn.top;
        (folioObj as AnyObj).width = fn.width;
      }
    }
  }

  // Puzzles
  frames.puzzles.forEach((pf) => {
    const puzzleObjs = objects.filter(
      (o) => (o as AnyObj).contentId === pf.id || (o as AnyObj).wsPuzzle === pf.id,
    );
    if (!puzzleObjs.length) return;

    const gf = pf.gridFrame;
    const cell = pf.cellSize;
    const n = pf.gridSize;

    puzzleObjs.forEach((o) => {
      const any = o as AnyObj;
      const role = (any.wsRole as string) || '';

      if (role === 'ws-label' && pf.captionFrame) {
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: pf.captionFrame.left,
            top: pf.captionFrame.top,
            width: pf.captionFrame.width,
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          any.left = pf.captionFrame.left;
          any.top = pf.captionFrame.top;
          any.width = pf.captionFrame.width;
        }
      } else if (role === 'ws-bg' || role === 'ws-frame') {
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: gf.left,
            top: gf.top,
            width: gf.width,
            height: gf.height,
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          any.left = gf.left;
          any.top = gf.top;
          any.width = gf.width;
          any.height = gf.height;
        }
      } else if (role === 'ws-bank-frame' && pf.wordListFrame) {
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: pf.wordListFrame.left,
            top: pf.wordListFrame.top - 4,
            width: pf.wordListFrame.width,
            height: pf.wordListFrame.height,
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          any.left = pf.wordListFrame.left;
          any.top = pf.wordListFrame.top - 4;
          any.width = pf.wordListFrame.width;
          any.height = pf.wordListFrame.height;
        }
      } else if (role === 'ws-divider' && pf.dividerFrame) {
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: pf.dividerFrame.left,
            top: pf.dividerFrame.top,
            width: pf.dividerFrame.width,
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          any.left = pf.dividerFrame.left;
          any.top = pf.dividerFrame.top;
          any.width = pf.dividerFrame.width;
        }
      }
    });

    // Re-place letters on lattice
    const letterObjs = puzzleObjs.filter((o) => (o as AnyObj).wsRole === 'ws-letter');
    if (letterObjs.length === n * n) {
      letterObjs.forEach((o, idx) => {
        const r = Math.floor(idx / n);
        const c = idx % n;
        const x = gf.left + (c + 0.5) * cell;
        const y = gf.top + (r + 0.5) * cell;
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: x,
            top: y,
            width: cell,
            fontSize: Math.max(6, cell * 0.56),
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          (o as AnyObj).left = x;
          (o as AnyObj).top = y;
          (o as AnyObj).width = cell;
          (o as AnyObj).fontSize = Math.max(6, cell * 0.56);
        }
      });
    }

    // Re-place word list items
    if (pf.bankItemFrames && pf.bankItemFrames.length) {
      const bankObjs = puzzleObjs.filter((o) => (o as AnyObj).wsRole === 'ws-bank');
      bankObjs.forEach((o, idx) => {
        const bif = pf.bankItemFrames![Math.min(idx, pf.bankItemFrames!.length - 1)];
        if (typeof (o as fabric.FabricObject).set === 'function') {
          (o as fabric.FabricObject).set({
            left: bif.left,
            top: bif.top,
            width: bif.width,
          });
          (o as fabric.FabricObject).setCoords();
        } else {
          (o as AnyObj).left = bif.left;
          (o as AnyObj).top = bif.top;
          (o as AnyObj).width = bif.width;
        }
      });
    }
  });
}

/**
 * Explicit reflow operation for one or more instances on a page.
 * Re-runs layoutWordSearchPage using current geometry, preserving puzzle words and intentional style overrides.
 */
export function reflowPageInstances(
  page: Page,
  pageNumber: number,
  pageCount: number,
  kdpSafe = true,
  activeCanvas?: fabric.Canvas | null,
): { page: Page; layoutResult: WordSearchLayoutResult } {
  const instances = wsInstancesOf(page);
  const meta = wsMetaOf(page);

  const geo: PageGeometry = computePageGeometry({
    width: page.width,
    height: page.height,
    pageNumber,
    pageCount,
    intent: kdpSafe ? 'safe' : 'minimum',
  });

  const puzzleInsts = instances.filter((i) => i.role === 'puzzle' || i.role === 'solution');
  const isSolution = meta?.kind === 'solution' || puzzleInsts.every((i) => i.role === 'solution');

  const titleInst = instances.find((i) => i.role === 'title');
  const titleText = (titleInst?.source?.rawMetadata?.text as string) || '';
  const pageData = (page.data ?? {}) as Record<string, unknown>;
  const templateId = (pageData.templateId as string) || meta?.templateId;

  const contentSpec: WordSearchContentSpec = {
    pageType: isSolution ? 'solution' : 'puzzle',
    puzzlesPerPage: puzzleInsts.length || 1,
    title: titleText,
    showFolio: instances.some((i) => i.role === 'page-number'),
    folio: pageNumber,
    templateId,
    puzzles: puzzleInsts.map((inst, idx) => ({
      id: inst.contentId,
      index: (inst.source?.puzzleIndex as number) || idx + 1,
      theme: inst.source?.theme as string,
      difficulty: inst.source?.difficulty as string,
      size: (inst.source?.gridSize as number) || 14,
      words: (inst.source?.words as string[]) || [],
      secret: inst.source?.secret as string,
    })),
  };

  const primaryInst = puzzleInsts[0];
  const effectiveStyle: StyleConfiguration = primaryInst
    ? { ...primaryInst.style, ...primaryInst.overrides?.style }
    : {
        fontFamily: 'Inter',
        letterColor: '#111827',
        gridLineColor: '#c7ced8',
        gridLineWidth: 0.6,
        frameWidth: 1.6,
        backgroundColor: null,
        fontScale: 0.56,
        letterSpacing: 0,
        letterCase: 'upper',
        gridStyle: 'plain',
        bankStyle: 'columns',
        bankColumns: 3,
        bankFontSize: 11,
        bankColor: '#111827',
        titleFontSize: 18,
        titleColor: '#111827',
        showTitle: true,
        showDifficulty: false,
        showWordBank: !isSolution,
        answerStyle: 'oval',
        answerColor: '#d64550',
      };

  const layoutResult = layoutWordSearchPage(geo, contentSpec, effectiveStyle);

  // 1. Update live canvas if active
  if (activeCanvas) {
    applyFramesToObjects(activeCanvas.getObjects(), layoutResult.frames);
    activeCanvas.requestRenderAll();
  }

  // 2. Update serialized page data objects
  const prevData = (page.data ?? {}) as Record<string, unknown>;
  const objects = ((prevData.objects ?? []) as AnyObj[]).map((o) => ({ ...o }));
  applyFramesToObjects(objects, layoutResult.frames);

  const nextInstances = instances.map((inst) => {
    const pf = layoutResult.frames.puzzles.find((f) => f.id === inst.contentId);
    if (!pf) return inst;
    return {
      ...inst,
      layout: {
        ...inst.layout,
        boxSize: pf.gridFrame.width,
        bankColumns: pf.bankColumns,
      },
    };
  });

  const nextData = {
    ...prevData,
    objects,
    layoutResult,
    ok: layoutResult.ok,
    invalidForProduction: !layoutResult.ok,
    layoutWarnings: layoutResult.warnings,
    [NOVELKA_INSTANCES]: nextInstances,
    instances: nextInstances,
  };

  return {
    page: { ...page, data: nextData },
    layoutResult,
  };
}
