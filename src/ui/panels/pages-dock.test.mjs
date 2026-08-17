/**
 * Unit 07 — the Pages dock (spec 07, pages-dock.test.mjs).
 *
 * jsdom, with real event handlers, because this panel is about behaviour.
 * Proves:
 *  - one row per page, in document order
 *  - selecting a row updates ui-store and never touches doc (by reference)
 *  - reorder dispatches exactly one page/reorder, and the order matches
 *  - duplicate and delete dispatch the right Command with the right ids
 *  - an insert gutter dispatches page/add at the correct index
 *  - deleting below 24 pages is refused, with a reason, and doc is unchanged
 *  - the severity dot renders when severity is supplied, and nothing when not
 *  - the cover row shows a spine width from coverSpecFor
 */

import { createHarness } from '../../../test/helpers/react-dom-harness.mjs';

const harness = await createHarness();
const { document: dom, createElement, mount, fire, run, unmount } = harness;

// One bundle, code-split, so every module below shares ONE copy of the store
// singleton. Bundling each entry point separately would give the panel a
// different store than the test asserts against.
const { store } = await import('../../../.test-build/state/store.built.mjs');
const { useUiStore } = await import('../../../.test-build/state/ui-store.built.mjs');
const { createDocument } = await import('../../../.test-build/model/index.built.mjs');
const { coverSpecFor } = await import('../../../.test-build/print/index.built.mjs');
const { PagesTab } = await import('../../../.test-build/ui/panels/PagesTab.built.mjs');

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
let idCounter = 0;
const newId = () => `new-${(idCounter += 1)}`;
const now = () => CREATED_AT;

async function loadBook(pageCount, { cover = false } = {}) {
  let n = 0;
  const doc = createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount,
    now: () => CREATED_AT,
    id: () => `p-${(n += 1)}`,
  });
  const withCover = cover
    ? { ...doc, cover: { id: 'cover-1', role: 'cover', elements: [], locked: false } }
    : doc;
  await run(() => {
    store.getState().load(withCover);
    useUiStore.getState().setCurrentPageIndex(0);
  });
  return withCover;
}

const renderPanel = async (props = {}) =>
  mount(createElement(PagesTab, { newId, now, ...props }));

const rows = () => [...dom.querySelectorAll('.dockpage:not(.is-cover)')];

/* ------------------------------------------- one row per page, in order -- */

console.log('=== one row per page, in document order ===');
{
  await loadBook(30);
  await renderPanel();

  const ids = rows().map((row) => row.dataset.pageId);
  check('one row per page', ids.length === 30, `found ${ids.length}`);
  check(
    'rows are in document order',
    ids.every((id, index) => id === `p-${index + 1}`),
    ids.slice(0, 4).join(','),
  );

  const names = rows().map((row) => row.querySelector('.dockpage-name').textContent);
  check('rows are numbered from 1', names[0] === 'Page 1' && names[29] === 'Page 30');

  const sides = rows().map((row) => row.querySelector('.dockpage-side').textContent);
  check('odd pages are recto, even are verso', sides[0] === 'Odd' && sides[1] === 'Even');
}

/* ------------------------- selecting a row never touches the Document -- */

console.log('\n=== selecting a row updates ui-store and never touches doc ===');
{
  await loadBook(30);
  await renderPanel();

  const before = store.getState();
  await fire(rows()[4], 'click');

  check('ui-store moved to the clicked page', useUiStore.getState().currentPageIndex === 4);
  check('doc is the same object reference', store.getState().doc === before.doc);
  check('past is the same object reference', store.getState().past === before.past);
  check('future is the same object reference', store.getState().future === before.future);

  // The keyboard equivalent selects too.
  await fire(rows()[7], 'keydown', { key: 'Enter' });
  check('Enter opens the focused row', useUiStore.getState().currentPageIndex === 7);
  check('and still never touches doc', store.getState().doc === before.doc);
}

/* --------------------------------------- reorder is exactly one command -- */

