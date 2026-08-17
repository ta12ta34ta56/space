/**
 * Word Search Build-Pages & Pipeline Integration Tests (Phase 2).
 *
 * Verifies:
 *  1. Generated puzzle page uses the new layout frames.
 *  2. Generated solution page uses the new layout frames.
 *  3. Puzzle objects carry the correct instance metadata.
 *  4. Solution objects carry the correct solution role.
 *  5. objectIds refer to actual generated object identifiers.
 *  6. Multiple puzzles per page receive distinct instanceIds.
 *  7. Puzzle and solution instances remain correctly associated.
 *  8. solutionPlacement: none.
 *  9. solutionPlacement: next_page.
 * 10. solutionPlacement: back_of_book.
 * 11. Overflow warning propagation.
 * 12. Invalid layouts are not treated as export-ready (preflight blocker).
 * 13. Legacy metadata remains readable and valid.
 * 14. Fallback legacy layout path functions when requested.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../../test/helpers/jsdom-canvas-stub.mjs';

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

import { generateWordSearch } from './generator.built.mjs';
import {
  buildWordSearchPages,
  buildWordSearchPagesLegacy,
  wsMetaOf,
  wsInstancesOf,
  DEFAULT_WS_LAYOUT,
  WS_PAGE,
  NOVELKA_INSTANCES,
} from './build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from './renderer.built.mjs';
import { preflight } from '../../services/kdp.built.mjs';

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

const FLOWERS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
];

const p1 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 101, theme: 'Flowers' }, 1);
const p2 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 102, theme: 'Garden' }, 2);
const p3 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 103, theme: 'Blooms' }, 3);
const p4 = generateWordSearch({ size: 14, words: FLOWERS, difficulty: 'medium', seed: 104, theme: 'Spring' }, 4);

const pageSize6x9 = { width: 432, height: 648 };

console.log('\n=== 1. Puzzle Page Layout Frames & Metadata ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, title: 'Botanical Book' }, pageSize6x9);
  check('res.ok is true', res.ok === true);
  check('res.warnings is empty for valid page', res.warnings.length === 0);
  check('puzzlePageCount is 1', res.puzzlePageCount === 1);
  check('solutionPageCount is 1 (back of book default)', res.solutionPageCount === 1);

  const puzzlePage = res.pages[0];
  const data = puzzlePage.data;
  check('page carries layoutResult', !!data.layoutResult);
  check('page layoutResult.ok is true', data.layoutResult.ok === true);
  check('page carries instances', Array.isArray(data.instances) && data.instances.length > 0);
  check('page carries novelka:instances key', Array.isArray(data[NOVELKA_INSTANCES]));
  check('page carries legacy wsMeta', !!data[WS_PAGE]);
  check('legacy wsMeta has puzzleIds', data[WS_PAGE].puzzleIds[0] === p1.id);
  check('legacy wsMeta kind is puzzle', data[WS_PAGE].kind === 'puzzle');
}

console.log('\n=== 2. Solution Page Layout Frames & Solution Roles ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, solutionPlacement: 'back_of_book' }, pageSize6x9);
  const solPage = res.pages[1];
  const data = solPage.data;
  check('solution page has kind solution', data[WS_PAGE].kind === 'solution');
  const solInstances = wsInstancesOf(solPage);
  const puzzleSolInst = solInstances.find((inst) => inst.role === 'solution');
  check('solution instance has role solution', !!puzzleSolInst);
  check('solution instance references source puzzle contentId', puzzleSolInst.contentId === p1.id);
  check('solution instance kind is word-search-solution', puzzleSolInst.kind === 'word-search-solution');
}

console.log('\n=== 3. Object-Level Instance Metadata & Stable objectIds ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, title: 'Nature' }, pageSize6x9);
  const page = res.pages[0];
  const objects = page.data.objects;
  const instances = wsInstancesOf(page);
  const puzzleInst = instances.find((inst) => inst.role === 'puzzle');

  check('puzzle instance has populated objectIds', Array.isArray(puzzleInst.objectIds) && puzzleInst.objectIds.length > 0);

  // Verify object properties
  const letterObj = objects.find((o) => o.wsRole === 'ws-letter');
  check('letter object has id matching objectIds list', puzzleInst.objectIds.includes(letterObj.id));
  check('letter object carries instanceId matching puzzle instance', letterObj.instanceId === puzzleInst.instanceId);
  check('letter object carries contentId matching puzzle id', letterObj.contentId === p1.id);
  check('letter object carries instanceRole grid', letterObj.instanceRole === 'grid');
  check('letter object carries legacy wsRole ws-letter', letterObj.wsRole === 'ws-letter');
  check('letter object carries legacy wsPuzzle', letterObj.wsPuzzle === p1.id);

  const bankObj = objects.find((o) => o.wsRole === 'ws-bank');
  check('bank object has instanceRole word-list', bankObj.instanceRole === 'word-list');
  check('bank object has contentId matching puzzle id', bankObj.contentId === p1.id);

  const titleObj = objects.find((o) => o.wsRole === 'ws-title');
  const titleInst = instances.find((inst) => inst.role === 'title');
  check('title object carries title instanceId', titleObj.instanceId === titleInst.instanceId);
  check('title instance objectIds includes titleObj.id', titleInst.objectIds.includes(titleObj.id));
}

console.log('\n=== 4. Multi-Up Puzzles Distinct instanceIds ===');
{
  // 2 puzzles on 1 page
  const res = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, puzzlesPerPage: 2, solutionPlacement: 'none' }, { width: 612, height: 792 });
  const page = res.pages[0];
  const instances = wsInstancesOf(page);
  const puzzleInstances = instances.filter((inst) => inst.role === 'puzzle');

  check('page has 2 puzzle instances', puzzleInstances.length === 2);
  check('puzzle 1 and puzzle 2 have distinct instanceIds', puzzleInstances[0].instanceId !== puzzleInstances[1].instanceId);
  check('puzzle 1 has contentId p1', puzzleInstances[0].contentId === p1.id);
  check('puzzle 2 has contentId p2', puzzleInstances[1].contentId === p2.id);

  // Check that object IDs do not overlap between the two instances
  const ids1 = new Set(puzzleInstances[0].objectIds);
  const ids2 = new Set(puzzleInstances[1].objectIds);
  const intersection = [...ids1].filter((id) => ids2.has(id));
  check('no overlapping objectIds between distinct instances', intersection.length === 0);
}

console.log('\n=== 5. Solution Placement Modes ===');
{
  // Mode: none
  const resNone = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, solutionPlacement: 'none' }, pageSize6x9);
  check('solutionPlacement none has 0 solution pages', resNone.solutionPageCount === 0 && resNone.pages.length === 2);

  // Mode: next_page
  const resNext = buildWordSearchPages([p1, p2], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, puzzlesPerPage: 1, solutionPlacement: 'next_page' }, pageSize6x9);
  check('solutionPlacement next_page alternates: total 4 pages', resNext.pages.length === 4);
  check('page 1 is puzzle', resNext.pages[0].data[WS_PAGE].kind === 'puzzle');
  check('page 2 is solution for p1', resNext.pages[1].data[WS_PAGE].kind === 'solution' && resNext.pages[1].data[WS_PAGE].puzzleIds[0] === p1.id);
  check('page 3 is puzzle', resNext.pages[2].data[WS_PAGE].kind === 'puzzle');
  check('page 4 is solution for p2', resNext.pages[3].data[WS_PAGE].kind === 'solution' && resNext.pages[3].data[WS_PAGE].puzzleIds[0] === p2.id);

  // Mode: back_of_book
  const resBack = buildWordSearchPages([p1, p2, p3, p4], DEFAULT_WS_STYLE, { ...DEFAULT_WS_LAYOUT, puzzlesPerPage: 1, solutionsPerPage: 4, solutionPlacement: 'back_of_book' }, pageSize6x9);
  check('solutionPlacement back_of_book has 4 puzzle pages and 1 packed solution page', resBack.puzzlePageCount === 4 && resBack.solutionPageCount === 1 && resBack.pages.length === 5);
  check('last page holds all 4 solution puzzleIds', resBack.pages[4].data[WS_PAGE].puzzleIds.length === 4);
}

console.log('\n=== 6. Overflow Propagation & Preflight Prevention ===');
{
  // Dense 25x25 grid on tiny 4x6 page (288x432 pt)
  const impossiblePuzzle = generateWordSearch({ size: 25, words: FLOWERS, difficulty: 'expert', seed: 999 }, 1);
  const resOverflow = buildWordSearchPages(
    [impossiblePuzzle],
    DEFAULT_WS_STYLE,
    { ...DEFAULT_WS_LAYOUT, solutionPlacement: 'none' },
    { width: 288, height: 432 },
  );

  check('resOverflow.ok is false', resOverflow.ok === false);
  check('resOverflow carries error warnings', resOverflow.warnings.some((w) => w.severity === 'error'));

  const badPage = resOverflow.pages[0];
  check('badPage is marked invalidForProduction = true', badPage.data.invalidForProduction === true);
  check('badPage is marked ok = false', badPage.data.ok === false);

  // Preflight check must fail on invalid page
  const issues = preflight(resOverflow.pages);
  const invalidLayoutIssue = issues.find((i) => i.code === 'invalid-layout');
  check('preflight flags invalid layout as blocker error', !!invalidLayoutIssue && invalidLayoutIssue.level === 'error');
}

console.log('\n=== 7. Legacy Metadata Reading & Compatibility ===');
{
  const res = buildWordSearchPages([p1], DEFAULT_WS_STYLE, DEFAULT_WS_LAYOUT, pageSize6x9);
  const page = res.pages[0];

  const meta = wsMetaOf(page);
  check('wsMetaOf reads page metadata correctly', meta.kind === 'puzzle' && meta.puzzleIds[0] === p1.id);

  const insts = wsInstancesOf(page);
  check('wsInstancesOf reads structured instances array', insts.length > 0 && insts[0].instanceId.startsWith('inst-'));
}

console.log('\n=== 8. Legacy Fallback Path ===');
{
  const resLegacy = buildWordSearchPagesLegacy([p1], DEFAULT_WS_STYLE, DEFAULT_WS_LAYOUT, pageSize6x9);
  check('resLegacy returns pages', resLegacy.pages.length === 2);
  check('resLegacy carries legacy metadata', resLegacy.pages[0].data[WS_PAGE].kind === 'puzzle');
  const inst = resLegacy.instances[0];
  const matchedObj = resLegacy.pages[0].data.objects.find((o) => o.instanceId === inst.instanceId);
  check('resLegacy attaches instance metadata to puzzle objects', !!matchedObj && matchedObj.instanceId === inst.instanceId);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL PHASE 2 BUILD-PAGES & PIPELINE TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
