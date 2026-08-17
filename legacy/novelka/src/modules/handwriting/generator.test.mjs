/**
 * Handwriting generator tests.  npm run test:handwriting
 *
 * The thing that actually matters: a child traces these. A letter that sits
 * below the baseline, or is missing a stroke, or has dashes bunched on the
 * curves, teaches the wrong shape. Every check here is about the geometry
 * being correct on paper.
 */
import {
  LETTERFORMS, UPPERCASE, LOWERCASE, NUMERALS, getLetterform,
  flattenStroke, ASCENDER, MIDLINE, BASELINE, DESCENDER,
} from './letterforms.built.mjs';
import {
  placeGlyph, buildRow, generateWorksheets, charactersFor,
  totalStrokeLength, DEFAULT_OPTIONS,
} from './generator.built.mjs';

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

console.log('\n=== alphabet coverage ===');
{
  check('26 uppercase letters', UPPERCASE.length === 26, String(UPPERCASE.length));
  check('26 lowercase letters', LOWERCASE.length === 26, String(LOWERCASE.length));
  check('10 digits', NUMERALS.length === 10, String(NUMERALS.length));

  const missingU = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => !getLetterform(c));
  check('every A-Z is defined', missingU.length === 0, missingU.join(''));
  const missingL = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((c) => !getLetterform(c));
  check('every a-z is defined', missingL.length === 0, missingL.join(''));
  const missingD = '0123456789'.split('').filter((c) => !getLetterform(c));
  check('every 0-9 is defined', missingD.length === 0, missingD.join(''));
}

console.log('\n=== no empty or degenerate letters ===');
{
  const empty = Object.keys(LETTERFORMS).filter((c) => LETTERFORMS[c].strokes.length === 0);
  check('no letter has zero strokes', empty.length === 0, empty.join(''));

  const tiny = Object.keys(LETTERFORMS).filter((c) => totalStrokeLength(c) < 0.35);
  check('no letter is suspiciously short (missing strokes)', tiny.length === 0,
    tiny.map((c) => `${c}=${totalStrokeLength(c).toFixed(2)}`).join(' '));

  const badAspect = Object.keys(LETTERFORMS).filter(
    (c) => LETTERFORMS[c].aspect <= 0.15 || LETTERFORMS[c].aspect > 1.1);
  check('every aspect ratio is sane', badAspect.length === 0, badAspect.join(''));
}

console.log('\n=== letters stay inside their box ===');
{
  const outOfBounds = [];
  for (const [ch, form] of Object.entries(LETTERFORMS)) {
    for (const s of form.strokes) {
      for (const p of flattenStroke(s)) {
        if (p.x < -0.02 || p.x > 1.02 || p.y < ASCENDER - 0.02 || p.y > DESCENDER + 0.02) {
          outOfBounds.push(`${ch}(${p.x.toFixed(2)},${p.y.toFixed(2)})`);
        }
      }
    }
  }
  check('no stroke escapes the 0..1 box', outOfBounds.length === 0,
    outOfBounds.slice(0, 6).join(' '));
}

