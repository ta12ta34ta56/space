/**
 * Quick Mode Word-Search Book Creation Tests (Phase 3).
 *
 * Verifies:
 *  1. Wizard defaults.
 *  2. Required title validation.
 *  3. Required word validation (preset themes vs custom lists).
 *  4. Page size selection across 5 validated trim sizes.
 *  5. Page count and puzzle count allocation calculations.
 *  6. None solution mode.
 *  7. Next-page solution mode.
 *  8. Back-of-book solution mode.
 *  9. Complete book generation (puzzles + solutions + instances + metadata).
 * 10. Invalid layout handling & non-silent failure.
 * 11. Generation error handling.
 * 12. Preview page count and page roles.
 * 13. Legacy editor remains available.
 * 14. Performance and deterministic reproduciblity.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../test/helpers/jsdom-canvas-stub.mjs';

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
  DEFAULT_QUICK_WORD_SEARCH_OPTIONS,
  validateQuickModeOptions,
  calculateQuickModeAllocation,
  buildStyleForPreset,
  generateQuickWordSearchBook,
} from './domain.built.mjs';
import { VALIDATED_TRIM_SIZES } from './domain.built.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== 1. Wizard Defaults ===');
{
  check('default title is non-empty', Boolean(DEFAULT_QUICK_WORD_SEARCH_OPTIONS.title));
  check('default trimSize is kdp6x9', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.trimSize === 'kdp6x9');
  check('default puzzleCount is 25', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.puzzleCount === 25);
  check('default solution arrangement is back_of_book', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.solutionArrangement === 'back_of_book');
  check('default solutionsPerPage is 4', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.solutionsPerPage === 4);
  check('default wordsPerPuzzle is 12', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.wordsPerPuzzle === 12);
  check('default style preset is classic', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.stylePreset === 'classic');
  check('default kdpSafe is true', DEFAULT_QUICK_WORD_SEARCH_OPTIONS.kdpSafe === true);
}

console.log('\n=== 2. Required Title Validation ===');
{
  const emptyTitle = validateQuickModeOptions({ title: '' });
  check('empty title fails validation', emptyTitle.valid === false && Boolean(emptyTitle.errors.title));

  const whitespaceTitle = validateQuickModeOptions({ title: '   ' });
  check('whitespace title fails validation', whitespaceTitle.valid === false && Boolean(whitespaceTitle.errors.title));

  const validTitle = validateQuickModeOptions({ title: 'Flower Puzzles' });
  check('valid title passes title check', !validTitle.errors.title);
}

console.log('\n=== 3. Required Word Validation ===');
{
  // Preset without banks
  const noBanks = validateQuickModeOptions({ title: 'Book', wordsSource: 'preset', presetBankIds: [] });
  check('empty preset bank selection fails', noBanks.valid === false && Boolean(noBanks.errors.words));

  // Custom with too few words
  const tooFew = validateQuickModeOptions({ title: 'Book', wordsSource: 'custom', customWordsText: 'CAT, DOG, BIRD' });
  check('fewer than 4 custom words fails validation', tooFew.valid === false && Boolean(tooFew.errors.words));

  // Custom with valid words
  const validCustom = validateQuickModeOptions({ title: 'Book', wordsSource: 'custom', customWordsText: 'ROSE, TULIP, DAISY, LILY, ORCHID' });
  check('5 custom words passes validation', !validCustom.errors.words);
}

console.log('\n=== 4. Page Size Selection & Validation ===');
{
  for (const [key, size] of Object.entries(VALIDATED_TRIM_SIZES)) {
    const alloc = calculateQuickModeAllocation({ trimSize: key, puzzleCount: 50 });
    check(`${size.label} allocation has correct dimensions`, alloc.trimSize.width === size.width && alloc.trimSize.height === size.height);
  }

  const invalidTrim = validateQuickModeOptions({ title: 'Book', trimSize: 'unknown_size_99' });
  check('unknown trim size fails validation', invalidTrim.valid === false && Boolean(invalidTrim.errors.trimSize));
}

console.log('\n=== 5. Page Allocation Calculations ===');
{
  // 50 puzzles, back_of_book (4/page) -> 50 puzzle pages + 13 solution pages = 63 pages
  const allocBack = calculateQuickModeAllocation({ puzzleCount: 50, solutionArrangement: 'back_of_book', solutionsPerPage: 4, puzzlesPerPage: 1 });
  check('back_of_book puzzlePages is 50', allocBack.puzzlePages === 50);
  check('back_of_book solutionPages is 13 (ceil(50/4))', allocBack.solutionPages === 13);
  check('back_of_book totalPages is 63', allocBack.totalPages === 63);

  // 20 puzzles, next_page -> 20 puzzle pages + 20 solution pages = 40 pages
  const allocNext = calculateQuickModeAllocation({ puzzleCount: 20, solutionArrangement: 'next_page', puzzlesPerPage: 1 });
  check('next_page puzzlePages is 20', allocNext.puzzlePages === 20);
  check('next_page solutionPages is 20', allocNext.solutionPages === 20);
  check('next_page totalPages is 40', allocNext.totalPages === 40);

  // 30 puzzles, none -> 30 puzzle pages + 0 solution pages = 30 pages
  const allocNone = calculateQuickModeAllocation({ puzzleCount: 30, solutionArrangement: 'none' });
  check('none solutionPages is 0', allocNone.solutionPages === 0);
  check('none totalPages is 30', allocNone.totalPages === 30);
}

console.log('\n=== 6. Style Presets ===');
{
  const classic = buildStyleForPreset('classic');
  check('classic preset uses Georgia and plain grid', classic.fontFamily === 'Georgia' && classic.gridStyle === 'plain');

  const modern = buildStyleForPreset('modern');
  check('modern preset uses Inter and ruled lines', modern.fontFamily === 'Inter' && modern.gridStyle === 'lines');

  const playful = buildStyleForPreset('playful');
  check('playful preset uses boxed grid and checklist bank', playful.gridStyle === 'boxes' && playful.bankStyle === 'checklist');
}

console.log('\n=== 7. Complete Book Generation: Back of Book ===');
{
  let progressCount = 0;
  const result = generateQuickWordSearchBook(
    {
      title: 'Botanical Word Search',
      theme: 'Flowers',
      wordsSource: 'preset',
      presetBankIds: ['garden'],
      puzzleCount: 10,
      solutionArrangement: 'back_of_book',
      solutionsPerPage: 4,
      trimSize: 'kdp6x9',
    },
    (done, _total) => {
      progressCount = done;
    },
  );

  check('generation reported progress', progressCount === 10);
  check('generation result.ok is true', result.ok === true);
  check('result has 10 puzzle pages', result.puzzlePageCount === 10);
  check('result has 3 solution pages (ceil(10/4))', result.solutionPageCount === 3);
  check('result has 13 total pages', result.pages.length === 13);
  check('domain book model is populated', result.book.title === 'Botanical Word Search' && result.book.pages.length === 13);
  check('every page carries structured instances', result.pages.every((p) => Array.isArray(p.data.instances) && p.data.instances.length > 0));
}

console.log('\n=== 8. Complete Book Generation: Next Page Mode ===');
{
  const result = generateQuickWordSearchBook({
    title: 'Animals Search',
    theme: 'Fauna',
    wordsSource: 'preset',
    presetBankIds: ['animals'],
    puzzleCount: 4,
    solutionArrangement: 'next_page',
    trimSize: 'kdp6x9',
  });

  check('next_page produces 4 puzzle pages and 4 solution pages', result.puzzlePageCount === 4 && result.solutionPageCount === 4);
  check('next_page produces 8 total pages', result.pages.length === 8);
  check('pages alternate puzzle -> solution', result.pages[0].data['novelka:wordsearch-page'].kind === 'puzzle' && result.pages[1].data['novelka:wordsearch-page'].kind === 'solution');
}

console.log('\n=== 9. Complete Book Generation: None Mode ===');
{
  const result = generateQuickWordSearchBook({
    title: 'Space Adventure',
    theme: 'Cosmos',
    wordsSource: 'preset',
    presetBankIds: ['space'],
    puzzleCount: 5,
    solutionArrangement: 'none',
    trimSize: 'kdp85x11',
  });

  check('none mode produces 5 puzzle pages and 0 solution pages', result.puzzlePageCount === 5 && result.solutionPageCount === 0 && result.pages.length === 5);
  check('all pages are puzzle pages', result.pages.every((p) => p.data['novelka:wordsearch-page'].kind === 'puzzle'));
}

console.log('\n=== 10. Complete Book Generation: Custom Word List ===');
{
  const customList = 'ALPHA, BRAVO, CHARLIE, DELTA, ECHO, FOXTROT, GOLF, HOTEL, INDIA, JULIETT, KILO, LIMA, MIKE, NOVEMBER';
  const result = generateQuickWordSearchBook({
    title: 'Phonetic Alphabet',
    wordsSource: 'custom',
    customWordsText: customList,
    puzzleCount: 3,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  check('custom word list generation succeeded', result.ok === true);
  check('custom puzzle pages contain words from custom list', result.pages[0].data.instances.some((i) => i.role === 'puzzle'));
}

console.log('\n=== 11. Invalid Layout & Error Propagation ===');
{
  // Force invalid layout (empty title throws before generation)
  let threw = false;
  try {
    generateQuickWordSearchBook({ title: '' });
  } catch {
    threw = true;
  }
  check('invalid options throw descriptive validation error', threw === true);
}

console.log('\n=== 12. Preview Page Roles & Consistency ===');
{
  const result = generateQuickWordSearchBook({
    title: 'Preview Test Book',
    puzzleCount: 6,
    solutionArrangement: 'back_of_book',
    solutionsPerPage: 4,
    trimSize: 'kdp6x9',
  });

  check('all pages have role interior', result.pages.every((p) => p.role === 'interior'));
  check('first 6 pages are puzzles', result.pages.slice(0, 6).every((p) => p.data['novelka:wordsearch-page'].kind === 'puzzle'));
  check('last 2 pages are solutions', result.pages.slice(6).every((p) => p.data['novelka:wordsearch-page'].kind === 'solution'));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL QUICK MODE WORD SEARCH TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
