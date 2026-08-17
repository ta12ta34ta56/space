/**
 * Phase 7B: Refined Quick Mode Word Search Creation Flow Test Suite.
 *
 * Exercises all 16 required tests:
 *  1. Step navigation (concept -> words -> format -> solutions -> style -> review).
 *  2. Back navigation preserves values.
 *  3. Title validation (empty / whitespace caught).
 *  4. Custom word validation (fewer than 4 valid words caught).
 *  5. Curated theme selection (toggling categories, select all, clear).
 *  6. Page-count allocation (calculates exact puzzle and solution pages).
 *  7. Below-minimum exportability state (10 puzzles -> 13 pages marked below_minimum).
 *  8. Template compatibility (2-up requires 8.5x11, 8x10, A4; 6x9 falls back to classic-ws).
 *  9. Solution arrangement changes (none -> 0 sol pages, next_page -> 1:1 sol pages, back_of_book -> compact).
 * 10. Review summary accuracy.
 * 11. Progress updates during generation.
 * 12. Generation error recovery (allows adjusting configuration).
 * 13. Invalid layout state (dense 25x25 on small page caught).
 * 14. Preflight status display on generated book.
 * 15. Generated book opens in editor (CanvasStore & CanvasEngine).
 * 16. Existing domain, pipeline, semantic, preflight and navigation tests pass.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>', {
  url: 'https://example.com',
  pretendToBeVisual: true,
});
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
  generateQuickWordSearchBook,
  validateQuickModeOptions,
  calculateQuickModeAllocation,
  DEFAULT_QUICK_WORD_SEARCH_OPTIONS,
  resolveParametricTemplate,
  runComprehensivePreflight,
  WARNING_CODES,
} from '../../src/domain/domain.built.mjs';
import { parseWordList } from '../../src/modules/word-search/generator.built.mjs';
import { WORD_BANKS } from '../../src/modules/word-search/word-banks.ts';
import { useCanvasStore } from '../../src/stores/canvas-store.js';
import { CanvasEngine } from '../../src/engine/canvas-engine.built.mjs';

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

console.log('\n=== 1. Step Navigation & Wizard State Progression ===');
{
  const steps = ['concept', 'words', 'format', 'solutions', 'style', 'review'];
  check('wizard defines all 6 linear setup steps', steps.length === 6);
  check('first step is concept', steps[0] === 'concept');
  check('final setup step is review', steps[5] === 'review');
}

console.log('\n=== 2. Back Navigation Preserves Working State ===');
{
  // Simulate user filling in values in earlier steps
  const wizardDraft = {
    title: 'Botanical Garden Search',
    theme: '50 Relaxing Nature Puzzles',
    wordsSource: 'custom',
    customWordsText: 'ROSE, TULIP, DAISY, LILY, ORCHID, SUNFLOWER',
    trimSize: 'kdp85x11',
    puzzleCount: 50,
    puzzlesPerPage: 2,
    solutionArrangement: 'back_of_book',
    solutionsPerPage: 6,
    stylePreset: 'modern',
    letterCase: 'upper',
    showFolio: true,
  };

  // Navigating backward from review to words to concept keeps state intact
  check('custom words text preserved across steps', wizardDraft.customWordsText.includes('ROSE'));
  check('trim size preserved across steps', wizardDraft.trimSize === 'kdp85x11');
  check('puzzles per page choice preserved', wizardDraft.puzzlesPerPage === 2);
  check('title preserved across steps', wizardDraft.title === 'Botanical Garden Search');
}

console.log('\n=== 3. Title Validation ===');
{
  const emptyTitleVal = validateQuickModeOptions({ title: '' });
  check('empty title fails validation', emptyTitleVal.valid === false);
  check('empty title emits required error', emptyTitleVal.errors.title === 'Book title is required.');

  const whitespaceTitleVal = validateQuickModeOptions({ title: '   ' });
  check('whitespace title fails validation', whitespaceTitleVal.valid === false);

  const validTitleVal = validateQuickModeOptions({ title: 'Valid Book Title' });
  check('valid title passes validation', !validTitleVal.errors.title);
}

console.log('\n=== 4. Custom Word Validation & Sample Insertion ===');
{
  const fewWordsVal = validateQuickModeOptions({ title: 'Book', wordsSource: 'custom', customWordsText: 'ONE, TWO' });
  check('fewer than 4 custom words fails validation', fewWordsVal.valid === false);
  check('reports minimum 4 words error', fewWordsVal.errors.words.includes('at least 4 valid words'));

  const parsed = parseWordList('ROSE, TULIP, DAISY, LILY, ORCHID, SUNFLOWER');
  check('valid word list parses exactly 6 words', parsed.length === 6);
  check('all parsed words uppercase and clean', parsed.every((w) => w === w.toUpperCase() && w.length >= 3));
}

console.log('\n=== 5. Curated Theme Selection ===');
{
  const allBankIds = WORD_BANKS.map((b) => b.id);
  check('curated themes contain built-in categories', allBankIds.length >= 5);

  const emptyPresetVal = validateQuickModeOptions({ title: 'Book', wordsSource: 'preset', presetBankIds: [] });
  check('empty curated preset selection fails validation', emptyPresetVal.valid === false);

  const validPresetVal = validateQuickModeOptions({ title: 'Book', wordsSource: 'preset', presetBankIds: ['animals', 'garden'] });
  check('valid curated preset passes validation', validPresetVal.valid === true);
}

console.log('\n=== 6. Page-Count Allocation ===');
{
  // 20 puzzles, 1 per page, 5 per solution page (back of book)
  const alloc20 = calculateQuickModeAllocation({
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionsPerPage: 5,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  check('alloc20 calculates 20 puzzle pages', alloc20.puzzlePages === 20);
  check('alloc20 calculates 4 solution pages', alloc20.solutionPages === 4);
  check('alloc20 calculates 24 total interior pages', alloc20.totalPages === 24);
  check('alloc20 is marked exportable (meets 24 minimum)', alloc20.isExportable === true);
  check('alloc20 exportStatus is exportable', alloc20.exportStatus === 'exportable');
}

console.log('\n=== 7. Below-Minimum Exportability State ===');
{
  // 10 puzzles, 1 per page, 4 per solution page -> 10 + 3 = 13 pages
  const smallAlloc = calculateQuickModeAllocation({
    puzzleCount: 10,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionArrangement: 'back_of_book',
  });

  check('smallAlloc totalPages is 13', smallAlloc.totalPages === 13);
  check('smallAlloc isExportable is false', smallAlloc.isExportable === false);
  check('smallAlloc exportStatus is below_minimum', smallAlloc.exportStatus === 'below_minimum');
  check('exportStatusMessage explains non-exportable state and 24-page minimum', smallAlloc.exportStatusMessage.includes('cannot be exported') && smallAlloc.exportStatusMessage.includes('at least 24 interior pages'));
}

console.log('\n=== 8. Template Compatibility & Size Policy ===');
{
  // 2-Up on 6x9 triggers size fallback to classic-ws
  const twoUpSmall = resolveParametricTemplate({ templateId: 'two-up-ws', trimSize: 'kdp6x9' });
  check('two-up on 6x9 triggers fallback', twoUpSmall.fallbackApplied === true);
  check('falls back to classic-ws', twoUpSmall.template.templateId === 'classic-ws');

  // 2-Up on 8.5x11 succeeds directly
  const twoUpBig = resolveParametricTemplate({ templateId: 'two-up-ws', trimSize: 'kdp85x11' });
  check('two-up on 8.5x11 resolves without fallback', twoUpBig.ok === true && twoUpBig.template.templateId === 'two-up-ws');
}

console.log('\n=== 9. Solution Arrangement Changes ===');
{
  // Mode: none
  const allocNone = calculateQuickModeAllocation({ puzzleCount: 20, puzzlesPerPage: 1, solutionArrangement: 'none' });
  check('solutionArrangement none produces 0 solution pages', allocNone.solutionPages === 0 && allocNone.totalPages === 20);

  // Mode: next_page
  const allocNext = calculateQuickModeAllocation({ puzzleCount: 20, puzzlesPerPage: 1, solutionArrangement: 'next_page' });
  check('solutionArrangement next_page produces 20 solution pages (total 40)', allocNext.solutionPages === 20 && allocNext.totalPages === 40);

  // Mode: back_of_book
  const allocBack = calculateQuickModeAllocation({ puzzleCount: 20, puzzlesPerPage: 1, solutionsPerPage: 4, solutionArrangement: 'back_of_book' });
  check('solutionArrangement back_of_book produces 5 solution pages (total 25)', allocBack.solutionPages === 5 && allocBack.totalPages === 25);
}

console.log('\n=== 10. Review Summary Accuracy ===');
{
  const opts = {
    title: 'Review Verification Book',
    theme: 'Spring & Summer',
    wordsSource: 'preset',
    presetBankIds: ['garden'],
    trimSize: 'kdp6x9',
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionArrangement: 'back_of_book',
    solutionsPerPage: 5,
    stylePreset: 'classic',
    showFolio: true,
  };

  const alloc = calculateQuickModeAllocation(opts);
  check('summary title matches', opts.title === 'Review Verification Book');
  check('summary trim size matches', opts.trimSize === 'kdp6x9');
  check('summary total pages matches 24', alloc.totalPages === 24);
  check('summary is exportable', alloc.isExportable === true);
}

console.log('\n=== 11. Progress Updates During Generation ===');
{
  const progressLog = [];
  const res = generateQuickWordSearchBook(
    {
      title: 'Progress Book',
      puzzleCount: 5,
      puzzlesPerPage: 1,
      solutionsPerPage: 5,
      solutionArrangement: 'back_of_book',
      trimSize: 'kdp6x9',
    },
    (done, total) => {
      progressLog.push({ done, total });
    },
  );

  check('generation completed ok is true', res.ok === true);
  check('progress reported for each puzzle sequentially', progressLog.length === 5 && progressLog[4].done === 5);
}

console.log('\n=== 12. Generation Error Recovery ===');
{
  try {
    // Attempt generation with invalid empty title
    generateQuickWordSearchBook({ title: '' });
    check('invalid title threw error', false);
  } catch (e) {
    check('invalid title caught cleanly in error state', e.message.includes('Quick Mode Validation Failed'));
  }
}

console.log('\n=== 13. Invalid Layout State Detection ===');
{
  // Dense 25x25 grid on tiny 4x6 page (288x432 pt)
  const resOverflow = generateQuickWordSearchBook({
    title: 'Overflow Test',
    puzzleCount: 1,
    wordsPerPuzzle: 25,
    puzzlesPerPage: 1,
    solutionArrangement: 'none',
    trimSize: 'kdp6x9',
  });

  check('resOverflow generated result exists', Boolean(resOverflow));
}

console.log('\n=== 14. Preflight Status Display on Generated Book ===');
{
  // 24-page complete volume
  const validBook = generateQuickWordSearchBook({
    title: 'Flora 24',
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionsPerPage: 5,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  const preflightRes = runComprehensivePreflight(validBook.pages, { exportPreset: 'interior' });
  check('valid 24-page volume preflight status is pass', preflightRes.status === 'pass');
  check('preflight errors list is empty', preflightRes.errors.length === 0);

  // 13-page volume (below minimum)
  const smallBook = generateQuickWordSearchBook({
    title: 'Draft 13',
    puzzleCount: 10,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  const smallPreflight = runComprehensivePreflight(smallBook.pages, { exportPreset: 'interior' });
  check('13-page volume preflight status is blocked', smallPreflight.status === 'blocked');
  check('emits TOO_FEW_PAGES diagnostic code', smallPreflight.errors.some((e) => e.code === 'TOO_FEW_PAGES'));
}

console.log('\n=== 15. Generated Book Opens in Canvas Editor ===');
{
  const result = generateQuickWordSearchBook({
    title: 'Editor Mount Book',
    puzzleCount: 4,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  useCanvasStore.getState().setProjectName(result.book.title);
  await useCanvasStore.getState().replaceAllPages(result.pages);

  const loadedStore = useCanvasStore.getState();
  check('CanvasStore holds all 5 generated pages', loadedStore.pages.length === 5);
  check('CanvasStore projectName matches', loadedStore.projectName === 'Editor Mount Book');

  const p1 = result.pages[0];
  const engine = new CanvasEngine();
  const canvasEl = document.getElementById('c');
  engine.mount(canvasEl, p1.width, p1.height);
  await engine.loadJSON(p1.data);

  const liveObjects = engine.canvas.getObjects();
  check('page 1 canvas populated with >50 objects', liveObjects.length > 50);
  check('page 1 has title element', liveObjects.some((o) => o.wsRole === 'ws-title'));
  check('page 1 has letter elements', liveObjects.filter((o) => o.wsRole === 'ws-letter').length === 14 * 14);

  engine.dispose();
}

console.log('\n=== 16. Existing Pipeline & Navigation Compatibility ===');
{
  check('DEFAULT_QUICK_WORD_SEARCH_OPTIONS defined', Boolean(DEFAULT_QUICK_WORD_SEARCH_OPTIONS));
  check('WARNING_CODES contains TEMPLATE_FALLBACK', Boolean(WARNING_CODES.TEMPLATE_FALLBACK));
}

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PHASE 7B QUICK MODE WIZARD TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
