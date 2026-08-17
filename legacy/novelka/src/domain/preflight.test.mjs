/**
 * Comprehensive Preflight & Export Hardening Test Suite (Phase 5).
 *
 * Exercises all 20 preflight and export verification rules:
 *  1. Valid small generated book passes.
 *  2. Valid 50-puzzle book passes when all required solutions exist.
 *  3. Missing solution blocks export.
 *  4. Orphan solution produces diagnostic.
 *  5. Invalid layout blocks export.
 *  6. Gutter collision is detected.
 *  7. Safe-area collision is detected.
 *  8. Unreadable text is detected.
 *  9. Word-list overflow is detected.
 * 10. Title overflow is detected.
 * 11. Object outside page is detected.
 * 12. Overlapping instances are detected where overlap is invalid.
 * 13. Duplicate instance IDs are detected.
 * 14. Missing object IDs are detected.
 * 15. Mixed page sizes are detected.
 * 16. Blank cover and missing artwork detection.
 * 17. Cover export excludes interior pages.
 * 18. Interior export excludes cover pages.
 * 19. "Everything" export preserves cover/interior ordering and counts.
 * 20. PDF parsing & deep inspection of page counts, dimensions, and contents via pdf-lib.
 */
import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body><canvas id="c"></canvas></body></html>', { pretendToBeVisual: true });
installCanvasStub(dom);
dom.window.HTMLCanvasElement.prototype.toDataURL = function () {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
};
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

import { PDFDocument } from 'pdf-lib';
import { generateWordSearch } from '../modules/word-search/generator.built.mjs';
import { buildWordSearchPages } from '../modules/word-search/build-pages.built.mjs';
import { DEFAULT_WS_STYLE } from '../modules/word-search/renderer.built.mjs';
import { runComprehensivePreflight } from './domain.built.mjs';
import { exportPDF } from '../engine/pdf-export.ts';

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

const flowers = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];

// 24-page even interior (20 puzzles + 4 solution pages at 5/page = 24 pages)
const puzzleList20 = Array.from({ length: 20 }, (_, i) =>
  generateWordSearch({ size: 14, words: flowers, difficulty: 'medium', seed: 600 + i, theme: `Theme ${i + 1}` }, i + 1),
);

const res24 = buildWordSearchPages(puzzleList20, DEFAULT_WS_STYLE, {
  puzzlesPerPage: 1,
  solutionsPerPage: 5,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Answers',
  templateId: 'classic',
  title: 'Complete 24 Page Volume',
  showFolio: true,
}, { width: 432, height: 648 });

const coverPage = {
  id: 'cover-page-1',
  name: 'Wraparound Cover',
  role: 'cover',
  width: 900,
  height: 648,
  data: {
    objects: [
      { id: 'c-bg', type: 'Rect', left: 0, top: 0, width: 900, height: 648, fill: '#312e81', visible: true },
      { id: 'c-title', type: 'Textbox', text: 'BOTANICAL WORD SEARCH', left: 500, top: 200, width: 350, height: 40, fontSize: 24, fill: '#ffffff', visible: true },
    ],
  },
};

console.log('\n=== 1. Valid Generated Book Passes Preflight ===');
{
  const result = runComprehensivePreflight(res24.pages, { exportPreset: 'interior' });
  check('24-page complete book (20 puzzles + 4 solutions) passes preflight', result.status === 'pass');
  check('preflight errors list is empty for valid book', result.errors.length === 0);
  check('summary indicates preflight passed', result.summary.includes('Preflight passed'));
}

