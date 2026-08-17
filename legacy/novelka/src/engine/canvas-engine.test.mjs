/**
 * Canvas-engine rendering tests.  npm run test:engine
 *
 * Verifies the "no blurry canvas" contract in a DOM-like environment: the
 * backing store must always be CSS size × devicePixelRatio × supersample, the
 * CSS size must be an integer (no fractional pixels), and a saved page's
 * viewport must never leak into offscreen renders.
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

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const { CanvasEngine } = await import('./canvas-engine.built.mjs');
const fabric = await import('fabric');

const newEngine = () => {
  const el = document.createElement('canvas');
  const engine = new CanvasEngine();
  engine.mount(el, 432, 648);
  return { engine, el };
};

console.log('\n=== backing store is supersampled (never 1:1) ===');
{
  const { engine } = newEngine();
  const canvas = engine.canvas;
  const lower = canvas.lowerCanvasEl;
  // jsdom dpr = 1, so pixelScale = 1 × 2 (supersample)
  check('css width is the rounded page width', lower.style.width === '432px',
    String(lower.style.width));
  check('backing width = css × 2', lower.width === 864, String(lower.width));
  check('backing height = css × 2', lower.height === 1296, String(lower.height));
  check('css height is the rounded page height', lower.style.height === '648px',
    String(lower.style.height));
  engine.dispose();
}

console.log('\n=== zoom keeps the backing store in lockstep ===');
{
  const { engine } = newEngine();
  engine.setZoom(0.73);
  const lower = engine.canvas.lowerCanvasEl;
  check('css width is an integer at fractional zoom',
    lower.style.width === `${Math.round(432 * 0.73)}px`, String(lower.style.width));
  check('backing is css × 2 at fractional zoom',
    lower.width === Math.round(432 * 0.73) * 2, `${lower.width} vs ${Math.round(432 * 0.73) * 2}`);
  engine.setZoom(1.6);
  const lower2 = engine.canvas.lowerCanvasEl;
  check('css width is an integer at 160%',
    lower2.style.width === `${Math.round(432 * 1.6)}px`, String(lower2.style.width));
  check('backing is css × 2 at 160%',
    lower2.width === Math.round(432 * 1.6) * 2, String(lower2.width));
  engine.dispose();
}

console.log('\n=== saved viewport never leaks into offscreen renders ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  c.add(new fabric.Rect({ left: 10, top: 20, width: 100, height: 50, fill: 'red' }));
  // simulate the app at a zoomed/panned state
  c.setZoom(0.73);
  c.absolutePan(new fabric.Point(40, 25));
  const data = c.toObject(['id']);
  engine.dispose();

  const el = document.createElement('canvas');
  const off = new fabric.StaticCanvas(el, { width: 432, height: 648 });
  await off.loadFromJSON(data);
  check('a saved page does not carry the editor zoom', off.getZoom() === 1,
    String(off.getZoom()));
  check('a saved page does not carry the pan', off.viewportTransform[4] === 0 && off.viewportTransform[5] === 0,
    JSON.stringify(off.viewportTransform));
  off.dispose();
}

console.log('\n=== lean serialization round-trips exactly ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  c.add(new fabric.Rect({ left: 12.5, top: 33, width: 120, height: 60, fill: '#ff8800', rx: 4 }));
  c.add(new fabric.Textbox('Hello world', {
    left: 40, top: 100, fontSize: 24, fontFamily: 'Arial', fill: '#123456', charSpacing: 12,
  }));
  c.add(new fabric.Circle({ left: 200, top: 50, radius: 40, fill: '', stroke: '#000', strokeWidth: 2 }));

  const data = engine.toJSON();
  const textKeys = data.objects.find((o) => o.type === 'Textbox');
  check('textbox JSON is lean (no default flood)',
    Object.keys(textKeys).length < 25, `${Object.keys(textKeys).length} keys`);
  check('whole page JSON is small',
    JSON.stringify(data).length < 4000, `${JSON.stringify(data).length} chars`);

  const el2 = document.createElement('canvas');
  const c2 = new fabric.StaticCanvas(el2, { width: 432, height: 648 });
  await c2.loadFromJSON(data);
  const objs = c2.getObjects();
  check('same object count after reload', objs.length === 3, String(objs.length));
  const r = objs[0], t = objs[1], ci = objs[2];
  check('rect geometry + fill + radius round-trip',
    r.left === 12.5 && r.top === 33 && r.width === 120 && r.height === 60
      && r.fill === '#ff8800' && r.rx === 4);
  check('text round-trips', t.text === 'Hello world' && t.fontSize === 24
      && t.fontFamily === 'Arial' && t.fill === '#123456' && t.charSpacing === 12);
  check('empty-fill circle keeps its stroke',
    ci.fill === '' && ci.stroke === '#000' && ci.strokeWidth === 2);
  check('reload keeps the viewport identity', c2.getZoom() === 1);
  check('background round-trips', c2.backgroundColor === '#ffffff');
  // Let any requestAnimationFrame-scheduled render finish before tearing the
  // canvases down (jsdom's raf shim runs via setTimeout, so a render fired
  // mid-dispose would touch already-cleaned elements).
  await new Promise((r) => setTimeout(r, 10));
  await c2.dispose();
  await engine.dispose();
}

console.log('\n=== align/distribute use transformed bounding boxes ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  const r1 = new fabric.Rect({ left: 10, top: 20, width: 40, height: 20, fill: 'red' });
  const r2 = new fabric.Rect({ left: 150, top: 80, width: 60, height: 20, angle: 25, fill: 'blue' });
  const r3 = new fabric.Rect({ left: 300, top: 45, width: 30, height: 20, scaleX: 1.7, fill: 'green' });
  c.add(r1, r2, r3);
  c.setActiveObject(new fabric.ActiveSelection([r1, r2, r3], { canvas: c }));

  engine.distribute('h');
  const boxes = [r1, r2, r3]
    .map((o) => o.getBoundingRect())
    .sort((a, b) => a.left - b.left);
  const gap1 = boxes[1].left - (boxes[0].left + boxes[0].width);
  const gap2 = boxes[2].left - (boxes[1].left + boxes[1].width);
  check('horizontal distribution gives equal transformed gaps', Math.abs(gap1 - gap2) < 0.001,
    `${gap1} vs ${gap2}`);

  engine.align('top');
  const tops = [r1, r2, r3].map((o) => o.getBoundingRect().top);
  check('top alignment uses transformed bounds', Math.max(...tops) - Math.min(...tops) < 0.001,
    tops.join(', '));
  engine.dispose();
}

console.log('\n=== loose multi-selection contract (Phase 8C/8D) ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  check('shift-key multi-selection is pinned to Shift (selectionKey)',
    c.selectionKey === 'shiftKey', String(c.selectionKey));
  check('shift-key multi-selection is pinned to Shift (multiSelectionKey)',
    c.multiSelectionKey === 'shiftKey', String(c.multiSelectionKey));

  const A = new fabric.Rect({ left: 100, top: 100, width: 60, height: 40, fill: 'red' });
  const Z = new fabric.Rect({ left: 250, top: 300, width: 60, height: 40, fill: 'blue' });
  c.add(A, Z);
  c.setActiveObject(A);
  c.requestRenderAll();

  // Shift+click Z -> ActiveSelection (LOOSE, not a Group)
  const grouped = c.handleMultiSelection({ shiftKey: true }, Z);
  const active = c.getActiveObject();
  check('shift+click creates an ActiveSelection', grouped && active.type === 'activeselection',
    String(active?.type));
  check('ActiveSelection stays loose (never auto-groups)',
    active.type !== 'group', String(active?.type));
  check('both members are selected', c.getActiveObjects().length === 2,
    String(c.getActiveObjects().length));
  check('ActiveSelection border is dashed (visual "loose" cue)',
    JSON.stringify(active.borderDashArray) === JSON.stringify([6, 4]),
    JSON.stringify(active.borderDashArray));

  // Shift+click an already-selected member REMOVES it (toggle, individual)
  const again = c.handleMultiSelection({ shiftKey: true }, Z);
  const active2 = c.getActiveObject();
  check('shift+click on a selected member removes it',
    again && active2.type === 'rect' && active2 === A, String(active2?.type));

  // Objects between A and Z (none here) are never pulled in; also verify a
  // third object far away is NOT selected by the toggle of Z.
  const M = new fabric.Rect({ left: 60, top: 500, width: 40, height: 40, fill: 'green' });
  c.add(M);
  c.handleMultiSelection({ shiftKey: true }, Z);
  check('only the clicked object joins the selection',
    c.getActiveObjects().length === 2 &&
    c.getActiveObjects().includes(A) && c.getActiveObjects().includes(Z) &&
    !c.getActiveObjects().includes(M), String(c.getActiveObjects().length));
  engine.dispose();
}

console.log('\n=== smart guides ignore the selection\'s own members ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  engine.snapEnabled = true;
  engine.snapToGrid = false;
  engine.setKdpBoundaryLock(false, 1, 24); // isolate guide behaviour
  let guides = { v: [], h: [] };
  engine.setGuideRenderer((g) => { guides = g; });

  const A = new fabric.Rect({ left: 100, top: 100, width: 80, height: 50, fill: 'red', strokeWidth: 0 });
  const Z = new fabric.Rect({ left: 250, top: 300, width: 80, height: 50, fill: 'blue', strokeWidth: 0 });
  c.add(A, Z);
  const sel = new fabric.ActiveSelection([A, Z], { canvas: c });
  c.setActiveObject(sel);
  c.requestRenderAll();

  const dragTo = (left, top) => {
    sel.set({ left, top });
    sel.setCoords();
    c.fire('object:moving', { target: sel, e: { shiftKey: false } });
  };

  // Dragging the selection with NO other objects must not align to its own
  // members (the old bug produced guides at member edges every frame).
  dragTo(120, 140);
  check('moving a multi-selection produces no self-alignment guides',
    guides.v.length === 0 && guides.h.length === 0, JSON.stringify(guides));

  // With an external object, aligning the union box to IT snaps + shows guides.
  const E = new fabric.Rect({ left: 470, top: 100, width: 40, height: 40, fill: 'gold', strokeWidth: 0 });
  c.add(E);
  // union = [sel.left .. sel.left + 230]; E.left = 470.
  // Drag so the union's right edge sits 3pt from E.left -> snaps to 240.
  guides = { v: [], h: [] };
  dragTo(243, 140);
  check('guide snaps to an EXTERNAL object edge',
    Math.abs(sel.left - 240) < 0.01, `${sel.left} vs 240`);
  check('guide line is emitted at the external edge',
    guides.v.some((v) => Math.abs(v - 470) < 0.01), JSON.stringify(guides));

  engine.dispose();
}

console.log('\n=== snap to grid uses nearest edge/center (not origin) ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  engine.snapToGrid = true;
  engine.gridSize = 20;
  engine.setKdpBoundaryLock(false, 1, 24);
  const r = new fabric.Rect({ left: 103, top: 107, width: 50, height: 30, fill: 'red', strokeWidth: 0 });
  c.add(r);
  c.setActiveObject(r);
  c.fire('object:moving', { target: r, e: {} });
  // edges left=103(->100/-3), center=128(->120/-8), right=153(->160/+7): best -3
  check('x snaps the nearest edge/center to a grid line',
    r.left === 100, String(r.left));
  // edges top=107(->100/-7), center=122(->120/-2), bottom=137(->140/+3): best -2
  check('y snaps the nearest edge/center to a grid line',
    r.top === 105, String(r.top));
  engine.dispose();
}

console.log("\n=== magnetic snap to guideline lines (cover) ===");
{
  const { engine } = newEngine();
  const c = engine.canvas;
  engine.snapToGrid = false;
  engine.setKdpBoundaryLock(false, 1, 24);
  // Simulate cover guidelines at x=100 (spine fold) and y=200 (safe edge).
  engine.snapLinesX = [100];
  engine.snapLinesY = [200];
  engine.snapThreshold = 7;
  let guides = { v: [], h: [] };
  engine.setGuideRenderer((g) => { guides = g; });

  const r = new fabric.Rect({ left: 50, top: 150, width: 40, height: 30, fill: 'red', strokeWidth: 0 });
  c.add(r);
  c.setActiveObject(r);

  // Move so the right edge (90) is 6pt from the x=100 line -> snaps to 60.
  r.set({ left: 54, top: 150 }); r.setCoords();
  c.fire('object:moving', { target: r, e: {} });
  check('right edge snaps to a vertical guideline', Math.abs(r.left - 60) < 0.01, `${r.left} vs 60`);
  check('vertical guide line is highlighted', guides.v.includes(100), JSON.stringify(guides.v));

  // Move so the bottom edge (180) is 6pt from the y=200 line -> snaps to 170.
  r.set({ left: 60, top: 168 }); r.setCoords();
  c.fire('object:moving', { target: r, e: {} });
  check('bottom edge snaps to a horizontal guideline', Math.abs(r.top - 170) < 0.01, `${r.top} vs 170`);
  check('horizontal guide line is highlighted', guides.h.includes(200), JSON.stringify(guides.h));

  // Outside the threshold of both guidelines AND page edges/center: no snap.
  r.set({ left: 300, top: 100 }); r.setCoords();
  c.fire('object:moving', { target: r, e: {} });
  check('no snap when beyond every threshold', r.left === 300 && r.top === 100, `${r.left},${r.top}`);

  engine.dispose();
}

console.log('\n=== KDP safe-area hard stop on move/scale ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  // 432x648, page 1 (recto), 24 pages -> safe = [27, 27, 378, 594]
  engine.setKdpBoundaryLock(true, 1, 24);
  const r = new fabric.Rect({ left: 100, top: 100, width: 200, height: 100, fill: 'red' });
  c.add(r);
  c.setActiveObject(r);
  c.requestRenderAll();

  const fireMove = (left, top) => {
    r.set({ left, top });
    r.setCoords();
    c.fire('object:moving', { target: r, e: {} });
  };
  fireMove(500, 700); // both axes far outside
  const bb = r.getBoundingRect();
  check('object:moving clamps right edge to the safe area',
    Math.abs(bb.left + bb.width - (27 + 378)) < 0.01, `${bb.left + bb.width} vs ${27 + 378}`);
  check('object:moving clamps bottom edge to the safe area',
    Math.abs(bb.top + bb.height - (27 + 594)) < 0.01, `${bb.top + bb.height} vs ${27 + 594}`);

  fireMove(-500, -500);
  const bb2 = r.getBoundingRect();
  check('object:moving clamps left edge to the safe area',
    Math.abs(bb2.left - 27) < 0.01, `${bb2.left} vs 27`);
  check('object:moving clamps top edge to the safe area',
    Math.abs(bb2.top - 27) < 0.01, `${bb2.top} vs 27`);

  // scaling beyond the safe area shrinks back to fit
  const before = r.getBoundingRect();
  r.set({ scaleX: 6, scaleY: 6 });
  r.setCoords();
  c.fire('object:scaling', { target: r, e: {} });
  const after = r.getBoundingRect();
  check('object:scaling never lets the object exceed the safe area',
    after.width <= 378 + 0.01 && after.height <= 594 + 0.01,
    `${after.width}x${after.height}`);
  check('scaled object stays inside the safe area',
    after.left >= 27 - 0.01 && after.top >= 27 - 0.01, `${after.left},${after.top}`);
  void before;

  // A rotated object poking out of the safe area is pulled back too.
  const big = new fabric.Rect({ left: 150, top: 250, width: 400, height: 60, fill: 'green', strokeWidth: 0 });
  c.add(big);
  big.set({ angle: 45 });
  big.setCoords();
  c.fire('object:rotating', { target: big, e: {} });
  const rb = big.getBoundingRect();
  check('object:rotating clamps the rotated bounding box to the safe area',
    rb.left >= 27 - 0.01 && rb.top >= 27 - 0.01 &&
    rb.left + rb.width <= 27 + 378 + 0.01 &&
    rb.top + rb.height <= 27 + 594 + 0.01,
    `${rb.left},${rb.top},${rb.width},${rb.height}`);
  engine.dispose();
}

console.log('\n=== KDP oversized objects are centred, not pinned ===');
{
  const { engine } = newEngine();
  const c = engine.canvas;
  engine.setKdpBoundaryLock(true, 1, 24);
  // wider than the safe area: 500 > 378 → must centre, so BOTH edges sit
  // symmetrically inside the margins.
  const wide = new fabric.Rect({ left: 10, top: 300, width: 500, height: 50, fill: 'blue', strokeWidth: 0 });
  c.add(wide);
  wide.set({ left: 400, top: 400 });
  wide.setCoords();
  c.fire('object:moving', { target: wide, e: {} });
  const bb = wide.getBoundingRect();
  check('oversized object is centred horizontally in the safe area',
    Math.abs(bb.left + bb.width / 2 - (27 + 378 / 2)) < 0.01,
    `centre=${bb.left + bb.width / 2}`);
  // It cannot fit by translation, so the guarantee is symmetry: neither edge
  // is pinned to one margin — the overhang is split evenly (centred).
  check('oversized object overflows both margins symmetrically',
    Math.abs((27 - bb.left) - (bb.left + bb.width - (27 + 378))) < 0.01,
    `left overhang=${27 - bb.left}, right overhang=${bb.left + bb.width - 405}`);
  engine.dispose();
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
