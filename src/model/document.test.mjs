import assert from 'node:assert/strict';
import {
  CURRENT_SCHEMA_VERSION,
  DocumentInvariantError,
  DocumentParseError,
  ELEMENT_KINDS,
  MAX_TITLE_LENGTH,
  assertValidDocument,
  createDocument,
  migrate,
} from './model.built.mjs';

/* ---------------------------------------------------------------- helpers -- */

/** A deterministic id source, so two runs with the same input are identical. */
function counterIds(prefix = 'id') {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function makeDoc(overrides = {}) {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    pageCount: 3,
    now: () => 1_700_000_000_000,
    id: counterIds(),
    ...overrides,
  });
}

function frame(over = {}) {
  return { xIn: 0.5, yIn: 0.75, wIn: 4.5, hIn: 6.25, ...over };
}

/** One element per ElementKind. Kind is semantic identity (D18); type is payload. */
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

function withPages(doc, pages) {
  return { ...doc, pages };
}

function throwsInvariant(fn, match, what) {
  assert.throws(
    fn,
    (error) => {
      assert.ok(error instanceof DocumentInvariantError, `${what}: expected a DocumentInvariantError`);
      assert.match(error.message, match, `${what}: message`);
      return true;
    },
    what,
  );
}

/* ------------------------------------------------------------- creation -- */

