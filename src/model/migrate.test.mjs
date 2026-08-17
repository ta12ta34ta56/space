import assert from 'node:assert/strict';
import {
  CURRENT_SCHEMA_VERSION,
  DocumentInvariantError,
  DocumentParseError,
  MIGRATIONS,
  assertValidDocument,
  createDocument,
  migrate,
} from './model.built.mjs';
import { createDocStore } from '../state/doc-store.built.mjs';
import { store } from '../state/store.built.mjs';

/* ---------------------------------------------------------------- helpers -- */

const CREATED_AT = 1_700_000_000_000;

function counterIds(prefix = 'id') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function makeDoc(pageCount = 2) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
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

/** A raw v1 record with one text element on page 0, in serialised form. */
function v1Raw() {
  const doc = makeDoc(1);
  const withContent = {
    ...doc,
    pages: [{ ...doc.pages[0], elements: [textElement('el-1')] }],
  };
  return JSON.parse(JSON.stringify({ ...withContent, schemaVersion: 1 }));
}

/* ------------------------------------------------------- the chain itself -- */

console.log('\n=== the migration chain holds exactly the no-op v1 -> v2 step ===');
{
  assert.equal(CURRENT_SCHEMA_VERSION, 2, 'this build writes schema version 2');
  assert.equal(MIGRATIONS.length, 1, 'exactly one migration step exists');

  const step = MIGRATIONS[0];
  assert.equal(step.from, 1);
  assert.equal(step.to, 2);

  // The step is a deliberate no-op: it changes the version and nothing else.
  const before = { a: 1, schemaVersion: 1, pages: [] };
  assert.deepEqual(step.up(before), { a: 1, schemaVersion: 2, pages: [] }, 'v2 is intentionally identical to v1');
  assert.deepEqual(before, { a: 1, schemaVersion: 1, pages: [] }, 'the step does not mutate its input');
}
console.log('PASS migration chain');

/* -------------------------------------------------------------- version 1 -- */

console.log('\n=== a v1 document loads and comes out at v2 ===');
{
  const raw = v1Raw();
  assert.equal(raw.schemaVersion, 1);

  const migrated = migrate(raw);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION, 'v1 is upgraded to v2');
  assert.equal(migrated.pages[0].elements[0].id, 'el-1', 'content survives the upgrade');
  assertValidDocument(migrated);
}
console.log('PASS migrate v1 -> v2');

/* -------------------------------------------------------------- version 2 -- */

console.log('\n=== a v2 document is unchanged ===');
{
  const doc = makeDoc(2);
  const raw = JSON.parse(JSON.stringify(doc));
  assert.equal(raw.schemaVersion, CURRENT_SCHEMA_VERSION);

  const migrated = migrate(raw);
  assert.deepEqual(migrated, doc, 'a current-version document passes through unchanged');
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
}
console.log('PASS migrate v2 unchanged');

/* --------------------------------------------------------- future version -- */

console.log('\n=== a future schemaVersion is refused with the version named ===');
{
  const raw = v1Raw();
  raw.schemaVersion = 99;

  assert.throws(
    () => migrate(raw),
    (error) => {
      assert.ok(error instanceof DocumentParseError, 'expected a DocumentParseError');
      assert.match(error.message, /99/, 'the message names the version');
      assert.match(error.message, /newer version of Novelka/, 'the message says why it refused');
      return true;
    },
    'schema version 99 is refused, never opened optimistically',
  );
}
console.log('PASS future version refused');

/* -------------------------------------------------------- missing version -- */

console.log('\n=== a missing schemaVersion is refused, not assumed to be v1 ===');
{
  const raw = v1Raw();
  delete raw.schemaVersion;

  assert.throws(
    () => migrate(raw),
    (error) => {
      assert.ok(error instanceof DocumentParseError, 'expected a DocumentParseError');
      assert.match(error.message, /schemaVersion: is missing/, 'the message says the version is missing');
      return true;
    },
    'a version-less document is refused',
  );
}
console.log('PASS missing version refused');

/* ----------------------------------------- migrates, then fails validation -- */

console.log('\n=== a document that migrates but fails assertValidDocument throws, nothing stored ===');
{
  // Structurally fine (so it parses), but it breaks an invariant: a page
  // carrying two elements with the same id. migrate must refuse it.
  const raw = v1Raw();
  raw.pages[0].elements = [textElement('dup'), textElement('dup')];

  assert.throws(
    () => migrate(raw),
    (error) => {
      assert.ok(error instanceof DocumentInvariantError, 'expected a DocumentInvariantError');
      assert.match(error.message, /duplicate id/, 'the invariant breach is named');
      return true;
    },
    'migrate refuses a document that breaks an invariant',
  );

  // And the store refuses it too, before touching anything.
  const snapshot = { doc: store.getState().doc, past: store.getState().past, future: store.getState().future };
  // The store bundles its own copy of the model, so the error is matched by
  // name, not instanceof — the same convention the doc-store tests use.
  assert.throws(
    () => store.getState().load(raw),
    (error) => {
      assert.ok(
        error.name === 'DocumentParseError' || error.name === 'DocumentInvariantError',
        `expected a model error, got ${error.name}`,
      );
      return true;
    },
    'store.load refuses a broken document',
  );
  assert.equal(store.getState().doc, snapshot.doc, 'nothing is stored on a rejected load');
  assert.equal(store.getState().past, snapshot.past);
  assert.equal(store.getState().future, snapshot.future);
}
console.log('PASS failed migration stores nothing');

/* ------------------------------------------------------- store.load clears -- */

console.log('\n=== store.load replaces the document and clears past and future ===');
{
  // Start from a known book so the singleton's state is predictable.
  const start = makeDoc(2);
  store.getState().load(start);
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().future.length, 0);

  let tick = CREATED_AT;
  const dispatch = (cmd) => {
    tick += 1000;
    store.getState().dispatch(cmd, tick);
  };

  dispatch({ t: 'book/setTitle', title: 'One' });
  dispatch({ t: 'book/setTitle', title: 'Two' });
  dispatch({ t: 'book/setTitle', title: 'Three' });
  assert.equal(store.getState().past.length, 3, 'three dispatches, three history entries');
  assert.equal(store.getState().doc.meta.title, 'Three');

  const opened = makeDoc(3);
  store.getState().load(opened);

  assert.deepEqual(store.getState().doc, opened, 'the loaded document becomes the live document');
  assert.equal(store.getState().past.length, 0, 'load clears the undo history');
  assert.equal(store.getState().future.length, 0, 'load clears the redo history');

  // Undoing past the moment of opening is meaningless, so undo is a no-op.
  store.getState().undo();
  assert.deepEqual(store.getState().doc, opened, 'undo after load does nothing');
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().future.length, 0);

  // Loading is not a Command: a store built separately is unaffected by the
  // singleton's history, and the Command union has no load member.
  const fresh = createDocStore(makeDoc(1));
  assert.deepEqual(
    Object.keys(fresh.getState()).sort(),
    ['dispatch', 'doc', 'future', 'jumpTo', 'load', 'past', 'redo', 'undo'],
    'the store surface gained exactly load',
  );
}
console.log('PASS store.load');

console.log('\nALL MIGRATE TESTS PASSED');
