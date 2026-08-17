/**
 * SVG sanitiser tests.  npm run test:svg
 *
 * These are real XSS payloads. Each one must come out inert.
 */
// The sanitiser needs a DOM. In the browser that is native; here we borrow one.
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');

const { sanitizeSvg, sanitizeSvgDataUrl, isSvgDataUrl } = await import('./svg-sanitize.built.mjs');

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/** The output must contain no way to execute anything. */
const isInert = (svg) => {
  const s = svg.toLowerCase();
  if (/<script/.test(s)) return 'contains <script>';
  if (/<foreignobject/.test(s)) return 'contains <foreignObject>';
  if (/\son\w+\s*=/.test(s)) return 'contains an on* handler';
  if (/javascript:/.test(s)) return 'contains javascript:';
  if (/<animate/.test(s)) return 'contains <animate>';
  if (/<iframe|<embed|<object/.test(s)) return 'contains an embedding tag';
  if (/@import/.test(s)) return 'contains @import';
  if (/expression\(/.test(s)) return 'contains expression()';
  return null;
};

console.log('\n=== script injection ===');
{
  const attacks = [
    ['inline script',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>'],
    ['script with CDATA',
      '<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[alert(document.cookie)]]></script></svg>'],
    ['nested script inside g',
      '<svg xmlns="http://www.w3.org/2000/svg"><g><g><script>fetch("//evil")</script></g></g></svg>'],
    ['uppercase SCRIPT',
      '<svg xmlns="http://www.w3.org/2000/svg"><SCRIPT>alert(1)</SCRIPT></svg>'],
  ];
  for (const [name, payload] of attacks) {
    const r = sanitizeSvg(payload);
    const bad = isInert(r.svg);
    check(name, bad === null, bad || '');
  }
}

console.log('\n=== event handlers ===');
{
  const attacks = [
    ['onload on svg root',
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="5" height="5"/></svg>'],
    ['onclick on a shape',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5" onclick="alert(1)"/></svg>'],
    ['onmouseover',
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" onmouseover="steal()"/></svg>'],
    ['ONERROR uppercase',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect ONERROR="alert(1)" width="5" height="5"/></svg>'],
    ['onbegin via animate',
      '<svg xmlns="http://www.w3.org/2000/svg"><animate onbegin="alert(1)" attributeName="x"/></svg>'],
  ];
  for (const [name, payload] of attacks) {
    const r = sanitizeSvg(payload);
    const bad = isInert(r.svg);
    check(name, bad === null, bad || '');
  }
}

console.log('\n=== javascript: and external URLs ===');
{
  const attacks = [
    ['javascript: in href',
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>'],
    ['javascript: in xlink:href',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="javascript:alert(1)"/></svg>'],
    ['javascript: in style',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(javascript:alert(1))" width="5" height="5"/></svg>'],
    ['external http reference in fill',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(http://evil.example/x.svg#a)" width="5" height="5"/></svg>'],
    ['@import in style block',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("http://evil.example/x.css");</style><rect width="5" height="5"/></svg>'],
    ['CSS expression',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="width:expression(alert(1))" height="5"/></svg>'],
  ];
  for (const [name, payload] of attacks) {
    const r = sanitizeSvg(payload);
    const bad = isInert(r.svg);
    const noExternal = !/https?:\/\/evil/.test(r.svg);
    check(name, bad === null && noExternal, bad || (noExternal ? '' : 'external URL survived'));
  }
}

console.log('\n=== embedded HTML and media ===');
{
  const attacks = [
    ['foreignObject with html',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="alert(1)"/></body></foreignObject></svg>'],
    ['iframe',
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="http://evil.example"></iframe></svg>'],
    ['embed',
      '<svg xmlns="http://www.w3.org/2000/svg"><embed src="http://evil.example/x.swf"/></svg>'],
    ['anchor with javascript',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="5" height="5"/></a></svg>'],
  ];
  for (const [name, payload] of attacks) {
    const r = sanitizeSvg(payload);
    const bad = isInert(r.svg);
    check(name, bad === null, bad || '');
  }
}

console.log('\n=== legitimate artwork survives ===');
{
  const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ff0000"/>
        <stop offset="100%" stop-color="#0000ff"/>
      </linearGradient>
      <clipPath id="c1"><circle cx="50" cy="50" r="40"/></clipPath>
    </defs>
    <g transform="translate(5,5)" clip-path="url(#c1)">
      <path d="M 10 10 L 90 10 L 50 90 Z" fill="url(#g1)" stroke="#111827" stroke-width="2"/>
      <rect x="20" y="20" width="30" height="30" rx="4" fill="currentColor" opacity="0.5"/>
      <circle cx="70" cy="30" r="8" fill="none" stroke="#333"/>
      <text x="50" y="95" font-family="Inter" font-size="10" text-anchor="middle">Hi</text>
    </g>
  </svg>`;
  const r = sanitizeSvg(art);

  check('valid artwork is not rejected', !r.error, r.error || '');
  check('nothing was stripped from clean art', !r.modified,
    `tags=${r.removedTags} attrs=${r.removedAttrs}`);

  for (const bit of ['path', 'linearGradient', 'stop', 'clipPath', 'circle', 'rect', 'text', 'tspan'.slice(0, 0) || 'g']) {
    check(`<${bit}> survives`, r.svg.includes(`<${bit}`) || r.svg.includes(`:${bit}`));
  }
  check('the path data is intact', r.svg.includes('M 10 10 L 90 10 L 50 90 Z'));
  check('internal gradient reference survives', r.svg.includes('url(#g1)'));
  check('clip-path reference survives', r.svg.includes('url(#c1)'));
  check('currentColor survives (recolouring still works)', r.svg.includes('currentColor'));
  check('transform survives', r.svg.includes('translate(5,5)'));
  check('stroke-width survives', r.svg.includes('stroke-width'));
}

console.log('\n=== reporting ===');
{
  const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>y()</script><rect width="5" height="5"/></svg>');
  check('reports that it changed something', r.modified === true);
  check('names the removed tag', r.removedTags.some((t) => t.toLowerCase() === 'script'),
    JSON.stringify(r.removedTags));
  check('names the removed attribute', r.removedAttrs.some((a) => a.toLowerCase() === 'onload'),
    JSON.stringify(r.removedAttrs));
  check('keeps the harmless shape', r.svg.includes('<rect'));
}

console.log('\n=== malformed input fails closed ===');
{
  check('unclosed tag is rejected', !!sanitizeSvg('<svg><rect').error);
  check('plain text is rejected', !!sanitizeSvg('hello world').error);
  check('html document is rejected', !!sanitizeSvg('<html><body>x</body></html>').error);
  check('empty string is rejected', !!sanitizeSvg('').error);
  const r = sanitizeSvg('<svg><rect');
  check('a rejected input returns no markup', r.svg === '');
}

console.log('\n=== data URLs ===');
{
  check('detects an svg data url',
    isSvgDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='));
  check('detects a utf8 svg data url',
    isSvgDataUrl('data:image/svg+xml,%3Csvg%3E%3C/svg%3E'));
  check('a png data url is not treated as svg',
    !isSvgDataUrl('data:image/png;base64,iVBORw0KGgo='));

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  check('png data urls pass through untouched', sanitizeSvgDataUrl(png).url === png);

  const evil = 'data:image/svg+xml;base64,' +
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="5" height="5"/></svg>').toString('base64');
  const cleaned = sanitizeSvgDataUrl(evil);
  check('an evil svg data url is cleaned, not passed through', cleaned.url !== evil);
  const decoded = Buffer.from(cleaned.url.split(',')[1], 'base64').toString('utf8');
  const bad = isInert(decoded);
  check('the cleaned data url decodes to inert markup', bad === null, bad || '');
  check('the harmless part of it survived', decoded.includes('<rect'));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