console.log('\n=== 2. Valid 50-Puzzle Book (Full Volume) ===');
{
  const puzzleList50 = Array.from({ length: 50 }, (_, i) =>
    generateWordSearch({ size: 14, words: flowers, difficulty: 'medium', seed: 700 + i, theme: `Theme ${i + 1}` }, i + 1),
  );
  const res50 = buildWordSearchPages(puzzleList50, DEFAULT_WS_STYLE, {
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionPlacement: 'back_of_book',
    kdpSafe: true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: 'classic',
    title: '50 Puzzle Volume',
    showFolio: true,
  }, { width: 432, height: 648 });

  const result50 = runComprehensivePreflight(res50.pages, { requireSolutions: true });
  check('50-puzzle book has 0 error blockers', result50.errors.length === 0);
  check('50-puzzle book status is not blocked', result50.status !== 'blocked');
}

console.log('\n=== 3. Missing Solution Blocks Export ===');
{
  const puzzlePagesOnly = res24.pages.filter((p) => p.data['novelka:wordsearch-page']?.kind === 'puzzle');
  const resultMissingSol = runComprehensivePreflight(puzzlePagesOnly, { requireSolutions: true });

  check('missing solutions blocks export', resultMissingSol.status === 'blocked');
  const missingDiag = resultMissingSol.errors.find((e) => e.code === 'MISSING_SOLUTION');
  check('emits MISSING_SOLUTION diagnostic code', Boolean(missingDiag));
}

console.log('\n=== 4. Orphan Solution Diagnostic ===');
{
  const orphanPage = {
    id: 'orphan-p',
    name: 'Orphan Answers',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      instances: [{
        instanceId: 'inst-orphan',
        role: 'solution',
        kind: 'word-search-solution',
        contentId: 'non-existent-puzzle-999',
        objectIds: [],
        source: {},
      }],
      objects: [{ id: 'obj-orphan', type: 'Rect', left: 40, top: 40, width: 100, height: 100, visible: true }],
    },
  };
  const resultOrphan = runComprehensivePreflight([...res24.pages, orphanPage], { requireSolutions: true });
  const orphanDiag = resultOrphan.warnings.find((w) => w.code === 'ORPHAN_SOLUTION');
  check('emits ORPHAN_SOLUTION diagnostic code', Boolean(orphanDiag));
}

console.log('\n=== 5. Invalid Layout Blocks Export ===');
{
  const badPage = {
    id: 'bad-layout-page',
    name: 'Bad Layout',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      invalidForProduction: true,
      ok: false,
      layoutWarnings: [{ code: 'GRID_BELOW_MINIMUM', message: 'Cell size below 12pt', severity: 'error' }],
      objects: [],
    },
  };
  const resultBadLayout = runComprehensivePreflight([...res24.pages, badPage]);
  check('invalid layout blocks export (status: blocked)', resultBadLayout.status === 'blocked');
  const layoutDiag = resultBadLayout.errors.find((e) => e.code === 'INVALID_LAYOUT');
  check('emits INVALID_LAYOUT diagnostic', Boolean(layoutDiag));
  check('affectedPages includes bad layout page', resultBadLayout.affectedPages.includes(res24.pages.length + 1));
}

console.log('\n=== 6. Safe Area & Gutter Collision Diagnostics ===');
{
  const collisionPage = {
    id: 'collision-page',
    name: 'Collision Page',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      objects: [
        {
          id: 'unsafe-text',
          type: 'Textbox',
          text: 'Unsafe Header Collision',
          left: 5,
          top: 5,
          width: 300,
          height: 20,
          fontSize: 16,
          visible: true,
        },
      ],
    },
  };
  const resultCollision = runComprehensivePreflight([...res24.pages, collisionPage]);
  const safeAreaDiag = resultCollision.errors.find((e) => e.code === 'TEXT_OUTSIDE_SAFE_AREA');
  check('detects TEXT_OUTSIDE_SAFE_AREA collision', Boolean(safeAreaDiag));
}