console.log('\n=== reorder dispatches exactly one page/reorder, and the order matches ===');
{
  await loadBook(30);
  await renderPanel();

  const before = store.getState();
  const beforeIds = before.doc.pages.map((page) => page.id);

  // The keyboard equivalent of grab-reorder: move page 3 up one place.
  await fire(rows()[2], 'keydown', { key: 'ArrowUp' });

  const after = store.getState();
  check('exactly one history entry was added', after.past.length === before.past.length + 1);
  check('the entry is labelled as a reorder', after.past.at(-1).label === 'Reorder pages');

  const afterIds = after.doc.pages.map((page) => page.id);
  const expected = [...beforeIds];
  const [moved] = expected.splice(2, 1);
  expected.splice(1, 0, moved);
  check('the resulting order matches the move', afterIds.join(',') === expected.join(','));

  // One Ctrl+Z puts it back, which is what "one undo entry" means.
  await run(() => store.getState().undo());
  check(
    'one undo restores the original order',
    store.getState().doc.pages.map((page) => page.id).join(',') === beforeIds.join(','),
  );

  // Moving the first row up is not a move, so it is not an undo entry.
  const quiet = store.getState().past.length;
  await fire(rows()[0], 'keydown', { key: 'ArrowUp' });
  check('moving the first row up produces no history entry', store.getState().past.length === quiet);
}

/* ----------------------------------------- duplicate and delete commands -- */

console.log('\n=== duplicate and delete dispatch the right Command with the right ids ===');
{
  await loadBook(30);
  await renderPanel();

  const targetId = store.getState().doc.pages[3].id;
  const beforeCount = store.getState().doc.pages.length;

  const duplicate = rows()[3].querySelector('[aria-label="Duplicate page"]');
  check('every row offers Duplicate page', duplicate !== null);
  await fire(duplicate, 'click');

  const afterDuplicate = store.getState();
  check('duplicate added one page', afterDuplicate.doc.pages.length === beforeCount + 1);
  check('duplicate is labelled correctly', afterDuplicate.past.at(-1).label === 'Duplicate page');
  check(
    'the copy sits immediately after its original',
    afterDuplicate.doc.pages[3].id === targetId && afterDuplicate.doc.pages[4].id.startsWith('new-'),
  );

  const deleteId = store.getState().doc.pages[6].id;
  await fire(rows()[6].querySelector('[aria-label="Delete page"]'), 'click');

  const afterDelete = store.getState();
  check('delete removed exactly that page', !afterDelete.doc.pages.some((p) => p.id === deleteId));
  check('delete removed exactly one page', afterDelete.doc.pages.length === beforeCount);
  check('delete is labelled correctly', afterDelete.past.at(-1).label === 'Delete pages');
}

/* ---------------------------------------- insert gutter adds at an index -- */

console.log('\n=== an insert gutter dispatches page/add at the correct index ===');
{
  await loadBook(30);
  await renderPanel();

  const gutters = [...dom.querySelectorAll('.dockpage-insert')];
  check('there is one insert gutter per row', gutters.length === 30, `found ${gutters.length}`);
  check(
    'the gutter names the position it inserts after',
    gutters[2].getAttribute('aria-label') === 'Insert a page after position 3',
  );

  const button = gutters[2].querySelector('.dockpage-insert-btn');
  check(
    'the insert button carries the legacy label',
    button.getAttribute('aria-label') === 'Insert a page after this one',
  );

  const beforeIds = store.getState().doc.pages.map((page) => page.id);
  await fire(button, 'click');

  const afterIds = store.getState().doc.pages.map((page) => page.id);
  check('one page was added', afterIds.length === beforeIds.length + 1);
  check('it landed directly after row 3', afterIds[3].startsWith('new-'));
  check('the pages either side are untouched', afterIds[2] === beforeIds[2] && afterIds[4] === beforeIds[3]);
  check('it is labelled as an add', store.getState().past.at(-1).label === 'Add page');

  // "Add page" at the foot appends.
  await fire(dom.querySelector('.dockpage-addlink'), 'click');
  const appended = store.getState().doc.pages;
  check('Add page appends to the end', appended.at(-1).id.startsWith('new-'));
}

