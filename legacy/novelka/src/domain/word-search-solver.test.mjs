/**
 * Domain Model & Word Search Responsive Layout Solver Tests.
 *
 * Exercises the Fabric-free domain model, pure responsive layout math,
 * KDP gutter placement (recto/verso), adaptive fallbacks, and warning codes.
 */
import {
  VALIDATED_TRIM_SIZES,
  computePageGeometry,
  getGeometryForPreset,
  layoutWordSearchPage,
  createGeneratedInstance,
  matchInstances,
  applyInstanceOverride,
  resetInstanceOverride,
  migrateLegacyMetadata,
  WARNING_CODES,
  generateDeveloperFixtureHTML,
} from './domain.built.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SAMPLE_WORDS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
  'BEGONIA', 'DAHLIA', 'HIBISCUS', 'IRIS',
];

console.log('\n=== 1. Validated Trim Sizes Geometry ===');
for (const [key, spec] of Object.entries(VALIDATED_TRIM_SIZES)) {
  const geoRecto = getGeometryForPreset(key, 1, 100);
  const geoVerso = getGeometryForPreset(key, 2, 100);

  check(`${spec.label} width and height match spec`, geoRecto.width === spec.width && geoRecto.height === spec.height);
  check(`${spec.label} safe area is inside page boundary`, geoRecto.safeArea.width > 0 && geoRecto.safeArea.height > 0);
  check(`${spec.label} recto has gutter on left (${geoRecto.margins.gutter}pt)`, geoRecto.safeArea.left === geoRecto.margins.gutter);
  check(`${spec.label} verso has outer margin on left (${geoVerso.margins.outer}pt)`, geoVerso.safeArea.left === geoVerso.margins.outer);
}

console.log('\n=== 2. Recto and Verso Gutter Placement & Page-Count Bands ===');
{
  // 100 pages (Band <= 150) -> gutter = 27pt (0.375"), outer = 27pt (0.375")
  const r100 = computePageGeometry({ width: 432, height: 648, pageNumber: 1, pageCount: 100 });
  const v100 = computePageGeometry({ width: 432, height: 648, pageNumber: 2, pageCount: 100 });
  check('100p recto gutter = 27pt on left', r100.safeArea.left === 27);
  check('100p recto safe width = 378pt', r100.safeArea.width === 378);
  check('100p verso gutter = 27pt on right (safe left = 27pt)', v100.safeArea.left === 27 && v100.safeArea.width === 378);

  // 200 pages (Band <= 300) -> gutter = 36pt (0.5"), outer = 27pt (0.375")
  // Page width = 432pt
  // Recto: left = 36pt (gutter), right margin = 27pt (outer), safe width = 432 - 36 - 27 = 369pt
  // Verso: left = 27pt (outer), right margin = 36pt (gutter), safe width = 432 - 27 - 36 = 369pt
  const r200 = computePageGeometry({ width: 432, height: 648, pageNumber: 1, pageCount: 200 });
  const v200 = computePageGeometry({ width: 432, height: 648, pageNumber: 2, pageCount: 200 });
  check('200p gutter = 36pt', r200.margins.gutter === 36);
  check('200p recto safe left = 36pt', r200.safeArea.left === 36);
  check('200p recto safe width = 369pt', r200.safeArea.width === 369);
  check('200p verso safe left = 27pt', v200.safeArea.left === 27);
  check('200p verso safe width = 369pt', v200.safeArea.width === 369);
  check('200p verso right edge has 36pt gutter margin', 432 - (v200.safeArea.left + v200.safeArea.width) === 36);

  // 500 pages (Band <= 500) -> gutter = 45pt (0.625"), outer = 27pt
  const r500 = computePageGeometry({ width: 432, height: 648, pageNumber: 1, pageCount: 500 });
  const v500 = computePageGeometry({ width: 432, height: 648, pageNumber: 2, pageCount: 500 });
  check('500p gutter = 45pt', r500.margins.gutter === 45);
  check('500p recto safe left = 45pt', r500.safeArea.left === 45);
  check('500p recto safe width = 360pt', r500.safeArea.width === 360);
  check('500p verso safe left = 27pt', v500.safeArea.left === 27);
  check('500p verso safe width = 360pt', v500.safeArea.width === 360);

  // 700 pages (Band <= 700) -> gutter = 54pt (0.75"), outer = 27pt
  const r700 = computePageGeometry({ width: 432, height: 648, pageNumber: 1, pageCount: 700 });
  const v700 = computePageGeometry({ width: 432, height: 648, pageNumber: 2, pageCount: 700 });
  check('700p gutter = 54pt', r700.margins.gutter === 54);
  check('700p recto safe left = 54pt', r700.safeArea.left === 54);
  check('700p recto safe width = 351pt', r700.safeArea.width === 351);
  check('700p verso safe left = 27pt', v700.safeArea.left === 27);
  check('700p verso safe width = 351pt', v700.safeArea.width === 351);

  // 828 pages (Band <= 828) -> gutter = 63pt (0.875"), outer = 27pt
  const r828 = computePageGeometry({ width: 432, height: 648, pageNumber: 1, pageCount: 828 });
  check('828p gutter = 63pt', r828.margins.gutter === 63);
  check('828p recto safe width = 342pt', r828.safeArea.width === 342);
}

