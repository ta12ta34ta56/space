import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body><canvas id="c" width="432" height="648"></canvas></body></html>', {
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

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const { Canvas } = await import('fabric');
const { renderPage } = await import('./render-page.built.mjs');

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

function snapshotCanvas(canvas) {
  const objects = canvas.getObjects().map((o) => ({
    type: o.type,
    left: o.left,
    top: o.top,
    width: o.width,
    height: o.height,
    fill: o.fill,
    stroke: o.stroke,
    strokeWidth: o.strokeWidth,
    elementId: o.elementId,
    text: o.text,
    fontSize: o.fontSize,
    fontFamily: o.fontFamily,
    isGroup: o.type === 'group',
    groupObjectsCount: o._objects ? o._objects.length : 0,
  }));
  return JSON.stringify({
    backgroundColor: canvas.backgroundColor,
    objects,
  });
}

const sampleBook = {
  trimId: '6x9',
  paper: 'bw-white',
  binding: 'paperback',
};

const sampleElements = [
  {
    type: 'text',
    id: 'el-text-1',
    kind: 'text',
    frame: { xIn: 0.5, yIn: 0.5, wIn: 4.0, hIn: 1.0 },
    text: 'Chapter Title',
    style: {
      fontFamily: 'Helvetica',
      fontSizePt: 24,
      bold: true,
      italic: false,
      underline: false,
      align: 'center',
      colorHex: '#111111',
    },
    z: 1,
    hidden: false,
    locked: false,
  },
  {
    type: 'shape',
    id: 'el-shape-rect',
    kind: 'border',
    frame: { xIn: 0.5, yIn: 1.8, wIn: 5.0, hIn: 3.0 },
    shape: {
      shape: 'rect',
      fillHex: null,
      strokeHex: '#333333',
      strokeWidthPt: 2,
    },
    z: 2,
    hidden: false,
    locked: false,
  },
  {
    type: 'shape',
    id: 'el-shape-circle',
    kind: 'shape',
    frame: { xIn: 1.0, yIn: 2.0, wIn: 1.5, hIn: 1.5 },
    shape: {
      shape: 'circle',
      fillHex: '#ea580c',
      strokeHex: null,
      strokeWidthPt: 0,
    },
    z: 3,
    hidden: false,
    locked: false,
  },
  {
    type: 'image',
    id: 'el-image-1',
    kind: 'sticker',
    frame: { xIn: 3.0, yIn: 2.0, wIn: 2.0, hIn: 2.0 },
    assetId: 'ornament-leaf-01',
    z: 4,
    hidden: false,
    locked: false,
  },
  {
    type: 'puzzle',
    id: 'el-puzzle-1',
    kind: 'puzzle',
    frame: { xIn: 0.5, yIn: 5.0, wIn: 5.0, hIn: 3.5 },
    puzzle: {
      kind: 'sudoku',
      data: {},
      style: {},
    },
    z: 5,
    hidden: false,
    locked: false,
  },
];

const samplePage = {
  id: 'page-1',
  kind: 'sudoku',
  role: 'interior',
  elements: sampleElements,
  locked: false,
};

/* ------------------------------------------------ THE REBUILD TEST (Headline) -- */

console.log('\n=== The headline rebuild test: dispose, recreate, byte-identical snapshot ===');
{
  const el1 = document.createElement('canvas');
  const canvas1 = new Canvas(el1, { width: 432, height: 648 });

  // Deep-freeze the page and book before rendering to prove purity
  deepFreeze(samplePage);
  deepFreeze(sampleBook);
  const docJsonBefore = JSON.stringify(samplePage);

  renderPage(canvas1, samplePage, sampleBook, 72);
  const snapshot1 = snapshotCanvas(canvas1);

  // Assert Document was not mutated
  const docJsonAfter = JSON.stringify(samplePage);
  check('Document is byte-identical before and after rendering (pure one-way flow)', docJsonBefore === docJsonAfter);

  // Dispose canvas1 entirely
  await canvas1.dispose();

  // Create brand new canvas2 from scratch
  const el2 = document.createElement('canvas');
  const canvas2 = new Canvas(el2, { width: 432, height: 648 });

  renderPage(canvas2, samplePage, sampleBook, 72);
  const snapshot2 = snapshotCanvas(canvas2);

  check('The two canvas snapshots are byte-identical after dispose and recreate', snapshot1 === snapshot2);
  await canvas2.dispose();
}

/* ---------------------------------------------------- Z order rendering -- */

