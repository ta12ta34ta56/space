/**
 * Template safe-area audit — npm run test:templates
 *
 * The core print promise: EVERY object that a template generates must sit
 * strictly inside the KDP safe area (safe margins + gutter on the correct
 * side), once the template's own clamp has run. Full-page background art is
 * exempt (intentional bleed). Non-KDP templates (the cover) are checked
 * against the minimum 0.25" margins instead.
 *
 * The audit runs every template at several trim sizes / page counts / page
 * numbers (recto + verso) so gutter flips and spine growth are covered.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../test/helpers/jsdom-canvas-stub.mjs';

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
// Templates call loadFont() (best-effort since the font-manager guard) and
// fabric only needs a 2D-context stub in jsdom — no real fonts.
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
if (!dom.window.FontFace) {
  dom.window.FontFace = class FontFace {};
  globalThis.FontFace = dom.window.FontFace;
}

const { TEMPLATES, buildTemplateJSON } = await import('./templates.built.mjs');
const { kdpMarginsFor, safeAreaFor, serializedObjectBounds, KDP_TRIM_SIZES, inchesToPt, KDP_MIN_LINE_WIDTH_PT } = await import('./kdp.built.mjs');

// Every KDP standard trim size (recto + verso) at a gutter-driving page count.
// This is the contract of item 2: a template must render correctly at EVERY
// trim size KDP accepts, never assuming one fixed size.
const VARIATIONS = [];
for (const trim of KDP_TRIM_SIZES) {
  const w = inchesToPt(trim.widthIn);
  const h = inchesToPt(trim.heightIn);
  VARIATIONS.push({ label: `${trim.id} recto/100p`, ctx: { w, h, font: 'Inter', pageNumber: 1, pageCount: 100 } });
  VARIATIONS.push({ label: `${trim.id} verso/100p`, ctx: { w, h, font: 'Inter', pageNumber: 2, pageCount: 100 } });
}
// A couple of extra gutter-band sizes on the reference 6×9 to cover spine growth.
VARIATIONS.push({ label: '6x9 recto/600p', ctx: { w: 432, h: 648, font: 'Inter', pageNumber: 3, pageCount: 600 } });
VARIATIONS.push({ label: '6x9 recto/24p', ctx: { w: 432, h: 648, font: 'Inter', pageNumber: 1, pageCount: 24 } });

const TOL = 0.5;

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

console.log('\n=== every template object stays inside the KDP safe area ===');
for (const t of TEMPLATES) {
  for (const v of VARIATIONS) {
    // kdpSafe templates are clamped to SAFE margins (0.375" + gutter).
    // Non-kdpSafe templates (the wraparound cover) are full-bleed art by
    // design: KDP covers have no gutter, so their content is checked against
    // a plain 0.25" inset from the trim edge.
    const safe = t.kdpSafe
      ? safeAreaFor(v.ctx.w, v.ctx.h, v.ctx.pageNumber, kdpMarginsFor(v.ctx.pageCount, { intent: 'safe' }))
      : { left: 18, top: 18, width: v.ctx.w - 36, height: v.ctx.h - 36 };
    let objs;
    try {
      objs = await buildTemplateJSON(t, v.ctx);
    } catch (e) {
      check(`template ${t.id} builds @ ${v.label}`, false, String(e?.message ?? e));
      continue;
    }
    check(`template ${t.id} produces objects @ ${v.label}`, Array.isArray(objs) && objs.length > 0,
      `objects=${objs.length}`);
    for (const o of objs) {
      const bb = serializedObjectBounds(o);
      const type = String(o.type ?? '').toLowerCase();
      const text = type === 'textbox' || type === 'i-text' || type === 'text' || typeof o.text === 'string';
      // Full-page background art is intentional bleed — exempt.
      if (bb.width >= v.ctx.w * 0.95 && bb.height >= v.ctx.h * 0.95) continue;
      check(
        `template ${t.id} @ ${v.label}: ${o.type ?? 'object'} inside safe area`,
        bb.left >= safe.left - TOL &&
          bb.top >= safe.top - TOL &&
          bb.left + bb.width <= safe.left + safe.width + TOL &&
          bb.top + bb.height <= safe.top + safe.height + TOL,
        `rect=[${bb.left.toFixed(1)},${bb.top.toFixed(1)},${bb.width.toFixed(1)},${bb.height.toFixed(1)}] ` +
          `safe=[${safe.left.toFixed(1)},${safe.top.toFixed(1)},${safe.width.toFixed(1)},${safe.height.toFixed(1)}]`,
      );
      // Every stroke must be at or above KDP's 0.75pt print minimum — a grid
      // of sub-0.75pt lines is what produced the old 100+ THIN_LINES warnings.
      const stroke = typeof o.stroke === 'string' && o.stroke !== '' && o.stroke !== 'transparent';
      const sw = Number(o.strokeWidth ?? 0);
      if (stroke && sw > 0) {
        check(
          `template ${t.id} @ ${v.label}: stroke >= ${KDP_MIN_LINE_WIDTH_PT}pt`,
          sw >= KDP_MIN_LINE_WIDTH_PT - 0.001,
          `strokeWidth=${sw}`,
        );
      }
      // Readable print text (KDP preflight flags fontSize < 6pt for content).
      if (text && typeof o.fontSize === 'number') {
        check(
          `template ${t.id} @ ${v.label}: readable text`,
          o.fontSize >= 6,
          `fontSize=${o.fontSize}`,
        );
      }
    }
  }
}

console.log('\n=== template metadata sanity ===');
check('template registry is populated', TEMPLATES.length >= 15, `count=${TEMPLATES.length}`);
check('every template has a preview and a builder',
  TEMPLATES.every((t) => typeof t.preview === 'string' && t.preview.length > 0 && typeof t.build === 'function'));
check('every template has a unique id',
  new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length);
check('certificate is safe-area enforced',
  TEMPLATES.find((t) => t.id === 'certificate')?.kdpSafe === true);
check('cover template stays bleed-friendly (not force-clamped)',
  TEMPLATES.find((t) => t.id === 'cover-bold')?.kdpSafe !== true);

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.slice(0, 25).forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
