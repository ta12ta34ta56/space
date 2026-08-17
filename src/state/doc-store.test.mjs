import assert from 'node:assert/strict';
import { createDocument } from '../model/model.built.mjs';
import { HISTORY_LIMIT, createDocStore, labelFor } from './doc-store.built.mjs';

/* ---------------------------------------------------------------- helpers -- */

function counterIds(prefix = 'p') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

const CREATED_AT = 1_700_000_000_000;

function makeDoc(pageCount = 4) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount,
    now: () => CREATED_AT,
    id: counterIds(),
  });
}

function textElement(id) {
  return {
    id,
    kind: 'text',
    type: 'text',
    frame: { xIn: 0.5, yIn: 0.75, wIn: 4.5, hIn: 6.25 },
    z: 0,
    hidden: false,
    locked: false,
    text: 'Chapter One',
    style: {
      fontFamily: 'Merriweather',
      fontSizePt: 11,
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      colorHex: '#111827',
    },
  };
}

function blankPage(id) {
  return { id, kind: 'blank', role: 'interior', elements: [], locked: false };
}

function pageIds(doc) {
  return doc.pages.map((page) => page.id);
}

/** A store over a fresh document, plus a clock that ticks once per dispatch. */
function freshStore(pageCount = 4) {
  const store = createDocStore(makeDoc(pageCount));
  let tick = CREATED_AT;
  const dispatch = (cmd) => {
    tick += 1000;
    store.getState().dispatch(cmd, tick);
  };
  return { store, dispatch, get: () => store.getState() };
}

/* ---------------------------------------------------------------- basics -- */

console.log('\n=== a new store holds the document and an empty history ===');
{
  const doc = makeDoc(3);
  const store = createDocStore(doc);
  const state = store.getState();

  assert.equal(state.doc, doc, 'the document is held by reference, not copied');
  assert.deepEqual(state.past, []);
  assert.deepEqual(state.future, []);

  // The store holds the document, its history, and `load` (spec 04 §4), and
  // nothing else. Selection, zoom, panels and theme belong to ui-store
  // (architecture.md §2).
  assert.deepEqual(
    Object.keys(state).sort(),
    ['dispatch', 'doc', 'future', 'jumpTo', 'load', 'past', 'redo', 'undo'],
    'no selection, zoom, panel or theme state lives in the document store',
  );

  assert.throws(
    () => createDocStore({ ...doc, id: '' }),
    /document\.id/,
    'a store cannot be built around an invalid document',
  );
}
console.log('PASS store shape');

console.log('\n=== dispatch applies the command and stamps updatedAt ===');
{
  const { dispatch, get } = freshStore(3);

  dispatch({ t: 'book/setTitle', title: 'Evening Puzzles' });

  assert.equal(get().doc.meta.title, 'Evening Puzzles');
  assert.equal(get().doc.meta.updatedAt, CREATED_AT + 1000, 'the store stamps updatedAt from the injected clock');
  assert.equal(get().doc.meta.createdAt, CREATED_AT, 'createdAt is never touched');
  assert.equal(get().past.length, 1);
  assert.equal(get().past[0].label, 'Rename book');
  assert.equal(get().past[0].doc.meta.title, '', 'history holds the state BEFORE the change');
  assert.deepEqual(get().future, []);

  assert.throws(
    () => get().dispatch({ t: 'book/setTitle', title: 'x' }, Number.NaN),
    /now must be a finite number/,
    'the clock must be a real number',
  );
}
console.log('PASS dispatch');

console.log('\n=== every command gets a plain-language history label ===');
{
  const labels = [
    [{ t: 'page/add', index: 0, page: blankPage('x') }, 'Add page'],
    [{ t: 'page/delete', ids: ['p-1'] }, 'Delete pages'],
    [{ t: 'page/reorder', from: 0, to: 1 }, 'Reorder pages'],
    [{ t: 'page/duplicate', id: 'p-1', newId: 'x' }, 'Duplicate page'],
    [{ t: 'page/setLocked', id: 'p-1', locked: true }, 'Lock page'],
    [{ t: 'element/add', pageId: 'p-1', element: textElement('e') }, 'Add element'],
    [{ t: 'element/delete', pageId: 'p-1', elementIds: ['e'] }, 'Delete elements'],
    [{ t: 'element/update', pageId: 'p-1', elementId: 'e', patch: {} }, 'Edit element'],
    [{ t: 'element/reorder', pageId: 'p-1', elementId: 'e', z: 1 }, 'Restack element'],
    [{ t: 'book/setTrim', trimId: '7x10' }, 'Change trim size'],
    [{ t: 'book/setPaper', paper: 'bw-cream' }, 'Change paper'],
    [{ t: 'book/setBinding', binding: 'paperback' }, 'Change binding'],
    [{ t: 'book/setBleed', bleed: true }, 'Change bleed'],
    [{ t: 'book/setTitle', title: 'A' }, 'Rename book'],
    [{ t: 'cover/set', cover: { id: 'c', role: 'cover', elements: [], locked: false } }, 'Add cover'],
    [{ t: 'cover/clear' }, 'Remove cover'],
  ];

  for (const [cmd, expected] of labels) {
    assert.equal(labelFor(cmd), expected, cmd.t);
    assert.equal(expected.includes('—'), false, 'no em dashes in user-facing copy');
  }
  assert.equal(labels.length, 16, 'every command in the union is labelled');
}
console.log('PASS labels');