console.log('\n=== letters sit on the right guide lines ===');
{
  const bottomOf = (ch) => Math.max(...getLetterform(ch).strokes
    .flatMap((s) => flattenStroke(s)).map((p) => p.y));
  const topOf = (ch) => Math.min(...getLetterform(ch).strokes
    .flatMap((s) => flattenStroke(s)).map((p) => p.y));

  // Descenders must go BELOW the baseline. This is the check that catches a
  // 'p' drawn like a 'b'.
  const descenders = ['g', 'j', 'p', 'q', 'y'];
  const notDescending = descenders.filter((c) => bottomOf(c) < BASELINE + 0.08);
  check('g j p q y descend below the baseline', notDescending.length === 0,
    notDescending.map((c) => `${c}=${bottomOf(c).toFixed(2)}`).join(' '));

  // Non-descenders must NOT.
  const shouldSit = ['a', 'c', 'e', 'm', 'n', 'o', 'r', 's', 'u', 'v', 'w', 'x', 'z'];
  const sinking = shouldSit.filter((c) => bottomOf(c) > BASELINE + 0.03);
  check('x-height letters rest on the baseline', sinking.length === 0,
    sinking.map((c) => `${c}=${bottomOf(c).toFixed(2)}`).join(' '));

  // Ascenders reach the top line.
  const ascenders = ['b', 'd', 'f', 'h', 'k', 'l', 't'];
  const tooShort = ascenders.filter((c) => topOf(c) > MIDLINE - 0.05);
  check('b d f h k l t reach up to the ascender', tooShort.length === 0,
    tooShort.map((c) => `${c}=${topOf(c).toFixed(2)}`).join(' '));

  // x-height letters must start at the midline, not the ascender.
  const tooTall = shouldSit.filter((c) => topOf(c) < MIDLINE - 0.06);
  check('x-height letters start at the midline', tooTall.length === 0,
    tooTall.map((c) => `${c}=${topOf(c).toFixed(2)}`).join(' '));

  // Capitals span ascender to baseline.
  const capsWrong = UPPERCASE.filter((c) => topOf(c) > 0.06 || bottomOf(c) < BASELINE - 0.06);
  check('capitals span ascender to baseline', capsWrong.length === 0,
    capsWrong.map((c) => `${c}[${topOf(c).toFixed(2)},${bottomOf(c).toFixed(2)}]`).join(' '));
}

console.log('\n=== stroke count matches how letters are taught ===');
{
  // Counts are how the letter is TAUGHT — one count per pencil lift.
  // These were previously wrong because several letters were stored as a
  // single multi-corner polyline, which the renderer collapsed into one
  // straight line (L, V, Z, M, N, W all rendered as a single stroke on paper).
  const expect = {
    A: 3, E: 4, F: 3, H: 3, I: 3, L: 2, T: 2, V: 2, X: 2, Y: 3, Z: 3,
    M: 4, N: 3, W: 4,
    O: 1, C: 1, U: 1, S: 1,
    i: 2, j: 3, l: 1, o: 1, t: 3, x: 2, v: 2, w: 4, z: 3,
  };
  const wrong = Object.entries(expect)
    .filter(([c, n]) => getLetterform(c).strokes.length !== n)
    .map(([c, n]) => `${c}: got ${getLetterform(c).strokes.length}, want ${n}`);
  check('stroke counts are correct', wrong.length === 0, wrong.join('; '));
}

console.log('\n=== no collapsed polylines ===');
{
  // A multi-point `line` stroke is drawn first-point-to-last-point, so every
  // corner in between vanishes. This silently turned M, N, W, Z, L, V, 1, 4, 7
  // into single diagonals on paper while every other test still passed.
  const collapsed = [];
  for (const [ch, form] of Object.entries(LETTERFORMS)) {
    form.strokes.forEach((st, i) => {
      if (st.kind === 'line' && st.points.length > 2) {
        collapsed.push(`${ch}#${i + 1}(${st.points.length}pts)`);
      }
    });
  }
  check('no line stroke has more than two points', collapsed.length === 0,
    collapsed.join(' '));

  // Letters with corners must therefore have several strokes.
  const corners = { M: 4, N: 3, W: 4, Z: 3, z: 3, L: 2, V: 2, v: 2, w: 4 };
  const wrong = Object.entries(corners)
    .filter(([c, n]) => getLetterform(c).strokes.length < n)
    .map(([c, n]) => `${c}: ${getLetterform(c).strokes.length} < ${n}`);
  check('cornered letters keep their corners', wrong.length === 0, wrong.join('; '));
}

