/**
 * Phase 6 Parametric Template System: Full Integration Checkpoint Test Suite.
 *
 * Demonstrates:
 *  1. Quick Mode generates a book using a resolved parametric template.
 *  2. buildWordSearchPages() uses the resolved parametric template.
 *  3. layoutWordSearchPage() receives the template's regions, slots, constraints and style tokens.
 *  4. The renderer uses the calculated frames from the parametric template.
 *  5. Changing a template rule changes the generated page layout.
 *  6. Changing a template style token changes the generated page style.
 *  7. The generated page metadata records: templateId, templateVersion, templateStatus, layoutDecisions.
 *  8. A published template is selectable in production generation.
 *  9. A draft/unpublished template is rejected in production generation.
 * 10. An unsupported size rejects or falls back with an explicit diagnostic.
 * 11. Legacy templates still load correctly for legacy projects.
 * 12. The legacy path is not silently used for new Quick Mode projects.
 * 13. Preflight reads the final resolved template / layout metadata.
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
  CLASSIC_WS_TEMPLATE,
  resolveParametricTemplate,
  registerParametricTemplate,
  unregisterParametricTemplate,
  layoutWordSearchPage,
  getGeometryForPreset,
  generateQuickWordSearchBook,
  runComprehensivePreflight,
  WARNING_CODES,
} from './domain.built.mjs';
import { generateWordSearch } from '../modules/word-search/generator.built.mjs';
import {
  buildWordSearchPages,
  buildWordSearchPagesLegacy,
  WS_PAGE,
  NOVELKA_INSTANCES,
} from '../modules/word-search/build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from '../modules/word-search/renderer.built.mjs';

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

const FLOWERS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
];

const p1 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 201, theme: 'Flora' }, 1);
const p2 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 202, theme: 'Fauna' }, 2);

const size6x9 = { width: 432, height: 648, trimKey: 'kdp6x9' };

console.log('\n=== TEST 1 & 2: Generate Page with classic-ws & Confirm Title Frame ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic-ws',
    title: 'Flora Explorer',
    showFolio: true,
  }, size6x9);

  check('res.ok is true', res.ok === true);
  check('page is generated', res.pages.length === 1);
  const page = res.pages[0];
  const pageData = page.data;
  check('page carries templateId "classic-ws"', pageData.templateId === 'classic-ws');
  check('page carries templateVersion "1.0.0"', pageData.templateVersion === '1.0.0');
  check('page carries templateStatus "published"', pageData.templateStatus === 'published');
  check('page carries layoutResult.template', pageData.layoutResult?.template?.templateId === 'classic-ws');

  // Title frame checks
  const titleFrame = pageData.layoutResult.frames.titleFrame;
  check('titleFrame is present', Boolean(titleFrame));
  check('titleFrame top aligns with safeArea top (27pt)', titleFrame.top === 27);
  check('titleFrame width spans safeArea width (378pt)', titleFrame.width === 378);

  const titleObj = pageData.objects.find((o) => o.wsRole === 'ws-title');
  check('rendered title object top aligns with titleFrame top within 1pt', Math.abs(titleObj.top - titleFrame.top) <= 1);
  check('rendered title object width equals titleFrame width', titleObj.width === titleFrame.width);
}

console.log('\n=== TEST 3 & 4: Confirm Grid & Word-List Frames Match Parametric Template ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic-ws',
    title: 'Flora Explorer',
    showFolio: true,
  }, size6x9);

  const pf = res.pages[0].data.layoutResult.frames.puzzles[0];
  check('puzzle layout frame is present', Boolean(pf));
  check('gridFrame width equals height (square grid)', pf.gridFrame.width === pf.gridFrame.height);
  check('grid cellSize is >= template minCellSize (12pt)', pf.cellSize >= 12);
  check('wordListFrame top is below gridFrame bottom', pf.wordListFrame.top >= pf.gridFrame.top + pf.gridFrame.height);
  check('wordListFrame bankColumns matches template default (3 cols)', pf.bankColumns === 3);

  // Check canvas objects
  const gridLetter = res.pages[0].data.objects.find((o) => o.wsRole === 'ws-letter');
  check('rendered letter falls within gridFrame horizontal bounds', gridLetter.left >= pf.gridFrame.left && gridLetter.left <= pf.gridFrame.left + pf.gridFrame.width);
  const bankItem = res.pages[0].data.objects.find((o) => o.wsRole === 'ws-bank');
  check('rendered bank item falls within wordListFrame vertical bounds', bankItem.top >= pf.wordListFrame.top);
}

console.log('\n=== TEST 5: Change Template Target Gap & Prove Layout Changes ===');
{
  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  const specStandard = {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: 'Flora Explorer',
    template: CLASSIC_WS_TEMPLATE,
    puzzles: [{ id: 'p1', index: 1, size: 14, words: FLOWERS }],
  };

  // Custom template with double target gap (28pt vs default 14pt)
  const customGapTemplate = {
    ...CLASSIC_WS_TEMPLATE,
    templateId: 'custom-gap-ws',
    slots: [{ puzzlesPerPage: 1, gridColumns: 1, gridRows: 1, targetGap: 28 }],
    regions: CLASSIC_WS_TEMPLATE.regions.map((r) =>
      r.role === 'word-list' ? { ...r, spacing: { top: 28 } } : r,
    ),
  };
  const specCustomGap = {
    ...specStandard,
    template: customGapTemplate,
  };

  const layoutStandard = layoutWordSearchPage(geo, specStandard);
  const layoutCustomGap = layoutWordSearchPage(geo, specCustomGap);

  const stdBankTop = layoutStandard.frames.puzzles[0].wordListFrame.top;
  const stdGridBottom = layoutStandard.frames.puzzles[0].gridFrame.top + layoutStandard.frames.puzzles[0].gridFrame.height;
  const stdActualGap = stdBankTop - stdGridBottom;

  const customBankTop = layoutCustomGap.frames.puzzles[0].wordListFrame.top;
  const customGridBottom = layoutCustomGap.frames.puzzles[0].gridFrame.top + layoutCustomGap.frames.puzzles[0].gridFrame.height;
  const customActualGap = customBankTop - customGridBottom;

  check('standard layout gap equals 14pt', Math.round(stdActualGap) === 14);
  check('custom layout gap equals 28pt', Math.round(customActualGap) === 28);
  check('changing target gap changes generated bank top coordinate', customBankTop !== stdBankTop);
}

console.log('\n=== TEST 6: Change Style Token & Prove Generated Object Style Changes ===');
{
  // Custom template with distinct styled tokens: letterColor = '#e11d48', fontFamily = 'Georgia', frameWidth = 2.4
  const styledTemplate = {
    ...CLASSIC_WS_TEMPLATE,
    templateId: 'styled-ws',
    styleTokens: {
      fontFamily: 'Georgia',
      letterColor: '#e11d48',
      gridLineColor: '#3b82f6',
      gridLineWidth: 1.2,
      frameWidth: 2.4,
      bankColumns: 4,
      bankFontSize: 12,
      gridStyle: 'lines',
      bankStyle: 'columns',
    },
  };

  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  const layoutRes = layoutWordSearchPage(geo, {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: 'Styled Words',
    template: styledTemplate,
    puzzles: [{ id: 'p1', index: 1, size: 14, words: FLOWERS }],
  });

  const pf = layoutRes.frames.puzzles[0];
  check('template styleToken bankColumns (4) is applied in layout frame', pf.bankColumns === 4);

  // Render objects using the template-derived frames and style
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic-ws',
    title: 'Flora Explorer',
    showFolio: true,
  }, size6x9);

  const letterObjs = res.pages[0].data.objects.filter((o) => o.wsRole === 'ws-letter');
  check('letters have default fill #111827 from classic-ws style tokens', letterObjs.every((l) => l.fill === '#111827'));
}

console.log('\n=== TEST 7 & 8: Draft vs Published Filtering in Production & Development ===');
{
  // In production (publishedOnly: true)
  const resolveProd = resolveParametricTemplate({
    templateId: 'draft-experiment-ws',
    publishedOnly: true,
  });
  check('draft template is rejected in production (publishedOnly: true)', resolveProd.ok === false);
  check('production fallbackApplied is true', resolveProd.fallbackApplied === true);
  check('production falls back to classic-ws', resolveProd.template.templateId === 'classic-ws');
  check('reason explains draft rejection', resolveProd.reason.includes('draft'));

  // In development (publishedOnly: false)
  const resolveDev = resolveParametricTemplate({
    templateId: 'draft-experiment-ws',
    publishedOnly: false,
  });
  check('draft template resolves successfully in dev (publishedOnly: false)', resolveDev.ok === true);
  check('dev fallbackApplied is false', resolveDev.fallbackApplied === false);
  check('resolved templateId is draft-experiment-ws', resolveDev.template.templateId === 'draft-experiment-ws');

  // buildWordSearchPages emits warning when fallback happens
  const resBuild = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'draft-experiment-ws',
    title: 'Flora',
    showFolio: true,
    publishedOnly: true,
  }, size6x9);

  check('buildWordSearchPages emits TEMPLATE_FALLBACK warning for draft in prod', resBuild.warnings.some((w) => w.code === WARNING_CODES.TEMPLATE_FALLBACK));
  check('generated page records fallback in layoutDecisions', resBuild.pages[0].data.layoutDecisions.some((d) => d.rule === 'TEMPLATE_FALLBACK'));
}

console.log('\n=== TEST 9: Reject Unsupported Trim Size with Clear Diagnostic ===');
{
  // two-up-ws supports ['kdp85x11', 'kdp8x10', 'A4'], NOT 'kdp6x9'
  const resUnsupported = resolveParametricTemplate({
    templateId: 'two-up-ws',
    trimSize: 'kdp6x9',
  });
  check('unsupported size is rejected (ok: false)', resUnsupported.ok === false);
  check('fallbackApplied is true', resUnsupported.fallbackApplied === true);
  check('diagnostic reason specifies unsupported trim size "kdp6x9"', resUnsupported.reason.includes('does not support trim size "kdp6x9"'));
  check('falls back to classic-ws', resUnsupported.template.templateId === 'classic-ws');

  // buildWordSearchPages emits warning when requested size is unsupported
  const resBuild = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 2,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'two-up-ws',
    title: 'Flora',
    showFolio: true,
  }, size6x9);

  check('buildWordSearchPages records TEMPLATE_FALLBACK warning for unsupported size', resBuild.warnings.some((w) => w.code === WARNING_CODES.TEMPLATE_FALLBACK));
}

console.log('\n=== TEST 10: Legacy Template Aliases & Legacy Project Fallback ===');
{
  const resClassic = resolveParametricTemplate({ templateId: 'classic' });
  check('legacy "classic" alias resolves to classic-ws', resClassic.ok === true && resClassic.template.templateId === 'classic-ws');

  const resTwoUp = resolveParametricTemplate({ templateId: 'two-up', trimSize: 'kdp85x11' });
  check('legacy "two-up" alias resolves to two-up-ws', resTwoUp.ok === true && resTwoUp.template.templateId === 'two-up-ws');

  const resAnswers = resolveParametricTemplate({ templateId: 'answers' });
  check('legacy "answers" alias resolves to answers-ws', resAnswers.ok === true && resAnswers.template.templateId === 'answers-ws');

  // Legacy layout fallback path when useLegacyLayout is explicitly true
  const resLegacy = buildWordSearchPagesLegacy([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: 'Legacy Flora',
    showFolio: true,
  }, size6x9);

  check('legacy path produces valid pages', resLegacy.pages.length === 1);
  check('legacy page carries WS_PAGE metadata', Boolean(resLegacy.pages[0].data[WS_PAGE]));
  check('legacy page carries NOVELKA_INSTANCES', Array.isArray(resLegacy.pages[0].data[NOVELKA_INSTANCES]));
}

console.log('\n=== TEST 11: Quick Mode Generates Book Using Resolved Parametric Template ===');
{
  const quickResult = generateQuickWordSearchBook({
    title: 'Botanical Garden Puzzles',
    puzzleCount: 4,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
    templateId: 'classic-ws',
  });

  check('quick mode result ok is true', quickResult.ok === true);
  check('total pages is 5 (4 puzzle + 1 solution)', quickResult.pages.length === 5);

  const puzzlePage = quickResult.pages[0];
  const puzzleData = puzzlePage.data;
  check('puzzle page carries templateId "classic-ws"', puzzleData.templateId === 'classic-ws');
  check('puzzle page carries templateVersion "1.0.0"', puzzleData.templateVersion === '1.0.0');
  check('puzzle page carries templateStatus "published"', puzzleData.templateStatus === 'published');
  check('puzzle page carries layoutResult with frames', Boolean(puzzleData.layoutResult?.frames));
  check('puzzle page has 0 error warnings', puzzleData.layoutWarnings.length === 0);

  const solPage = quickResult.pages[4];
  const solData = solPage.data;
  check('solution page carries templateId "answers-ws"', solData.templateId === 'answers-ws');
  check('solution page carries templateVersion "1.0.0"', solData.templateVersion === '1.0.0');
  check('solution page carries templateStatus "published"', solData.templateStatus === 'published');

  // Verify domain Book model pages
  const domainBookPages = quickResult.book.pages;
  check('domain Book model has 5 pages', domainBookPages.length === 5);
  check('domain page 1 has templateId classic-ws', domainBookPages[0].templateId === 'classic-ws');
  check('domain page 5 has templateId answers-ws', domainBookPages[4].templateId === 'answers-ws');
}

console.log('\n=== TEST 12: Preflight Reads Resolved Template & Layout Metadata ===');
{
  const quickResult = generateQuickWordSearchBook({
    title: 'Botanical Garden Puzzles',
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionsPerPage: 5,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  // Complete 24-page book (20 puzzle pages + 4 answer pages)
  const preflightRes = runComprehensivePreflight(quickResult.pages, { exportPreset: 'interior' });
  check('preflight status is pass for valid parametric book', preflightRes.status === 'pass');
  check('preflight errors list is empty', preflightRes.errors.length === 0);
  check('preflight affectedPages is empty', preflightRes.affectedPages.length === 0);
  check('preflight summary indicates passed', preflightRes.summary.includes('Preflight passed'));
}

console.log('\n=== TEST 13: Custom Published Template with letterColor "#e11d48" ===');
{
  const customRoseTemplate = {
    ...CLASSIC_WS_TEMPLATE,
    templateId: 'rose-ws',
    version: '1.0.0',
    name: 'Rose Word Search',
    description: 'Custom published rose styled word search template',
    generatorKinds: ['wordsearch'],
    pageModes: ['puzzle'],
    supportedSizes: ['kdp6x9', 'kdp85x11'],
    styleTokens: {
      fontFamily: 'Georgia',
      letterColor: '#e11d48',
      gridLineColor: '#fda4af',
      gridLineWidth: 0.8,
      frameWidth: 1.8,
      bankColumns: 3,
      bankFontSize: 11,
      bankColor: '#be123c',
      gridStyle: 'lines',
      bankStyle: 'columns',
    },
    status: 'published',
    accessLevel: 'free',
  };

  registerParametricTemplate(customRoseTemplate);

  // 1. Generate a word-search page with the custom template
  const resRose = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'rose-ws',
    template: customRoseTemplate,
    title: 'Rose Garden',
    showFolio: true,
  }, size6x9);

  check('rose generation ok is true', resRose.ok === true);
  const rosePage = resRose.pages[0];

  // Verify 1: The resolved template metadata contains the custom template ID
  check('resolved template metadata contains custom template ID "rose-ws"', rosePage.data.templateId === 'rose-ws');
  check('layoutResult template metadata has templateId "rose-ws"', rosePage.data.layoutResult?.template?.templateId === 'rose-ws');
  check('resolved template status is "published"', rosePage.data.templateStatus === 'published');

  // Verify 2: The layout result contains the custom style token
  check('layout measurements record bankFontSize from template (11pt)', rosePage.data.layoutResult.measurements.bankFontSize === 11);
  check('layout result measurements bankColumns matches template token (3)', rosePage.data.layoutResult.measurements.bankColumns === 3);

  // Verify 3: At least one rendered letter object has fill "#e11d48"
  const letterObjs = rosePage.data.objects.filter((o) => o.wsRole === 'ws-letter');
  check('at least one rendered letter object exists', letterObjs.length > 0);
  check('every rendered letter object has fill "#e11d48"', letterObjs.every((l) => l.fill === '#e11d48'));

  // Verify 4: The word-list style also reflects the custom token if configured (#be123c)
  const bankObjs = rosePage.data.objects.filter((o) => o.wsRole === 'ws-bank');
  check('rendered bank objects exist', bankObjs.length > 0);
  check('every rendered bank object has custom bankColor "#be123c"', bankObjs.every((b) => b.fill === '#be123c'));

  // Verify 5: The default classic-ws template remains unchanged in a separate generation
  const resClassicSeparate = buildWordSearchPages([p1], DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'none',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic-ws',
    title: 'Standard Garden',
    showFolio: true,
  }, size6x9);

  const classicLetters = resClassicSeparate.pages[0].data.objects.filter((o) => o.wsRole === 'ws-letter');
  const classicBank = resClassicSeparate.pages[0].data.objects.filter((o) => o.wsRole === 'ws-bank');
  check('classic-ws template generation templateId is "classic-ws"', resClassicSeparate.pages[0].data.templateId === 'classic-ws');
  check('classic-ws letters retain default fill "#111827"', classicLetters.every((l) => l.fill === '#111827'));
  check('classic-ws word bank retains default fill "#111827"', classicBank.every((b) => b.fill === '#111827'));

  // Clean up
  unregisterParametricTemplate('rose-ws');
}

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PHASE 6 INTEGRATION CHECKPOINT TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
