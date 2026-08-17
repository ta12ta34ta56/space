/**
 * Unit 08 — the layer row model (spec 08, layer-rows.test.mjs).
 *
 * Pure, no DOM. Proves the D18 fix is structural, not cosmetic:
 *  - one row per element, in z order, front-most first
 *  - a puzzle element produces exactly ONE row (D3)
 *  - all eleven kinds get their own label, icon and class, with no fallback
 *  - no function in src/ infers an element's kind from its type, size or
 *    object count (D18) — checked by reading the source
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ELEMENT_KINDS } from '../../model/model.built.mjs';
import { KIND_META, kindMetaFor, layerRowsFor, zForMove } from './layer-rows.built.mjs';

const frame = { xIn: 1, yIn: 1, wIn: 2, hIn: 2 };

const element = (id, kind, z, over = {}) => {
  const base = { id, kind, frame, z, hidden: false, locked: false, ...over };
  if (kind === 'text') {
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
  }
  if (kind === 'image' || kind === 'sticker' || kind === 'icon' || kind === 'pattern') {
    return { ...base, type: 'image', assetId: `asset-${id}` };
  }
  if (kind === 'puzzle' || kind === 'solution') {
    return { ...base, type: 'puzzle', puzzle: { kind: 'wordsearch', data: {}, style: {} } };
  }
  return {
    ...base,
    type: 'shape',
    shape: { shape: 'rect', fillHex: '#ffffff', strokeHex: '#000000', strokeWidthPt: 1 },
  };
};

const page = (elements) => ({ id: 'p-1', kind: 'blank', role: 'interior', elements, locked: false });

/* ------------------------------------- one row per element, in z order -- */

console.log('=== one row per element, in z order, front-most first ===');
{
  const rows = layerRowsFor(
    page([element('a', 'text', 0), element('b', 'shape', 2), element('c', 'image', 1)]),
  );

  assert.equal(rows.length, 3, 'one row per element, no more and no fewer');
  assert.deepEqual(rows.map((r) => r.id), ['b', 'c', 'a'], 'front-most (highest z) first');
  assert.deepEqual(rows.map((r) => r.z), [2, 1, 0]);

  // An empty page has no rows, and no synthetic placeholder row.
  assert.deepEqual(layerRowsFor(page([])), []);

  // Ties keep document order, so the list never shuffles between renders.
  const tied = layerRowsFor(page([element('x', 'text', 1), element('y', 'shape', 1)]));
  assert.deepEqual(tied.map((r) => r.id), ['x', 'y'], 'equal z keeps document order');

  // Hidden and locked are read from the element, never inferred.
  const flags = layerRowsFor(
    page([element('h', 'shape', 0, { hidden: true, locked: true })]),
  );
  assert.equal(flags[0].hidden, true);
  assert.equal(flags[0].locked, true);
}
console.log('PASS rows in z order');

/* ------------------------------------------ a puzzle is exactly one row -- */

console.log('\n=== a puzzle element produces exactly one row (D3) ===');
{
  const rows = layerRowsFor(page([element('pz', 'puzzle', 0)]));
  assert.equal(rows.length, 1, 'one puzzle, one row, never 81');
  assert.equal(rows[0].kind, 'puzzle');
  assert.deepEqual(rows[0].children, [], 'a puzzle has no synthesised children to expand');

  // A page of puzzles is a page of rows: no clustering, no "unit" rows.
  const many = layerRowsFor(
    page([element('p1', 'puzzle', 0), element('p2', 'puzzle', 1), element('s1', 'solution', 2)]),
  );
  assert.equal(many.length, 3);
  assert.deepEqual(many.map((r) => r.id), ['s1', 'p2', 'p1']);
  assert.equal(
    many.every((row) => !row.id.startsWith('unit:')),
    true,
    'no synthetic unit row exists',
  );
}
console.log('PASS one puzzle is one row');

/* ---------------------------- eleven kinds, each with its own identity -- */

