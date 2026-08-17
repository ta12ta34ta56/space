import assert from 'node:assert/strict';
import {
  CommandError,
  DocumentInvariantError,
  apply,
  assertValidDocument,
  createDocument,
  migrate,
} from './model.built.mjs';

/* ---------------------------------------------------------------- helpers -- */

function counterIds(prefix = 'id') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function makeDoc(pageCount = 4) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    pageCount,
    now: () => 1_700_000_000_000,
    id: counterIds('p'),
  });
}

function frame(over = {}) {
  return { xIn: 0.5, yIn: 0.75, wIn: 4.5, hIn: 6.25, ...over };
}

const TEXT_STYLE = {
  fontFamily: 'Merriweather',
  fontSizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  colorHex: '#111827',
};

function textElement(id, over = {}) {
  return {
    id,
    kind: 'text',
    type: 'text',
    frame: frame(),
    z: 0,
    hidden: false,
    locked: false,
    text: 'Chapter One',
    style: TEXT_STYLE,
    ...over,
  };
}

function shapeElement(id, over = {}) {
  return {
    id,
    kind: 'divider',
    type: 'shape',
    frame: frame(),
    z: 1,
    hidden: false,
    locked: false,
    shape: { shape: 'line', fillHex: null, strokeHex: '#111827', strokeWidthPt: 0.75 },
    ...over,
  };
}

function imageElement(id, over = {}) {
  return {
    id,
    kind: 'sticker',
    type: 'image',
    frame: frame(),
    z: 2,
    hidden: false,
    locked: false,
    assetId: 'asset-star',
    ...over,
  };
}

function puzzleElement(id, over = {}) {
  return {
    id,
    kind: 'puzzle',
    type: 'puzzle',
    frame: frame(),
    z: 3,
    hidden: false,
    locked: false,
    puzzle: { kind: 'wordsearch', data: {}, style: {} },
    ...over,
  };
}

function blankPage(id, kind = 'blank') {
  return { id, kind, role: 'interior', elements: [], locked: false };
}

function coverSurface(id = 'cover-1', elements = []) {
  return { id, role: 'cover', elements, locked: false };
}