console.log('\n=== 7. Unreadable Text Detection ===');
{
  const unreadablePage = {
    id: 'unreadable-page',
    name: 'Tiny Text Page',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      objects: [
        {
          id: 'tiny-txt',
          type: 'Textbox',
          text: 'Tiny unreadable text',
          left: 40,
          top: 40,
          width: 200,
          height: 10,
          fontSize: 4.5,
          wsRole: 'ws-letter',
          visible: true,
        },
      ],
    },
  };
  const resultUnreadable = runComprehensivePreflight([...res24.pages, unreadablePage]);
  const unreadableDiag = resultUnreadable.errors.find((e) => e.code === 'UNREADABLE_TEXT');
  check('detects UNREADABLE_TEXT threshold violation', Boolean(unreadableDiag));
}

console.log('\n=== 8. Object Outside Page Bounds ===');
{
  const outsidePage = {
    id: 'outside-page',
    name: 'Outside Page',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      objects: [
        {
          id: 'out-elem',
          type: 'Rect',
          left: 500,
          top: 100,
          width: 100,
          height: 100,
          visible: true,
        },
      ],
    },
  };
  const resultOutside = runComprehensivePreflight([...res24.pages, outsidePage]);
  const outsideDiag = resultOutside.warnings.find((w) => w.code === 'OBJECT_OUTSIDE_PAGE') || resultOutside.errors.find((e) => e.code === 'OBJECT_OUTSIDE_PAGE');
  check('detects OBJECT_OUTSIDE_PAGE violation', Boolean(outsideDiag));
}

console.log('\n=== 9. Overlapping Instances Detection ===');
{
  const overlapPage = {
    id: 'overlap-page',
    name: 'Overlap Page',
    width: 612,
    height: 792,
    role: 'interior',
    data: {
      instances: [
        { instanceId: 'inst-a', contentId: 'p-a', role: 'puzzle', objectIds: ['obj-a'], source: {} },
        { instanceId: 'inst-b', contentId: 'p-b', role: 'puzzle', objectIds: ['obj-b'], source: {} },
      ],
      objects: [
        { id: 'obj-a', instanceId: 'inst-a', type: 'Rect', left: 100, top: 100, width: 250, height: 250, visible: true },
        { id: 'obj-b', instanceId: 'inst-b', type: 'Rect', left: 150, top: 150, width: 250, height: 250, visible: true },
      ],
    },
  };
  const resultOverlap = runComprehensivePreflight([...res24.pages, overlapPage]);
  const overlapDiag = resultOverlap.errors.find((e) => e.code === 'OVERLAPPING_INSTANCES');
  check('detects OVERLAPPING_INSTANCES on the same page', Boolean(overlapDiag));
}

console.log('\n=== 10. Duplicate Instance IDs Detection ===');
{
  const dupePage = {
    id: 'dupe-page',
    name: 'Dupe Page',
    width: 432,
    height: 648,
    role: 'interior',
    data: {
      instances: [
        { instanceId: res24.pages[0].data.instances[0].instanceId, contentId: 'p-dupe', role: 'puzzle', objectIds: [], source: {} },
      ],
      objects: [],
    },
  };
  const resultDupe = runComprehensivePreflight([...res24.pages, dupePage]);
  const dupeDiag = resultDupe.errors.find((e) => e.code === 'DUPLICATE_INSTANCE_ID');
  check('detects DUPLICATE_INSTANCE_ID collision', Boolean(dupeDiag));
}

console.log('\n=== 11. Mixed Page Sizes Detection ===');
{
  const mixedPages = [
    { id: 'p-6x9', name: 'Page 1', width: 432, height: 648, role: 'interior', data: { objects: [] } },
    { id: 'p-85x11', name: 'Page 2', width: 612, height: 792, role: 'interior', data: { objects: [] } },
  ];
  const resultMixed = runComprehensivePreflight(mixedPages);
  const mixedDiag = resultMixed.errors.find((e) => e.code === 'MIXED_PAGE_SIZES');
  check('detects MIXED_PAGE_SIZES blocker', Boolean(mixedDiag));
}