console.log('\n=== 3. Five Validated Trims Single-Up Layout ===');
for (const [key, spec] of Object.entries(VALIDATED_TRIM_SIZES)) {
  const geo = getGeometryForPreset(key, 1, 100);
  const result = layoutWordSearchPage(geo, {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: 'Word Search',
    subtitle: 'Puzzle 1 · Botanical',
    showFolio: true,
    folio: 1,
    puzzles: [
      { id: `p-${key}`, index: 1, size: 14, words: SAMPLE_WORDS.slice(0, 12) },
    ],
  });

  check(`${spec.label} layout is ok (no error warnings)`, result.ok === true);
  check(`${spec.label} grid frame is square`, result.frames.puzzles[0].gridFrame.width === result.frames.puzzles[0].gridFrame.height);
  check(`${spec.label} cell size >= 12pt`, result.frames.puzzles[0].cellSize >= 12, `${result.frames.puzzles[0].cellSize.toFixed(1)}pt`);
  check(`${spec.label} title frame stays inside safe area`, result.frames.titleFrame.top >= geo.safeArea.top);
  check(
    `${spec.label} word list is positioned below grid`,
    result.frames.puzzles[0].wordListFrame.top >=
      result.frames.puzzles[0].gridFrame.top + result.frames.puzzles[0].gridFrame.height,
  );
}

console.log('\n=== 4. Multiple Puzzles Per Page (2-Up and Solutions) ===');
{
  // 8.5 × 11 in 2-up
  const geo = getGeometryForPreset('kdp85x11', 1, 100);
  const result = layoutWordSearchPage(geo, {
    pageType: 'puzzle',
    puzzlesPerPage: 2,
    title: 'Two Puzzles',
    showFolio: true,
    folio: 1,
    puzzles: [
      { id: 'p-1', index: 1, size: 12, words: SAMPLE_WORDS.slice(0, 8) },
      { id: 'p-2', index: 2, size: 12, words: SAMPLE_WORDS.slice(8, 16) },
    ],
  });

  check('2-up on 8.5x11 passes layout', result.ok === true);
  check('2-up produces 2 puzzle frames', result.frames.puzzles.length === 2);
  const p1 = result.frames.puzzles[0];
  const p2 = result.frames.puzzles[1];
  check(
    'p2 is placed strictly below p1',
    p2.gridFrame.top > p1.wordListFrame.top + p1.wordListFrame.height,
  );
  check('both grids have cell size >= 12pt', p1.cellSize >= 12 && p2.cellSize >= 12);
}
{
  // Answer keys (compact solution layout, 4-up)
  const geo = getGeometryForPreset('kdp6x9', 50, 100);
  const result = layoutWordSearchPage(geo, {
    pageType: 'solution',
    puzzlesPerPage: 2,
    title: 'Answers',
    showFolio: true,
    folio: 50,
    puzzles: [
      { id: 'sol-1', index: 1, size: 14, words: [] },
      { id: 'sol-2', index: 2, size: 14, words: [] },
    ],
  });

  check('solution page has no word list frame', result.frames.puzzles[0].wordListFrame === undefined);
  check('solution page layout is ok', result.ok === true);
}

