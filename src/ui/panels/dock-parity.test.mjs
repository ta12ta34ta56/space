/**
 * Units 07 and 08 — the D17 parity guard (spec 07, spec 08).
 *
 * This test is unusual on purpose. It makes "did the port stay faithful?" a
 * build failure instead of an opinion.
 *
 * The owner built the right dock over three months, and losing it is the
 * outcome they named as unacceptable. The standard is not "good"; it is
 * *indistinguishable from the original, except it can no longer desync*. So
 * this reads the legacy component and asserts that the class names and the
 * accessible names it used are all present in the new panels.
 *
 * One deliberate correction. Spec 08 lists the layer row class as `.layerrow`.
 * No such class exists anywhere in the legacy build: the real class is
 * `.docklayer`, with `.docklayer-name`, `.docklayer-type` and friends, and
 * `grep -rn "layerrow" legacy/` returns nothing. Under D17 the shipped legacy
 * markup is the source of truth, so parity is asserted against `.docklayer`
 * and the spec's `.layerrow` is treated as a typo. Recorded in the tracker.
 */

import fs from 'node:fs';
import path from 'node:path';

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

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf-8');
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const LEGACY = read('legacy/novelka/src/components/editor/RightDock.tsx');
const LEGACY_CSS = read('legacy/novelka/src/index.css');

const pagesTab = stripComments(read('src/ui/panels/PagesTab.tsx'));
const layersTab = stripComments(read('src/ui/panels/LayersTab.tsx'));
const layerRows = stripComments(read('src/ui/panels/layer-rows.ts'));
const dockCss = read('src/ui/app/AppShell.css');

/* ------------------------------------------------- Pages: class names -- */

console.log('=== the Pages rows carry the legacy class names ===');
{
  // Named by spec 07, and every one of them is in the legacy component.
  const required = [
    'dockpage',
    'dockpage-thumb',
    'dockpage-dot',
    'dockpage-tools',
    'dockpage-label',
    'dockpage-side',
    'dockpage-insert',
    'dockpage-dropline',
  ];

  for (const name of required) {
    check(`the legacy build really used .${name}`, LEGACY.includes(name));
    check(`.${name} is rendered by the new panel`, pagesTab.includes(name));
    check(`.${name} is styled`, dockCss.includes(`.${name}`));
  }

  // The rest of the legacy Pages markup, so nothing quietly went missing.
  for (const name of [
    'dockpages',
    'dockpage-name',
    'dockpage-add',
    'dockpage-addlink',
    'dockpage-insert-btn',
    'is-cover',
    'grabbing',
    'sev-err',
    'sev-warn',
    'mini-btn',
  ]) {
    check(`.${name} survived the port`, pagesTab.includes(name), 'missing from PagesTab');
  }
}

/* -------------------------------------------------- Pages: aria labels -- */