console.log('\n=== bowls are round, not pinched ===');
{
  // rx is in normalised units and gets multiplied by the letter's aspect on
  // the way to the page, so a bowl can be geometrically "correct" yet render
  // far narrower than it is tall. Check the RENDERED ratio.
  const bad = [];
  for (const ch of ['a', 'b', 'c', 'd', 'g', 'o', 'p', 'q', 'O', 'Q']) {
    const form = getLetterform(ch);
    const arc = form.strokes.find((s) => s.kind === 'arc');
    if (!arc) continue;
    const ratio = (2 * arc.rx * form.aspect) / (2 * arc.ry);
    if (ratio < 0.78 || ratio > 1.02) bad.push(`${ch}=${ratio.toFixed(2)}`);
  }
  check('bowl width/height renders between 0.78 and 1.02', bad.length === 0, bad.join(' '));
}

console.log('\n=== descender tails hook the right way ===');
{
  // g, j and y hook LEFT under the baseline. An earlier g curved inward from
  // the midline and read as a comma.
  const bad = [];
  for (const ch of ['g', 'j', 'y']) {
    const form = getLetterform(ch);
    // Ignore the dot on i/j: it is a legitimate final stroke well above the
    // baseline, and including it would look like a tail pointing the wrong way.
    const tailStrokes = form.strokes.filter(
      (st) => flattenStroke(st).some((p) => p.y > BASELINE + 0.05));
    const pts = tailStrokes.flatMap((st) => flattenStroke(st));
    const lowest = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const ending = pts[pts.length - 1];
    if (lowest.y < BASELINE + 0.12) bad.push(`${ch} never reaches the descender`);
    if (ending.x >= lowest.x) bad.push(`${ch} tail does not hook left`);
  }
  check('g j y descend and hook left', bad.length === 0, bad.join('; '));
}

console.log('\n=== dotted rendering ===');
{
  const g = placeGlyph('A', 100, 200, 120, { style: 'dotted' }, true);
  check('a traced glyph produces dashes', g.dashes.length > 20, `${g.dashes.length}`);
  check('a blank glyph produces none',
    placeGlyph('A', 0, 0, 120, { style: 'dotted' }, false).dashes.length === 0);

  // Dashes must be evenly spaced ALONG the stroke, including on curves.
  // Spacing by x bunches them up on diagonals; this is that regression test.
  const o = placeGlyph('O', 0, 0, 200, { style: 'dotted' }, true);
  const lens = o.dashes.map((d) => Math.hypot(d.x2 - d.x1, d.y2 - d.y1));
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const spread = Math.max(...lens) / Math.min(...lens);
  check('dash lengths on a curve are uniform', spread < 2.5,
    `max/min = ${spread.toFixed(2)}, avg ${avg.toFixed(2)}pt`);

  // Gaps between consecutive dashes should also be even.
  const gaps = [];
  for (let i = 1; i < o.dashes.length; i++) {
    gaps.push(Math.hypot(o.dashes[i].x1 - o.dashes[i - 1].x2, o.dashes[i].y1 - o.dashes[i - 1].y2));
  }
  const gapSpread = Math.max(...gaps) / Math.max(0.001, Math.min(...gaps.filter((x) => x > 0.01)));
  check('gaps between dashes are uniform', gapSpread < 4, `max/min = ${gapSpread.toFixed(2)}`);

  check('dashes stay inside the glyph box', o.dashes.every(
    (d) => d.x1 >= -1 && d.x2 <= o.width + 1 && d.y1 >= -1 && d.y2 <= o.height + 1));
}

