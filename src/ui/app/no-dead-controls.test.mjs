/**
 * Unit 06 — no dead controls (spec 06, no-dead-controls.test.mjs).
 *
 * Honesty rule 3, enforced rather than trusted: walk the rendered shell and
 * fail on any disabled control. A control that is not implemented is not
 * rendered — Preflight, Export, rulers, grid and snap are absent, not greyed
 * out. Also enforces ui-context §6: every icon button has a real accessible
 * name.
 */

import { JSDOM } from 'jsdom';
import { installCanvasStub } from '../../../test/helpers/jsdom-canvas-stub.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
installCanvasStub(dom);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.devicePixelRatio = 1;

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { AppShell } = await import('./AppShell.built.mjs');

let pass = 0;
let fail = 0;
const failures = [];

const check = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const markup = renderToStaticMarkup(createElement(AppShell));
const shell = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`);
const doc = shell.window.document;

const controls = [
  ...doc.querySelectorAll('button, input, select, textarea, [role="switch"], [role="button"]'),
];

/* --------------------------------------------------- no disabled controls -- */

console.log('=== no control in the shell is disabled ===');
{
  check('the shell renders controls to audit', controls.length > 0, `found ${controls.length}`);

  const disabled = controls.filter(
    (el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
  );
  check(
    'no control is disabled',
    disabled.length === 0,
    disabled.map((el) => el.outerHTML.slice(0, 80)).join(' | '),
  );
}

/* -------------------------------- unimplemented controls are not rendered -- */

console.log('\n=== controls belonging to later units are absent, not greyed out ===');
{
  const text = doc.body.textContent ?? '';
  const labels = controls.map((el) => `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`).join(' ');

  // Preflight and Export are Unit 11; rulers, grid, snap and smart guides are
  // Unit 09. None of them may appear in any form.
  for (const word of ['Preflight', 'Export', 'Ruler', 'Grid', 'Snap']) {
    check(`"${word}" does not appear as a control`, !labels.includes(word) && !text.includes(word));
  }

  // The right dock is reserved space only (Unit 07 fills it).
  const dock = doc.querySelector('.shell-dock');
  check('the right dock exists as reserved space', dock !== null);
  check('the right dock is empty', dock !== null && dock.children.length === 0);
}

/* ------------------------------------- every control has an accessible name -- */

console.log('\n=== every control carries a real accessible name ===');
{
  const unnamed = controls.filter((el) => {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel !== null && ariaLabel.trim().length > 0) return false;
    if ((el.textContent ?? '').trim().length > 0) return false;
    if (el.id !== '' && doc.querySelector(`label[for="${el.id}"]`) !== null) return false;
    if (el.closest('label') !== null) return false;
    return true;
  });
  check(
    'no unnamed control',
    unnamed.length === 0,
    unnamed.map((el) => el.outerHTML.slice(0, 80)).join(' | '),
  );
}

/* --------------------------------------------- shell copy honesty checks -- */

console.log('\n=== shell copy follows the copy rules ===');
{
  const text = doc.body.textContent ?? '';
  check('no em dash in shell copy', !text.includes('\u2014'));

  // The page indicator reads "N of M" (D21).
  check('the page indicator reads "1 of 24"', text.includes('1 of 24'));

  // Displayed dimensions carry units (6 × 9 in).
  check('the trim readout carries its unit', /6 × 9 in/.test(text));
}

/* ----------------------------------------------------------------- summary -- */

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL NO-DEAD-CONTROLS TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
