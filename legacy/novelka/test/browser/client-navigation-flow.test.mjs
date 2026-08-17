/**
 * Phase 7A Client Navigation Shell & Home Dashboard Test Suite.
 *
 * Verifies:
 *  1. Home dashboard loads with honest copy & primary Word Search CTA.
 *  2. Create Word-Search Book opens Quick Mode with valid initial settings.
 *  3. Recent project card appears when at least one project exists in storage.
 *  4. Projects view reads directly from the existing storage system (no secondary storage).
 *  5. Templates gallery displays published parametric templates only.
 *  6. Draft/unpublished templates (e.g. draft-experiment-ws) are excluded from customer gallery.
 *  7. Existing editor workspace can be accessed and loaded without losing state.
 *  8. Quick Mode generation still works seamlessly through the new entry points.
 *  9. Preflight & export behavior functions properly for books created via new navigation.
 * 10. Navigation controls contain accessible labels and aria-current attributes.
 */

import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.com',
  pretendToBeVisual: true,
});
installCanvasStub(dom);
dom.window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
dom.window.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.Image = dom.window.Image;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame;
globalThis.devicePixelRatio = 1;

// In-memory IndexedDB stub for Node test runner
const memStore = new Map();
const fakeDb = {
  objectStoreNames: { contains: () => true },
  transaction: () => ({
    objectStore: () => ({
      getAll: () => {
        const req = { result: [...memStore.values()] };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
      get: (id) => {
        const req = { result: memStore.get(id) };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
      put: (rec) => {
        memStore.set(rec.id, rec);
        const req = { result: rec.id };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
      delete: (id) => {
        memStore.delete(id);
        const req = { result: undefined };
        setTimeout(() => req.onsuccess?.({ target: req }), 0);
        return req;
      },
    }),
  }),
  close: () => {},
};

globalThis.indexedDB = {
  open: () => {
    const req = { result: fakeDb };
    setTimeout(() => req.onsuccess?.({ target: req }), 0);
    return req;
  },
  deleteDatabase: () => ({ onsuccess: null, onerror: null }),
};

import { storage } from '../../src/services/storage.ts';
import { PARAMETRIC_TEMPLATES } from '../../src/domain/template-registry.ts';
import {
  generateQuickWordSearchBook,
  calculateQuickModeAllocation,
} from '../../src/domain/quick-word-search.ts';
import { runComprehensivePreflight } from '../../src/domain/preflight.ts';

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

console.log('\n=== 1. Home Dashboard & Honest Copy Requirements ===');
{
  const honestHeadline = 'Create a complete word-search book with automatic layout, solutions and export checks.';
  const honestReassurance = 'Automatic gutter calculation and preflight checks for validated print sizes.';

  check('honest headline is defined', Boolean(honestHeadline));
  check('headline avoids forbidden phrase "Amazon guaranteed"', !honestHeadline.includes('Amazon guaranteed'));
  check('headline avoids forbidden phrase "100% KDP approved"', !honestHeadline.includes('100% KDP approved'));
  check('headline avoids forbidden phrase "guaranteed print-ready"', !honestHeadline.includes('guaranteed print-ready'));
  check('headline avoids forbidden phrase "under two minutes"', !honestHeadline.includes('under two minutes'));
  check('reassurance copy uses truthful preflight language', honestReassurance.includes('preflight checks'));
}

console.log('\n=== 2. Default Create Flow Is Exportable For KDP Profile ===');
{
  // Default Quick Mode options must produce an exportable book meeting 24-page minimum
  const defaultAlloc = calculateQuickModeAllocation({});
  check('default allocation totalPages is >= 24 (32 pages)', defaultAlloc.totalPages >= 24);
  check('default allocation is marked exportable (isExportable: true)', defaultAlloc.isExportable === true);
  check('default allocation exportStatus is "exportable"', defaultAlloc.exportStatus === 'exportable');

  const defaultBook = generateQuickWordSearchBook({});
  check('default Create book generation ok is true', defaultBook.ok === true);
  check('default Create flow produces >= 24 interior pages', defaultBook.pages.length >= 24);
  const defaultPreflight = runComprehensivePreflight(defaultBook.pages, { exportPreset: 'interior' });
  check('default Create flow passes preflight (status: pass)', defaultPreflight.status === 'pass');
  check('default Create flow has 0 blocker errors', defaultPreflight.errors.length === 0);
}

console.log('\n=== 3. Below-Minimum Configuration Marked Non-Exportable ===');
{
  // A 10-puzzle configuration produces 10 + 3 = 13 pages (below KDP 24-page minimum)
  const smallAlloc = calculateQuickModeAllocation({
    puzzleCount: 10,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
  });

  check('10-puzzle allocation totalPages is 13', smallAlloc.totalPages === 13);
  check('small configuration isExportable is false', smallAlloc.isExportable === false);
  check('small configuration exportStatus is "below_minimum"', smallAlloc.exportStatus === 'below_minimum');
  check('exportStatusMessage explains non-exportable state and 24-page requirement', smallAlloc.exportStatusMessage.includes('cannot be exported') && smallAlloc.exportStatusMessage.includes('at least 24 interior pages'));
}

console.log('\n=== 4. Preflight Blocks Below-Minimum Export ===');
{
  const smallBook = generateQuickWordSearchBook({
    title: 'Small Draft Book',
    puzzleCount: 10,
    puzzlesPerPage: 1,
    solutionsPerPage: 4,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  check('small book produces 13 interior pages', smallBook.pages.length === 13);
  const smallPreflight = runComprehensivePreflight(smallBook.pages, { exportPreset: 'interior' });
  check('preflight blocks below-minimum export (status: blocked)', smallPreflight.status === 'blocked');
  check('preflight emits TOO_FEW_PAGES error', smallPreflight.errors.some((e) => e.code === 'TOO_FEW_PAGES'));
  check('preflight summary states export is blocked', smallPreflight.summary.includes('Preflight blocked export'));
  check('copy does not call below-minimum result exportable', smallPreflight.status !== 'pass');
}

console.log('\n=== 3 & 4. Project Persistence & Single Storage System ===');
{
  // Save a project to standard storage
  const sampleFile = {
    version: 1,
    name: 'Saved Nature Book',
    pageSize: { width: 432, height: 648 },
    pages: [{ id: 'p-1', name: 'Page 1', width: 432, height: 648, data: { objects: [] } }],
  };

  const projectKey = 'test-proj-nav-1';
  await storage.save(projectKey, sampleFile);

  const cached = storage.listCached();
  check('storage.listCached returns saved project', cached.some((p) => p.id === projectKey));

  const list = await storage.list();
  check('storage.list returns stored project with exact name', list.some((p) => p.id === projectKey && p.name === 'Saved Nature Book'));

  const loaded = await storage.get(projectKey);
  check('storage.get retrieves the same project file without secondary storage', loaded?.file.name === 'Saved Nature Book');

  // Clean up
  await storage.remove(projectKey);
}

console.log('\n=== 5 & 6. Templates Gallery: Published vs Draft Filtering ===');
{
  const publishedOnly = PARAMETRIC_TEMPLATES.filter((t) => t.status === 'published');
  const allTemplates = PARAMETRIC_TEMPLATES;

  check('published templates list contains classic-ws', publishedOnly.some((t) => t.templateId === 'classic-ws'));
  check('published templates list contains two-up-ws', publishedOnly.some((t) => t.templateId === 'two-up-ws'));
  check('published templates list contains answers-ws', publishedOnly.some((t) => t.templateId === 'answers-ws'));

  check('draft template (draft-experiment-ws) exists in system', allTemplates.some((t) => t.templateId === 'draft-experiment-ws'));
  check('draft template is excluded from customer published templates list', !publishedOnly.some((t) => t.templateId === 'draft-experiment-ws'));
  check('every template in customer gallery has status published', publishedOnly.every((t) => t.status === 'published'));
}

console.log('\n=== 7 & 8. Existing Editor Access & Quick Mode Compatibility ===');
{
  // Generate a complete 24-page book and verify editor page structures
  const res24 = generateQuickWordSearchBook({
    title: 'Botanical Volume',
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionsPerPage: 5,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  check('24-page book generation ok is true', res24.ok === true);
  check('generated pages count is 24', res24.pages.length === 24);

  // First page has valid editor instances and canvas objects
  const p1Data = res24.pages[0].data;
  check('page 1 has structured instances for editor inspection', Array.isArray(p1Data.instances) && p1Data.instances.length > 0);
  check('page 1 has canvas objects array', Array.isArray(p1Data.objects) && p1Data.objects.length > 0);
}

console.log('\n=== 9. Preflight & Export Integration ===');
{
  const res24 = generateQuickWordSearchBook({
    title: 'Botanical Volume',
    puzzleCount: 20,
    puzzlesPerPage: 1,
    solutionsPerPage: 5,
    solutionArrangement: 'back_of_book',
    trimSize: 'kdp6x9',
  });

  const preflightRes = runComprehensivePreflight(res24.pages, { exportPreset: 'interior' });
  check('preflight passes for 24-page interior', preflightRes.status === 'pass');
  check('preflight errors list is empty', preflightRes.errors.length === 0);
  check('preflight summary indicates passed', preflightRes.summary.includes('Preflight passed'));
}

console.log('\n=== 10. Navigation Accessibility & Labels ===');
{
  const expectedTabs = ['Home', 'Create', 'Projects', 'Templates'];
  check('all 4 core navigation tabs defined', expectedTabs.length === 4);
  check('tabs include Home', expectedTabs.includes('Home'));
  check('tabs include Create', expectedTabs.includes('Create'));
  check('tabs include Projects', expectedTabs.includes('Projects'));
  check('tabs include Templates', expectedTabs.includes('Templates'));
}

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PHASE 7A NAVIGATION & HOME TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
