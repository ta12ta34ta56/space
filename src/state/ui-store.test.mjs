/**
 * Unit 06 — the ephemeral UI store (spec 06, ui-store.test.mjs).
 *
 * Proves the two-store split holds:
 *  - guide visibility, zoom and selection live in ui-store, not the Document —
 *    the key sets are disjoint
 *  - toggling a guide does not touch doc, past or future (by reference)
 */

import assert from 'node:assert/strict';
import { createDocument } from '../model/model.built.mjs';
import { GUIDE_KINDS } from '../print/print.built.mjs';
import { createDocStore } from './doc-store.built.mjs';
import { useUiStore, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS } from './ui-store.built.mjs';

let n = 0;
const id = () => `id-${n++}`;
const doc = createDocument({
  trimId: '6x9',
  paper: 'bw-white',
  binding: 'paperback',
  pageCount: 4,
  now: () => 1000,
  id,
});

/* ------------------------------------------- the key sets are disjoint -- */

console.log('=== ui state and Document state share no keys ===');
{
  const uiKeys = Object.keys(useUiStore.getState());
  const docKeys = Object.keys(doc);

  // No ui-store key may appear in the Document, and vice versa. This is the
  // architecture §2 rule made mechanical: selection, zoom and guide
  // visibility can never become undoable, autosaved document changes.
  const overlap = uiKeys.filter((k) => docKeys.includes(k));
  assert.deepEqual(overlap, [], `ui-store and Document share keys: ${overlap.join(', ')}`);

  // The spec names these three explicitly.
  for (const key of ['zoom', 'visibleGuides', 'selection', 'bleedOn', 'currentPageIndex', 'activePanel']) {
    assert.ok(uiKeys.includes(key), `${key} is in ui-store`);
    assert.ok(!docKeys.includes(key), `${key} is not in the Document`);
  }
}
console.log('PASS key sets are disjoint');

/* -------------------------- toggling a guide never touches the doc store -- */

console.log('\n=== toggling a guide does not touch doc, past or future ===');
{
  const docStore = createDocStore(doc);
  docStore.getState().dispatch(
    {
      t: 'page/add',
      index: 0,
      page: { id: 'p-new', kind: 'blank', role: 'interior', elements: [], locked: false },
    },
    2000,
  );

  const before = docStore.getState();
  const { doc: docBefore, past: pastBefore, future: futureBefore } = before;

  for (const kind of GUIDE_KINDS) {
    useUiStore.getState().toggleGuide(kind);
  }
  useUiStore.getState().toggleBleed();
  useUiStore.getState().setZoom(1.5);
  useUiStore.getState().setCurrentPageIndex(2);

  const after = docStore.getState();
  assert.equal(after.doc, docBefore, 'doc is the same reference');
  assert.equal(after.past, pastBefore, 'past is the same reference');
  assert.equal(after.future, futureBefore, 'future is the same reference');
}
console.log('PASS doc store untouched by ui changes');

/* --------------------------------------------- guides toggle independently -- */

console.log('\n=== each guide toggles independently ===');
{
  // Reset to a known state: everything visible.
  for (const kind of GUIDE_KINDS) {
    if (!useUiStore.getState().visibleGuides[kind]) useUiStore.getState().toggleGuide(kind);
  }

  for (const kind of GUIDE_KINDS) {
    const before = { ...useUiStore.getState().visibleGuides };
    useUiStore.getState().toggleGuide(kind);
    const afterToggle = useUiStore.getState().visibleGuides;

    assert.equal(afterToggle[kind], !before[kind], `${kind} flipped`);
    for (const other of GUIDE_KINDS) {
      if (other === kind) continue;
      assert.equal(afterToggle[other], before[other], `${kind}: ${other} unchanged`);
    }
    useUiStore.getState().toggleGuide(kind);
  }
}
console.log('PASS guides toggle independently');

/* ----------------------------------------------------------- zoom bounds -- */

console.log('\n=== zoom clamps and walks the ladder ===');
{
  useUiStore.getState().setZoom(99);
  assert.equal(useUiStore.getState().zoom, ZOOM_MAX, 'zoom clamps to the maximum');
  useUiStore.getState().setZoom(0);
  assert.equal(useUiStore.getState().zoom, ZOOM_MIN, 'zoom clamps to the minimum');
  useUiStore.getState().setZoom(Number.NaN);
  assert.equal(useUiStore.getState().zoom, ZOOM_MIN, 'a non-finite zoom is ignored');

  useUiStore.getState().setZoom(1);
  useUiStore.getState().zoomIn();
  assert.equal(useUiStore.getState().zoom, ZOOM_STEPS[ZOOM_STEPS.indexOf(1) + 1], 'zoomIn steps up the ladder');
  useUiStore.getState().setZoom(1);
  useUiStore.getState().zoomOut();
  assert.equal(useUiStore.getState().zoom, ZOOM_STEPS[ZOOM_STEPS.indexOf(1) - 1], 'zoomOut steps down the ladder');

  useUiStore.getState().setCurrentPageIndex(-3);
  assert.notEqual(useUiStore.getState().currentPageIndex, -3, 'a negative page index is ignored');
}
console.log('PASS zoom bounds');

console.log('\nALL UI-STORE TESTS PASSED');