/* ------------------------------------------------------------ undo / redo -- */

console.log('\n=== dispatch, undo, redo returns the same document ===');
{
  const { dispatch, get } = freshStore(3);

  dispatch({ t: 'page/add', index: 1, page: blankPage('added') });
  const afterDispatch = get().doc;

  get().undo();
  assert.deepEqual(pageIds(get().doc), ['p-1', 'p-2', 'p-3'], 'undo removes the page');
  assert.equal(get().past.length, 0);
  assert.equal(get().future.length, 1);
  assert.equal(get().future[0].label, 'Add page');

  get().redo();
  assert.deepEqual(get().doc, afterDispatch, 'redo returns the exact document undo left');
  assert.equal(get().doc, afterDispatch, 'and it is the same object, not a rebuilt copy');
  assert.equal(get().past.length, 1);
  assert.equal(get().future.length, 0);
}
console.log('PASS undo then redo');

console.log('\n=== five commands undone five times returns the starting document ===');
{
  const start = makeDoc(3);
  const store = createDocStore(start);
  let tick = CREATED_AT;
  const dispatch = (cmd) => {
    tick += 1000;
    store.getState().dispatch(cmd, tick);
  };

  dispatch({ t: 'book/setTitle', title: 'One' });
  dispatch({ t: 'page/add', index: 0, page: blankPage('added') });
  dispatch({ t: 'element/add', pageId: 'added', element: textElement('el-1') });
  dispatch({ t: 'element/update', pageId: 'added', elementId: 'el-1', patch: { text: 'Two' } });
  dispatch({ t: 'page/reorder', from: 0, to: 2 });

  assert.equal(store.getState().past.length, 5);

  for (let step = 0; step < 5; step += 1) store.getState().undo();

  assert.equal(store.getState().doc, start, 'the exact starting document is restored, by reference');
  assert.deepEqual(store.getState().doc, start);
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().future.length, 5);

  // Undo at the bottom of the stack is a no-op, never an error.
  store.getState().undo();
  assert.equal(store.getState().doc, start);
  assert.equal(store.getState().future.length, 5);

  // And redoing all five gets back to where it was.
  for (let step = 0; step < 5; step += 1) store.getState().redo();
  assert.deepEqual(pageIds(store.getState().doc), ['p-1', 'p-2', 'added', 'p-3']);
  assert.equal(store.getState().future.length, 0);

  store.getState().redo();
  assert.equal(store.getState().future.length, 0, 'redo at the top of the stack is a no-op');
}
console.log('PASS undo to the start');

console.log('\n=== dispatching after undo clears the future ===');
{
  const { dispatch, get } = freshStore(3);

  dispatch({ t: 'book/setTitle', title: 'One' });
  dispatch({ t: 'book/setTitle', title: 'Two' });
  get().undo();
  assert.equal(get().future.length, 1);

  dispatch({ t: 'book/setTitle', title: 'Three' });
  assert.deepEqual(get().future, [], 'a new branch discards the redo stack');
  assert.equal(get().doc.meta.title, 'Three');
  assert.equal(get().past.length, 2);
}
console.log('PASS future cleared');

/* ------------------------------------------------------- rejected commands -- */

console.log('\n=== a rejected command changes nothing ===');
{
  const { dispatch, get } = freshStore(3);
  dispatch({ t: 'book/setTitle', title: 'Before' });

  const before = { doc: get().doc, past: get().past, future: get().future };

  // Rejected by apply: the page does not exist. Matched by name rather than by
  // class, because the harness bundles the model and the store separately, so
  // each bundle carries its own CommandError constructor.
  assert.throws(
    () => get().dispatch({ t: 'element/add', pageId: 'ghost', element: textElement('e') }, 99),
    (error) => {
      assert.equal(error.name, 'CommandError');
      assert.match(error.message, /element\/add: no page with id "ghost"/);
      return true;
    },
    'an unknown page id is refused',
  );
  assert.equal(get().doc, before.doc, 'doc is untouched, by reference');
  assert.equal(get().past, before.past, 'past is untouched, by reference');
  assert.equal(get().future, before.future, 'future is untouched, by reference');

  // Rejected by assertValidDocument: the command is well formed, the result is
  // not a legal document. Nothing is stored, so no half-applied state exists.
  get().dispatch({ t: 'element/add', pageId: 'p-1', element: textElement('el-1') }, 100);
  const good = get().doc;
  assert.throws(
    () => get().dispatch({ t: 'element/add', pageId: 'p-2', element: textElement('el-1') }, 101),
    /duplicate id/,
    'a duplicate element id is refused',
  );
  assert.equal(get().doc, good, 'the last good document survives');
  assert.equal(get().past.length, 2, 'no history entry is written for a rejected command');

  // Undo still works afterwards: the store was never left in a partial state.
  get().undo();
  assert.equal(get().doc.meta.title, 'Before');
}
console.log('PASS rejected commands');