/** A document with content on page 2, used by most of the element tests. */
function docWithElements() {
  const doc = makeDoc(4);
  const pages = doc.pages.slice();
  pages[1] = {
    ...pages[1],
    elements: [textElement('el-text'), shapeElement('el-shape'), imageElement('el-image')],
  };
  return { ...doc, pages };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function throwsCommandError(fn, match, what) {
  assert.throws(
    fn,
    (error) => {
      assert.ok(error instanceof CommandError, `${what}: expected a CommandError, got ${error.name}`);
      assert.match(error.message, match, `${what}: message`);
      return true;
    },
    what,
  );
}

function pageIds(doc) {
  return doc.pages.map((page) => page.id);
}

function elementIds(page) {
  return page.elements.map((element) => element.id);
}

/* --------------------------------------------------------- page commands -- */

console.log('\n=== page/add ===');
{
  const doc = makeDoc(3);
  const page = blankPage('new-page', 'wordsearch');

  const atStart = apply(doc, { t: 'page/add', index: 0, page });
  assert.deepEqual(pageIds(atStart), ['new-page', 'p-1', 'p-2', 'p-3']);
  assert.deepEqual(atStart.pages[0], page, 'the page is stored exactly as given');
  assert.equal(atStart.pages[0].kind, 'wordsearch', 'kind is carried in, never inferred');

  const inMiddle = apply(doc, { t: 'page/add', index: 2, page });
  assert.deepEqual(pageIds(inMiddle), ['p-1', 'p-2', 'new-page', 'p-3']);

  const atEnd = apply(doc, { t: 'page/add', index: 3, page });
  assert.deepEqual(pageIds(atEnd), ['p-1', 'p-2', 'p-3', 'new-page'], 'index === length appends');

  const empty = apply(makeDoc(0), { t: 'page/add', index: 0, page });
  assert.deepEqual(pageIds(empty), ['new-page']);

  assert.deepEqual(pageIds(doc), ['p-1', 'p-2', 'p-3'], 'the input document is unchanged');
  assert.deepEqual(atStart.book, doc.book);
  assert.equal(atStart.meta.updatedAt, doc.meta.updatedAt, 'apply never stamps updatedAt');

  for (const index of [-1, 4, 1.5, Number.NaN]) {
    throwsCommandError(
      () => apply(doc, { t: 'page/add', index, page }),
      /index must be a whole number between 0 and 3/,
      `page/add at index ${String(index)}`,
    );
  }
}
console.log('PASS page/add');

console.log('\n=== page/delete ===');
{
  const doc = makeDoc(4);

  const one = apply(doc, { t: 'page/delete', ids: ['p-2'] });
  assert.deepEqual(pageIds(one), ['p-1', 'p-3', 'p-4']);

  const several = apply(doc, { t: 'page/delete', ids: ['p-1', 'p-4'] });
  assert.deepEqual(pageIds(several), ['p-2', 'p-3']);

  const all = apply(doc, { t: 'page/delete', ids: ['p-1', 'p-2', 'p-3', 'p-4'] });
  assert.deepEqual(pageIds(all), [], 'deleting every page is allowed by the model');

  assert.deepEqual(pageIds(doc), ['p-1', 'p-2', 'p-3', 'p-4'], 'the input document is unchanged');

  throwsCommandError(
    () => apply(doc, { t: 'page/delete', ids: ['p-2', 'ghost'] }),
    /page\/delete: no page with id "ghost"/,
    'a partly unknown delete',
  );
  // The whole command is rejected: not one page of it is applied.
  assert.deepEqual(pageIds(doc), ['p-1', 'p-2', 'p-3', 'p-4']);
}
console.log('PASS page/delete');

console.log('\n=== page/reorder ===');
{
  const doc = makeDoc(4);

  assert.deepEqual(pageIds(apply(doc, { t: 'page/reorder', from: 0, to: 3 })), [
    'p-2',
    'p-3',
    'p-4',
    'p-1',
  ]);
  assert.deepEqual(pageIds(apply(doc, { t: 'page/reorder', from: 3, to: 0 })), [
    'p-4',
    'p-1',
    'p-2',
    'p-3',
  ]);
  assert.deepEqual(pageIds(apply(doc, { t: 'page/reorder', from: 1, to: 2 })), [
    'p-1',
    'p-3',
    'p-2',
    'p-4',
  ]);
  assert.deepEqual(
    pageIds(apply(doc, { t: 'page/reorder', from: 2, to: 2 })),
    ['p-1', 'p-2', 'p-3', 'p-4'],
    'moving a page onto itself is a no-op, not an error',
  );

  assert.deepEqual(pageIds(doc), ['p-1', 'p-2', 'p-3', 'p-4'], 'the input document is unchanged');

  for (const [from, to, field] of [
    [-1, 0, 'from'],
    [4, 0, 'from'],
    [0, 4, 'to'],
    [0, -1, 'to'],
    [1.5, 0, 'from'],
  ]) {
    throwsCommandError(
      () => apply(doc, { t: 'page/reorder', from, to }),
      new RegExp(`page/reorder: ${field} must be a whole number between 0 and 3`),
      `page/reorder ${from} -> ${to}`,
    );
  }
}
console.log('PASS page/reorder');

console.log('\n=== page/duplicate ===');
{
  const doc = docWithElements();

  const result = apply(doc, { t: 'page/duplicate', id: 'p-2', newId: 'copy-1' });
  assert.deepEqual(pageIds(result), ['p-1', 'p-2', 'copy-1', 'p-3', 'p-4'], 'the copy sits after the original');

  const copy = result.pages[2];
  assert.equal(copy.kind, doc.pages[1].kind);
  assert.equal(copy.locked, doc.pages[1].locked);
  assert.deepEqual(
    elementIds(copy),
    ['copy-1-el-text', 'copy-1-el-shape', 'copy-1-el-image'],
    'copied elements get fresh ids derived from the new page id',
  );
  assert.deepEqual(
    copy.elements.map((element) => ({ ...element, id: null })),
    doc.pages[1].elements.map((element) => ({ ...element, id: null })),
    'everything except the id is copied verbatim',
  );

  // Deterministic: the same command twice gives the same document.
  assert.deepEqual(apply(doc, { t: 'page/duplicate', id: 'p-2', newId: 'copy-1' }), result);

  assert.deepEqual(pageIds(doc), ['p-1', 'p-2', 'p-3', 'p-4'], 'the input document is unchanged');

  throwsCommandError(
    () => apply(doc, { t: 'page/duplicate', id: 'ghost', newId: 'copy-2' }),
    /page\/duplicate: no page with id "ghost"/,
    'duplicating an unknown page',
  );
}
console.log('PASS page/duplicate');

console.log('\n=== page/setLocked ===');
{
  const doc = makeDoc(3);

  const locked = apply(doc, { t: 'page/setLocked', id: 'p-2', locked: true });
  assert.equal(locked.pages[1].locked, true);
  assert.equal(locked.pages[0].locked, false);
  assert.equal(doc.pages[1].locked, false, 'the input document is unchanged');

  const unlocked = apply(locked, { t: 'page/setLocked', id: 'p-2', locked: false });
  assert.deepEqual(unlocked, doc, 'locking then unlocking returns the original document');

  throwsCommandError(
    () => apply(doc, { t: 'page/setLocked', id: 'ghost', locked: true }),
    /page\/setLocked: no page with id "ghost"/,
    'locking an unknown page',
  );
}
console.log('PASS page/setLocked');

/* ------------------------------------------------------ element commands -- */

console.log('\n=== element/add ===');
{
  const doc = docWithElements();
  const added = puzzleElement('el-puzzle');

  const result = apply(doc, { t: 'element/add', pageId: 'p-2', element: added });
  assert.deepEqual(elementIds(result.pages[1]), ['el-text', 'el-shape', 'el-image', 'el-puzzle']);
  assert.deepEqual(result.pages[1].elements[3], added, 'the element is stored exactly as given');
  assert.equal(result.pages[1].elements[3].kind, 'puzzle', 'kind is carried in, never inferred');

  const ontoEmpty = apply(doc, { t: 'element/add', pageId: 'p-1', element: textElement('el-new') });
  assert.deepEqual(elementIds(ontoEmpty.pages[0]), ['el-new']);

  assert.deepEqual(elementIds(doc.pages[1]), ['el-text', 'el-shape', 'el-image'], 'the input is unchanged');

  throwsCommandError(
    () => apply(doc, { t: 'element/add', pageId: 'ghost', element: added }),
    /element\/add: no page with id "ghost"/,
    'adding to an unknown page',
  );
}
console.log('PASS element/add');

console.log('\n=== element/delete ===');
{
  const doc = docWithElements();

  const one = apply(doc, { t: 'element/delete', pageId: 'p-2', elementIds: ['el-shape'] });
  assert.deepEqual(elementIds(one.pages[1]), ['el-text', 'el-image']);

  const both = apply(doc, { t: 'element/delete', pageId: 'p-2', elementIds: ['el-text', 'el-image'] });
  assert.deepEqual(elementIds(both.pages[1]), ['el-shape']);

  const all = apply(doc, {
    t: 'element/delete',
    pageId: 'p-2',
    elementIds: ['el-text', 'el-shape', 'el-image'],
  });
  assert.deepEqual(elementIds(all.pages[1]), []);

  assert.deepEqual(elementIds(doc.pages[1]), ['el-text', 'el-shape', 'el-image'], 'the input is unchanged');

  throwsCommandError(
    () => apply(doc, { t: 'element/delete', pageId: 'p-2', elementIds: ['el-text', 'ghost'] }),
    /element\/delete: no element with id "ghost" on page "p-2"/,
    'a partly unknown element delete',
  );
  throwsCommandError(
    () => apply(doc, { t: 'element/delete', pageId: 'ghost', elementIds: ['el-text'] }),
    /element\/delete: no page with id "ghost"/,
    'deleting from an unknown page',
  );
}
console.log('PASS element/delete');

console.log('\n=== element/update ===');
{
  const doc = docWithElements();
  const moved = frame({ xIn: 1.25, yIn: 2 });

  const result = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-text',
    patch: { frame: moved },
  });
  assert.deepEqual(result.pages[1].elements[0].frame, moved);
  assert.deepEqual(doc.pages[1].elements[0].frame, frame(), 'the input is unchanged');

  // Every patchable field, on the type that owns it.
  const textPatched = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-text',
    patch: {
      text: 'Chapter Two',
      style: { ...TEXT_STYLE, bold: true, fontSizePt: 14 },
      z: 9,
      hidden: true,
      locked: true,
    },
  });
  assert.deepEqual(textPatched.pages[1].elements[0], {
    ...textElement('el-text'),
    text: 'Chapter Two',
    style: { ...TEXT_STYLE, bold: true, fontSizePt: 14 },
    z: 9,
    hidden: true,
    locked: true,
  });

  const shapePatched = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-shape',
    patch: { shape: { shape: 'rect', fillHex: '#fff', strokeHex: null, strokeWidthPt: 1 } },
  });
  assert.deepEqual(shapePatched.pages[1].elements[1].shape, {
    shape: 'rect',
    fillHex: '#fff',
    strokeHex: null,
    strokeWidthPt: 1,
  });

  const imagePatched = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-image',
    patch: { assetId: 'asset-moon' },
  });
  assert.equal(imagePatched.pages[1].elements[2].assetId, 'asset-moon');

  // A puzzle restyles by setting one field. Nothing reaches inside it (D3).
  const withPuzzle = apply(doc, {
    t: 'element/add',
    pageId: 'p-3',
    element: puzzleElement('el-puzzle'),
  });
  const restyled = apply(withPuzzle, {
    t: 'element/update',
    pageId: 'p-3',
    elementId: 'el-puzzle',
    patch: { puzzle: { kind: 'sudoku', data: {}, style: {} } },
  });
  assert.deepEqual(restyled.pages[2].elements[0].puzzle, { kind: 'sudoku', data: {}, style: {} });

  // An empty patch is a no-op in value, and never a mutation.
  const untouched = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-text',
    patch: {},
  });
  assert.deepEqual(untouched, doc);

  throwsCommandError(
    () => apply(doc, { t: 'element/update', pageId: 'ghost', elementId: 'el-text', patch: {} }),
    /element\/update: no page with id "ghost" in this document\./,
    'updating on an unknown page',
  );
  throwsCommandError(
    () => apply(doc, { t: 'element/update', pageId: 'p-2', elementId: 'ghost', patch: {} }),
    /element\/update: no element with id "ghost" on page "p-2"\./,
    'updating an unknown element',
  );
}
console.log('PASS element/update');

