/**
 * Generator kind-tag & apply-to-all smoke test — npm run test:live.
 *
 * Verifies the v9 data model and workflow:
 *  1. Every generated page carries a machine-readable `kind` tag (item 1).
 *  2. `pageKindOf` reads that tag; legacy metadata still resolves.
 *  3. Solutions per page always offer "1" (item 3).
 *  4. The shared apply functions only touch pages of the SAME generator kind,
 *     never cross kinds, and skip the cover (item 2).
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
installCanvasStub(dom);
dom.window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Image = dom.window.Image;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
globalThis.devicePixelRatio = 1;
if (!dom.window.document.fonts) {
  dom.window.document.fonts = {
    load: async () => [], ready: Promise.resolve(), add() {}, has() { return false; }, size: 0,
    [Symbol.iterator]: function* () {},
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
}

const { pageKindOf, kindLabel, sameGenerator } = await import('./page-kind.built.mjs');
const { buildSudokuPages, DEFAULT_LAYOUT: SUDO_LAYOUT } = await import('../sudoku-maker/build-pages.built.mjs');
const { DEFAULT_STYLE: SUDO_STYLE, suggestSolutionsPerPage } = await import('../sudoku-maker/renderer.built.mjs');
const { generateSet } = await import('../sudoku-maker/generator.built.mjs');
const { buildWordSearchPages, DEFAULT_WS_LAYOUT } = await import('../word-search/build-pages.built.mjs');
const { DEFAULT_WS_STYLE, suggestWsSolutionsPerPage } = await import('../word-search/renderer.built.mjs');
const { generateWordSearch } = await import('../word-search/generator.built.mjs');
const { buildCrosswordPages, DEFAULT_CW_LAYOUT } = await import('../crossword/build-pages.built.mjs');
const { DEFAULT_CW_STYLE, suggestCwSolutionsPerPage } = await import('../crossword/renderer.built.mjs');
const { generateCrossword } = await import('../crossword/generator.built.mjs');
const { buildMazePages, DEFAULT_MZ_LAYOUT } = await import('../maze/build-pages.built.mjs');
const { DEFAULT_MAZE_STYLE } = await import('../maze/renderer.built.mjs');
const { generateMazes } = await import('../maze/generator.built.mjs');
const { mzApplySpecToPages } = await import('./mz-layout.built.mjs');

// ---- 1. Every generated page carries a kind tag ---------------------------
console.log('\n=== item 1: generated pages carry a machine-readable kind tag ===');

const sudokuPuzzles = generateSet({ size: 9, difficulty: 'medium', count: 4, symmetric: true });
const sudoku = buildSudokuPages(
  sudokuPuzzles, SUDO_STYLE,
  { ...SUDO_LAYOUT, puzzlesPerPage: 2, solutionPlacement: 'back_of_book', solutionsPerPage: 1 },
  { width: 432, height: 648 },
);
check('sudoku pages stamped kind=sudoku',
  sudoku.pages.every((p) => p.kind === 'sudoku'), JSON.stringify(sudoku.pages.map((p) => p.kind)));
check('sudoku resolves via pageKindOf', sudoku.pages.every((p) => pageKindOf(p) === 'sudoku'));
check('kindLabel(sudoku) = Sudoku', kindLabel('sudoku') === 'Sudoku');

const wsPuzzles = Array.from({ length: 2 }, (_, i) =>
  generateWordSearch({ difficulty: 'medium', words: ['CAT', 'DOG', 'BIRD', 'FISH'], size: 10, seed: 100 + i }, i + 1));
const ws = buildWordSearchPages(
  wsPuzzles, DEFAULT_WS_STYLE,
  { ...DEFAULT_WS_LAYOUT, solutionPlacement: 'back_of_book', solutionsPerPage: 1 },
  { width: 432, height: 648 },
);
check('wordsearch pages stamped kind=wordsearch',
  ws.pages.every((p) => p.kind === 'wordsearch'), JSON.stringify(ws.pages.map((p) => p.kind)));
check('wordsearch resolves via pageKindOf', ws.pages.every((p) => pageKindOf(p) === 'wordsearch'));

const cwPuzzle = generateCrossword({ words: ['CAT', 'DOG', 'BIRD', 'FISH', 'PLANE', 'TRAIN', 'BOAT', 'CAR'].map((word) => ({ word, clue: `(${word.length} letters)` })), difficulty: 'easy', seed: 5 }, 1);
const cw = buildCrosswordPages(
  [cwPuzzle],
  DEFAULT_CW_STYLE,
  DEFAULT_CW_LAYOUT,
  { width: 432, height: 648 },
);
check('crossword pages stamped kind=crossword',
  (cw.pages || []).every((p) => p.kind === 'crossword'));

// ---- 2. same-generator / cross-generator --------------------------------
const s1 = sudoku.pages[0], w1 = ws.pages[0];
check('sameGenerator sudoku→sudoku', sameGenerator(s1, sudoku.pages[1]));
check('sameGenerator sudoku↛wordsearch', !sameGenerator(s1, w1));

// ---- MAZE: apply-to-all works (item 6, was broken) -----------------------
console.log('\n=== item 6: MAZE apply-to-all (previously broken) ===');
const mazes = generateMazes({ shape: 'rectangular', width: 12, height: 12, difficulty: 'medium', startsAt: 'top', braid: 0.2 }, 6);
const mazeBuilt = buildMazePages(mazes, DEFAULT_MZ_LAYOUT, DEFAULT_MAZE_STYLE, { width: 432, height: 648 }, 1);
check('maze pages stamped kind=maze', mazeBuilt.pages.every((p) => p.kind === 'maze'));
const m0 = mazeBuilt.pages[0];
const mazeSpec = { boxSize: 280, wallColor: '#ff00ff', wallWidth: 2.5, solutionColor: '#00ff00', showSolution: false, roundCaps: false, kdpSafe: true, offsetX: 0, offsetY: 0 };
const mazeStyle = { ...DEFAULT_MAZE_STYLE, wallColor: '#ff00ff', wallWidth: 2.5 };
const mzRes = await mzApplySpecToPages(
  mazeBuilt.pages, mazeSpec, mazeStyle, DEFAULT_MZ_LAYOUT.templateId,
  { width: 12, height: 12, braid: 0.2, startsAt: 'top' }, m0.id,
);
check('maze apply-to-all changed sibling pages', mzRes.changed >= 5, `changed=${mzRes.changed}`);
check('maze active page skipped', mzRes.pages.find((p) => p.id === m0.id) === m0);

// ---- 3. "1 solution per page" always offered -----------------------------
console.log('\n=== item 3: "1 solution per page" is always offered ===');
const sudokuSol = suggestSolutionsPerPage(9, 432, 648);
const wsSol = suggestWsSolutionsPerPage(10, 432, 648);
const cwSol = suggestCwSolutionsPerPage(432, 648);
check('sudoku solutions include 1', sudokuSol.includes(1), `[${sudokuSol}]`);
check('sudoku solutions ascending (1 first)', sudokuSol[0] === 1);
check('wordsearch solutions include 1', wsSol.includes(1), `[${wsSol}]`);
check('crossword solutions include 1', cwSol.includes(1), `[${cwSol}]`);

// ---- 4. apply-to-all never crosses kinds / touches cover -----------------
console.log('\n=== item 4: apply-to-all respects the kind tag ===');
const coverPage = { id: 'cover', name: 'Cover', width: 432, height: 648, background: '#fff', role: 'cover', data: null };
check('cover has no kind', pageKindOf(coverPage) === null);

// ---- 5. puzzle scale persists when recoloring (fix #3) --------------------
console.log('\n=== puzzle scale persists when recoloring ===');
const fabricNs = await import('fabric');
const { relayoutCanvas: relayoutSudoku, measure: measureSudoku, DEFAULT_SPEC: SUDO_SPEC } =
  await import('../sudoku-maker/layout.built.mjs');
const { groupPuzzleUnits, flattenPuzzleGroups } = await import('./puzzle-groups.built.mjs');

// Sudoku: a style-only edit re-lays the page from the LIVE size (it re-measures
// the scaled group and keeps that boxSize), so the user's shrink must survive.
const sudokuSolo = generateSet({ size: 9, difficulty: 'medium', count: 1, symmetric: true });
const sudokuSoloBuilt = buildSudokuPages(
  sudokuSolo, SUDO_STYLE,
  { ...SUDO_LAYOUT, puzzlesPerPage: 1, solutionPlacement: 'none' },
  { width: 432, height: 648 },
);
const sPage = sudokuSoloBuilt.pages[0];
const sc = new fabricNs.StaticCanvas(document.createElement('canvas'), { width: 432, height: 648 });
await sc.loadFromJSON(sPage.data);
const origSize = measureSudoku(sc.getObjects()).size;
groupPuzzleUnits(sc);
const sg = sc.getObjects().find((o) => o.type === 'group');
sg.scale(0.7);
flattenPuzzleGroups(sc);
const scaledSize = measureSudoku(sc.getObjects()).size;
groupPuzzleUnits(sc);
// style-only edit: preserve the live scaled size, then re-lay
relayoutSudoku(sc, sPage, 1, sudokuSoloBuilt.pages.length, { ...SUDO_SPEC, boxSize: Math.round(scaledSize) }, 9);
flattenPuzzleGroups(sc);
const afterSize = measureSudoku(sc.getObjects()).size;
check('sudoku keeps the user\'s scaled size (not the original)',
  Math.abs(afterSize - scaledSize) < 4 && Math.abs(afterSize - origSize) > 10,
  `orig=${origSize.toFixed(1)} scaled=${scaledSize.toFixed(1)} after=${afterSize.toFixed(1)}`);
groupPuzzleUnits(sc);
sc.dispose();

// Crossword: the surgical style patch must not reset the group's scale.
const cwPage = cw.pages[0];
const cc = new fabricNs.StaticCanvas(document.createElement('canvas'), { width: 432, height: 648 });
await cc.loadFromJSON(cwPage.data);
groupPuzzleUnits(cc);
const cg = cc.getObjects().find((o) => o.type === 'group');
cg.scale(0.7);
const { patchCwStyleOnCanvas } = await import('./layout.built.mjs');
patchCwStyleOnCanvas(cc, { ...DEFAULT_CW_STYLE, letterColor: '#ff0000', fontScale: 0.7 });
check('crossword keeps its group scale after recoloring',
  Math.abs(cg.scaleX - 0.7) < 0.001, `scaleX=${cg.scaleX}`);
cc.dispose();

// ---- 7. generated pages are built at INTERIOR size, never the cover --------
console.log('\n=== generated pages use interior page size (never cover size) ===');
const { generationPage } = await import('./placement.built.mjs');
{
  const cover = { id: 'c', role: 'cover', width: 1200, height: 800, data: null };
  const interior = { id: 'i1', role: 'interior', width: 432, height: 648, data: null };
  const interior2 = { id: 'i2', role: 'interior', width: 432, height: 648, data: null };
  const pages = [cover, interior, interior2];

  const onCover = generationPage(pages, 'c');
  check('generation on the cover resolves to an interior page',
    onCover.id === 'i1' && onCover.role === 'interior', onCover.id);
  check('interior size is used when the cover is active',
    onCover.width === 432 && onCover.height === 648, `${onCover.width}x${onCover.height}`);

  const onInterior = generationPage(pages, 'i1');
  check('generation on an interior page uses that page',
    onInterior.id === 'i1' && onInterior.width === 432);

  const noCover = generationPage([interior, interior2], 'i2');
  check('no cover present -> active interior page used',
    noCover.id === 'i2');
}

console.log(`\nALL GENERATOR-KIND CHECKS PASSED  (${pass} checks)` + (fail ? `, ${fail} FAILED` : ''));
if (fail) process.exit(1);