console.log('\n=== glyph placement scales correctly ===');
{
  const small = placeGlyph('B', 0, 0, 50, { style: 'dotted' }, true);
  const big = placeGlyph('B', 0, 0, 400, { style: 'dotted' }, true);
  check('width scales with height', Math.abs((big.width / small.width) - 8) < 0.01,
    `${(big.width / small.width).toFixed(3)}`);
  // A bigger letter needs MORE dashes, not longer ones — otherwise a large
  // letter looks like a dashed line instead of a dotted trace. Dash size is
  // clamped (0.9-3.2pt) so growth is sub-linear by design: 8x the height gives
  // ~2.5x the dots, each still a comfortable dot rather than a long stripe.
  check('a bigger letter gets more dashes', big.dashes.length > small.dashes.length * 2,
    `${small.dashes.length} -> ${big.dashes.length}`);
  const bigLen = big.dashes.map((d) => Math.hypot(d.x2 - d.x1, d.y2 - d.y1));
  check('and its dashes stay dot-sized, not stripes', Math.max(...bigLen) <= 3.3,
    `max ${Math.max(...bigLen).toFixed(2)}pt`);

  const off = placeGlyph('B', 300, 150, 100, { style: 'dotted' }, true);
  check('placement offsets correctly', off.left === 300 && off.top === 150);
  check('all dashes are offset too', off.dashes.every((d) => d.x1 >= 299 && d.y1 >= 149));
}

console.log('\n=== practice rows ===');
{
  const row = buildRow('A', { left: 50, width: 500, top: 100, height: 90 },
    { ...DEFAULT_OPTIONS, tracePerRow: 3 });
  check('a row fits several letters', row.glyphs.length >= 4, `${row.glyphs.length}`);
  check('first 3 are traced', row.glyphs.slice(0, 3).every((g) => g.traced));
  check('the rest are blank practice', row.glyphs.slice(3).every((g) => !g.traced));
  check('nothing overflows the row width',
    row.glyphs.every((g) => g.left + g.width <= 550.01),
    `last ends at ${(row.glyphs.at(-1).left + row.glyphs.at(-1).width).toFixed(1)}`);

  // Letters must not collide.
  let overlap = 0;
  for (let i = 1; i < row.glyphs.length; i++) {
    if (row.glyphs[i].left < row.glyphs[i - 1].left + row.glyphs[i - 1].width) overlap++;
  }
  check('letters never overlap', overlap === 0, `${overlap} collisions`);

  // Guides must be in the right order and correctly spaced.
  check('guides are ordered top to bottom',
    row.ascender < row.midline && row.midline < row.baseline && row.baseline < row.descender);
  check('midline sits at 25% of the box',
    Math.abs((row.midline - row.ascender) / (row.descender - row.ascender) - 0.25) < 0.001);
  check('baseline sits at 75%',
    Math.abs((row.baseline - row.ascender) / (row.descender - row.ascender) - 0.75) < 0.001);

  // Narrow vs wide letters must pack differently.
  const iRow = buildRow('i', { left: 0, width: 500, top: 0, height: 80 }, DEFAULT_OPTIONS);
  const wRow = buildRow('w', { left: 0, width: 500, top: 0, height: 80 }, DEFAULT_OPTIONS);
  check('narrow letters fit more per row than wide ones',
    iRow.glyphs.length > wRow.glyphs.length, `i=${iRow.glyphs.length} w=${wRow.glyphs.length}`);
}

console.log('\n=== full worksheet generation ===');
{
  const area = { left: 50, top: 120, width: 500, height: 560 };
  const res = generateWorksheets({ ...DEFAULT_OPTIONS, charset: 'upper' }, area, 90, 30);
  check('one page per letter', res.pages.length === 26, `${res.pages.length}`);
  check('every page has rows', res.pages.every((p) => p.rows.length > 0));
  check('every row has glyphs', res.pages.every((p) => p.rows.every((r) => r.glyphs.length > 0)));
  check('pages are in alphabetical order', res.pages[0].char === 'A' && res.pages[25].char === 'Z');

  const lower = generateWorksheets({ ...DEFAULT_OPTIONS, charset: 'lower' }, area, 90, 30);
  check('lowercase set generates 26 pages', lower.pages.length === 26);
  check('and uses lowercase forms', lower.pages[0].char === 'a');

  const nums = generateWorksheets({ ...DEFAULT_OPTIONS, charset: 'numbers' }, area, 90, 30);
  check('numbers generate 10 pages', nums.pages.length === 10, `${nums.pages.length}`);

  // 'both' alternates capital and lowercase down the page.
  const both = generateWorksheets({ ...DEFAULT_OPTIONS, charset: 'both', rows: 4 }, area, 90, 30);
  const p0 = both.pages[0];
  check('both-case page is titled "A a"', p0.title === 'A a', p0.title);
  check('rows alternate upper/lower',
    p0.rows[0].glyphs[0].char === 'A' && p0.rows[1].glyphs[0].char === 'a');

  // Custom character set — a child's name.
  const name = generateWorksheets(
    { ...DEFAULT_OPTIONS, only: ['S', 'a', 'r', 'a'] }, area, 90, 30);
  check('a custom character list is honoured', name.pages.length === 4,
    name.pages.map((p) => p.char).join(''));
}