console.log('\n=== 5. Title Overflow Detection ===');
{
  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  const longTitle = 'THIS IS AN EXTRAORDINARILY LONG WORD SEARCH BOOK TITLE THAT WILL EXCEED ALL AVAILABLE WIDTH';
  const result = layoutWordSearchPage(geo, {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: longTitle,
    puzzles: [{ id: 'p-long-title', index: 1, size: 12, words: SAMPLE_WORDS.slice(0, 8) }],
  });

  check('long title triggers TITLE_OVERFLOW warning', result.warnings.some((w) => w.code === WARNING_CODES.TITLE_OVERFLOW));
  check('solver reports ok=false due to title overflow error', result.ok === false);
}

console.log('\n=== 6. Large Word Lists & Adaptive Bank Fallbacks ===');
{
  // 6x9 with 16x16 grid, 28 words, page title & footer, with minCellSize: 22pt:
  // initial 3 columns gives 10 rows (bank height ~178.5pt), leaving 344.1pt for the grid
  // (cell size 21.5pt < 22pt). The solver adaptively scales bank font or grows columns
  // to recover vertical space, achieving cell size >= 22pt.
  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  const largeList = [
    ...SAMPLE_WORDS,
    'DAFFODIL', 'BLUEBELL', 'POPPY', 'ZINNIA', 'ASTER', 'SNOWDROP', 'FOXGLOVE', 'LUPINE',
    'CAMELLIA', 'GARDENIA', 'MAGNOLIA', 'HYACINTH',
  ];
  const result = layoutWordSearchPage(
    geo,
    {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: 'Flowers',
      showFolio: true,
      folio: 1,
      puzzles: [{ id: 'p-large-list', index: 1, size: 16, words: largeList }],
    },
    { bankColumns: 3, bankFontSize: 11 },
    { minCellSize: 22 },
  );

  check('large word list triggers an adaptive fallback decision', result.fallbackDecisions.length > 0);
  check('adaptive fallback preserved cell size >= 22pt', result.frames.puzzles[0].cellSize >= 22);
  check('large word list layout succeeded after fallback', result.ok === true);
}

