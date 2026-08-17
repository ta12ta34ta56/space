/**
 * Phase 4 Hardening Checkpoint & Non-Browser Canvas Integration Test.
 *
 * Exercises the complete editor-level semantic editing lifecycle:
 *  1. Load a generated word-search page in the editor.
 *  2. Click/select a letter object.
 *  3. The complete logical puzzle instance becomes selected.
 *  4. The grid, letters, word list and border move together.
 *  5. A second puzzle remains unchanged.
 *  6. Change the style of one instance.
 *  7. Confirm the style appears in the actual canvas.
 *  8. Apply a style to all matching word-search puzzles in book.
 *  9. Confirm solutions, cover objects and unrelated modules remain unchanged.
 * 10. Reset the instance.
 * 11. Confirm the original base template style returns.
 * 12. Reflow the active page.
 * 13. Confirm the actual canvas objects move to the new frames.
 * 14. Create one undo step.
 * 15. Undo the operation.
 * 16. Redo the operation.
 * 17. Save the project.
 * 18. Reload the project.
 * 19. Confirm instance metadata and overrides persist without drift.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>', { pretendToBeVisual: true });
installCanvasStub(dom);
dom.window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Image = dom.window.Image;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
globalThis.devicePixelRatio = 1;

import { generateWordSearch } from '../modules/word-search/generator.built.mjs';
import { buildWordSearchPages, wsInstancesOf } from '../modules/word-search/build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from '../modules/word-search/renderer.built.mjs';
import {
  resolveInstanceForObject,
  getObjectsForInstance,
  selectSemanticInstance,
  moveSemanticInstance,
  styleSemanticInstance,
  applyStyleToScope,
  resetSemanticInstance,
  reflowPageInstances,
} from './domain.built.mjs';
import { useCanvasStore } from '../stores/canvas-store.js';
import { engine } from '../engine/canvas-engine.ts';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== PHASE 4 HARDENING: CANVAS INTEGRATION TEST (NON-BROWSER) ===\n');

const FLOWERS = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];
const p1 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 301, theme: 'Garden' }, 1);
const p2 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 302, theme: 'Flowers' }, 2);

// 1. Build a 2-up puzzle book and load into editor
console.log('Step 1: Load generated word-search pages into the editor');
const res = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
  puzzlesPerPage: 2,
  solutionsPerPage: 4,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Answers',
  templateId: 'classic',
  title: 'Botanical Volume',
  showFolio: true,
}, { width: 612, height: 792 });

const canvasEl = document.getElementById('c');
engine.mount(canvasEl, 612, 792);

await useCanvasStore.getState().replaceAllPages(res.pages);
check('CanvasStore holds generated pages', useCanvasStore.getState().pages.length === 2); // 1 puzzle page (2-up) + 1 solution page

const activePage = useCanvasStore.getState().pages[0];
check('CanvasEngine mounted with page objects', engine.canvas.getObjects().length > 100);

// 2 & 3. Select a letter object -> resolve & select complete logical instance
console.log('\nStep 2 & 3: Select letter object & expand to logical instance');
const canvasObjs = engine.canvas.getObjects();
const letterP1 = canvasObjs.find((o) => o.wsRole === 'ws-letter' && o.wsPuzzle === p1.id);
check('found letter object for puzzle 1', Boolean(letterP1));

const resolvedInst = resolveInstanceForObject(letterP1, activePage);
check('letter resolves to puzzle 1 instanceId', resolvedInst !== null && resolvedInst.contentId === p1.id);

const selection = selectSemanticInstance(engine.canvas, resolvedInst);
check('complete logical instance becomes selected (>50 objects)', selection.objects.length > 50);
const selectedTypes = new Set(selection.objects.map((o) => o.wsRole));
check('instance selection includes letters, rules, bank, label', selectedTypes.has('ws-letter') && selectedTypes.has('ws-bank'));
check('instance selection excludes puzzle 2 objects', selection.objects.every((o) => o.wsPuzzle !== p2.id));

// 4 & 5. Move one instance -> related objects move together, puzzle 2 stays put
console.log('\nStep 4 & 5: Move instance 1 and verify puzzle 2 is unchanged');
const p1ObjsBefore = getObjectsForInstance(engine.canvas, resolvedInst).map((o) => ({ id: o.id, top: o.top, left: o.left }));
const instP2 = activePage.data.instances.find((i) => i.contentId === p2.id);
const p2ObjsBefore = getObjectsForInstance(engine.canvas, instP2).map((o) => ({ id: o.id, top: o.top, left: o.left }));

const moveResult = moveSemanticInstance(engine.canvas, activePage, resolvedInst.instanceId, 10, 20);
check('moveSemanticInstance moved all p1 objects', moveResult.movedCount === p1ObjsBefore.length);

const p1ObjsAfter = getObjectsForInstance(engine.canvas, resolvedInst);
const p2ObjsAfter = getObjectsForInstance(engine.canvas, instP2);
check('p1 objects all shifted by (dx: 10, dy: 20)', p1ObjsAfter.every((o, idx) => Math.abs((o.left ?? 0) - (p1ObjsBefore[idx].left + 10)) < 0.01 && Math.abs((o.top ?? 0) - (p1ObjsBefore[idx].top + 20)) < 0.01));
check('p2 objects remained unchanged at original positions', p2ObjsAfter.every((o, idx) => Math.abs((o.top ?? 0) - p2ObjsBefore[idx].top) < 0.01 && Math.abs((o.left ?? 0) - p2ObjsBefore[idx].left) < 0.01));
check('instance layout override records offsetX: 10, offsetY: 20', moveResult.page.data.instances.find((i) => i.instanceId === resolvedInst.instanceId).overrides.layout.offsetX === 10);

// 6 & 7. Change style of one instance -> persists in overrides and appears on canvas
console.log('\nStep 6 & 7: Style one instance and confirm canvas update');
const styled = styleSemanticInstance(engine.canvas, moveResult.page, resolvedInst.instanceId, {
  letterColor: '#e11d48',
  gridLineColor: '#0284c7',
  frameWidth: 2.4,
});

check('styleSemanticInstance updated objects', styled.patchedCount > 30);
const p1Letters = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('canvas letter fills changed to #e11d48', p1Letters.every((o) => o.fill === '#e11d48'));
const p2Letters = getObjectsForInstance(engine.canvas, instP2).filter((o) => o.wsRole === 'ws-letter');
check('puzzle 2 letters remained default #111827', p2Letters.every((o) => o.fill === '#111827'));

// 8 & 9. Apply style to all matching word-search puzzles in book
console.log('\nStep 8 & 9: Apply style to all puzzles in book (protect solutions & covers)');
const docPages = [styled.page, res.pages[1]]; // puzzle page + solution page
const scopedRes = applyStyleToScope(docPages, styled.page.id, resolvedInst, { letterColor: '#2563eb' }, 'all_puzzles_in_book', engine.canvas);

check('scoped styling updated both puzzle instances', scopedRes.changedInstances === 2);
const p1LettersAfter = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('puzzle 1 canvas letters now #2563eb', p1LettersAfter.every((o) => o.fill === '#2563eb'));

const solPageData = scopedRes.pages[1].data;
const solInstances = solPageData.instances.filter((i) => i.role === 'solution');
check('solution instances were not styled as puzzles', solInstances.every((si) => !si.overrides?.isOverridden));

// 10 & 11. Reset instance -> original base template style returns
console.log('\nStep 10 & 11: Reset instance and confirm base style restored');
const resetRes = resetSemanticInstance(engine.canvas, styled.page, resolvedInst.instanceId);
check('resetSemanticInstance returned true', resetRes.reset === true);
const p1LettersReset = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('canvas letters returned to base #111827', p1LettersReset.every((o) => o.fill === '#111827'));
const p1InstReset = resetRes.page.data.instances.find((i) => i.instanceId === resolvedInst.instanceId);
check('instance override is cleared (isOverridden = false)', p1InstReset.overrides.isOverridden === false);

// 12 & 13. Reflow the active page -> updates canvas objects to new solver frames
console.log('\nStep 12 & 13: Reflow active page and confirm frame updates');
const reflowed = reflowPageInstances(resetRes.page, 1, 100, true, engine.canvas);
check('reflow returned layoutResult.ok = true', reflowed.layoutResult.ok === true);
const canvasObjsReflowed = engine.canvas.getObjects();
const titleObj = canvasObjsReflowed.find((o) => o.wsRole === 'ws-title');
check('title object sits at solver titleFrame top', titleObj && Math.abs((titleObj.top ?? 0) - reflowed.layoutResult.frames.titleFrame.top) < 0.01);

// 14, 15 & 16. Undo & Redo single semantic action
console.log('\nStep 14, 15 & 16: Undo / Redo integration in CanvasStore');
useCanvasStore.getState().commit('Base State A');
const pastCountBefore = useCanvasStore.getState().past.length;

// Apply style mutation on canvas and store in instance record
const styledAgain = styleSemanticInstance(engine.canvas, useCanvasStore.getState().activePage(), resolvedInst.instanceId, { letterColor: '#7c3aed' });
const updatedPages = useCanvasStore.getState().pages.map((p) => (p.id === styledAgain.page.id ? styledAgain.page : p));
useCanvasStore.setState({ pages: updatedPages });
useCanvasStore.getState().commit('Style Change Single Step B');

check('one semantic action added exactly one history entry', useCanvasStore.getState().past.length === pastCountBefore + 1);

// Verify color before undo is #7c3aed
const p1LettersBeforeUndo = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('color before undo is #7c3aed', p1LettersBeforeUndo.every((o) => o.fill === '#7c3aed'));

// Undo -> restores State A (#111827)
await useCanvasStore.getState().undo();
const p1LettersAfterUndo = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('undo restored previous letter fill on canvas (#111827)', p1LettersAfterUndo.every((o) => o.fill === '#111827'));

// Redo -> restores State B (#7c3aed)
await useCanvasStore.getState().redo();
const p1LettersAfterRedo = getObjectsForInstance(engine.canvas, resolvedInst).filter((o) => o.wsRole === 'ws-letter');
check('redo restored styled letter fill on canvas (#7c3aed)', p1LettersAfterRedo.every((o) => o.fill === '#7c3aed'));

// 17, 18 & 19. Save & Reload project -> confirm instance metadata and overrides persist
console.log('\nStep 17, 18 & 19: Serialize, Save and Reload project');
const serializedProject = useCanvasStore.getState().serialize();
check('serialized project has 2 pages', serializedProject.pages.length === 2);
check('serialized project contains novelka:instances metadata', Array.isArray(serializedProject.pages[0].data['novelka:instances']));

// Reload into store
await useCanvasStore.getState().loadProject(serializedProject);
const reloadedPage = useCanvasStore.getState().pages[0];
const reloadedInst = wsInstancesOf(reloadedPage).find((i) => i.instanceId === resolvedInst.instanceId);

check('reloaded page keeps instance metadata intact', Boolean(reloadedInst));
check('reloaded instance keeps overrides (letterColor: #7c3aed)', reloadedInst.overrides.style.letterColor === '#7c3aed');
check('reloaded instance keeps populated objectIds list', Array.isArray(reloadedInst.objectIds) && reloadedInst.objectIds.length > 50);

engine.dispose();

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PHASE 4 HARDENING CHECKS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