console.log('\n=== rows never run off the page ===');
{
  const area = { left: 50, top: 120, width: 500, height: 200 };
  const res = generateWorksheets({ ...DEFAULT_OPTIONS, rows: 10 }, area, 90, 30);
  const overflow = res.pages[0].rows.filter((r) => r.descender > area.top + area.height + 0.5);
  check('rows that would not fit are dropped', overflow.length === 0,
    `${overflow.length} rows overflow`);
  check('at least one row survives a tight page', res.pages[0].rows.length >= 1);
}

console.log('\n=== stroke order data ===');
{
  const g = placeGlyph('A', 0, 0, 100, { style: 'dotted' }, true);
  check('A exposes 3 stroke starts', g.starts.length === 3, `${g.starts.length}`);
  check('each start has a heading', g.headings.length === g.starts.length);
  check('headings are finite numbers', g.headings.every((h) => Number.isFinite(h)));
  check('paths are provided for outline styles', g.paths.length === 3);
  check('every path has points', g.paths.every((p) => p.length >= 2));

  // The first stroke of A must start at the TOP (it is drawn top-down).
  const first = g.starts[0];
  check('A starts its first stroke away from the very bottom', first.y <= 100 * BASELINE + 1,
    `y=${first.y.toFixed(1)}`);
}

console.log('\n=== charactersFor ===');
{
  check('upper -> 26', charactersFor({ charset: 'upper' }).length === 26);
  check('numbers -> 10', charactersFor({ charset: 'numbers' }).length === 10);
  check('only[] filters to valid characters',
    charactersFor({ charset: 'upper', only: ['A', 'b', '@', '7'] }).join('') === 'Ab7');
  check('unknown characters are dropped, not crashed',
    charactersFor({ charset: 'upper', only: ['@', '#'] }).length === 0);
}


console.log('\n=== word bank quality ===');
{
  const { WORD_BANK, wordFor, wordsFor, phraseFor, NUMBER_WORDS } =
    await import('./word-banks.built.mjs');

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  check('every letter has a word', letters.every((c) => WORD_BANK[c]?.primary));
  check('every letter has alternates', letters.every((c) => wordsFor(c).length >= 2));

  // The word must START with its letter, or the child learns the wrong sound.
  // X is the documented exception: nothing a child knows starts with X.
  const wrongStart = letters.filter(
    (c) => c !== 'X' && !WORD_BANK[c].primary.toUpperCase().startsWith(c));
  check('primary words start with their letter', wrongStart.length === 0, wrongStart.join(''));

  // Soft-C and soft-G teach the wrong phoneme.
  check('C uses a hard sound, not Circle/City',
    /^(Cat|Cake|Cow|Car|Cup)$/.test(WORD_BANK.C.primary), WORD_BANK.C.primary);
  check('G uses a hard sound, not Giraffe',
    !/^(Giraffe|Gem|Giant|Ginger)/i.test(WORD_BANK.G.primary), WORD_BANK.G.primary);

  // Drawable and short enough for a worksheet line.
  const tooLong = letters.filter((c) => WORD_BANK[c].primary.length > 9);
  check('primary words are short enough to trace', tooLong.length === 0,
    tooLong.map((c) => `${c}=${WORD_BANK[c].primary}`).join(' '));

  check('X is handled honestly', phraseFor('X', 'Box') === 'Box ends with X',
    phraseFor('X', 'Box'));
  check('other letters read normally', phraseFor('A', 'Apple') === 'A is for Apple');

  check('digits map to number words', NUMBER_WORDS['3'] === 'Three');
  check('wordFor handles digits', wordFor('7') === 'Seven', wordFor('7'));
  check('wordFor is case-insensitive', wordFor('a') === wordFor('A'));
  check('wordFor cycles alternates', wordFor('A', 1) !== wordFor('A', 0));
  check('unknown characters return empty, not crash', wordFor('@') === '');
}

