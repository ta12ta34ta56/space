/**
 * Unit 08 — the Layers dock (spec 08, layers-dock.test.mjs).
 *
 * jsdom, with real event handlers. Proves:
 *  - visibility and lock each dispatch one element/update
 *  - delete dispatches element/delete
 *  - reorder dispatches exactly one element/reorder, and one Ctrl+Z restores
 *    the order
 *  - selecting a row updates ui-store and leaves doc unchanged, by reference
 *  - a locked element's row shows locked state and refuses reorder
 */

import { createHarness } from '../../../test/helpers/react-dom-harness.mjs';

const harness = await createHarness();
const { document: dom, createElement, mount, fire, run, unmount } = harness;

// One code-split bundle, so the panel and the test share one store singleton.
const { store } = await import('../../../.test-build/state/store.built.mjs');
const { useUiStore } = await import('../../../.test-build/state/ui-store.built.mjs');
const { createDocument } = await import('../../../.test-build/model/index.built.mjs');
const { LayersTab } = await import('../../../.test-build/ui/panels/LayersTab.built.mjs');

let pass = 0;
let fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const CREATED_AT = 1_700_000_000_000;
const now = () => CREATED_AT;
const newId = () => 'unused';

const frame = { xIn: 1, yIn: 1, wIn: 2, hIn: 2 };

const shape = (id, z, over = {}) => ({
  id,
  kind: 'shape',
  type: 'shape',
  frame,
  z,
  hidden: false,
  locked: false,
  shape: { shape: 'rect', fillHex: '#ffffff', strokeHex: '#000000', strokeWidthPt: 1 },
  ...over,
});

const puzzle = (id, z) => ({
  id,
  kind: 'puzzle',
  type: 'puzzle',
  frame,
  z,
  hidden: false,
  locked: false,
  puzzle: { kind: 'wordsearch', data: {}, style: {} },
});

/** Loads a 24-page book whose first page carries `elements`. */
async function loadPage(elements) {
  let n = 0;
  const doc = createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount: 24,
    now: () => CREATED_AT,
    id: () => `p-${(n += 1)}`,
  });
  const pages = doc.pages.slice();
  pages[0] = { ...pages[0], elements };
  await run(() => {
    store.getState().load({ ...doc, pages });
    useUiStore.getState().setCurrentPageIndex(0);
    useUiStore.getState().setSelection([]);
  });
  return pages[0].id;
}

const renderPanel = async () => mount(createElement(LayersTab, { newId, now }));
const rows = () => [...dom.querySelectorAll('.docklayer')];
const elementsNow = () => store.getState().doc.pages[0].elements;
const byId = (id) => elementsNow().find((el) => el.id === id);

/* ---------------------------------------------- rows come from the page -- */

console.log('=== the tree comes from the Document, front-most first ===');
{
  await loadPage([shape('a', 0), puzzle('b', 2), shape('c', 1)]);
  await renderPanel();

  const names = rows().map((row) => row.querySelector('.docklayer-name').textContent);
  check('one row per element', rows().length === 3, `found ${rows().length}`);
  check('front-most first', names.join(',') === 'Puzzle,Shape,Shape', names.join(','));
  check('a puzzle is exactly one row (D3)', rows().filter((r) => r.querySelector('.lk-puzzle')).length === 1);
  check('each kind carries its own class', dom.querySelector('.lk-puzzle') !== null && dom.querySelector('.lk-shape') !== null);

  // An empty page says so plainly rather than showing a blank panel.
  await loadPage([]);
  await renderPanel();
  check('an empty page renders no rows', dom.querySelectorAll('.docklayer').length === 0);
  const empty = dom.querySelector('.empty');
  check('and says the page is empty', empty !== null && /This page is empty/.test(empty.textContent));
}

/* ------------------------------------- visibility and lock, one each -- */

console.log('\n=== visibility and lock dispatch one element/update each ===');
{
  await loadPage([shape('a', 0), shape('b', 1)]);
  await renderPanel();

  const before = store.getState();
  const hide = rows()[0].querySelector('[aria-label="Hide layer"]');
  check('a visible row offers Hide layer', hide !== null);
  await fire(hide, 'click');

  check('exactly one history entry', store.getState().past.length === before.past.length + 1);
  check('labelled as an element edit', store.getState().past.at(-1).label === 'Edit element');
  check('the front element is now hidden', byId('b').hidden === true);
  check('the other element is untouched', byId('a').hidden === false);

  await renderPanel();
  const show = rows()[0].querySelector('[aria-label="Show layer"]');
  check('a hidden row offers Show layer', show !== null);

  const beforeLock = store.getState().past.length;
  const lock = rows()[0].querySelector('[aria-label="Lock layer"]');
  check('a row offers Lock layer', lock !== null);
  await fire(lock, 'click');

  check('lock is exactly one more entry', store.getState().past.length === beforeLock + 1);
  check('the element is now locked', byId('b').locked === true);

  await renderPanel();
  const unlock = rows()[0].querySelector('[aria-label="Unlock layer"]');
  check('a locked row offers Unlock layer', unlock !== null);
  check('and shows its locked state', unlock.classList.contains('on'));
}