console.log('\n=== element/reorder ===');
{
  const doc = docWithElements();

  const result = apply(doc, { t: 'element/reorder', pageId: 'p-2', elementId: 'el-image', z: 0 });
  assert.equal(result.pages[1].elements[2].z, 0);
  assert.equal(
    elementIds(result.pages[1]).join(','),
    'el-text,el-shape,el-image',
    'restacking changes z, not array order',
  );
  assert.equal(doc.pages[1].elements[2].z, 2, 'the input is unchanged');

  throwsCommandError(
    () => apply(doc, { t: 'element/reorder', pageId: 'p-2', elementId: 'el-text', z: Number.NaN }),
    /element\/reorder: z must be a finite number/,
    'a NaN z',
  );
  throwsCommandError(
    () => apply(doc, { t: 'element/reorder', pageId: 'p-2', elementId: 'ghost', z: 1 }),
    /element\/reorder: no element with id "ghost"/,
    'restacking an unknown element',
  );
}
console.log('PASS element/reorder');

/* --------------------------------------------------------- book commands -- */

console.log('\n=== book/setTrim, setPaper, setBinding, setTitle ===');
{
  const doc = makeDoc(2);

  const trimmed = apply(doc, { t: 'book/setTrim', trimId: '8.5x11' });
  assert.deepEqual(trimmed.book, { trimId: '8.5x11', paper: 'bw-white', binding: 'paperback' });
  assert.deepEqual(doc.book, { trimId: '6x9', paper: 'bw-white', binding: 'paperback' });

  const papered = apply(doc, { t: 'book/setPaper', paper: 'bw-cream' });
  assert.deepEqual(papered.book, { trimId: '6x9', paper: 'bw-cream', binding: 'paperback' });

  const bound = apply(doc, { t: 'book/setBinding', binding: 'hardcover' });
  assert.deepEqual(bound.book, { trimId: '6x9', paper: 'bw-white', binding: 'hardcover' });

  const titled = apply(doc, { t: 'book/setTitle', title: 'Word Search Volume One' });
  assert.equal(titled.meta.title, 'Word Search Volume One');
  assert.equal(titled.meta.createdAt, doc.meta.createdAt);
  assert.equal(titled.meta.updatedAt, doc.meta.updatedAt, 'apply never stamps updatedAt');
  assert.equal(doc.meta.title, '', 'the input is unchanged');

  assert.equal(apply(doc, { t: 'book/setTitle', title: '' }).meta.title, '');
  assert.equal(apply(doc, { t: 'book/setTitle', title: 'x'.repeat(200) }).meta.title.length, 200);

  throwsCommandError(
    () => apply(doc, { t: 'book/setTitle', title: 'x'.repeat(201) }),
    /book\/setTitle: a title must be 200 characters or fewer, received 201\./,
    'an over-long title',
  );

  // Book settings do not touch pages: the same page objects come back.
  assert.equal(trimmed.pages, doc.pages, 'unchanged pages keep their array reference');
}
console.log('PASS book commands');