console.log('\n=== Elements render in z order; changing z changes canvas order ===');
{
  const el = document.createElement('canvas');
  const canvas = new Canvas(el, { width: 432, height: 648 });

  const elemA = {
    type: 'text',
    id: 'el-A',
    kind: 'text',
    frame: { xIn: 1, yIn: 1, wIn: 2, hIn: 1 },
    text: 'A',
    style: { fontFamily: 'Arial', fontSizePt: 12, bold: false, italic: false, underline: false, align: 'left', colorHex: '#000' },
    z: 10,
    hidden: false,
    locked: false,
  };

  const elemB = {
    type: 'text',
    id: 'el-B',
    kind: 'text',
    frame: { xIn: 1, yIn: 1, wIn: 2, hIn: 1 },
    text: 'B',
    style: { fontFamily: 'Arial', fontSizePt: 12, bold: false, italic: false, underline: false, align: 'left', colorHex: '#000' },
    z: 5,
    hidden: false,
    locked: false,
  };

  const page = {
    id: 'page-z',
    kind: 'blank',
    role: 'interior',
    elements: [elemA, elemB], // passed with A first in array, but B has lower z
    locked: false,
  };

  renderPage(canvas, page, sampleBook, 72);
  const objs = canvas.getObjects();
  check('object with z=5 is placed before object with z=10', objs[0].elementId === 'el-B' && objs[1].elementId === 'el-A');

  // Change z order
  const pageReversed = {
    ...page,
    elements: [{ ...elemA, z: 2 }, { ...elemB, z: 8 }],
  };
  renderPage(canvas, pageReversed, sampleBook, 72);
  const objsReversed = canvas.getObjects();
  check('changing z flips the order of rendered canvas objects', objsReversed[0].elementId === 'el-A' && objsReversed[1].elementId === 'el-B');

  await canvas.dispose();
}

/* ------------------------------------------------------- hidden: true -- */

console.log('\n=== hidden: true renders nothing ===');
{
  const el = document.createElement('canvas');
  const canvas = new Canvas(el, { width: 432, height: 648 });

  const pageWithHidden = {
    id: 'page-hidden',
    kind: 'blank',
    role: 'interior',
    elements: [
      {
        type: 'text',
        id: 'el-visible',
        kind: 'text',
        frame: { xIn: 1, yIn: 1, wIn: 2, hIn: 1 },
        text: 'Visible',
        style: { fontFamily: 'Arial', fontSizePt: 12, bold: false, italic: false, underline: false, align: 'left', colorHex: '#000' },
        z: 1,
        hidden: false,
        locked: false,
      },
      {
        type: 'text',
        id: 'el-hidden',
        kind: 'text',
        frame: { xIn: 1, yIn: 2, wIn: 2, hIn: 1 },
        text: 'Hidden',
        style: { fontFamily: 'Arial', fontSizePt: 12, bold: false, italic: false, underline: false, align: 'left', colorHex: '#000' },
        z: 2,
        hidden: true,
        locked: false,
      },
    ],
    locked: false,
  };

  renderPage(canvas, pageWithHidden, sampleBook, 72);
  const objs = canvas.getObjects();
  check('hidden element is skipped during rendering', objs.length === 1 && objs[0].elementId === 'el-visible');

  await canvas.dispose();
}

/* ------------------------------------------- Puzzle is ONE Fabric object (D3) -- */

console.log('\n=== A puzzle element produces exactly ONE Fabric object (D3) ===');
{
  const el = document.createElement('canvas');
  const canvas = new Canvas(el, { width: 432, height: 648 });

  const puzzlePage = {
    id: 'page-puzzle-only',
    kind: 'sudoku',
    role: 'interior',
    elements: [
      {
        type: 'puzzle',
        id: 'el-puzzle-sudoku',
        kind: 'puzzle',
        frame: { xIn: 1, yIn: 1, wIn: 4, hIn: 4 },
        puzzle: {
          kind: 'sudoku',
          data: {},
          style: {},
        },
        z: 1,
        hidden: false,
        locked: false,
      },
    ],
    locked: false,
  };

  renderPage(canvas, puzzlePage, sampleBook, 72);
  const objs = canvas.getObjects();
  check('puzzle produces exactly one Fabric object on canvas', objs.length === 1);
  check('puzzle object carries elementId', objs[0].elementId === 'el-puzzle-sudoku');

  await canvas.dispose();
}

/* ---------------------------------------------- dispose leaves no listeners -- */

console.log('\n=== dispose() leaves no listeners attached ===');
{
  const el = document.createElement('canvas');
  const canvas = new Canvas(el, { width: 432, height: 648 });
  renderPage(canvas, samplePage, sampleBook, 72);
  await canvas.dispose();
  // Fabric __eventListeners is cleared on dispose
  const listenersCount = Object.keys(canvas.__eventListeners || {}).length;
  check('dispose() cleans up listeners', listenersCount === 0, `remaining: ${listenersCount}`);
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL RENDER-PAGE TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