/* ---------------------------- deleting below the KDP minimum is refused -- */

console.log('\n=== deleting below 24 pages is refused with a reason, and doc is unchanged ===');
{
  await loadBook(24);
  await renderPanel();

  const before = store.getState();
  await fire(rows()[0].querySelector('[aria-label="Delete page"]'), 'click');

  const after = store.getState();
  check('the Document is unchanged, by reference', after.doc === before.doc);
  check('no history entry was created', after.past === before.past);

  const refusal = dom.querySelector('.dockpage-refusal');
  check('a reason is shown, not silence', refusal !== null);
  const text = refusal?.textContent ?? '';
  check('the reason names the limit', text.includes('24'), text);
  check('the reason says what to do instead', /Add a page/.test(text), text);
  check('the reason has no em dash', !text.includes('\u2014'));

  // At 25 pages the same click is allowed, so the rule is a limit, not a ban.
  await loadBook(25);
  await renderPanel();
  const allowed = store.getState().doc;
  await fire(rows()[0].querySelector('[aria-label="Delete page"]'), 'click');
  check('at 25 pages the delete goes through', store.getState().doc !== allowed);
  check('leaving exactly the minimum', store.getState().doc.pages.length === 24);
}

/* -------------------------------------------------- the severity dot -- */

console.log('\n=== the severity dot renders when supplied, and nothing when it is not ===');
{
  await loadBook(30);
  await renderPanel();

  check(
    'with no preflight data, no dot renders anywhere',
    dom.querySelectorAll('.dockpage-dot').length === 0,
  );
  check(
    'and no row is tinted with a severity',
    dom.querySelectorAll('.dockpage.sev-err, .dockpage.sev-warn').length === 0,
  );

  const ids = store.getState().doc.pages.map((page) => page.id);
  await renderPanel({ severity: { [ids[1]]: 'error', [ids[2]]: 'warn' } });

  const dots = [...dom.querySelectorAll('.dockpage-dot')];
  check('one dot per page with a severity', dots.length === 2, `found ${dots.length}`);
  check('an error dot carries the err class', dots[0].classList.contains('err'));
  check('a warning dot carries the warn class', dots[1].classList.contains('warn'));
  check(
    'the dot explains itself',
    dots[0].getAttribute('title') === 'This page has preflight errors' &&
      dots[1].getAttribute('title') === 'This page has preflight warnings',
  );
  check('the row border matches the severity', rows()[1].classList.contains('sev-err'));
  check('the warning row matches too', rows()[2].classList.contains('sev-warn'));
}

/* ------------------------------------------- the cover row and its spine -- */

console.log('\n=== the cover row shows a spine width from coverSpecFor ===');
{
  await loadBook(120, { cover: true });
  await renderPanel();

  const cover = dom.querySelector('.dockpage.is-cover');
  check('the cover row renders when the book has a cover', cover !== null);
  check('the cover is not numbered with the interior', cover.querySelector('.dockpage-name').textContent === 'Cover');

  const expected = coverSpecFor('6x9', 'bw-white', 120, 'paperback');
  const shown = cover.querySelector('.dockpage-side').textContent;
  check(
    'the spine width comes from coverSpecFor',
    shown === `Spine ${expected.spineIn.toFixed(3)}"`,
    `${shown} vs ${expected.spineIn.toFixed(3)}`,
  );
  check('the spine width carries its unit', /"$/.test(shown));
  check('the interior rows are still numbered from 1', rows()[0].querySelector('.dockpage-name').textContent === 'Page 1');

  // A book with no cover shows no cover row: nothing is invented.
  await loadBook(30);
  await renderPanel();
  check('no cover, no cover row', dom.querySelector('.dockpage.is-cover') === null);
}

/* ----------------------------------------------------------------- summary -- */

await unmount();

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL PAGES DOCK TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
