/**
 * Phase 8E live-editing tests — npm run test:live
 *
 * Verifies the post-generation editing contract:
 *  - crossword "clues only / puzzle only / both" generation modes
 *  - surgical style patches found by DEEP search (objects inside Groups)
 *  - "apply to all pages" off-screen replay, preserving module metadata
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
    load: async () => [],
    ready: Promise.resolve(),
    add() {},
    has() { return false; },
    size: 0,
    [Symbol.iterator]: function* () {},
  };
}

const fabric = await import('fabric');

const {
  buildCrosswordPages,
  DEFAULT_CW_LAYOUT,
} = await import('./build-pages.built.mjs');
const { clueBlockHeight } = await import('./renderer.built.mjs');
const { patchCwStyleOnCanvas } = await import('./layout.built.mjs');
const { patchWsStyleOnCanvas, applyWsStyleToPages } = await import('./ws-layout.built.mjs');
const { patchMzStyleOnCanvas } = await import('./mz-layout.built.mjs');
const { patchHwStyleOnCanvas } = await import('./hw-layout.built.mjs');

let pass = 0;
let fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    const msg = `${name}${detail ? ` — ${detail}` : ''}`;
    failures.push(msg);
    console.log(`  FAIL  ${msg}`);
  }
};

const near = (a, b) => Math.abs(a - b) < 0.001;

// ---------------------------------------------------------------- crossword
console.log('\n=== crossword content mode (clues / words / both) ===');
{
  const placement = {
    word: 'CAT', clean: 'CAT', clue: 'A pet', row: 0, col: 0,
    orientation: 'across', number: 1, cells: [0, 1, 2],
  };
  const puzzle = {
    id: 'p1', index: 1, size: 3, difficulty: 'easy', theme: 'Pets',
    grid: ['C', 'A', 'T', null, null, null, null, null, null],
    numbers: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    placements: [placement],
    across: [placement],
    down: [],
    unplaced: [],
    complete: true,
  };
  const style = {
    fontFamily: 'Inter', letterColor: '#111827', gridLineColor: '#111827',
    gridLineWidth: 0.8, frameWidth: 0, cellFill: null, blockStyle: 'none',
    blockColor: '#111827', numberScale: 0.3, numberColor: '#4b5563',
    fontScale: 0.6, clueFontSize: 9.5, clueColor: '#111827', clueColumns: 2,
    hintStyle: 'clues', showTitle: true, showDifficulty: false, showClues: true,
  };
  // heading texts of the cw-clue-head objects on a generated puzzle page
  const headsIn = (mode) => {
    const { pages } = buildCrosswordPages(
      [puzzle], style, { ...DEFAULT_CW_LAYOUT, contentMode: mode },
      { width: 432, height: 648 },
    );
    const objs = pages[0].data?.objects ?? [];
    return {
      roles: new Set(objs.map((o) => o.cwRole).filter(Boolean)),
      heads: new Set(
        objs
          .filter((o) => o.cwRole === 'cw-clue-head' && typeof o.text === 'string')
          .map((o) => String(o.text)),
      ),
    };
  };

  check('default contentMode is "both"', DEFAULT_CW_LAYOUT.contentMode === 'both');

  const both = headsIn('both');
  check('both mode draws the grid', both.roles.has('cw-cell'));
  check('both mode prints the clue lists', both.heads.has('ACROSS'));
  check('both mode prints the answer key', both.heads.has('ANSWERS'));

  const clues = headsIn('clues');
  check('clues mode draws the grid', clues.roles.has('cw-cell'));
  check('clues mode prints the clue lists', clues.heads.has('ACROSS'));
  check('clues mode does NOT print the answer key', !clues.heads.has('ANSWERS'));

  const words = headsIn('words');
  check('words mode draws the grid', words.roles.has('cw-cell'));
  check('words mode does NOT print the text clues', !words.heads.has('ACROSS') && !words.heads.has('DOWN'));
  check('words mode prints the answer key', words.heads.has('ANSWERS'));
  check('words mode answer key lists the solution words',
    (() => {
      const { pages } = buildCrosswordPages(
        [puzzle], style, { ...DEFAULT_CW_LAYOUT, contentMode: 'words' },
        { width: 432, height: 648 },
      );
      const texts = (pages[0].data?.objects ?? [])
        .filter((o) => o.cwRole === 'cw-clue' && typeof o.text === 'string')
        .map((o) => String(o.text));
      return texts.includes('CAT');
    })());

  // Layout allocates room for the answers just as it does for the clues.
  const hClues = clueBlockHeight(puzzle, 300, style, 'clues');
  const hWords = clueBlockHeight(puzzle, 300, style, 'words');
  const hBoth = clueBlockHeight(puzzle, 300, style, 'both');
  check('words mode reserves content space for the answer key', hWords > 0, `h=${hWords}`);
  check('both mode reserves more space than clues alone', hBoth > hClues, `${hBoth} vs ${hClues}`);
}

// ------------------------------------------------- deep-search surgical patch
console.log('\n=== surgical style patch finds objects inside Groups (deep search) ===');
{
  const el = document.createElement('canvas');
  const c = new fabric.StaticCanvas(el, { width: 432, height: 648 });

  const inGroupLetter = new fabric.Textbox('A', { width: 50, fontSize: 12, left: 0, top: 0 });
  inGroupLetter.moduleId = 'wordsearch';
  inGroupLetter.wsRole = 'ws-letter';
  const inGroupRule = new fabric.Line([0, 0, 100, 0], { stroke: '#aaaaaa', strokeWidth: 0.6 });
  inGroupRule.moduleId = 'wordsearch';
  inGroupRule.wsRole = 'ws-rule';
  const group = new fabric.Group([inGroupLetter, inGroupRule]);

  const looseLetter = new fabric.Textbox('B', { width: 50, fontSize: 12, left: 200, top: 0 });
  looseLetter.moduleId = 'wordsearch';
  looseLetter.wsRole = 'ws-letter';

  const foreign = new fabric.Rect({ left: 0, top: 300, width: 20, height: 20, fill: 'red' });
  c.add(group, looseLetter, foreign);

  const next = { fontScale: 0.6, letterColor: '#ff0000', fontFamily: 'Georgia', letterSpacing: 40, gridLineColor: '#00ff00', gridLineWidth: 1.2 };
  patchWsStyleOnCanvas(c, next);

  // Absolute math: fontSize = box width × fontScale (width is the cell).
  check('letter inside a Group is restyled (fontSize = width × scale)',
    near(inGroupLetter.fontSize, 50 * 0.6) && near(inGroupLetter.fontSize, 30),
    `fontSize=${inGroupLetter.fontSize}`);
  check('letter inside a Group gets new colour + font + spacing',
    inGroupLetter.fill === '#ff0000' && inGroupLetter.fontFamily === 'Georgia' && inGroupLetter.charSpacing === 40);
  check('top-level letter is restyled too',
    near(looseLetter.fontSize, 30) && looseLetter.fill === '#ff0000');
  check('rule inside a Group gets new stroke + width',
    inGroupRule.stroke === '#00ff00' && inGroupRule.strokeWidth === 1.2);
  check('non-module object is left untouched', foreign.fill === 'red' && foreign.left === 0);
  c.dispose();
}

console.log('\n=== crossword block style restyles existing block objects ===');
{
  const el = document.createElement('canvas');
  const c = new fabric.StaticCanvas(el, { width: 432, height: 648 });
  const block = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, fill: '#111827', stroke: null });
  block.moduleId = 'crossword';
  block.cwRole = 'cw-block';
  c.add(block);

  const base = { fontFamily: 'Inter', letterColor: '#111827', gridLineColor: '#111827', gridLineWidth: 0.8, frameWidth: 0, cellFill: null, blockColor: '#111827', numberScale: 0.3, numberColor: '#4b5563', fontScale: 0.6, clueFontSize: 9.5, clueColor: '#111827', clueColumns: 2, hintStyle: 'clues', showTitle: true, showDifficulty: false, showClues: true };
  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'none' });
  check('blockStyle none hides the object', block.visible === false);
  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'hollow', gridLineColor: '#00ff00', gridLineWidth: 2 });
  check('blockStyle hollow restyles it', block.visible === true && block.fill === null && block.stroke === '#00ff00' && near(block.strokeWidth, 1));
  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'solid', blockColor: '#0000ff' });
  check('blockStyle solid fills it', block.visible === true && block.fill === '#0000ff' && block.stroke === null);
  c.dispose();
}

console.log("\n=== block style live-syncs blocks from the cell lattice ===\n");
{
  const el = document.createElement('canvas');
  const c = new fabric.StaticCanvas(el, { width: 432, height: 648 });
  // a 3×3 crossword with 4 live cells — the other 5 must be derived as blocks
  const mkCell = (left, top) => {
    const cell = new fabric.Rect({ left, top, width: 40, height: 40, fill: null, stroke: '#111827', strokeWidth: 0.8 });
    cell.moduleId = 'crossword';
    cell.cwRole = 'cw-cell';
    cell.cwPuzzle = 'p1';
    c.add(cell);
  };
  mkCell(0, 0);
  mkCell(40, 0);
  mkCell(80, 0);
  mkCell(0, 40);
  const base = { fontFamily: 'Inter', letterColor: '#111827', gridLineColor: '#111827', gridLineWidth: 0.8, frameWidth: 0, cellFill: null, blockColor: '#111827', numberScale: 0.3, numberColor: '#4b5563', fontScale: 0.6, clueFontSize: 9.5, clueColor: '#111827', clueColumns: 2, hintStyle: 'clues', showTitle: true, showDifficulty: false, showClues: true };

  // generated with blocks off → no cw-block objects exist
  check('no blocks when page was generated with none', c.getObjects().filter((o) => o.cwRole === 'cw-block').length === 0);

  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'solid' });
  const blocks = c.getObjects().filter((o) => o.cwRole === 'cw-block');
  check('solid creates a block for every unused cell (5 of 9)', blocks.length === 5, `blocks=${blocks.length}`);
  check('blocks are tagged like generated ones', blocks.every((b) => b.moduleId === 'crossword' && b.cwPuzzle === 'p1'));
  check('blocks are visible and filled', blocks.every((b) => b.visible === true && b.fill === '#111827'));

  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'hollow', gridLineColor: '#00ff00' });
  const blocks2 = c.getObjects().filter((o) => o.cwRole === 'cw-block');
  check('toggling hollow reuses the same blocks (no duplicates)', blocks2.length === 5, `blocks=${blocks2.length}`);
  check('hollow blocks are outlined', blocks2.every((b) => b.fill === null && b.stroke === '#00ff00'));

  patchCwStyleOnCanvas(c, { ...base, blockStyle: 'none' });
  const blocks3 = c.getObjects().filter((o) => o.cwRole === 'cw-block');
  check('toggling none hides but keeps the blocks', blocks3.length === 5 && blocks3.every((b) => b.visible === false));
  c.dispose();
}

console.log('\n=== maze + handwriting surgical patches ===');
{
  const el = document.createElement('canvas');
  const c = new fabric.StaticCanvas(el, { width: 432, height: 648 });
  const wall = new fabric.Line([0, 0, 100, 0], { stroke: '#111827', strokeWidth: 1.6, strokeLineCap: 'square' });
  wall.moduleId = 'maze';
  wall.mzRole = 'mz-wall';
  const sol = new fabric.Polyline([{ x: 0, y: 0 }, { x: 10, y: 10 }], { stroke: '#e11d48', strokeWidth: 2 });
  sol.moduleId = 'maze';
  sol.mzRole = 'mz-solution';
  const guide = new fabric.Line([0, 0, 100, 0], { stroke: '#9aa4b5', strokeWidth: 0.8, strokeDashArray: [4, 4] });
  guide.moduleId = 'handwriting';
  guide.hwRole = 'hw-guide-midline';
  const trace = new fabric.Line([0, 0, 10, 10], { stroke: '#b8bfcc', strokeWidth: 2.4 });
  trace.moduleId = 'handwriting';
  trace.hwRole = 'hw-trace-dash';
  c.add(wall, sol, guide, trace);

  patchMzStyleOnCanvas(c, { wallColor: '#0000ff', wallWidth: 3, roundCaps: true, solutionColor: '#00ff00', solutionWidth: 4 });
  check('maze wall colour + width + caps updated',
    wall.stroke === '#0000ff' && near(wall.strokeWidth, 3) && wall.strokeLineCap === 'round');
  check('maze solution colour + width updated',
    sol.stroke === '#00ff00' && near(sol.strokeWidth, 4));

  patchHwStyleOnCanvas(c, { guideColor: '#123456', midlineColor: '#abcdef', guideWidth: 2, traceColor: '#fedcba', traceWidth: 5 });
  check('handwriting midline updated', guide.stroke === '#abcdef' && near(guide.strokeWidth, 2));
  check('handwriting trace updated', trace.stroke === '#fedcba' && near(trace.strokeWidth, 5));
  c.dispose();
}

// ------------------------------------------------------------- apply to all
console.log('\n=== apply style to all module pages, off-screen, preserving meta ===');
{
  const makePage = (id, tag) => {
    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: 432, height: 648 });
    if (tag) {
      const t = new fabric.Textbox('CAT', { width: 50, fontSize: 12, left: 10, top: 10 });
      t.moduleId = 'wordsearch';
      t.wsRole = 'ws-letter';
      c.add(t);
    } else {
      c.add(new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, fill: 'red' }));
    }
    const json = c.toObject(["id", "moduleId", "wsRole"]);
    c.dispose();
    return {
      id,
      name: `Page ${id}`,
      width: 432,
      height: 648,
      background: '#ffffff',
      role: 'interior',
      data: {
        version: '6.0.0',
        background: '#ffffff',
        objects: json.objects,
        'novelka:test-meta': { keep: true },
      },
    };
  };

  const pageA = makePage('a', true);
  const pageB = makePage('b', true);
  const pageC = makePage('c', false);
  const next = { fontScale: 0.5, letterColor: '#ff00ff', fontFamily: 'Inter', letterSpacing: 0, gridLineColor: '#c7ced8', gridLineWidth: 0.6 };

  const { pages, changed } = await applyWsStyleToPages([pageA, pageB, pageC], next, 'b');

  check('changed counts only module pages (skipping the active page)', changed === 1, `changed=${changed}`);
  check('skipped page is untouched', pages[1] === pageB);
  check('non-module page is untouched', pages[2] === pageC);

  const aObjs = pages[0].data.objects;
  check('patched page object carried the new colour',
    aObjs[0].fill === '#ff00ff', JSON.stringify(aObjs[0].fill));
  check('patched page object got absolute font size (50 × 0.5)',
    near(aObjs[0].fontSize, 25), `fontSize=${aObjs[0].fontSize}`);
  check('module metadata survived the replay',
    pages[0].data['novelka:test-meta'] !== undefined);
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.slice(0, 25).forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