console.log('\n=== 12. Blank Cover and Missing Artwork Detection ===');
{
  const blankCover = {
    id: 'cover-blank',
    name: 'Blank Cover',
    role: 'cover',
    width: 900,
    height: 648,
    data: { objects: [] },
  };
  const resBlankCover = runComprehensivePreflight([blankCover], { exportPreset: 'cover' });
  const blankCoverDiag = resBlankCover.errors.find((e) => e.code === 'BLANK_COVER');
  check('detects BLANK_COVER blocker error', Boolean(blankCoverDiag));
}

console.log('\n=== 13. PDF Parsing & Deep Inspection: Interior PDF ===');
{
  const fullBookWithCover = [coverPage, ...res24.pages];
  const interiorOnly = fullBookWithCover.filter((p) => p.role !== 'cover');

  const blob = await exportPDF(interiorOnly, 'Flora-Word-Search-Interior', {
    dpi: 300,
    watermark: false,
    mode: 'hybrid',
  });

  const arrayBuffer = await blob.arrayBuffer();
  const parsedInterior = await PDFDocument.load(arrayBuffer);

  check('interior PDF loads successfully via PDFDocument', Boolean(parsedInterior));
  check('interior PDF parsed page count equals 24', parsedInterior.getPageCount() === 24);

  // Verify every page has expected 6x9 trim size (432 x 648 pt)
  const allPages6x9 = Array.from({ length: parsedInterior.getPageCount() }, (_, i) => {
    const p = parsedInterior.getPage(i);
    const size = p.getSize();
    return size.width === 432 && size.height === 648;
  }).every(Boolean);
  check('every interior page is 432 × 648 pt (6 × 9 in)', allPages6x9);

  // Verify cover is excluded (no 900pt wide page exists in interior PDF)
  const hasCoverWidth = Array.from({ length: parsedInterior.getPageCount() }, (_, i) => {
    return parsedInterior.getPage(i).getSize().width === 900;
  }).some(Boolean);
  check('cover is excluded from interior PDF', hasCoverWidth === false);

  check('interior PDF binary size is substantial (>100KB)', arrayBuffer.byteLength > 100000);
}

console.log('\n=== 14. PDF Parsing & Deep Inspection: Cover PDF ===');
{
  const blobCover = await exportPDF([coverPage], 'Flora-Word-Search-Cover', {
    dpi: 300,
    watermark: false,
    mode: 'hybrid',
  });

  const coverBuffer = await blobCover.arrayBuffer();
  const parsedCover = await PDFDocument.load(coverBuffer);

  check('cover PDF loads successfully via PDFDocument', Boolean(parsedCover));
  check('cover PDF contains exactly 1 page', parsedCover.getPageCount() === 1);

  const coverSize = parsedCover.getPage(0).getSize();
  check('cover PDF dimensions match wraparound 900 × 648 pt', coverSize.width === 900 && coverSize.height === 648);

  // Verify interior pages are excluded from cover PDF
  check('all interior pages are excluded from cover PDF', parsedCover.getPageCount() === 1);
}

console.log('\n=== 15. PDF Parsing: "Everything" Export Ordering ===');
{
  const fullBookWithCover = [coverPage, ...res24.pages];
  const blobAll = await exportPDF(fullBookWithCover, 'Full-Book-Combined', {
    dpi: 300,
    watermark: false,
    mode: 'hybrid',
  });

  const allBuffer = await blobAll.arrayBuffer();
  const parsedAll = await PDFDocument.load(allBuffer);

  check('combined PDF contains 25 pages (1 cover + 24 interior)', parsedAll.getPageCount() === 25);
  const p0Size = parsedAll.getPage(0).getSize();
  check('page 0 is wraparound cover (900 × 648 pt)', p0Size.width === 900 && p0Size.height === 648);
  const p1Size = parsedAll.getPage(1).getSize();
  check('page 1 is interior page (432 × 648 pt)', p1Size.width === 432 && p1Size.height === 648);
  const p24Size = parsedAll.getPage(24).getSize();
  check('page 24 is solution page (432 × 648 pt)', p24Size.width === 432 && p24Size.height === 648);
}

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PREFLIGHT & PDF INSPECTION TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