console.log('\n=== createDocument ===');
{
  const doc = makeDoc();
  assertValidDocument(doc);

  assert.equal(doc.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(doc.schemaVersion, 1, 'the schema starts at version 1');
  assert.deepEqual(doc.book, { trimId: '6x9', paper: 'bw-white', binding: 'paperback' });
  assert.equal(doc.pages.length, 3);
  assert.equal(doc.cover, null, 'a new document has no cover surface yet');
  assert.deepEqual(doc.meta, { title: '', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 });

  for (const page of doc.pages) {
    assert.equal(page.kind, 'blank', 'kind is assigned at creation, never inferred');
    assert.equal(page.role, 'interior');
    assert.deepEqual(page.elements, []);
    assert.equal(page.locked, false);
  }

  assert.equal(new Set(doc.pages.map((p) => p.id)).size, 3, 'page ids are unique');

  const empty = makeDoc({ pageCount: 0 });
  assert.deepEqual(empty.pages, []);

  // No derived print geometry is stored. It is computed from `book` (Unit 03).
  const serialised = JSON.stringify(doc);
  for (const banned of ['margin', 'gutter', 'safeArea', 'spine', 'bleed']) {
    assert.equal(serialised.includes(banned), false, `${banned} must not be stored in the Document`);
  }
}
console.log('PASS createDocument');

console.log('\n=== createDocument rejects a bad page count ===');
{
  for (const pageCount of [-1, 1.5, Number.NaN, '3']) {
    throwsInvariant(
      () => makeDoc({ pageCount }),
      /pageCount must be a whole number of 0 or more/,
      `pageCount ${String(pageCount)}`,
    );
  }
  throwsInvariant(() => makeDoc({ now: () => Number.NaN }), /now\(\) must return a finite number/, 'bad clock');
}
console.log('PASS createDocument rejects a bad page count');

console.log('\n=== purity: injected now and id are the only sources ===');
{
  const input = {
    trimId: '8.5x11',
    paper: 'bw-cream',
    binding: 'paperback',
    pageCount: 5,
    now: () => 1_234_567_890,
    id: counterIds('p'),
  };

  const first = createDocument({ ...input, id: counterIds('p') });
  const second = createDocument({ ...input, id: counterIds('p') });
  assert.equal(
    JSON.stringify(first),
    JSON.stringify(second),
    'the same inputs must produce byte-identical output',
  );

  // Proof by removal: if createDocument reached for the clock or the random
  // source itself, this call would throw.
  const realNow = Date.now;
  const realRandom = Math.random;
  Date.now = () => {
    throw new Error('createDocument called Date.now');
  };
  Math.random = () => {
    throw new Error('createDocument called Math.random');
  };
  try {
    const third = createDocument({ ...input, id: counterIds('p') });
    assert.equal(JSON.stringify(third), JSON.stringify(first));
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }

  // The injected id source is used verbatim.
  assert.equal(first.pages[0].id, 'p-1');
  assert.equal(first.pages[4].id, 'p-5');
  assert.equal(first.id, 'p-6', 'the document id comes from the same injected source');
}
console.log('PASS purity');

/* ------------------------------------------------- serialisation round-trip -- */

console.log('\n=== every ElementKind survives JSON round-trip unchanged ===');
{
  assert.deepEqual(
    [...ELEMENT_KINDS],
    ['text', 'shape', 'image', 'divider', 'border', 'pattern', 'sticker', 'icon', 'puzzle', 'solution', 'template'],
    'the ElementKind vocabulary is exactly the one D18 locks',
  );

  const doc = makeDoc({ pageCount: 1 });
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

  const roundTripped = JSON.parse(JSON.stringify(loaded));
  assert.deepEqual(roundTripped, loaded, 'the Document must survive JSON.parse(JSON.stringify(doc)) unchanged');

  // And it is still a valid document after the trip, and still parses.
  assertValidDocument(roundTripped);
  assert.deepEqual(migrate(roundTripped), loaded, 'a round-tripped document reloads identically');

  // Nothing in the document is undefined: absence is null.
  assert.equal(JSON.stringify(loaded).includes('undefined'), false);
  assert.equal(Object.keys(roundTripped.pages[0].elements[0]).length, Object.keys(elements[0]).length);
}
console.log('PASS serialisation round-trip');

/* ----------------------------------------------------------- validation -- */

console.log('\n=== assertValidDocument catches invariant breaches ===');
{
  const doc = makeDoc({ pageCount: 2 });

  throwsInvariant(
    () => assertValidDocument(withPages(doc, [doc.pages[0], { ...doc.pages[1], id: doc.pages[0].id }])),
    /duplicate id/,
    'duplicate page id',
  );

  const duplicated = elementOfKind('text', 'same-id');
  throwsInvariant(
    () =>
      assertValidDocument(
        withPages(doc, [{ ...doc.pages[0], elements: [duplicated, { ...duplicated, z: 1 }] }, doc.pages[1]]),
      ),
    /duplicate id/,
    'duplicate element id in one page',
  );
  throwsInvariant(
    () =>
      assertValidDocument(
        withPages(doc, [
          { ...doc.pages[0], elements: [duplicated] },
          { ...doc.pages[1], elements: [{ ...duplicated, z: 1 }] },
        ]),
      ),
    /duplicate id/,
    'duplicate element id across pages',
  );
  throwsInvariant(
    () => assertValidDocument({ ...doc, pages: [{ ...doc.pages[0], id: doc.id }, doc.pages[1]] }),
    /duplicate id/,
    'a page reusing the document id',
  );

  const negative = { ...elementOfKind('shape', 'neg'), frame: frame({ wIn: -1 }) };
  throwsInvariant(
    () => assertValidDocument(withPages(doc, [{ ...doc.pages[0], elements: [negative] }, doc.pages[1]])),
    /frame\.wIn must not be negative/,
    'negative wIn',
  );

  const negativeH = { ...elementOfKind('shape', 'neg-h'), frame: frame({ hIn: -0.001 }) };
  throwsInvariant(
    () => assertValidDocument(withPages(doc, [{ ...doc.pages[0], elements: [negativeH] }, doc.pages[1]])),
    /frame\.hIn must not be negative/,
    'negative hIn',
  );

  for (const field of ['xIn', 'yIn', 'wIn', 'hIn']) {
    const notFinite = { ...elementOfKind('shape', `nan-${field}`), frame: frame({ [field]: Number.NaN }) };
    throwsInvariant(
      () => assertValidDocument(withPages(doc, [{ ...doc.pages[0], elements: [notFinite] }, doc.pages[1]])),
      new RegExp(`frame\\.${field} must be a finite number`),
      `NaN in frame.${field}`,
    );
  }

  const infinite = { ...elementOfKind('image', 'inf'), frame: frame({ xIn: Number.POSITIVE_INFINITY }) };
  throwsInvariant(
    () => assertValidDocument(withPages(doc, [{ ...doc.pages[0], elements: [infinite] }, doc.pages[1]])),
    /frame\.xIn must be a finite number/,
    'Infinity in a frame',
  );

  const cover = { id: 'cover-1', role: 'cover', elements: [], locked: false };
  throwsInvariant(
    () => assertValidDocument(withPages(doc, [cover, doc.pages[1]])),
    /pages hold interior pages only/,
    'a cover object inside pages',
  );

  throwsInvariant(() => assertValidDocument({ ...doc, id: '' }), /document\.id/, 'an empty document id');
  throwsInvariant(
    () => assertValidDocument({ ...doc, schemaVersion: 0 }),
    /schemaVersion/,
    'a schema version below 1',
  );
  throwsInvariant(
    () => assertValidDocument({ ...doc, meta: { ...doc.meta, updatedAt: Number.NaN } }),
    /timestamps must be finite/,
    'a NaN timestamp',
  );
  throwsInvariant(
    () =>
      assertValidDocument(
        withPages(doc, [
          { ...doc.pages[0], elements: [{ ...elementOfKind('text', 'z'), z: Number.NaN }] },
          doc.pages[1],
        ]),
      ),
    /z must be a finite number/,
    'a NaN z index',
  );
  throwsInvariant(
    () => assertValidDocument({ ...doc, cover: { ...cover, id: doc.pages[0].id } }),
    /duplicate id/,
    'a cover reusing a page id',
  );
}
console.log('PASS assertValidDocument');

/* ------------------------------------------------------------ migration -- */

console.log('\n=== migrate accepts a valid v1 document unchanged ===');
{
  const doc = makeDoc({ pageCount: 2 });
  const withContent = {
    ...doc,
    cover: { id: 'cover-1', role: 'cover', elements: [], locked: false },
    pages: [
      { ...doc.pages[0], kind: 'wordsearch', elements: [elementOfKind('puzzle', 'pz-1')] },
      { ...doc.pages[1], kind: 'template', elements: [elementOfKind('divider', 'dv-1')] },
    ],
  };

  const raw = JSON.parse(JSON.stringify(withContent));
  const migrated = migrate(raw);
  assert.deepEqual(migrated, withContent, 'a v1 document is returned unchanged');
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);

  // migrate is pure: the input object is not mutated.
  assert.deepEqual(raw, JSON.parse(JSON.stringify(withContent)), 'migrate does not mutate its input');
}
console.log('PASS migrate v1');