/* -------------------------------------------------------- cover commands -- */

console.log('\n=== cover/set and cover/clear ===');
{
  const doc = makeDoc(2);
  const cover = coverSurface('cover-1', [textElement('cover-title')]);

  const withCover = apply(doc, { t: 'cover/set', cover });
  assert.deepEqual(withCover.cover, cover);
  assert.deepEqual(pageIds(withCover), ['p-1', 'p-2'], 'the cover never appears in pages (invariant 6)');
  assert.equal(doc.cover, null, 'the input is unchanged');

  const replaced = apply(withCover, { t: 'cover/set', cover: coverSurface('cover-2') });
  assert.equal(replaced.cover.id, 'cover-2');

  const cleared = apply(withCover, { t: 'cover/clear' });
  assert.equal(cleared.cover, null);
  assert.deepEqual(cleared, doc, 'setting then clearing returns the original document');

  assert.deepEqual(apply(doc, { t: 'cover/clear' }), doc, 'clearing an absent cover is a no-op');
}
console.log('PASS cover commands');

/* ----------------------------------------------------------- every command -- */

console.log('\n=== every command in the union is covered ===');
{
  // Kept in step with the union by hand, and checked by the fact that each name
  // below is exercised above. A new command with no test fails this list.
  const covered = [
    'page/add',
    'page/delete',
    'page/reorder',
    'page/duplicate',
    'page/setLocked',
    'element/add',
    'element/delete',
    'element/update',
    'element/reorder',
    'book/setTrim',
    'book/setPaper',
    'book/setBinding',
    'book/setTitle',
    'cover/set',
    'cover/clear',
  ];
  assert.equal(covered.length, 15, 'the v1-so-far command union has 15 members');
  assert.equal(new Set(covered).size, covered.length, 'no duplicates');
}
console.log('PASS command coverage');

