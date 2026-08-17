import { isCover, type Page } from '../types/canvas.types';
import { serializedObjectBounds } from './kdp';
import { syncCoverPage, type BookSettings } from './book';

/**
 * Smart book resize.
 *
 * Changing trim size is a BOOK-level operation, never a single-page one:
 *
 *  1. every interior page gets the new trim geometry;
 *  2. generated content reflows through the modules' OWN pure layout code
 *     (`applySpecToPages` / `wsApplySpecToPages` / `cwApplySpecToPages` —
 *     the same functions the panels use), so templates stay the authority
 *     for slots and puzzles auto-fit the new safe area;
 *  3. everything else is scaled proportionally and re-centred;
 *  4. the cover is recomputed via `calculateCover` (through syncCoverPage).
 *
 * The module layout code is imported dynamically so the heavy generator
 * chunks stay lazy. No generator/template logic is modified — only reused.
 */

type AnyObj = Record<string, unknown>;

const num = (v: unknown, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

const objectsOf = (page: Page): AnyObj[] => {
  const d = page.data as AnyObj | null;
  return Array.isArray(d?.objects) ? (d!.objects as AnyObj[]) : [];
};

/* ------------------------------------------------ proportional scaling -- */

function scalePageData(page: Page, newW: number, newH: number): unknown {
  const d = page.data as AnyObj | null;
  if (!d || !Array.isArray(d.objects)) return page.data;
  const s = Math.min(newW / page.width, newH / page.height);
  const dx = (newW - page.width * s) / 2;
  const dy = (newH - page.height * s) / 2;
  const objects = (d.objects as AnyObj[]).map((o) => ({
    ...o,
    left: num(o.left, 0) * s + dx,
    top: num(o.top, 0) * s + dy,
    scaleX: num(o.scaleX, 1) * s,
    scaleY: num(o.scaleY, 1) * s,
  }));
  return { ...d, objects };
}

/* ------------------------------------------------ style derivation ------ */
/* The relayout functions rewrite colours/line widths from the spec, so we
   read those values off the page's existing artwork first — the reflow then
   preserves the user's styling instead of resetting it to defaults. */

function deriveSudoku(page: Page) {
  const objs = objectsOf(page);
  const rules = objs.filter((o) => String(o.sudokuRole ?? '').startsWith('sudoku-rule'));
  const firstId = rules[0]?.sudokuPuzzle;
  const mine = firstId ? rules.filter((r) => r.sudokuPuzzle === firstId) : rules;
  const cells =
    mine.length >= 10 ? Math.max(4, Math.round(mine.length / 2) - 1) : 9;
  const major = mine.find((r) => r.sudokuRole === 'sudoku-rule-major');
  const minor = mine.find((r) => r.sudokuRole === 'sudoku-rule');
  const clue = objs.find(
    (o) =>
      o.sudokuPuzzle === firstId &&
      String(o.type ?? '').toLowerCase().includes('text') &&
      !String(o.sudokuRole ?? '').startsWith('sudoku-rule') &&
      !String(o.sudokuRole ?? '').startsWith('sudoku-coord') &&
      o.sudokuRole !== 'sudoku-label',
  );
  // old cell size, for preserving the number/cell font ratio
  let fontScale: number | undefined;
  if (mine.length && clue && typeof clue.fontSize === 'number') {
    let minL = Infinity, maxR = -Infinity;
    for (const r of mine) {
      const b = serializedObjectBounds(r);
      minL = Math.min(minL, b.left);
      maxR = Math.max(maxR, b.left + b.width);
    }
    const size = maxR - minL;
    if (size > 1) fontScale = Math.min(0.9, Math.max(0.3, clue.fontSize / (size / cells)));
  }
  return {
    cells,
    overrides: {
      ...(major ? { thickLineWidth: num(major.strokeWidth, 2.4) } : {}),
      ...(minor ? { gridLineColor: str(minor.stroke, '#111827') } : {}),
      ...(clue ? { numberColor: str(clue.fill, '#111827') } : {}),
      ...(fontScale ? { fontScale } : {}),
    },
  };
}

function deriveWs(page: Page) {
  const objs = objectsOf(page);
  const by = (role: string) => objs.find((o) => o.wsRole === role);
  const letter = by('ws-letter');
  const rule = by('ws-rule');
  const frame = by('ws-frame');
  const bank = objs.find((o) => o.wsRole === 'ws-bank' && typeof o.fontSize === 'number');
  const answer = by('ws-answer');
  return {
    ...(letter ? { letterColor: str(letter.fill, '#111827') } : {}),
    ...(rule ? { gridLineColor: str(rule.stroke, '#c7ced8') } : {}),
    ...(frame ? { frameWidth: num(frame.strokeWidth, 1.6) } : {}),
    ...(bank ? { bankFontSize: num(bank.fontSize, 11), bankColor: str(bank.fill, '#111827') } : {}),
    ...(answer ? { answerColor: str(answer.stroke ?? answer.fill, '#d64550') } : {}),
  };
}

function deriveCw(page: Page) {
  const objs = objectsOf(page);
  const by = (role: string) => objs.find((o) => o.cwRole === role);
  const cell = by('cw-cell');
  const number = by('cw-number');
  const clue = objs.find((o) => o.cwRole === 'cw-clue' && typeof o.fontSize === 'number');
  const answer = by('cw-answer');
  const frame = by('cw-frame');
  // clue block height, measured off the page like the crossword panel does
  const clues = objs.filter((o) => o.cwRole === 'cw-clue' || o.cwRole === 'cw-clue-head');
  let clueHeight = 0;
  if (clues.length) {
    let top = Infinity, bottom = -Infinity;
    for (const o of clues) {
      const b = serializedObjectBounds(o);
      top = Math.min(top, b.top);
      bottom = Math.max(bottom, b.top + b.height);
    }
    clueHeight = Math.max(0, bottom - top);
  }
  return {
    clueHeight,
    overrides: {
      ...(cell
        ? {
            gridLineColor: str(cell.stroke, '#111827'),
            gridLineWidth: num(cell.strokeWidth, 0.8),
            cellFill: (typeof cell.fill === 'string' ? cell.fill : null) as string | null,
          }
        : {}),
      ...(number ? { numberColor: str(number.fill, '#4b5563') } : {}),
      ...(clue ? { clueFontSize: num(clue.fontSize, 9.5), clueColor: str(clue.fill, '#111827') } : {}),
      ...(answer ? { letterColor: str(answer.fill, '#111827') } : {}),
      ...(frame ? { frameWidth: num(frame.strokeWidth, 0) } : {}),
    },
  };
}

/* ------------------------------------------------ module reflows -------- */

async function reflowSudoku(pages: Page[], refPages: Page[]): Promise<Page[]> {
  const { sudokuMetaOf } = await import('../modules/sudoku-maker/build-pages');
  const { applySpecToPages, DEFAULT_SPEC } = await import('../modules/sudoku-maker/layout');
  // Style is sampled from the ORIGINAL (pre-scale) pages so derived ratios
  // (font scale vs cell size) stay exact.
  const combos = new Map<string, { kind: 'puzzle' | 'solution'; perPage: number; page: Page }>();
  for (const p of refPages) {
    const meta = sudokuMetaOf(p);
    if (!meta || meta.kind === 'heading') continue;
    const key = `${meta.kind}|${meta.perPage}`;
    if (!combos.has(key)) combos.set(key, { kind: meta.kind, perPage: meta.perPage, page: p });
  }
  let cur = pages;
  for (const c of combos.values()) {
    const d = deriveSudoku(c.page);
    const spec = { ...DEFAULT_SPEC, boxSize: 0, ...d.overrides };
    const r = await applySpecToPages(cur, spec, d.cells, c.kind, c.perPage);
    cur = r.pages;
  }
  return cur;
}

async function reflowWordSearch(pages: Page[], refPages: Page[]): Promise<Page[]> {
  const { wsMetaOf } = await import('../modules/word-search/build-pages');
  const { wsApplySpecToPages, DEFAULT_WS_SPEC } = await import('../modules/word-search/layout');
  const combos = new Map<string, { kind: 'puzzle' | 'solution'; perPage: number; page: Page }>();
  for (const p of refPages) {
    const meta = wsMetaOf(p);
    if (!meta) continue;
    const key = `${meta.kind}|${meta.perPage}`;
    if (!combos.has(key)) combos.set(key, { kind: meta.kind, perPage: meta.perPage, page: p });
  }
  let cur = pages;
  for (const c of combos.values()) {
    const spec = { ...DEFAULT_WS_SPEC, boxSize: 0, ...deriveWs(c.page) };
    const r = await wsApplySpecToPages(cur, spec, c.kind, c.perPage);
    cur = r.pages;
  }
  return cur;
}

async function reflowCrossword(pages: Page[], refPages: Page[]): Promise<Page[]> {
  const { cwMetaOf } = await import('../modules/crossword/build-pages');
  const { cwApplySpecToPages, DEFAULT_CW_SPEC } = await import('../modules/crossword/layout');
  const combos = new Map<string, { kind: 'puzzle' | 'solution'; perPage: number; page: Page }>();
  for (const p of refPages) {
    const meta = cwMetaOf(p);
    if (!meta) continue;
    const key = `${meta.kind}|${meta.perPage}`;
    if (!combos.has(key)) combos.set(key, { kind: meta.kind, perPage: meta.perPage, page: p });
  }
  let cur = pages;
  for (const c of combos.values()) {
    const d = deriveCw(c.page);
    const spec = { ...DEFAULT_CW_SPEC, boxSize: 0, ...d.overrides };
    const r = await cwApplySpecToPages(cur, spec, c.kind, c.perPage, d.clueHeight);
    cur = r.pages;
  }
  return cur;
}

/* ------------------------------------------------ the operation --------- */

/**
 * Resize the whole book to `next` settings. Returns the new page list —
 * interior pages at the new trim, generated pages reflowed by their module's
 * layout code, everything else scaled, and the cover recomputed.
 */
export async function resizeBookPages(pages: Page[], next: BookSettings): Promise<Page[]> {
  const newW = next.trimWidth;
  const newH = next.trimHeight;

  // 1. New interior geometry. EVERY page is scaled proportionally first, so
  //    page furniture (titles, folios, dividers, decorations) lands inside
  //    the new trim; the module relayouts below then REWRITE the puzzle
  //    groups from the templates' slots for the new page, overriding the
  //    scaled approximation with exact template-authoritative geometry.
  const resized: Page[] = [];
  for (const p of pages) {
    if (isCover(p)) {
      resized.push(p);
      continue;
    }
    if (Math.abs(p.width - newW) < 0.5 && Math.abs(p.height - newH) < 0.5) {
      resized.push(p);
      continue;
    }
    resized.push({
      ...p,
      width: newW,
      height: newH,
      data: scalePageData(p, newW, newH),
    });
  }

  // 2. Template-authoritative reflow for generated content.
  let out = await reflowSudoku(resized, pages);
  out = await reflowWordSearch(out, pages);
  out = await reflowCrossword(out, pages);

  // 3. Cover geometry is derived — recompute it for the new trim.
  return syncCoverPage(out, next).pages;
}