console.log('\n=== 7. Small Page / Squeezed Content Warnings ===');
{
  // Scenario A: 25x25 grid on tiny 4x6 page (288x432 pt) with minCellSize: 14pt.
  // Required grid side at minimum cell size is 25 * 14 = 350pt.
  // Safe area width is only 234pt (350pt > 234pt), so minimum readable grid width exceeds available width!
  // Emits GRID_BELOW_MINIMUM and CONTENT_DOES_NOT_FIT (required width > available width) and UNREADABLE_TEXT.
  const geo = computePageGeometry({ width: 4 * 72, height: 6 * 72, pageNumber: 1, pageCount: 100 });
  const result = layoutWordSearchPage(
    geo,
    {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: 'Dense Grid',
      puzzles: [
        {
          id: 'p-impossible',
          index: 1,
          size: 25,
          words: SAMPLE_WORDS,
        },
      ],
    },
    {},
    { minCellSize: 14, minLetterSize: 6 },
  );

  check('impossible grid emits GRID_BELOW_MINIMUM', result.warnings.some((w) => w.code === WARNING_CODES.GRID_BELOW_MINIMUM));
  check('impossible grid emits CONTENT_DOES_NOT_FIT because required width (350pt) > available width (234pt)',
    result.warnings.some((w) => w.code === WARNING_CODES.CONTENT_DOES_NOT_FIT));
  check('impossible grid letter size below 6pt emits UNREADABLE_TEXT', result.warnings.some((w) => w.code === WARNING_CODES.UNREADABLE_TEXT));
  check('impossible grid result.ok is false (invalid for production)', result.ok === false);
}
{
  // Scenario B: Grid fits horizontally and vertically (requiredHeight <= availableHeight),
  // but minCellSize constraint fails (e.g. 18x18 grid on 6x9 with minCellSize: 25pt).
  // Available body height = ~519pt, requiredHeight = ~500pt (<= 519pt), but safe width = 378pt (378/18 = 21pt < 25pt).
  // Must emit GRID_BELOW_MINIMUM, but MUST NOT emit CONTENT_DOES_NOT_FIT vertical overflow when requiredHeight <= availableHeight.
  const geo6x9 = getGeometryForPreset('kdp6x9', 1, 100);
  const resultB = layoutWordSearchPage(
    geo6x9,
    {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: 'Word Search',
      puzzles: [{ id: 'p-grid-min-only', index: 1, size: 18, words: SAMPLE_WORDS.slice(0, 8) }],
    },
    {},
    { minCellSize: 25 },
  );

  check('Scenario B emits GRID_BELOW_MINIMUM (cellSize 21pt < 25pt)', resultB.warnings.some((w) => w.code === WARNING_CODES.GRID_BELOW_MINIMUM));
  check('Scenario B result.ok is false (invalid for production)', resultB.ok === false);
  const contentFitWarn = resultB.warnings.find((w) => w.code === WARNING_CODES.CONTENT_DOES_NOT_FIT);
  if (contentFitWarn) {
    const d = contentFitWarn.details;
    if (d.requiredHeight && d.availableHeight) {
      check('CONTENT_DOES_NOT_FIT details never claim requiredHeight <= availableHeight', d.requiredHeight > d.availableHeight);
    }
  }
}

console.log('\n=== 8. Readability & Letter Constraints ===');
{
  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  // Test with fontScale set very small (0.1) -> letter font size < minLetterSize (6pt)
  const result = layoutWordSearchPage(
    geo,
    {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: 'Tiny Letters',
      puzzles: [{ id: 'p-tiny', index: 1, size: 14, words: SAMPLE_WORDS.slice(0, 10) }],
    },
    { fontScale: 0.1 },
    { minLetterSize: 6 },
  );

  check('tiny letter font size emits UNREADABLE_TEXT', result.warnings.some((w) => w.code === WARNING_CODES.UNREADABLE_TEXT));
}

console.log('\n=== 9. GeneratedInstance Model & Semantic Matching ===');
{
  const inst1 = createGeneratedInstance({
    kind: 'word-search',
    pageId: 'page-1',
    contentId: 'puzzle-1',
    role: 'puzzle',
    layout: { boxSize: 320, bankColumns: 3 },
    style: { fontFamily: 'Georgia', letterColor: '#111111' },
    source: { seed: 1001, puzzleIndex: 1, theme: 'Animals' },
  });

  const inst2 = createGeneratedInstance({
    kind: 'word-search',
    pageId: 'page-2',
    contentId: 'puzzle-2',
    role: 'puzzle',
    layout: { boxSize: 320, bankColumns: 3 },
    style: { fontFamily: 'Georgia', letterColor: '#111111' },
    source: { seed: 1002, puzzleIndex: 2, theme: 'Plants' },
  });

  const inst3 = createGeneratedInstance({
    kind: 'word-search-solution',
    pageId: 'page-3',
    contentId: 'puzzle-1-sol',
    role: 'solution',
    layout: { boxSize: 180 },
    style: { fontFamily: 'Georgia', letterColor: '#111111' },
    source: { seed: 1001, puzzleIndex: 1 },
  });

  const instances = [inst1, inst2, inst3];

  check('instanceId is generated and prefixed', inst1.instanceId.startsWith('inst-'));
  check('objectIds is empty array in Phase 1', Array.isArray(inst1.objectIds) && inst1.objectIds.length === 0);

  const puzzlesOnly = matchInstances(instances, { role: 'puzzle' });
  check('matchInstances finds 2 puzzle instances', puzzlesOnly.length === 2);

  const solutionsOnly = matchInstances(instances, { kind: 'word-search-solution' });
  check('matchInstances finds 1 solution instance', solutionsOnly.length === 1);
}