/* ---------------------------------------------------------------- purity -- */

console.log('\n=== apply is pure: frozen input, no clock, no randomness ===');
{
  const source = docWithElements();
  const before = JSON.parse(JSON.stringify(source));
  const doc = deepFreeze(source);

  const commands = [
    { t: 'page/add', index: 1, page: blankPage('added') },
    { t: 'page/delete', ids: ['p-3'] },
    { t: 'page/reorder', from: 0, to: 2 },
    { t: 'page/duplicate', id: 'p-2', newId: 'dup' },
    { t: 'page/setLocked', id: 'p-1', locked: true },
    { t: 'element/add', pageId: 'p-1', element: puzzleElement('added-el') },
    { t: 'element/delete', pageId: 'p-2', elementIds: ['el-image'] },
    { t: 'element/update', pageId: 'p-2', elementId: 'el-text', patch: { text: 'New' } },
    { t: 'element/reorder', pageId: 'p-2', elementId: 'el-text', z: 5 },
    { t: 'book/setTrim', trimId: '7x10' },
    { t: 'book/setPaper', paper: 'color-premium' },
    { t: 'book/setBinding', binding: 'hardcover' },
    { t: 'book/setTitle', title: 'A Book' },
    { t: 'cover/set', cover: coverSurface() },
    { t: 'cover/clear' },
  ];

  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => {
    throw new Error('apply called Date.now');
  };
  Math.random = () => {
    throw new Error('apply called Math.random');
  };
  try {
    for (const cmd of commands) {
      const first = apply(doc, cmd);
      const second = apply(doc, cmd);
      assert.deepEqual(first, second, `${cmd.t}: the same input must produce the same output`);
      assert.notEqual(first, doc, `${cmd.t}: apply returns a new document`);
    }
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  assert.deepEqual(JSON.parse(JSON.stringify(doc)), before, 'the input document is byte-identical after every command');
}
console.log('PASS purity');

/* --------------------------------------------------- structural sharing -- */

console.log('\n=== structural sharing: untouched pages keep their reference ===');
{
  const doc = makeDoc(4);
  const withElement = apply(doc, {
    t: 'element/add',
    pageId: 'p-4',
    element: textElement('el-1'),
  });

  const result = apply(withElement, {
    t: 'element/update',
    pageId: 'p-4',
    elementId: 'el-1',
    patch: { frame: frame({ xIn: 3 }) },
  });

  assert.equal(result.pages[0], withElement.pages[0], 'page 1 is the same object');
  assert.equal(result.pages[1], withElement.pages[1], 'page 2 is the same object');
  assert.equal(result.pages[2], withElement.pages[2], 'page 3 is the same object');
  assert.notEqual(result.pages[3], withElement.pages[3], 'page 4 changed, so it is a new object');

  // And within a page, the untouched elements are shared too.
  const busy = apply(
    apply(withElement, { t: 'element/add', pageId: 'p-4', element: shapeElement('el-2') }),
    { t: 'element/add', pageId: 'p-4', element: imageElement('el-3') },
  );
  const patched = apply(busy, {
    t: 'element/update',
    pageId: 'p-4',
    elementId: 'el-2',
    patch: { z: 7 },
  });
  assert.equal(patched.pages[3].elements[0], busy.pages[3].elements[0], 'element 1 is shared');
  assert.notEqual(patched.pages[3].elements[1], busy.pages[3].elements[1], 'element 2 changed');
  assert.equal(patched.pages[3].elements[2], busy.pages[3].elements[2], 'element 3 is shared');

  // Book-only and cover-only commands share the whole pages array.
  assert.equal(apply(doc, { t: 'book/setPaper', paper: 'bw-cream' }).pages, doc.pages);
  assert.equal(apply(doc, { t: 'cover/set', cover: coverSurface() }).pages, doc.pages);
  // Page-only commands share the book and the cover.
  const reordered = apply(doc, { t: 'page/reorder', from: 0, to: 1 });
  assert.equal(reordered.book, doc.book);
  assert.equal(reordered.meta, doc.meta);
}
console.log('PASS structural sharing');

/* ------------------------------------------------------- identity (D18) -- */

console.log('\n=== an update cannot change an element identity (D18) ===');
{
  const doc = docWithElements();

  // The compile-time half of this test is `commands.type-test.ts`, checked by
  // tsc. This is the runtime half: identity fields survive, and a patch that
  // reached here from untyped data is refused rather than quietly applied.
  const result = apply(doc, {
    t: 'element/update',
    pageId: 'p-2',
    elementId: 'el-shape',
    patch: { z: 4, hidden: true },
  });
  const patched = result.pages[1].elements[1];
  assert.equal(patched.id, 'el-shape');
  assert.equal(patched.type, 'shape');
  assert.equal(patched.kind, 'divider', 'a divider stays a divider, never collapsing to a generic shape');

  for (const [field, value] of [
    ['id', 'someone-else'],
    ['type', 'text'],
    ['kind', 'sticker'],
  ]) {
    throwsCommandError(
      () =>
        apply(doc, {
          t: 'element/update',
          pageId: 'p-2',
          elementId: 'el-shape',
          patch: { [field]: value },
        }),
      new RegExp(`"${field}" is not a patchable field of a shape element`),
      `patching ${field}`,
    );
  }

  // A field belonging to another element type is refused too.
  throwsCommandError(
    () =>
      apply(doc, {
        t: 'element/update',
        pageId: 'p-2',
        elementId: 'el-shape',
        patch: { text: 'not a shape field' },
      }),
    /"text" is not a patchable field of a shape element/,
    'a text field on a shape',
  );
  throwsCommandError(
    () =>
      apply(doc, {
        t: 'element/update',
        pageId: 'p-2',
        elementId: 'el-text',
        patch: { assetId: 'asset-star' },
      }),
    /"assetId" is not a patchable field of a text element/,
    'an image field on a text element',
  );
}
console.log('PASS identity');

/* ---------------------------------------------------------- serialisation -- */

console.log('\n=== a document survives a sequence of commands and a JSON round-trip ===');
{
  let doc = makeDoc(3);
  const sequence = [
    { t: 'book/setTitle', title: 'Puzzles for Long Evenings' },
    { t: 'book/setTrim', trimId: '7x10' },
    { t: 'book/setPaper', paper: 'bw-cream' },
    { t: 'page/add', index: 3, page: blankPage('p-added', 'wordsearch') },
    { t: 'element/add', pageId: 'p-added', element: puzzleElement('el-puzzle') },
    { t: 'element/add', pageId: 'p-added', element: textElement('el-title') },
    { t: 'element/update', pageId: 'p-added', elementId: 'el-title', patch: { text: 'Puzzle 1' } },
    { t: 'element/reorder', pageId: 'p-added', elementId: 'el-title', z: 0 },
    { t: 'page/duplicate', id: 'p-added', newId: 'p-copy' },
    { t: 'page/reorder', from: 4, to: 0 },
    { t: 'page/setLocked', id: 'p-1', locked: true },
    { t: 'cover/set', cover: coverSurface('cover-1', [textElement('cover-title')]) },
    { t: 'page/delete', ids: ['p-2'] },
    { t: 'element/delete', pageId: 'p-added', elementIds: ['el-puzzle'] },
  ];
  for (const cmd of sequence) doc = apply(doc, cmd);

  const roundTripped = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(roundTripped, doc, 'the Document must survive JSON.parse(JSON.stringify(doc)) unchanged');
  assert.equal(JSON.stringify(doc).includes('undefined'), false, 'absence is null, never undefined');

  // And it still loads: the result of a command sequence is a real document.
  assert.deepEqual(migrate(roundTripped), doc);
}
console.log('PASS serialisation after commands');

console.log('\n=== a command can produce a document that breaks an invariant ===');
{
  // apply answers "what does this command do", not "is the result a legal
  // book". Adding an element whose id is already used elsewhere is a
  // well-formed command and an illegal document. The pairing that refuses it
  // is apply followed by assertValidDocument, which is exactly what dispatch
  // does (proved in doc-store.test.mjs).
  const doc = docWithElements();
  const clash = apply(doc, { t: 'element/add', pageId: 'p-1', element: textElement('el-text') });
  assert.equal(clash.pages[0].elements[0].id, 'el-text');
  assert.throws(() => assertValidDocument(clash), DocumentInvariantError, 'the duplicate id is caught');
  assert.doesNotThrow(() => assertValidDocument(doc), 'and the document it came from was fine');
}
console.log('PASS invalid-document handoff');

console.log('\nALL COMMAND TESTS PASSED');
