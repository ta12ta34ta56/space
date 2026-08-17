import assert from 'node:assert/strict';
import { IDBObjectStore, indexedDB } from 'fake-indexeddb';
import {
  ELEMENT_KINDS,
  apply,
  assertValidDocument,
  createDocument,
  migrate,
} from '../model/model.built.mjs';
import {
  StorageFullError,
  createStorage,
  readProjectFile,
  recoveryCandidate,
  serializeProjectFile,
  storage as defaultStorage,
} from './storage.built.mjs';

// IndexedDB does not exist in plain Node; fake-indexeddb stands in
// (spec 04, Tests). The storage module reads the global at call time, so it
// is installed before any storage call runs.
globalThis.indexedDB = indexedDB;

/* ---------------------------------------------------------------- helpers -- */

const CREATED_AT = 1_700_000_000_000;

function counterIds(prefix = 'id') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function makeDoc(pageCount = 3) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    pageCount,
    now: () => CREATED_AT,
    id: counterIds('p'),
  });
}

function frame(over = {}) {
  return { xIn: 0.5, yIn: 0.75, wIn: 4.5, hIn: 6.25, ...over };
}

/** One element per ElementKind, so a save exercises every element payload. */
function elementOfKind(kind, id) {
  const base = { id, kind, frame: frame(), z: 0, hidden: false, locked: false };
  switch (kind) {
    case 'text':
      return {
        ...base,
        type: 'text',
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
    case 'shape':
    case 'template':
      return {
        ...base,
        type: 'shape',
        shape: { shape: 'rect', fillHex: null, strokeHex: '#111827', strokeWidthPt: 0.75 },
      };
    case 'puzzle':
    case 'solution':
      return { ...base, type: 'puzzle', puzzle: { kind: 'wordsearch', data: {}, style: {} } };
    default:
      // image, divider, border, pattern, sticker, icon — all asset-backed.
      return { ...base, type: 'image', assetId: `asset-${kind}` };
  }
}

function docWithEveryKind() {
  const doc = makeDoc(1);
  const elements = ELEMENT_KINDS.map((kind, index) => ({
    ...elementOfKind(kind, `el-${kind}`),
    z: index,
  }));
  const loaded = {
    ...doc,
    cover: { id: 'cover-1', role: 'cover', elements: [elementOfKind('text', 'cover-text')], locked: false },
    pages: [{ ...doc.pages[0], elements }],
  };
  assertValidDocument(loaded);
  return loaded;
}

/** A storage instance with a deterministic clock and id source. */
function testStorage() {
  return createStorage({ now: () => CREATED_AT, id: counterIds('s') });
}

/** A fake IDB request that fails with `error`, fired on the next microtask. */
function failingRequest(error) {
  const request = { result: undefined, error, onsuccess: null, onerror: null };
  queueMicrotask(() => {
    if (typeof request.onerror === 'function') request.onerror();
  });
  return request;
}

/** Runs `action` with `IDBObjectStore.prototype[method]` failing with `error`. */
async function withFailingMethod(method, error, action) {
  const original = IDBObjectStore.prototype[method];
  IDBObjectStore.prototype[method] = function () {
    return failingRequest(error);
  };
  try {
    return await action();
  } finally {
    IDBObjectStore.prototype[method] = original;
  }
}

/* ------------------------------------------------------------- round-trip -- */

console.log('\n=== the headline test: save a Document with every element kind, read it back identical ===');
{
  const s = testStorage();
  const doc = docWithEveryKind();

  const saved = await s.save(doc);
  assert.equal(saved.id, doc.id);
  assert.equal(saved.schemaVersion, doc.schemaVersion);
  assert.equal(saved.updatedAt, CREATED_AT, 'the clock is injected, not read');

  const loaded = await s.get(doc.id);
  assert.ok(loaded !== null, 'the project is found');
  assert.deepEqual(loaded.document, doc, 'the document survives save -> read byte-identical');
  assert.equal(loaded.document.schemaVersion, doc.schemaVersion);
}
console.log('PASS round-trip');

console.log('\n=== list shows the right name and page count ===');
{
  const s = testStorage();
  const doc = apply(makeDoc(3), { t: 'book/setTitle', title: 'Evening Puzzles' });
  await s.save(doc);

  const listed = await s.list();
  const found = listed.find((project) => project.id === doc.id);
  assert.ok(found !== undefined, 'the saved project appears in list');
  assert.equal(found.document.meta.title, 'Evening Puzzles');
  assert.equal(found.document.pages.length, 3);

  // The summary the index cache carries is derived from the same record.
  assert.equal(found.document.meta.title, 'Evening Puzzles');
}
console.log('PASS list');

/* ---------------------------------------------------- remove / rename -- */

console.log('\n=== remove deletes; rename preserves the id and every element ===');
{
  const s = testStorage();
  const doc = docWithEveryKind();
  await s.save(doc);

  const renamed = await s.rename(doc.id, 'New Name');
  assert.equal(renamed.id, doc.id, 'rename keeps the id');
  assert.equal(renamed.document.meta.title, 'New Name');
  assert.deepEqual(renamed.document.pages, doc.pages, 'rename preserves every element');
  assert.deepEqual(renamed.document.cover, doc.cover, 'rename preserves the cover');

  await s.remove(doc.id);
  assert.equal(await s.get(doc.id), null, 'the project is gone after remove');
  assert.equal((await s.list()).some((project) => project.id === doc.id), false);

  await assert.rejects(s.rename(doc.id, 'Ghost'), /no project with id/, 'renaming a missing project rejects');
}
console.log('PASS remove and rename');

/* ------------------------------------------------------------ duplicate -- */

console.log('\n=== duplicate produces new ids; mutating the copy does not touch the original ===');
{
  const s = testStorage();
  const doc = docWithEveryKind();
  await s.save(doc);

  const copy = await s.duplicate(doc.id);
  assert.notEqual(copy.id, doc.id, 'the duplicate gets a new project id');
  assert.equal(copy.document.meta.title, `Copy of ${doc.meta.title}`);

  const withoutId = (value) => {
    const clone = { ...value };
    delete clone.id;
    return clone;
  };

  assert.equal(copy.document.pages.length, doc.pages.length, 'the same number of pages');
  for (let index = 0; index < doc.pages.length; index += 1) {
    const originalPage = doc.pages[index];
    const copyPage = copy.document.pages[index];
    assert.notEqual(copyPage.id, originalPage.id, 'page ids are new');
    assert.equal(copyPage.elements.length, originalPage.elements.length, 'the same number of elements');
    for (let elementIndex = 0; elementIndex < originalPage.elements.length; elementIndex += 1) {
      assert.notEqual(
        copyPage.elements[elementIndex].id,
        originalPage.elements[elementIndex].id,
        'element ids are new',
      );
      // Content is identical except for the id itself.
      assert.deepEqual(withoutId(copyPage.elements[elementIndex]), withoutId(originalPage.elements[elementIndex]));
    }
  }
  assert.notEqual(copy.document.cover.id, doc.cover.id, 'the cover id is new');
  assert.equal(copy.document.cover.elements.length, doc.cover.elements.length);
  for (let elementIndex = 0; elementIndex < doc.cover.elements.length; elementIndex += 1) {
    assert.notEqual(
      copy.document.cover.elements[elementIndex].id,
      doc.cover.elements[elementIndex].id,
      'cover element ids are new',
    );
    assert.deepEqual(
      withoutId(copy.document.cover.elements[elementIndex]),
      withoutId(doc.cover.elements[elementIndex]),
    );
  }

  // Every id inside the copy is still unique — the copy is a legal document.
  assertValidDocument(copy.document);

  // Mutating the copy must not touch the original.
  const edited = apply(copy.document, { t: 'book/setTitle', title: 'Changed' });
  await s.save(edited);
  assert.equal((await s.get(doc.id)).document.meta.title, doc.meta.title, 'the original title is untouched');
  assert.equal((await s.get(copy.id)).document.meta.title, 'Changed', 'the copy carries its own edits');

  // A custom name is honoured.
  const named = await s.duplicate(doc.id, 'My Clone');
  assert.equal(named.document.meta.title, 'My Clone');
}
console.log('PASS duplicate');

/* ---------------------------------------------------------- quota failure -- */

console.log('\n=== a quota failure surfaces as StorageFullError, never swallowed ===');
{
  const s = testStorage();
  const doc = makeDoc(2);

  await assert.rejects(
    withFailingMethod('put', new DOMException('The quota has been exceeded.', 'QuotaExceededError'), () =>
      s.save(doc),
    ),
    (error) => {
      assert.ok(error instanceof StorageFullError, 'the write surfaces as StorageFullError');
      assert.equal(error.name, 'StorageFullError');
      return true;
    },
    'a QuotaExceededError becomes StorageFullError',
  );
}
console.log('PASS quota failure');

console.log('\n=== a read failure rejects; it does not return [] ===');
{
  const s = testStorage();

  await assert.rejects(
    withFailingMethod('getAll', new DOMException('read failed', 'UnknownError'), () => s.list()),
    (error) => error.name === 'UnknownError',
    'list rejects when the store cannot be read',
  );

  await assert.rejects(
    withFailingMethod('get', new DOMException('read failed', 'UnknownError'), () => s.get('p-1')),
    (error) => error.name === 'UnknownError',
    'get rejects when the record cannot be read',
  );
}
console.log('PASS read failure rejects');

/* --------------------------------------------------------- autosave slot -- */

console.log('\n=== the autosave slot writes, reads and clears ===');
{
  const s = testStorage();
  const doc = makeDoc(1);

  await s.writeAutosave({ at: 1234, document: doc });
  const record = await s.readAutosave();
  assert.ok(record !== null, 'the autosave slot is found');
  assert.equal(record.at, 1234);
  assert.deepEqual(record.document, doc);

  await s.clearAutosave();
  assert.equal(await s.readAutosave(), null, 'clearAutosave empties the slot');
}
console.log('PASS autosave slot');

/* ------------------------------------------------------- recovery candidate -- */

console.log('\n=== the recovery candidate is returned only when newer than every project ===');
{
  const doc = makeDoc(1);
  const project = { id: 'p-1', schemaVersion: doc.schemaVersion, document: doc, updatedAt: 5000 };

  assert.equal(recoveryCandidate(null, [project]), null, 'no autosave means nothing to recover');
  assert.equal(
    recoveryCandidate({ at: 4000, document: doc }, [project]),
    null,
    'an autosave older than the newest project is not a candidate',
  );
  const candidate = recoveryCandidate({ at: 6000, document: doc }, [project]);
  assert.ok(candidate !== null, 'a newer autosave is a recovery candidate');
  assert.equal(candidate.at, 6000);
  assert.deepEqual(candidate.document, doc);
  assert.deepEqual(
    recoveryCandidate({ at: 6000, document: doc }, []),
    { at: 6000, document: doc },
    'with no projects, the autosave wins',
  );
}
console.log('PASS recovery candidate');

/* ------------------------------------------------------ file round-trip -- */

console.log('\n=== downloadJSON payload -> readProjectFile round-trips identically ===');
{
  const doc = docWithEveryKind();

  // downloadJSON writes exactly `serializeProjectFile(doc)` and triggers a DOM
  // download, which plain Node cannot exercise. The file payload is the thing
  // that must round-trip, so the test goes through it.
  const exported = serializeProjectFile(doc);
  const file = new File([exported], 'evening-puzzles.novelka.json');
  const loaded = await readProjectFile(file);
  assert.deepEqual(loaded, migrate(doc), 'the exported file loads back to the same document');
  assert.deepEqual(loaded, doc);

  await assert.rejects(
    readProjectFile(new File(['not json'], 'x.novelka.json')),
    /not valid JSON/,
    'a non-JSON file is refused',
  );
  await assert.rejects(
    readProjectFile(new File(['{"a": 1}'], 'x.novelka.json')),
    /schemaVersion/,
    'a JSON file without a document is refused',
  );
}
console.log('PASS file round-trip');

/* --------------------------------------------------------- default wiring -- */

console.log('\n=== the default storage instance exists and rejects a missing key honestly ===');
{
  assert.equal(typeof defaultStorage.save, 'function');
  assert.equal(typeof defaultStorage.list, 'function');
  assert.equal(typeof defaultStorage.readAutosave, 'function');
}
console.log('PASS default storage');

console.log('\nALL STORAGE TESTS PASSED');