console.log('\n=== 10. Instance Overrides & Non-Destructive Reset ===');
{
  const inst = createGeneratedInstance({
    kind: 'word-search',
    pageId: 'page-1',
    contentId: 'puzzle-1',
    role: 'puzzle',
    layout: { boxSize: 320, bankColumns: 3 },
    style: { fontFamily: 'Inter', letterColor: '#000000' },
  });

  check('initial instance is not overridden', inst.overrides.isOverridden === false);

  const overridden = applyInstanceOverride(inst, {
    layout: { boxSize: 280 },
    style: { letterColor: '#d64550' },
  });

  check('applied override flags isOverridden = true', overridden.overrides.isOverridden === true);
  check('override stores custom layout boxSize=280', overridden.overrides.layout.boxSize === 280);
  check('override stores custom style color', overridden.overrides.style.letterColor === '#d64550');
  check('base style and layout remain intact', overridden.style.letterColor === '#000000' && overridden.layout.boxSize === 320);

  const reset = resetInstanceOverride(overridden);
  check('resetInstanceOverride clears isOverridden', reset.overrides.isOverridden === false);
  check('resetInstanceOverride removes layout overrides', reset.overrides.layout === undefined);
}

console.log('\n=== 11. Legacy Metadata Compatibility ===');
{
  // Legacy Novelka metadata
  const novelkaData = {
    'novelka:wordsearch-page': {
      kind: 'puzzle',
      puzzleIds: ['ws-1', 'ws-2'],
      perPage: 2,
      templateId: 'two-up',
    },
  };
  const migratedNovelka = migrateLegacyMetadata(novelkaData, 'page-10');
  check('migrates novelka:wordsearch-page to 2 instances', migratedNovelka.length === 2);
  check('migrated contentId matches puzzleId', migratedNovelka[0].contentId === 'ws-1');

  // Legacy Minipdf metadata
  const minipdfData = {
    'minipdf:wordsearch-page': {
      kind: 'solution',
      puzzleIds: ['ws-1', 'ws-2', 'ws-3', 'ws-4'],
      perPage: 4,
      templateId: 'answers',
    },
  };
  const migratedMinipdf = migrateLegacyMetadata(minipdfData, 'page-20');
  check('migrates minipdf:wordsearch-page to 4 instances', migratedMinipdf.length === 4);
  check('migrated role is solution', migratedMinipdf[0].role === 'solution');

  // Legacy Gridpress metadata
  const gridpressData = {
    'gridpress:wordsearch-page': {
      kind: 'puzzle',
      puzzleIds: ['ws-gp-1'],
      perPage: 1,
      templateId: 'classic',
    },
  };
  const migratedGridpress = migrateLegacyMetadata(gridpressData, 'page-30');
  check('migrates gridpress:wordsearch-page to 1 instance', migratedGridpress.length === 1);
}

console.log('\n=== 12. Developer Fixture Generation ===');
{
  const html = generateDeveloperFixtureHTML();
  check('generateDeveloperFixtureHTML produces non-empty HTML document', html.includes('<!DOCTYPE html>'));
  check('HTML fixture includes 100-page 6x9 scenario', html.includes('kdp6x9-100p-recto'));
  check('HTML fixture includes 200-page 6x9 scenario', html.includes('kdp6x9-200p-recto'));
  check('HTML fixture includes 8.5x11 scenario', html.includes('85x11-100p-2up'));
  check('HTML fixture includes invalid preview demo', html.includes('invalid-preview-demo'));
}

console.log(`\n${'-'.repeat(48)}`);
if (fail === 0) {
  console.log(`ALL DOMAIN & LAYOUT SOLVER TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