/* ---------------------------------------------------------------- capping -- */

console.log('\n=== past never exceeds 50 entries ===');
{
  assert.equal(HISTORY_LIMIT, 50);

  const { dispatch, get } = freshStore(2);
  for (let index = 0; index < 60; index += 1) {
    dispatch({ t: 'book/setTitle', title: `Title ${index}` });
  }

  assert.equal(get().past.length, HISTORY_LIMIT, 'the stack is capped');
  assert.equal(
    get().past[0].doc.meta.title,
    'Title 9',
    'the oldest entries are dropped, the newest 50 are kept',
  );
  assert.equal(get().past[HISTORY_LIMIT - 1].doc.meta.title, 'Title 58');
  assert.equal(get().doc.meta.title, 'Title 59');

  // Undoing 50 times reaches the oldest state still held, and stops there.
  for (let index = 0; index < 60; index += 1) get().undo();
  assert.equal(get().doc.meta.title, 'Title 9');
  assert.equal(get().past.length, 0);
  assert.equal(get().future.length, HISTORY_LIMIT);

  // Redo is capped too.
  for (let index = 0; index < HISTORY_LIMIT; index += 1) get().redo();
  assert.equal(get().past.length, HISTORY_LIMIT);
  assert.equal(get().doc.meta.title, 'Title 59');
}
console.log('PASS history cap');

/* ----------------------------------------------------------------- jumpTo -- */

console.log('\n=== jumpTo lands where repeated undo would (D24.1) ===');
{
  const commands = [
    { t: 'book/setTitle', title: 'One' },
    { t: 'page/add', index: 0, page: blankPage('added') },
    { t: 'element/add', pageId: 'added', element: textElement('el-1') },
    { t: 'book/setPaper', paper: 'bw-cream' },
    { t: 'page/reorder', from: 0, to: 2 },
  ];

  for (let target = 0; target < commands.length; target += 1) {
    const byJump = freshStore(3);
    const byUndo = freshStore(3);
    for (const cmd of commands) {
      byJump.dispatch(cmd);
      byUndo.dispatch(cmd);
    }

    byJump.get().jumpTo(target);
    for (let step = commands.length - target; step > 0; step -= 1) byUndo.get().undo();

    assert.deepEqual(
      byJump.get().doc,
      byUndo.get().doc,
      `jumpTo(${target}) reaches the same document as ${commands.length - target} undos`,
    );
    assert.deepEqual(
      byJump.get().past.map((entry) => entry.label),
      byUndo.get().past.map((entry) => entry.label),
      `jumpTo(${target}) leaves the same past`,
    );
    assert.deepEqual(
      byJump.get().future.map((entry) => entry.label),
      byUndo.get().future.map((entry) => entry.label),
      `jumpTo(${target}) leaves the same future`,
    );
    assert.deepEqual(
      byJump.get().future.map((entry) => entry.doc),
      byUndo.get().future.map((entry) => entry.doc),
      `jumpTo(${target}) leaves the same redo documents`,
    );
  }
}
console.log('PASS jumpTo');

console.log('\n=== jumpTo out of range does nothing ===');
{
  const { dispatch, get } = freshStore(3);
  dispatch({ t: 'book/setTitle', title: 'One' });
  dispatch({ t: 'book/setTitle', title: 'Two' });

  const before = { doc: get().doc, past: get().past, future: get().future };
  for (const index of [-1, 2, 99, 1.5, Number.NaN]) {
    get().jumpTo(index);
    assert.equal(get().doc, before.doc, `jumpTo(${String(index)}) leaves doc alone`);
    assert.equal(get().past, before.past, `jumpTo(${String(index)}) leaves past alone`);
    assert.equal(get().future, before.future, `jumpTo(${String(index)}) leaves future alone`);
  }

  // And a jump followed by redo returns to the newest state.
  get().jumpTo(0);
  assert.equal(get().doc.meta.title, '');
  get().redo();
  get().redo();
  assert.equal(get().doc.meta.title, 'Two');
}
console.log('PASS jumpTo bounds');

/* ------------------------------------------------------- one gesture, one entry -- */

console.log('\n=== one dispatch is one undo entry, with no coalescing ===');
{
  const { dispatch, get } = freshStore(3);
  dispatch({ t: 'element/add', pageId: 'p-1', element: textElement('el-1') });

  // A drag that committed three times would be three entries. The store never
  // merges them and never reads the clock to decide (spec 02 §3): the UI is
  // responsible for dispatching once, when the gesture ends.
  for (const xIn of [1, 2, 3]) {
    dispatch({
      t: 'element/update',
      pageId: 'p-1',
      elementId: 'el-1',
      patch: { frame: { xIn, yIn: 0.75, wIn: 4.5, hIn: 6.25 } },
    });
  }

  assert.equal(get().past.length, 4, 'four dispatches, four entries');
  get().undo();
  assert.equal(get().doc.pages[0].elements[0].frame.xIn, 2, 'undo steps back exactly one dispatch');
}
console.log('PASS undo granularity');

console.log('\nALL DOC STORE TESTS PASSED');
