/**
 * Unit 06 — the guide overlay is DOM, above the canvas (spec 06, overlay.test.mjs).
 *
 * jsdom. Proves:
 *  - guides render as DOM, not canvas objects
 *  - every guide element has pointer-events: none
 *  - a hidden guide renders NOTHING, not an invisible element
 *  - guides paint above page content in stacking order
 */

import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuideOverlay } from './GuideOverlay.built.mjs';

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

const shellCss = fs.readFileSync(path.resolve('src/ui/app/AppShell.css'), 'utf-8');

const book = { trimId: '6x9', paper: 'bw-white', binding: 'paperback' };
const allVisible = { bleed: true, trim: true, safe: true, gutter: true, spine: true, barcode: true };

const renderStage = (overlayProps) => {
  const overlayMarkup = renderToStaticMarkup(createElement(GuideOverlay, overlayProps));
  const dom = new JSDOM(
    `<!doctype html><html><head><style>${shellCss}</style></head><body>
       <div class="page-stage">
         <canvas width="432" height="648"></canvas>
         ${overlayMarkup}
       </div>
     </body></html>`,
  );
  return dom;
};

/* ------------------------------------------------ guides are DOM, not canvas -- */

console.log('=== guides render as DOM elements, not canvas objects ===');
{
  const dom = renderStage({
    book,
    pageIndex: 0,
    pageCount: 100,
    surface: 'interior',
    bleedOn: true,
    visibleGuides: allVisible,
    pxPerIn: 72,
  });
  const overlay = dom.window.document.querySelector('.guide-overlay');
  check('the overlay exists in the DOM', overlay !== null);

  const guides = [...dom.window.document.querySelectorAll('.guide')];
  check('guide elements exist', guides.length === 4, `found ${guides.length}`); // bleed, trim, safe, gutter
  check(
    'every guide is a div, never a canvas',
    guides.every((g) => g.tagName === 'DIV'),
  );
  check('the overlay contains no canvas element', overlay.querySelector('canvas') === null);
  check('the overlay is aria-hidden', overlay.getAttribute('aria-hidden') === 'true');
}

/* --------------------------------------------------- pointer-events: none -- */

console.log('\n=== every guide element has pointer-events: none ===');
{
  const dom = renderStage({
    book,
    pageIndex: 1,
    pageCount: 100,
    surface: 'interior',
    bleedOn: true,
    visibleGuides: allVisible,
    pxPerIn: 72,
  });
  const overlay = dom.window.document.querySelector('.guide-overlay');
  const guides = [...dom.window.document.querySelectorAll('.guide')];

  // The rule is enforced inline, so it holds even without the stylesheet.
  check('the overlay root has inline pointer-events: none', overlay.style.pointerEvents === 'none');
  check(
    'every guide has inline pointer-events: none',
    guides.length > 0 && guides.every((g) => g.style.pointerEvents === 'none'),
  );
  check(
    'the stylesheet also pins pointer-events: none on overlay and guide',
    /\.guide-overlay\s*{[^}]*pointer-events:\s*none/.test(shellCss) &&
      /\.guide\s*{[^}]*pointer-events:\s*none/.test(shellCss),
  );
}

/* ------------------------------------------- hidden guide renders nothing -- */

console.log('\n=== a hidden guide renders nothing, not an invisible element ===');
{
  const dom = renderStage({
    book,
    pageIndex: 0,
    pageCount: 100,
    surface: 'interior',
    bleedOn: true,
    visibleGuides: { ...allVisible, safe: false, gutter: false },
    pxPerIn: 72,
  });
  const doc = dom.window.document;
  check('the safe guide is absent from the DOM', doc.querySelector('[data-guide="safe"]') === null);
  check('the gutter guide is absent from the DOM', doc.querySelector('[data-guide="gutter"]') === null);
  check('the visible guides still render', doc.querySelector('[data-guide="trim"]') !== null);

  const none = renderStage({
    book,
    pageIndex: 0,
    pageCount: 100,
    surface: 'interior',
    bleedOn: false,
    visibleGuides: { bleed: false, trim: false, safe: false, gutter: false, spine: false, barcode: false },
    pxPerIn: 72,
  });
  check(
    'with everything hidden the overlay is empty',
    none.window.document.querySelectorAll('.guide').length === 0,
  );
}

/* -------------------------------------------- stacking: overlay above paint -- */

console.log('\n=== guides paint above page content in stacking order ===');
{
  const dom = renderStage({
    book,
    pageIndex: 0,
    pageCount: 100,
    surface: 'interior',
    bleedOn: false,
    visibleGuides: allVisible,
    pxPerIn: 72,
  });
  const doc = dom.window.document;
  const stage = doc.querySelector('.page-stage');
  const canvas = stage.querySelector('canvas');
  const overlay = stage.querySelector('.guide-overlay');

  check(
    'the overlay follows the canvas in DOM order',
    (canvas.compareDocumentPosition(overlay) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );

  // The stylesheet raises the overlay above the paint. jsdom's computed style
  // support for cascade varies, so fall back to the source rule.
  const computedZ = dom.window.getComputedStyle(overlay).zIndex;
  check(
    'the overlay is raised above the canvas (z-index)',
    computedZ === '10' || /\.guide-overlay\s*{[^}]*z-index:\s*10/.test(shellCss),
    `computed z-index: ${computedZ}`,
  );
  check(
    'the overlay covers the whole stage (inset 0)',
    /\.guide-overlay\s*{[^}]*inset:\s*0/.test(shellCss),
  );
}

/* -------------------------------------------------- cover surface renders -- */

console.log('\n=== the cover surface renders spine fold and barcode keep-out ===');
{
  const dom = renderStage({
    book,
    pageIndex: 0,
    pageCount: 200,
    surface: 'cover',
    bleedOn: false,
    visibleGuides: allVisible,
    pxPerIn: 72,
  });
  const doc = dom.window.document;
  check('the spine fold guide renders on the cover', doc.querySelector('[data-guide="spine"]') !== null);
  check('the barcode keep-out guide renders on the cover', doc.querySelector('[data-guide="barcode"]') !== null);
  check('both safe areas render on the cover', doc.querySelectorAll('[data-guide="safe"]').length === 2);
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL OVERLAY TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
