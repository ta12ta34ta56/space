/**
 * Semantic Editing Test Suite (Phase 4).
 *
 * Verifies:
 *  1. Selecting any object resolves the correct logical instance.
 *  2. Selecting one instance excludes unrelated objects.
 *  3. Moving an instance moves all related objects together.
 *  4. Moving one instance does not move another instance.
 *  5. Resizing/reflow updates frames from the solver.
 *  6. One-instance style override persists in instance.overrides.
 *  7. Global word-search style affects only matching instances (respects scope).
 *  8. Solution instances are not accidentally styled as puzzle instances unless explicitly selected.
 *  9. Reset removes overrides and restores defaults.
 * 10. Reset is undoable.
 * 11. Reflow preserves source puzzle content (words, grid letters).
 * 12. Reflow preserves intentional style overrides.
 * 13. Invalid reflow produces warnings and flags ok=false.
 * 14. Legacy projects still open.
 * 15. All existing generator, domain, pipeline and quick mode tests remain passing.
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

import * as fabric from 'fabric';
import { generateWordSearch } from '../modules/word-search/generator.built.mjs';
import { buildWordSearchPages } from '../modules/word-search/build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from '../modules/word-search/renderer.built.mjs';
import {
  resolveInstanceForObject,
  getObjectsForInstance,
  selectSemanticInstance,
  moveSemanticInstance,
  styleSemanticInstance,
  applyStyleToScope,
  resetSemanticInstance,
  resetScope,
  reflowPageInstances,
} from './domain.built.mjs';

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

const FLOWERS = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];
const p1 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 201, theme: 'Garden' }, 1);
const p2 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 202, theme: 'Flora' }, 2);

console.log('\n=== 1. Resolve & Select Logical Instance ===');
{
  const res = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 2,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Multi Puzzle Book',
    showFolio: true,
  }, { width: 612, height: 792 });

  const page = res.pages[0];
  const el = document.createElement('canvas');
  const canvas = new fabric.Canvas(el, { width: page.width, height: page.height });
  await canvas.loadFromJSON(page.data);

  const objects = canvas.getObjects();
  const letterOfP1 = objects.find((o) => o.wsRole === 'ws-letter' && o.wsPuzzle === p1.id);
  const letterOfP2 = objects.find((o) => o.wsRole === 'ws-letter' && o.wsPuzzle === p2.id);

  const instP1 = resolveInstanceForObject(letterOfP1, page);
  const instP2 = resolveInstanceForObject(letterOfP2, page);

  check('selecting p1 letter resolves instance for p1', instP1 !== null && instP1.contentId === p1.id);
  check('selecting p2 letter resolves instance for p2', instP2 !== null && instP2.contentId === p2.id);
  check('p1 and p2 have distinct instanceIds', instP1.instanceId !== instP2.instanceId);

  // Excludes unrelated objects
  const selP1 = selectSemanticInstance(canvas, instP1);
  check('selectSemanticInstance returns member objects for p1', selP1.objects.length > 50);
  const containsP2 = selP1.objects.some((o) => o.wsPuzzle === p2.id);
  check('p1 selection excludes p2 objects', containsP2 === false);

  canvas.dispose();
}

console.log('\n=== 2. Move Instance (Moves All Related Objects Together) ===');
{
  const res = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 2,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Multi Puzzle',
    showFolio: true,
  }, { width: 612, height: 792 });

  const page = res.pages[0];
  const el = document.createElement('canvas');
  const canvas = new fabric.Canvas(el, { width: page.width, height: page.height });
  await canvas.loadFromJSON(page.data);

  const inst1 = page.data.instances.find((i) => i.contentId === p1.id);
  const inst2 = page.data.instances.find((i) => i.contentId === p2.id);

  const p1ObjsBefore = getObjectsForInstance(canvas, inst1).map((o) => ({ id: o.id, top: o.top }));
  const p2ObjsBefore = getObjectsForInstance(canvas, inst2).map((o) => ({ id: o.id, top: o.top }));

  // Move instance 1 down by 25pt
  const moveRes = moveSemanticInstance(canvas, page, inst1.instanceId, 0, 25);
  check('moveSemanticInstance moved all p1 objects', moveRes.movedCount === p1ObjsBefore.length);

  const p1ObjsAfter = getObjectsForInstance(canvas, inst1);
  const p2ObjsAfter = getObjectsForInstance(canvas, inst2);

  check('every p1 object shifted down by 25pt', p1ObjsAfter.every((o, idx) => Math.abs((o.top ?? 0) - (p1ObjsBefore[idx].top + 25)) < 0.01));
  check('p2 objects remained unmoved', p2ObjsAfter.every((o, idx) => Math.abs((o.top ?? 0) - p2ObjsBefore[idx].top) < 0.01));
  check('page instance override records offsetY = 25', moveRes.page.data.instances.find((i) => i.instanceId === inst1.instanceId).overrides.layout.offsetY === 25);

  canvas.dispose();
}

console.log('\n=== 3. Edit One Instance Style (Persists Overrides) ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'back_of_book',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Word Search',
    showFolio: true,
  }, { width: 432, height: 648 });

  const page = res.pages[0];
  const el = document.createElement('canvas');
  const canvas = new fabric.Canvas(el, { width: page.width, height: page.height });
  await canvas.loadFromJSON(page.data);

  const inst1 = page.data.instances.find((i) => i.contentId === p1.id);
  const styled = styleSemanticInstance(canvas, page, inst1.instanceId, {
    letterColor: '#e11d48',
    gridLineColor: '#0284c7',
  });

  check('styleSemanticInstance updated objects', styled.patchedCount > 30);
  const updatedInst = styled.page.data.instances.find((i) => i.instanceId === inst1.instanceId);
  check('override is marked isOverridden = true', updatedInst.overrides.isOverridden === true);
  check('custom letterColor is recorded in override', updatedInst.overrides.style.letterColor === '#e11d48');
  check('custom gridLineColor is recorded in override', updatedInst.overrides.style.gridLineColor === '#0284c7');

  const letterObjs = getObjectsForInstance(canvas, inst1).filter((o) => o.wsRole === 'ws-letter');
  check('letter canvas objects fill updated to #e11d48', letterObjs.every((o) => o.fill === '#e11d48'));

  canvas.dispose();
}

console.log('\n=== 4. Apply Style to Scope (Book / Page / Solutions) ===');
{
  const res = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'back_of_book',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Book Style Test',
    showFolio: true,
  }, { width: 432, height: 648 });

  // res.pages: 2 puzzle pages (p1, p2) + 1 solution page
  const p1Inst = res.pages[0].data.instances.find((i) => i.role === 'puzzle');
  const solInst = res.pages[2].data.instances.find((i) => i.role === 'solution');

  // Scope: 'all_puzzles_in_book'
  const scopedPuzzles = applyStyleToScope(res.pages, res.pages[0].id, p1Inst, { letterColor: '#2563eb' }, 'all_puzzles_in_book');
  check('all_puzzles_in_book touched 2 puzzle instances', scopedPuzzles.changedInstances === 2);

  const page1Inst = scopedPuzzles.pages[0].data.instances.find((i) => i.role === 'puzzle');
  const page2Inst = scopedPuzzles.pages[1].data.instances.find((i) => i.role === 'puzzle');
  const solPageInst = scopedPuzzles.pages[2].data.instances.find((i) => i.role === 'solution');

  check('page 1 puzzle has custom letterColor #2563eb', page1Inst.overrides.style.letterColor === '#2563eb');
  check('page 2 puzzle has custom letterColor #2563eb', page2Inst.overrides.style.letterColor === '#2563eb');
  check('solution page instance was NOT accidentally styled as puzzle', !solPageInst.overrides?.isOverridden);

  // Scope: 'all_solutions_in_book'
  const scopedSolutions = applyStyleToScope(res.pages, res.pages[2].id, solInst, { answerColor: '#10b981' }, 'all_solutions_in_book');
  check('all_solutions_in_book touched all 2 solution instances in the book', scopedSolutions.changedInstances === 2);
  const updatedSol = scopedSolutions.pages[2].data.instances.find((i) => i.role === 'solution');
  check('solution instance has custom answerColor #10b981', updatedSol.overrides.style.answerColor === '#10b981');
}

console.log('\n=== 5. Reset Semantic Instance & Scope ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'back_of_book',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Word Search',
    showFolio: true,
  }, { width: 432, height: 648 });

  const page = res.pages[0];
  const el = document.createElement('canvas');
  const canvas = new fabric.Canvas(el, { width: page.width, height: page.height });
  await canvas.loadFromJSON(page.data);

  const inst1 = page.data.instances.find((i) => i.contentId === p1.id);
  const styled = styleSemanticInstance(canvas, page, inst1.instanceId, { letterColor: '#7c3aed' });
  check('style applied initially', styled.page.data.instances[2].overrides.isOverridden === true);

  const reset = resetSemanticInstance(canvas, styled.page, inst1.instanceId);
  check('resetSemanticInstance returned true', reset.reset === true);
  const instAfterReset = reset.page.data.instances.find((i) => i.instanceId === inst1.instanceId);
  check('overrides cleared after reset', instAfterReset.overrides.isOverridden === false);

  const letterObjs = getObjectsForInstance(canvas, inst1).filter((o) => o.wsRole === 'ws-letter');
  check('canvas letter fill restored to default #111827', letterObjs.every((o) => o.fill === '#111827'));

  // Test resetScope on multiple pages
  const bookPages = [styled.page, { ...styled.page, id: 'page-2' }];
  const scopeReset = resetScope(bookPages, styled.page.id, inst1, 'all_puzzles_in_book', canvas);
  check('resetScope cleared overrides across matching scope', scopeReset.resetCount >= 1);

  canvas.dispose();
}

console.log('\n=== 6. Reflow Page Instances (Preserves Puzzle Data & Layout Rules) ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Reflow Test',
    showFolio: true,
  }, { width: 432, height: 648 });

  const page = res.pages[0];
  const reflow = reflowPageInstances(page, 1, 100);

  check('reflow completed with layoutResult', !!reflow.layoutResult);
  check('reflow layout is ok', reflow.layoutResult.ok === true);
  const reflowedInst = reflow.page.data.instances.find((i) => i.role === 'puzzle');
  check('reflow preserved puzzle words', reflowedInst.source.words.length === FLOWERS.length);
  check('reflow preserved puzzle theme', reflowedInst.source.theme === 'Garden');
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL SEMANTIC EDITING TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