console.log('\n=== each of the eleven kinds gets its own label, icon and class ===');
{
  assert.equal(ELEMENT_KINDS.length, 11, 'the model declares eleven element kinds');
  assert.equal(Object.keys(KIND_META).length, 11, 'presentation exists for all eleven, no fallback');

  const labels = new Set();
  const icons = new Set();
  const classNames = new Set();

  for (const kind of ELEMENT_KINDS) {
    const meta = kindMetaFor(kind);
    assert.ok(meta, `${kind} has presentation`);
    assert.equal(typeof meta.label, 'string');
    assert.ok(meta.label.length > 0, `${kind} has a label`);
    assert.notEqual(meta.label, 'Object', `${kind}: labels are words, never "Object"`);
    assert.ok(meta.className.startsWith('lk-'), `${kind}: keeps the legacy lk- class prefix`);
    labels.add(meta.label);
    icons.add(meta.icon);
    classNames.add(meta.className);
  }

  assert.equal(labels.size, 11, 'every kind has its OWN label, none shared');
  assert.equal(icons.size, 11, 'every kind has its OWN icon, none shared');
  assert.equal(classNames.size, 11, 'every kind has its OWN class, none shared');

  // The five families D18 is about are named, not lumped into one row.
  for (const [kind, label] of [
    ['divider', 'Divider'],
    ['border', 'Border'],
    ['pattern', 'Pattern'],
    ['sticker', 'Sticker'],
    ['icon', 'Icon'],
  ]) {
    assert.equal(kindMetaFor(kind).label, label, `a ${kind} row says "${label}"`);
  }

  // The six legacy entries keep exactly their legacy icon, class and label.
  const legacy = {
    puzzle: { icon: 'puzzle', className: 'lk-puzzle', label: 'Puzzle' },
    solution: { icon: 'check', className: 'lk-solution', label: 'Solution' },
    template: { icon: 'layoutTemplate', className: 'lk-template', label: 'Template' },
    text: { icon: 'type', className: 'lk-text', label: 'Text' },
    image: { icon: 'image', className: 'lk-image', label: 'Image' },
    shape: { icon: 'shapes', className: 'lk-shape', label: 'Shape' },
  };
  for (const [kind, meta] of Object.entries(legacy)) {
    assert.deepEqual(kindMetaFor(kind), meta, `${kind} is the legacy presentation verbatim`);
  }

  // And every kind actually reaches a row with that presentation.
  const rows = layerRowsFor(page(ELEMENT_KINDS.map((kind, index) => element(`el-${kind}`, kind, index))));
  assert.equal(rows.length, 11);
  for (const row of rows) {
    assert.equal(row.kind, row.id.replace('el-', ''), `${row.id}: kind is read, never inferred`);
  }
  // A non-text row is named by its kind; a text row shows its own words.
  const named = layerRowsFor(page([element('t', 'text', 0), element('d', 'divider', 1)]));
  assert.equal(named.find((r) => r.id === 't').name, 'Chapter One');
  assert.equal(named.find((r) => r.id === 'd').name, 'Divider');
}
console.log('PASS eleven distinct kinds');

/* ------------------------------------------------- reorder produces a z -- */

console.log('\n=== reordering a row produces one new z, and nothing else moves ===');
{
  const rows = layerRowsFor(
    page([element('a', 'text', 0), element('b', 'shape', 1), element('c', 'image', 2)]),
  );
  // Displayed front-most first: c (2), b (1), a (0).
  assert.deepEqual(rows.map((r) => r.id), ['c', 'b', 'a']);

  // Move the front row (c) to the back: it must end up below a.
  const toBack = zForMove(rows, 0, 2);
  assert.ok(toBack < 0, `moving to the back lands below the lowest z, got ${toBack}`);

  // Move the back row (a) to the front: above c.
  const toFront = zForMove(rows, 2, 0);
  assert.ok(toFront > 2, `moving to the front lands above the highest z, got ${toFront}`);

  // Move into the middle: strictly between its new neighbours.
  const toMiddle = zForMove(rows, 0, 1);
  assert.ok(toMiddle > 0 && toMiddle < 1, `landing between a and b, got ${toMiddle}`);

  // A move that changes nothing produces nothing, so no empty undo entry.
  assert.equal(zForMove(rows, 1, 1), null, 'moving a row onto itself is not a change');
  assert.equal(zForMove(rows, -1, 0), null, 'an index outside the list is refused');
  assert.equal(zForMove(rows, 0, 9), null, 'a target outside the list is refused');
}
console.log('PASS reorder z');

/* ------------------------------ no code in src/ infers a kind (D18) -- */

console.log('\n=== no function in src/ infers an element kind from appearance (D18) ===');
{
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
  };

  const files = walk(path.resolve('src'));
  const stripComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  // The legacy guessers, by name. They are deleted, not ported.
  const bannedNames = /\b(kindOf|isSolutionish|isPuzzleish|unitKeyOf|moduleLabelOf)\b/;
  // Reading `.kind` is right. Deriving it from `.type`, a size or a count is
  // the bug: `kind:` may never be assigned from anything but a stored kind.
  const inferredAssignment = /\bkind\s*[:=]\s*(?!.*\.kind\b)[^,;\n]*\b(type|width|height|wIn|hIn|length|_objects|elementType)\b/;

  const offenders = [];
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, 'utf-8'));
    if (bannedNames.test(source)) offenders.push(`${file}: a legacy kind guesser survived the port`);
    if (inferredAssignment.test(source)) offenders.push(`${file}: kind is derived from appearance`);
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));

  // And the row model itself only ever reads a stored kind.
  const rowSource = stripComments(fs.readFileSync(path.resolve('src/ui/panels/layer-rows.ts'), 'utf-8'));
  assert.match(rowSource, /kind: element\.kind/, 'the row reads element.kind, one property access');
}
console.log('PASS no kind is inferred');

console.log('\nALL LAYER ROW TESTS PASSED');