/* --------------------------------------------------------------- delete -- */

console.log('\n=== delete dispatches element/delete ===');
{
  await loadPage([shape('a', 0), shape('b', 1), shape('c', 2)]);
  await renderPanel();

  await fire(rows()[0].querySelector('[aria-label="Delete layer"]'), 'click');

  check('labelled as a delete', store.getState().past.at(-1).label === 'Delete elements');
  check('exactly that element went', byId('c') === undefined);
  check('the others survive', byId('a') !== undefined && byId('b') !== undefined);
  check('the row is gone from the panel', dom.querySelectorAll('.docklayer').length === 2);
}

/* --------------------------------- reorder is one command, one undo -- */

console.log('\n=== reorder dispatches one element/reorder; one undo restores the order ===');
{
  await loadPage([shape('a', 0), shape('b', 1), shape('c', 2)]);
  await renderPanel();

  // Displayed front-most first: c, b, a. Move the front row down one.
  const before = store.getState();
  const order = () =>
    [...elementsNow()].sort((x, y) => y.z - x.z).map((el) => el.id).join(',');
  check('the starting order is c,b,a', order() === 'c,b,a');

  await fire(rows()[0], 'keydown', { key: 'ArrowDown' });

  check('exactly one history entry', store.getState().past.length === before.past.length + 1);
  check('labelled as a restack', store.getState().past.at(-1).label === 'Restack element');
  check('the order changed as the row moved', order() === 'b,c,a', order());

  await run(() => store.getState().undo());
  check('one undo restores the order', order() === 'c,b,a', order());

  // Moving the front row up is not a move, so it is not an undo entry.
  await renderPanel();
  const quiet = store.getState().past.length;
  await fire(rows()[0], 'keydown', { key: 'ArrowUp' });
  check('moving the front row further up does nothing', store.getState().past.length === quiet);
}

/* ---------------------- selecting a row never touches the Document -- */

console.log('\n=== selecting a row updates ui-store and leaves doc unchanged ===');
{
  await loadPage([shape('a', 0), shape('b', 1)]);
  await renderPanel();

  const before = store.getState();
  await fire(rows()[0], 'click');

  check('the selection is in ui-store', useUiStore.getState().selection.join(',') === 'b');
  check('doc is the same reference', store.getState().doc === before.doc);
  check('past is the same reference', store.getState().past === before.past);
  check('future is the same reference', store.getState().future === before.future);

  await renderPanel();
  check('the selected row shows as active', rows()[0].classList.contains('active'));

  // The keyboard equivalent selects too, and still never edits the Document.
  await fire(rows()[1], 'keydown', { key: 'Enter' });
  check('Enter selects the focused row', useUiStore.getState().selection.join(',') === 'a');
  check('and doc is still the same reference', store.getState().doc === before.doc);
}

/* ------------------------------ a locked row shows it and refuses reorder -- */

console.log('\n=== a locked element shows locked state and refuses reorder ===');
{
  await loadPage([shape('a', 0), shape('b', 1, { locked: true }), shape('c', 2)]);
  await renderPanel();

  // Displayed: c, b (locked), a.
  const lockedRow = rows()[1];
  check(
    'the locked row shows its lock',
    lockedRow.querySelector('[aria-label="Unlock layer"]') !== null,
  );
  check(
    'and marks the control as on',
    lockedRow.querySelector('[aria-label="Unlock layer"]').classList.contains('on'),
  );

  const before = store.getState();
  await fire(lockedRow, 'keydown', { key: 'ArrowUp' });
  check('a locked row refuses to move', store.getState().doc === before.doc);
  check('and creates no history entry', store.getState().past === before.past);

  // Selecting a locked row is refused too: locking is what stops it changing.
  await run(() => useUiStore.getState().setSelection([]));
  await fire(lockedRow, 'click');
  check('a locked row is not selected by a click', useUiStore.getState().selection.length === 0);

  // An unlocked row in the same list still moves, so the refusal is targeted.
  await fire(rows()[0], 'keydown', { key: 'ArrowDown' });
  check('an unlocked row still moves', store.getState().doc !== before.doc);
}

/* ----------------------------------------------------------------- summary -- */

await unmount();

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL LAYERS DOCK TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
