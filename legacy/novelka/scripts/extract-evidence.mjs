import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
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

import {
  CLASSIC_WS_TEMPLATE,
  resolveParametricTemplate,
  layoutWordSearchPage,
  getGeometryForPreset,
} from '../src/domain/domain.built.mjs';
import { generateWordSearch } from '../src/modules/word-search/generator.built.mjs';
import {
  buildWordSearchPages,
  DEFAULT_WS_LAYOUT,
} from '../src/modules/word-search/build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from '../src/modules/word-search/renderer.built.mjs';

const flowers = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];
const p1 = generateWordSearch({ size: 14, words: flowers, difficulty: 'medium', seed: 101, theme: 'Flowers' }, 1);
const p2 = generateWordSearch({ size: 14, words: flowers, difficulty: 'medium', seed: 102, theme: 'Garden' }, 2);

// 1. Classic WS on 6x9
const resClassic = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
  ...DEFAULT_WS_LAYOUT,
  templateId: 'classic-ws',
  title: 'Flora Explorer',
  solutionPlacement: 'none',
}, { width: 432, height: 648, trimKey: 'kdp6x9' });

// 2. Two-Up WS on 8.5x11
const resTwoUp = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
  ...DEFAULT_WS_LAYOUT,
  puzzlesPerPage: 2,
  templateId: 'two-up-ws',
  title: 'Double Word Search',
  solutionPlacement: 'none',
}, { width: 612, height: 792, trimKey: 'kdp85x11' });

// 3. Answers WS on 6x9 (4-up solutions)
const resAnswers = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
  ...DEFAULT_WS_LAYOUT,
  solutionsPerPage: 4,
  solutionPlacement: 'back_of_book',
}, { width: 432, height: 648, trimKey: 'kdp6x9' });

console.log('=== EVIDENCE: 1. CLASSIC-WS GENERATED PAGE ===');
const cp = resClassic.pages[0];
console.log(JSON.stringify({
  id: cp.id,
  name: cp.name,
  width: cp.width,
  height: cp.height,
  role: cp.role,
  templateId: cp.data.templateId,
  templateVersion: cp.data.templateVersion,
  templateStatus: cp.data.templateStatus,
  templateFallbackApplied: cp.data.templateFallbackApplied,
  instancesCount: cp.data.instances.length,
  objectsCount: cp.data.objects.length,
  frames: cp.data.layoutResult.frames,
  measurements: cp.data.layoutResult.measurements,
}, null, 2));

console.log('\n=== EVIDENCE: 2. TWO-UP-WS GENERATED PAGE ===');
const tp = resTwoUp.pages[0];
console.log(JSON.stringify({
  id: tp.id,
  name: tp.name,
  width: tp.width,
  height: tp.height,
  templateId: tp.data.templateId,
  templateVersion: tp.data.templateVersion,
  templateStatus: tp.data.templateStatus,
  puzzlesCount: tp.data.layoutResult.frames.puzzles.length,
  dividerFrame: tp.data.layoutResult.frames.puzzles[0].dividerFrame,
  puzzle1Grid: tp.data.layoutResult.frames.puzzles[0].gridFrame,
  puzzle2Grid: tp.data.layoutResult.frames.puzzles[1].gridFrame,
}, null, 2));

console.log('\n=== EVIDENCE: 3. ANSWERS-WS GENERATED PAGE ===');
const ap = resAnswers.pages[2]; // page 3 is solution page
console.log(JSON.stringify({
  id: ap.id,
  name: ap.name,
  width: ap.width,
  height: ap.height,
  templateId: ap.data.templateId,
  templateVersion: ap.data.templateVersion,
  templateStatus: ap.data.templateStatus,
  puzzlesCount: ap.data.layoutResult.frames.puzzles.length,
  puzzle1SolGrid: ap.data.layoutResult.frames.puzzles[0].gridFrame,
  puzzle2SolGrid: ap.data.layoutResult.frames.puzzles[1].gridFrame,
}, null, 2));

console.log('\n=== EVIDENCE: 4. BEFORE / AFTER TEMPLATE RULE CHANGE ===');
const geo = getGeometryForPreset('kdp6x9', 1, 100);
const specBefore = {
  pageType: 'puzzle',
  puzzlesPerPage: 1,
  title: 'Flora Explorer',
  template: CLASSIC_WS_TEMPLATE,
  puzzles: [{ id: 'p1', index: 1, size: 14, words: flowers }],
};
const customTemplate = {
  ...CLASSIC_WS_TEMPLATE,
  templateId: 'custom-ws',
  slots: [{ puzzlesPerPage: 1, gridColumns: 1, gridRows: 1, targetGap: 28 }],
  regions: CLASSIC_WS_TEMPLATE.regions.map((r) =>
    r.role === 'word-list' ? { ...r, spacing: { top: 28 } } : r,
  ),
};
const specAfter = {
  ...specBefore,
  template: customTemplate,
};

const layoutBefore = layoutWordSearchPage(geo, specBefore);
const layoutAfter = layoutWordSearchPage(geo, specAfter);

console.log('BEFORE (targetGap: 14pt):');
console.log('  gridFrame:', layoutBefore.frames.puzzles[0].gridFrame);
console.log('  wordListFrame:', layoutBefore.frames.puzzles[0].wordListFrame);
console.log('  actualGap:', layoutBefore.frames.puzzles[0].wordListFrame.top - (layoutBefore.frames.puzzles[0].gridFrame.top + layoutBefore.frames.puzzles[0].gridFrame.height));

console.log('AFTER (targetGap: 28pt):');
console.log('  gridFrame:', layoutAfter.frames.puzzles[0].gridFrame);
console.log('  wordListFrame:', layoutAfter.frames.puzzles[0].wordListFrame);
console.log('  actualGap:', layoutAfter.frames.puzzles[0].wordListFrame.top - (layoutAfter.frames.puzzles[0].gridFrame.top + layoutAfter.frames.puzzles[0].gridFrame.height));

console.log('\n=== EVIDENCE: 5. DRAFT TEMPLATE FALLBACK BEHAVIOR ===');
const draftProd = resolveParametricTemplate({ templateId: 'draft-experiment-ws', publishedOnly: true });
console.log('Production resolve (publishedOnly: true):', draftProd);
const draftDev = resolveParametricTemplate({ templateId: 'draft-experiment-ws', publishedOnly: false });
console.log('Development resolve (publishedOnly: false):', draftDev);

console.log('\n=== EVIDENCE: 6. UNSUPPORTED SIZE FALLBACK BEHAVIOR ===');
const unsupportedSize = resolveParametricTemplate({ templateId: 'two-up-ws', trimSize: 'kdp6x9' });
console.log('Unsupported size resolve (two-up-ws on kdp6x9):', unsupportedSize);