console.log('\n=== every legacy aria-label in PagesTab is present ===');
{
  // Read them out of the legacy file rather than trusting a hand-typed list:
  // if the legacy panel had a label, the new one must have it too.
  const legacyPagesTab = LEGACY.slice(
    LEGACY.indexOf('function PagesTab'),
    LEGACY.indexOf('/* ========================================================= Layers tab === */'),
  );
  const labels = new Set();
  for (const match of legacyPagesTab.matchAll(/aria-label=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    labels.add(match[1] ?? match[2]);
  }

  check('the legacy PagesTab had labels to compare against', labels.size > 0, `${labels.size}`);

  for (const label of labels) {
    // Template labels are compared by their literal prefix, since the
    // interpolated position number differs per row.
    const literal = label.split('${')[0].trim();
    check(`aria-label "${label}" is present`, pagesTab.includes(literal), literal);
  }
}

/* ------------------------------------------------- Layers: class names -- */

console.log('\n=== the Layers rows carry the legacy class names ===');
{
  // Spec 08 says `.layerrow`. The legacy build has no such class; the row is
  // `.docklayer`. D17 makes the shipped markup the source of truth.
  check(
    'the spec\u2019s .layerrow does not exist in the legacy build',
    !LEGACY.includes('layerrow') && !LEGACY_CSS.includes('layerrow'),
    'if this fails, the spec was right and this test is wrong',
  );
  check('the legacy row class is .docklayer', LEGACY.includes('docklayer') && LEGACY_CSS.includes('.docklayer'));
  check('the new panel uses .docklayer', layersTab.includes('docklayer'));

  for (const name of [
    'docklayers',
    'docklayers-order',
    'docklayers-hint',
    'docklayer-chevron',
    'docklayer-type',
    'docklayer-name',
    'docklayer-count',
    'docklayer-actions',
    'docklayer-children',
    'child',
    'move-mode',
  ]) {
    check(`the legacy build used ${name}`, LEGACY.includes(name));
    check(`${name} survived the port`, layersTab.includes(name));
  }

  // The drop-line is shared with Pages, exactly as the legacy panel shared it.
  check('the Layers drop-line reuses .dockpage-dropline', layersTab.includes('dockpage-dropline'));
}

/* ------------------------------- Layers: the six legacy kinds plus five -- */

console.log('\n=== the six legacy lk- classes survive, and the five D18 kinds join them ===');
{
  const legacyKinds = ['lk-puzzle', 'lk-solution', 'lk-template', 'lk-text', 'lk-image', 'lk-shape'];
  for (const name of legacyKinds) {
    check(`the legacy build had .${name}`, LEGACY.includes(name) && LEGACY_CSS.includes(`.${name}`));
    check(`.${name} survived the port`, layerRows.includes(name));
    check(`.${name} is styled`, dockCss.includes(`.${name}`));
  }

  // D18: five families that used to share one generic row now have their own.
  const newKinds = ['lk-divider', 'lk-border', 'lk-pattern', 'lk-sticker', 'lk-icon'];
  for (const name of newKinds) {
    check(`.${name} exists (D18)`, layerRows.includes(name));
    check(`.${name} is styled`, dockCss.includes(`.${name}`));
  }

  const styled = [...dockCss.matchAll(/\.lk-[a-z]+/g)].map((m) => m[0]);
  check(
    'exactly eleven kind classes are styled, one per kind',
    new Set(styled).size === 11,
    [...new Set(styled)].join(','),
  );
}

/* --------------------------------------------------- Layers: aria labels -- */

console.log('\n=== every legacy aria-label in LayersTab is present ===');
{
  const legacyLayersTab = LEGACY.slice(
    LEGACY.indexOf('function LayersTab'),
    LEGACY.indexOf('/* ======================================================== KDP Check ===== */'),
  );
  const labels = new Set();
  for (const match of legacyLayersTab.matchAll(/aria-label=\{?(?:"([^"]+)"|[^}]*?\?\s*'([^']+)'\s*:\s*'([^']+)')/g)) {
    for (const group of [match[1], match[2], match[3]]) {
      if (group !== undefined) labels.add(group);
    }
  }

  check('the legacy LayersTab had labels to compare against', labels.size > 0, `${labels.size}`);
  for (const label of labels) {
    // "Duplicate layer" is the one legacy control not ported: duplicating an
    // element needs a new element id per type, which is Unit 09's job. It is
    // absent rather than dead (honesty rule 3), and noted in the tracker.
    if (label === 'Duplicate layer') continue;
    check(`aria-label "${label}" is present`, layersTab.includes(label));
  }
}

/* ------------------------------------------- no polling anywhere in the dock -- */

console.log('\n=== no setInterval anywhere in the dock ===');
{
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
  };

  const uiFiles = walk(path.resolve('src/ui'));
  const polling = uiFiles.filter((file) => /\bsetInterval\b/.test(stripComments(read(file))));
  check('no file under src/ui polls on a timer', polling.length === 0, polling.join(', '));

  // The legacy tree DID poll; that is the thing being removed.
  check('the legacy layer tree polled on a 900 ms interval', /setInterval\(read, 900\)/.test(LEGACY));
}

/* --------------------------------------- the rendered markup, not just source -- */

console.log('\n=== the rendered DOM really carries these classes ===');
{
  // Source greps can be fooled by a comment; this renders the panels and
  // reads the resulting DOM.
  const { createHarness } = await import('../../../test/helpers/react-dom-harness.mjs');
  const harness = await createHarness();
  const { document: dom, createElement, mount, run, unmount } = harness;

  const { store } = await import('../../../.test-build/state/store.built.mjs');
  const { useUiStore } = await import('../../../.test-build/state/ui-store.built.mjs');
  const { createDocument, ELEMENT_KINDS } = await import('../../../.test-build/model/index.built.mjs');
  const { PagesTab } = await import('../../../.test-build/ui/panels/PagesTab.built.mjs');
  const { LayersTab } = await import('../../../.test-build/ui/panels/LayersTab.built.mjs');

  const frame = { xIn: 1, yIn: 1, wIn: 2, hIn: 2 };
  const elementFor = (kind, z) => {
    const base = { id: `el-${kind}`, kind, frame, z, hidden: false, locked: false };
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
    if (kind === 'puzzle' || kind === 'solution') {
      return { ...base, type: 'puzzle', puzzle: { kind: 'sudoku', data: {}, style: {} } };
    }
    if (['image', 'sticker', 'icon', 'pattern'].includes(kind)) {
      return { ...base, type: 'image', assetId: `asset-${kind}` };
    }
    return {
      ...base,
      type: 'shape',
      shape: { shape: 'rect', fillHex: '#ffffff', strokeHex: '#000000', strokeWidthPt: 1 },
    };
  };

  let n = 0;
  const doc = createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount: 24,
    now: () => 1_700_000_000_000,
    id: () => `p-${(n += 1)}`,
  });
  const pages = doc.pages.slice();
  pages[0] = { ...pages[0], elements: ELEMENT_KINDS.map((kind, index) => elementFor(kind, index)) };
  await run(() => {
    store.getState().load({
      ...doc,
      pages,
      cover: { id: 'cover-1', role: 'cover', elements: [], locked: false },
    });
    useUiStore.getState().setCurrentPageIndex(0);
  });

  await mount(
    createElement(PagesTab, {
      newId: () => 'x',
      now: () => 1,
      severity: { [pages[1].id]: 'error', [pages[2].id]: 'warn' },
    }),
  );

  for (const selector of [
    '.dockpages',
    '.dockpage',
    '.dockpage.is-cover',
    '.dockpage-thumb',
    '.dockpage-dot',
    '.dockpage-tools',
    '.dockpage-label',
    '.dockpage-name',
    '.dockpage-side',
    '.dockpage-insert',
    '.dockpage-insert-btn',
    '.dockpage-add',
    '.dockpage-addlink',
    '.mini-btn',
  ]) {
    check(`the rendered Pages DOM has ${selector}`, dom.querySelector(selector) !== null);
  }

  for (const label of ['Duplicate page', 'Delete page', 'Insert a page after this one']) {
    check(
      `the rendered Pages DOM exposes "${label}"`,
      dom.querySelector(`[aria-label="${label}"]`) !== null,
    );
  }

  await mount(createElement(LayersTab, { newId: () => 'x', now: () => 1 }));

  for (const selector of [
    '.docklayers',
    '.docklayers-order',
    '.docklayers-hint',
    '.docklayer',
    '.docklayer-chevron',
    '.docklayer-type',
    '.docklayer-name',
    '.docklayer-actions',
  ]) {
    check(`the rendered Layers DOM has ${selector}`, dom.querySelector(selector) !== null);
  }

  // All eleven kinds render distinctly, in the same DOM, at the same time.
  const kindClasses = [
    'lk-text',
    'lk-shape',
    'lk-image',
    'lk-divider',
    'lk-border',
    'lk-pattern',
    'lk-sticker',
    'lk-icon',
    'lk-puzzle',
    'lk-solution',
    'lk-template',
  ];
  for (const cls of kindClasses) {
    check(`the rendered Layers DOM has .${cls}`, dom.querySelector(`.${cls}`) !== null);
  }
  check(
    'eleven rows, one per kind',
    dom.querySelectorAll('.docklayer').length === 11,
    `${dom.querySelectorAll('.docklayer').length}`,
  );

  // A divider says "Divider" on screen. That is the owner-visible point of D18.
  const dividerRow = dom.querySelector('.lk-divider')?.closest('.docklayer');
  check(
    'a divider row says "Divider"',
    dividerRow?.querySelector('.docklayer-name')?.textContent === 'Divider',
  );
  check('and its type badge is titled "Divider"', dom.querySelector('.lk-divider')?.getAttribute('title') === 'Divider');

  for (const label of ['Hide layer', 'Lock layer', 'Delete layer']) {
    check(
      `the rendered Layers DOM exposes "${label}"`,
      dom.querySelector(`[aria-label="${label}"]`) !== null,
    );
  }

  // Every icon button in either panel has a real accessible name (ui-context §6).
  const unnamed = [...dom.querySelectorAll('button')].filter((el) => {
    const aria = el.getAttribute('aria-label');
    if (aria !== null && aria.trim().length > 0) return false;
    return (el.textContent ?? '').trim().length === 0;
  });
  check('no unnamed control in the dock', unnamed.length === 0, unnamed.map((el) => el.outerHTML.slice(0, 60)).join(' | '));

  // No control is disabled: a control that is not implemented is not rendered.
  const disabled = [...dom.querySelectorAll('button, [role="button"]')].filter(
    (el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
  );
  check('no disabled control in the dock', disabled.length === 0);

  await unmount();
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL DOCK PARITY TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