console.log('\n=== page templates ===');
{
  // Templates build fabric objects, which need a DOM. Borrow one.
  const { JSDOM } = await import('jsdom');
  const { installCanvasStub } = await import('../../../test/helpers/jsdom-canvas-stub.mjs');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  installCanvasStub(dom);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  globalThis.Image = dom.window.Image;

  const { HW_TEMPLATES, getHwTemplate, hwTemplatesFor } =
    await import('./templates.built.mjs');

  check('at least 14 designs', HW_TEMPLATES.length >= 14, String(HW_TEMPLATES.length));
  const ids = HW_TEMPLATES.map((t) => t.id);
  check('ids are unique', new Set(ids).size === ids.length);
  check('every design has a name and description',
    HW_TEMPLATES.every((t) => t.name && t.description));
  check('every design has a preview', HW_TEMPLATES.every((t) => t.preview.includes('<')));
  check('every design declares an access level',
    HW_TEMPLATES.every((t) => ['free', 'ad_unlock', 'premium_only'].includes(t.accessLevel)));
  check('most designs are free',
    HW_TEMPLATES.filter((t) => t.accessLevel === 'free').length >= 8);

  const ctx = {
    page: { id: 'p', name: '', width: 432, height: 648, background: '#fff', data: null },
    pageNumber: 1, pageCount: 30, title: 'A a', char: 'A', rows: 3,
    font: 'Inter', kdpSafe: true, ink: '#111827', accent: '#2b7fb8', word: 'Apple',
  };

  // Some designs are exercises rather than tracing pages (letter matching),
  // so "no rows" is legitimate for them — but they must return SOMETHING to
  // fill, or the page would print blank.
  const EXERCISE = ['match-case'];
  const broken = [];
  for (const t of HW_TEMPLATES) {
    try {
      const r = t.build(ctx);
      if (!r.rows?.length && !EXERCISE.includes(t.id)) broken.push(`${t.id}: no rows`);
      if (EXERCISE.includes(t.id) && !r.matchColumns) {
        broken.push(`${t.id}: exercise design returns nothing to fill`);
      }
      // every row must sit inside the page
      for (const row of r.rows) {
        if (row.left < 0 || row.top < 0
            || row.left + row.width > ctx.page.width + 0.5
            || row.top + row.height > ctx.page.height + 0.5) {
          broken.push(`${t.id}: row escapes the page`);
          break;
        }
        if (row.height < 20) broken.push(`${t.id}: row too short (${row.height.toFixed(1)})`);
      }
      // rows must not overlap each other
      for (let i = 1; i < r.rows.length; i++) {
        if (r.rows[i].top < r.rows[i - 1].top + r.rows[i - 1].height - 0.5) {
          broken.push(`${t.id}: rows overlap`);
          break;
        }
      }
      for (const s of r.imageSlots ?? []) {
        if (s.width < 10 || s.height < 10) broken.push(`${t.id}: degenerate image slot`);
      }
    } catch (e) {
      broken.push(`${t.id}: threw ${e.message}`);
    }
  }
  check('every design builds without error', broken.length === 0, broken.slice(0, 5).join('; '));

  // A tiny trim size must still produce something usable, not negative heights.
  const tiny = { ...ctx, page: { ...ctx.page, width: 288, height: 432 }, rows: 6 };
  const tinyBroken = HW_TEMPLATES.filter((t) => {
    try {
      const r = t.build(tiny);
      return r.rows.some((row) => row.height <= 0 || row.width <= 0);
    } catch { return true; }
  }).map((t) => t.id);
  check('the alphabet grid returns a label column',
    !!getHwTemplate('alphabet-grid').build(ctx).labelColumn);
  check('the matching page returns its two columns',
    !!getHwTemplate('match-case').build(ctx).matchColumns);
  check('designs survive a small trim size', tinyBroken.length === 0, tinyBroken.join(' '));

  check('unknown id falls back to a real design', getHwTemplate('nope').id === 'classic');
  check('number pages hide letter-only designs',
    !hwTemplatesFor('numbers').some((t) => t.id === 'picture-word'));
  check('letter pages hide the counting design',
    !hwTemplatesFor('upper').some((t) => t.id === 'count-trace'));
  check('number pages DO offer counting',
    hwTemplatesFor('numbers').some((t) => t.id === 'count-trace'));

  // Designs that promise a giant letter must actually return a slot for it,
  // and it must be big enough to colour in / join dots on.
  const heroDesigns = ['colour-letter', 'dot-to-dot'];
  const heroBroken = heroDesigns.filter((id) => {
    const r = getHwTemplate(id).build(ctx);
    return !r.heroLetter || r.heroLetter.height < 80
      || r.heroLetter.top < 0
      || r.heroLetter.top + r.heroLetter.height > ctx.page.height;
  });
  check('colour-in and dot-to-dot return a usable hero letter', heroBroken.length === 0,
    heroBroken.join(' '));

  // The hero must not sit on top of the practice rows.
  const heroOverlap = heroDesigns.filter((id) => {
    const r = getHwTemplate(id).build(ctx);
    if (!r.heroLetter || !r.rows.length) return false;
    return r.heroLetter.top + r.heroLetter.height > r.rows[0].top + 0.5;
  });
  check('the hero letter never overlaps the practice rows', heroOverlap.length === 0,
    heroOverlap.join(' '));

  // Every design should use most of the page. A design that stops halfway is
  // wasting paper the customer is paying to print.
  const wasteful = HW_TEMPLATES.filter((t) => {
    const r = t.build(ctx);
    const last = r.rows.at(-1);
    const usedTo = Math.max(
      last ? last.top + last.height : 0,
      ...r.imageSlots.map((s) => s.top + s.height),
      r.heroLetter ? r.heroLetter.top + r.heroLetter.height : 0,
      r.matchColumns ? r.matchColumns.top + r.matchColumns.height : 0,
      r.labelColumn ? r.labelColumn.top + r.labelColumn.rowHeight * r.labelColumn.rows : 0,
    );
    return usedTo < ctx.page.height * 0.80;
  }).map((t) => t.id);
  check('no design wastes the bottom of the page', wasteful.length === 0, wasteful.join(' '));

  // The X correction must survive into the rendered page. The template used to
  // build the sentence itself, which silently discarded phraseFor()'s fix.
  const xCtx = { ...ctx, char: 'X', title: 'X x', word: 'Box',
    phrase: 'Box ends with X' };
  const xPage = getHwTemplate('picture-word').build(xCtx);
  const xText = xPage.chrome
    .filter((o) => o.type === 'textbox').map((o) => o.text).join(' | ');
  check('the X phrase reaches the page', xText.includes('Box ends with X'), xText);
  check('and never says "X is for Box"', !xText.includes('X is for Box'), xText);

  const withArt = HW_TEMPLATES.filter((t) => t.build(ctx).imageSlots.length > 0);
  check('several designs reserve space for the user\'s own art',
    withArt.length >= 3, withArt.map((t) => t.id).join(' '));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) console.log(`ALL TESTS PASSED  (${pass} checks)`);
else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