console.log('\n=== migrate rejects malformed input with a useful message ===');
{
  const doc = makeDoc({ pageCount: 1 });
  const valid = JSON.parse(JSON.stringify(doc));

  const cases = [
    [null, /expected an object/, 'null'],
    [undefined, /expected an object/, 'undefined'],
    ['{}', /expected an object/, 'a string'],
    [[], /expected an object/, 'an array'],
    [{}, /schemaVersion: expected a finite number/, 'an empty object'],
    [{ ...valid, schemaVersion: '1' }, /schemaVersion: expected a finite number/, 'a string version'],
    [{ ...valid, schemaVersion: 1.5 }, /schemaVersion: expected an integer of 1 or more/, 'a fractional version'],
    [
      { ...valid, schemaVersion: CURRENT_SCHEMA_VERSION + 1 },
      /saved by a newer version of Novelka/,
      'a future version',
    ],
    [{ ...valid, id: '' }, /document\.id: must not be empty/, 'an empty id'],
    [{ ...valid, book: { ...valid.book, trimId: '4x6' } }, /trimId: expected one of/, 'an unsupported trim'],
    [{ ...valid, book: { ...valid.book, paper: 'white' } }, /paper: expected one of/, 'the old paper vocabulary'],
    [{ ...valid, pages: {} }, /pages: expected an array/, 'pages as an object'],
    [
      { ...valid, pages: [{ ...valid.pages[0], role: 'cover' }] },
      /interior pages only/,
      'a cover role inside pages',
    ],
    [
      { ...valid, pages: [{ ...valid.pages[0], kind: 'crosswords' }] },
      /kind: expected one of/,
      'a misspelt page kind',
    ],
    [
      { ...valid, pages: [{ ...valid.pages[0], elements: [{ ...elementOfKind('text', 't'), type: 'group' }] }] },
      /type: expected one of text, shape, image, puzzle/,
      'an unknown element type',
    ],
    [
      { ...valid, pages: [{ ...valid.pages[0], elements: [{ ...elementOfKind('text', 't'), kind: 'widget' }] }] },
      /kind: expected one of/,
      'an unknown element kind',
    ],
    [
      {
        ...valid,
        pages: [
          {
            ...valid.pages[0],
            elements: [{ ...elementOfKind('shape', 's'), frame: frame({ wIn: 'wide' }) }],
          },
        ],
      },
      /frame\.wIn: expected a finite number/,
      'a string width',
    ],
    [
      {
        ...valid,
        pages: [
          { ...valid.pages[0], elements: [{ ...elementOfKind('shape', 's'), frame: frame({ hIn: null }) }] },
        ],
      },
      /frame\.hIn: expected a finite number/,
      'a null height',
    ],
    [
      {
        ...valid,
        pages: [
          {
            ...valid.pages[0],
            elements: [
              {
                ...elementOfKind('puzzle', 'p'),
                puzzle: { kind: 'wordsearch', data: { seed: 1 }, style: {} },
              },
            ],
          },
        ],
      },
      /must be empty until the generator schemas land/,
      'puzzle data before Unit 12',
    ],
    [
      {
        ...valid,
        pages: [
          {
            ...valid.pages[0],
            elements: [
              {
                ...elementOfKind('text', 't'),
                style: { ...elementOfKind('text', 't').style, colorHex: 'black' },
              },
            ],
          },
        ],
      },
      /colorHex: expected a hex colour/,
      'a named colour',
    ],
    [{ ...valid, cover: { id: 'c', role: 'interior', elements: [], locked: false } }, /cover/, 'a cover with the wrong role'],
    [{ ...valid, meta: { ...valid.meta, title: 'x'.repeat(MAX_TITLE_LENGTH + 1) } }, /title/, 'an over-long title'],
    [{ ...valid, meta: { ...valid.meta, createdAt: 'yesterday' } }, /createdAt: expected a finite number/, 'a text date'],
  ];

  for (const [input, match, what] of cases) {
    assert.throws(
      () => migrate(input),
      (error) => {
        assert.ok(
          error instanceof DocumentParseError || error instanceof DocumentInvariantError,
          `${what}: expected a parse or invariant error, got ${error.name}`,
        );
        assert.match(error.message, match, `${what}: message`);
        return true;
      },
      what,
    );
  }

  // Structurally valid, but it breaks an invariant. It must still not come back.
  const duplicate = {
    ...valid,
    pages: [valid.pages[0], { ...valid.pages[0] }],
  };
  throwsInvariant(() => migrate(duplicate), /duplicate id/, 'duplicate page ids survive parsing but not migrate');

  // Extra fields from a hand-edited or future file are dropped, not trusted.
  const withExtras = { ...valid, rogue: 'field', pages: [{ ...valid.pages[0], rogue: 'field' }] };
  const cleaned = migrate(withExtras);
  assert.equal('rogue' in cleaned, false, 'unknown document fields are dropped');
  assert.equal('rogue' in cleaned.pages[0], false, 'unknown page fields are dropped');
  assert.deepEqual(cleaned, valid);
}
console.log('PASS migrate rejects malformed input');

console.log('\nALL DOCUMENT TESTS PASSED');
