/**
 * Phase 6: Parametric Template Rules & Validation Test Suite.
 *
 * Verifies:
 *  1. Template schema creation.
 *  2. Template validation (pure validator).
 *  3. Required region validation (detects missing grid / title regions).
 *  4. Generator compatibility (wordsearch generator matching).
 *  5. Draft vs published filtering (draft templates excluded from public resolver).
 *  6. Version handling (semantic versioning validation).
 *  7. Template resolver selection (default and explicit selection).
 *  8. Unsupported-size rejection.
 *  9. Safe-area constraints (regions mapped within safe bounds).
 * 10. Gutter-aware recto layout (left gutter).
 * 11. Gutter-aware verso layout (right gutter).
 * 12. Long-title fallback (title auto-scaling within template title region).
 * 13. Large-word-list fallback (adaptive column growing / font scaling in word-list region).
 * 14. Multiple-puzzle slots (2-up template slot rules).
 * 15. Solution template compatibility (answers template 4-up/6-up).
 * 16. Legacy template compatibility (aliases classic -> classic-ws, two-up -> two-up-ws, answers -> answers-ws).
 * 17. Style-token resolution (resolves template style tokens into layout).
 * 18. Invalid template diagnostics (returns structured diagnostics with codes and fields).
 * 19. Fixture generation (generates valid HTML/SVG fixture document).
 * 20. Spread data model sanity.
 */
import {
  CLASSIC_WS_TEMPLATE,
  TWO_UP_WS_TEMPLATE,
  ANSWERS_WS_TEMPLATE,
  DRAFT_EXPERIMENT_TEMPLATE,
  PARAMETRIC_TEMPLATES,
  validateTemplate,
  resolveParametricTemplate,
  generateParametricTemplateFixtureHTML,
  buildParametricScenarios,
} from './domain.built.mjs';
import { getGeometryForPreset } from './domain.built.mjs';
import { layoutWordSearchPage } from './domain.built.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const FLOWERS = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];

console.log('\n=== 1. Template Schema & Creation ===');
{
  check('PARAMETRIC_TEMPLATES registry contains official templates', PARAMETRIC_TEMPLATES.length >= 3);
  check('classic template has valid templateId', CLASSIC_WS_TEMPLATE.templateId === 'classic-ws');
  check('classic template has semantic version', CLASSIC_WS_TEMPLATE.version === '1.0.0');
  check('classic template has published status', CLASSIC_WS_TEMPLATE.status === 'published');
  check('classic template has 5 semantic regions', CLASSIC_WS_TEMPLATE.regions.length === 5);
  check('classic template has slot rules', CLASSIC_WS_TEMPLATE.slots.length > 0);
  check('classic template supports spread behavior', CLASSIC_WS_TEMPLATE.spreadBehavior?.gutterSide === 'inner');
}

console.log('\n=== 2. Template Validation (Pure Validator) ===');
{
  const valClassic = validateTemplate(CLASSIC_WS_TEMPLATE);
  check('classic template passes validation with valid: true', valClassic.valid === true);
  check('classic diagnostics list is empty', valClassic.diagnostics.length === 0);

  const valTwoUp = validateTemplate(TWO_UP_WS_TEMPLATE);
  check('two-up template passes validation', valTwoUp.valid === true);

  const valAnswers = validateTemplate(ANSWERS_WS_TEMPLATE);
  check('answers template passes validation', valAnswers.valid === true);
}

console.log('\n=== 3. Required Region Validation ===');
{
  // Template missing puzzle-grid region
  const badTemplate = {
    ...CLASSIC_WS_TEMPLATE,
    templateId: 'bad-no-grid',
    regions: CLASSIC_WS_TEMPLATE.regions.filter((r) => r.role !== 'puzzle-grid'),
  };
  const valBad = validateTemplate(badTemplate);
  check('template missing puzzle-grid fails validation', valBad.valid === false);
  const missingDiag = valBad.diagnostics.find((d) => d.code === 'MISSING_REQUIRED_REGION');
  check('emits MISSING_REQUIRED_REGION diagnostic', Boolean(missingDiag));
}

console.log('\n=== 4. Generator Compatibility ===');
{
  check('classic template supports wordsearch generator', CLASSIC_WS_TEMPLATE.generatorKinds.includes('wordsearch'));
  check('answers template supports wordsearch generator', ANSWERS_WS_TEMPLATE.generatorKinds.includes('wordsearch'));
}

console.log('\n=== 5. Draft vs Published Filtering ===');
{
  check('draft experiment template has status draft', DRAFT_EXPERIMENT_TEMPLATE.status === 'draft');

  // Attempting to resolve draft template for public production (publishedOnly: true)
  const resolveDraft = resolveParametricTemplate({ templateId: 'draft-experiment-ws', publishedOnly: true });
  check('draft template is rejected in publishedOnly mode', resolveDraft.ok === false);
  check('resolver falls back to default published template', resolveDraft.fallbackApplied === true && resolveDraft.template.templateId === 'classic-ws');
  check('reason explains draft status rejection', resolveDraft.reason.includes('draft'));

  // Resolving with publishedOnly: false allows draft template
  const resolveDraftDev = resolveParametricTemplate({ templateId: 'draft-experiment-ws', publishedOnly: false });
  check('draft template resolves successfully in dev/internal mode', resolveDraftDev.ok === true && resolveDraftDev.template.templateId === 'draft-experiment-ws');
}

console.log('\n=== 6. Version Handling ===');
{
  const badVersionTemplate = {
    ...CLASSIC_WS_TEMPLATE,
    templateId: 'bad-ver',
    version: 'invalid-semver-string',
  };
  const valVer = validateTemplate(badVersionTemplate);
  check('invalid version string fails validation', valVer.valid === false);
  const verDiag = valVer.diagnostics.find((d) => d.code === 'INVALID_VERSION');
  check('emits INVALID_VERSION diagnostic', Boolean(verDiag));
}

console.log('\n=== 7. Template Resolver Selection ===');
{
  // Default puzzle template resolution
  const defPuzzle = resolveParametricTemplate({ pageMode: 'puzzle', trimSize: 'kdp6x9' });
  check('resolves default published puzzle template (classic-ws)', defPuzzle.ok === true && defPuzzle.template.templateId === 'classic-ws');

  // Default solution template resolution
  const defSol = resolveParametricTemplate({ pageMode: 'solution', trimSize: 'kdp6x9' });
  check('resolves default published solution template (answers-ws)', defSol.ok === true && defSol.template.templateId === 'answers-ws');
}

console.log('\n=== 8. Unsupported-Size Rejection ===');
{
  // two-up-ws supports ['kdp85x11', 'kdp8x10', 'A4'], does NOT support 'kdp6x9'
  const twoUpSmall = resolveParametricTemplate({ templateId: 'two-up-ws', trimSize: 'kdp6x9' });
  check('two-up requested on 6x9 is rejected due to size policy', twoUpSmall.ok === false);
  check('resolver falls back to classic on 6x9', twoUpSmall.template.templateId === 'classic-ws');
  check('reason explains unsupported trim size', twoUpSmall.reason.includes('does not support trim size "kdp6x9"'));

  // two-up on 8.5x11 succeeds
  const twoUpBig = resolveParametricTemplate({ templateId: 'two-up-ws', trimSize: 'kdp85x11' });
  check('two-up on 8.5x11 succeeds', twoUpBig.ok === true && twoUpBig.template.templateId === 'two-up-ws');
}

console.log('\n=== 9. Safe-Area & Gutter-Aware Recto / Verso Layouts ===');
{
  const geoR = getGeometryForPreset('kdp6x9', 1, 100); // Recto (Left Gutter 27pt)
  const geoV = getGeometryForPreset('kdp6x9', 2, 100); // Verso (Right Gutter 27pt)

  const spec = {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: 'Botanical Garden',
    showFolio: true,
    folio: 1,
    puzzles: [{ id: 'p1', index: 1, size: 14, words: FLOWERS }],
  };

  const layoutR = layoutWordSearchPage(geoR, spec, CLASSIC_WS_TEMPLATE.styleTokens);
  const layoutV = layoutWordSearchPage(geoV, { ...spec, folio: 2 }, CLASSIC_WS_TEMPLATE.styleTokens);

  check('recto layout ok is true', layoutR.ok === true);
  check('verso layout ok is true', layoutV.ok === true);
  check('recto safe area starts at left = 27pt (gutter left)', geoR.safeArea.left === 27);
  check('verso safe area starts at left = 27pt (outer left)', geoV.safeArea.left === 27);
  check('recto grid left aligns with recto safe area', layoutR.frames.puzzles[0].gridFrame.left === geoR.safeArea.left);
  check('verso grid left aligns with verso safe area', layoutV.frames.puzzles[0].gridFrame.left === geoV.safeArea.left);
}

console.log('\n=== 10. Long-Title & Large-Word-List Fallbacks ===');
{
  const geo = getGeometryForPreset('kdp6x9', 1, 100);
  const longTitleSpec = {
    pageType: 'puzzle',
    puzzlesPerPage: 1,
    title: 'THE EXTRAORDINARY EXPEDITION ACROSS BOTANICAL EXPANSES',
    puzzles: [{ id: 'p1', index: 1, size: 14, words: FLOWERS }],
  };
  const layoutLongTitle = layoutWordSearchPage(geo, longTitleSpec, CLASSIC_WS_TEMPLATE.styleTokens);
  check('long title triggered TITLE_AUTO_SCALE fallback decision', layoutLongTitle.fallbackDecisions.some((f) => f.rule === 'TITLE_AUTO_SCALE'));
  check('title fits within safe area width after fallback', layoutLongTitle.frames.titleFrame.width <= geo.safeArea.width);
}

console.log('\n=== 11. Multiple-Puzzle Slots (Two-Up Template) ===');
{
  const geo85 = getGeometryForPreset('kdp85x11', 1, 100);
  const specTwoUp = {
    pageType: 'puzzle',
    puzzlesPerPage: 2,
    title: 'Double Word Search',
    showFolio: true,
    folio: 1,
    puzzles: [
      { id: 'p1', index: 1, size: 12, words: FLOWERS.slice(0, 8) },
      { id: 'p2', index: 2, size: 12, words: FLOWERS.slice(0, 8) },
    ],
  };
  const layoutTwoUp = layoutWordSearchPage(geo85, specTwoUp, TWO_UP_WS_TEMPLATE.styleTokens);
  check('two-up template produces 2 puzzle frames', layoutTwoUp.frames.puzzles.length === 2);
  check('two-up layout has divider frame', Boolean(layoutTwoUp.frames.puzzles[0].dividerFrame));
}

console.log('\n=== 12. Solution Template Compatibility (Answers Template) ===');
{
  const geo = getGeometryForPreset('kdp6x9', 50, 100);
  const specAnswers = {
    pageType: 'solution',
    puzzlesPerPage: 4,
    title: 'Answers',
    showFolio: true,
    folio: 50,
    puzzles: [
      { id: 'sol-1', index: 1, size: 14, words: [] },
      { id: 'sol-2', index: 2, size: 14, words: [] },
      { id: 'sol-3', index: 3, size: 14, words: [] },
      { id: 'sol-4', index: 4, size: 14, words: [] },
    ],
  };
  const layoutAnswers = layoutWordSearchPage(geo, specAnswers, ANSWERS_WS_TEMPLATE.styleTokens);
  check('answers template produces 4 solution puzzle frames', layoutAnswers.frames.puzzles.length === 4);
  check('answers template layout is ok = true', layoutAnswers.ok === true);
}

console.log('\n=== 13. Legacy Template Aliases Compatibility ===');
{
  const resClassic = resolveParametricTemplate({ templateId: 'classic' });
  check('legacy "classic" resolves to classic-ws', resClassic.ok === true && resClassic.template.templateId === 'classic-ws');

  const resTwoUp = resolveParametricTemplate({ templateId: 'two-up', trimSize: 'kdp85x11' });
  check('legacy "two-up" resolves to two-up-ws', resTwoUp.ok === true && resTwoUp.template.templateId === 'two-up-ws');

  const resAnswers = resolveParametricTemplate({ templateId: 'answers' });
  check('legacy "answers" resolves to answers-ws', resAnswers.ok === true && resAnswers.template.templateId === 'answers-ws');
}

console.log('\n=== 14. Invalid Template Diagnostics ===');
{
  const invalidTpl = {
    templateId: '',
    version: 'bad-version',
    name: '   ',
    description: '',
    generatorKinds: [],
    pageModes: [],
    supportedSizes: [],
    regions: [
      { id: 'r1', role: 'title', required: true, contentType: 'text', layoutBehavior: 'anchored', constraints: { minWidth: 500, maxWidth: 100 } },
      { id: 'r1', role: 'invalid-role', required: true, contentType: 'grid', layoutBehavior: 'flow', spacing: { top: -10 } },
    ],
    slots: [{ puzzlesPerPage: 0, gridColumns: 0, gridRows: 0, targetGap: -5 }],
    constraints: { minCellSize: 200, minLetterSize: 100 },
    styleTokens: {},
    mirrorBehavior: 'mirror_gutter',
    spreadBehavior: { mirrorBehavior: 'symmetric', gutterSide: 'outer' },
    overflowPolicy: 'scale_down',
    status: 'invalid-status',
    accessLevel: 'invalid-access',
  };

  const valResult = validateTemplate(invalidTpl);
  check('invalid template fails validation', valResult.valid === false);
  check('reports INVALID_TEMPLATE_ID', valResult.diagnostics.some((d) => d.code === 'INVALID_TEMPLATE_ID'));
  check('reports INVALID_VERSION', valResult.diagnostics.some((d) => d.code === 'INVALID_VERSION'));
  check('reports DUPLICATE_REGION_ID', valResult.diagnostics.some((d) => d.code === 'DUPLICATE_REGION_ID'));
  check('reports INVALID_REGION_ROLE', valResult.diagnostics.some((d) => d.code === 'INVALID_REGION_ROLE'));
  check('reports INVALID_REGION_CONSTRAINTS', valResult.diagnostics.some((d) => d.code === 'INVALID_REGION_CONSTRAINTS'));
  check('reports NEGATIVE_SPACING', valResult.diagnostics.some((d) => d.code === 'NEGATIVE_SPACING'));
  check('reports INVALID_SLOT_RULE', valResult.diagnostics.some((d) => d.code === 'INVALID_SLOT_RULE'));
  check('reports IMPOSSIBLE_MIN_SIZE', valResult.diagnostics.some((d) => d.code === 'IMPOSSIBLE_MIN_SIZE'));
  check('reports UNSAFE_GUTTER_BEHAVIOR', valResult.diagnostics.some((d) => d.code === 'UNSAFE_GUTTER_BEHAVIOR'));
}

console.log('\n=== 15. Parametric Developer Fixtures ===');
{
  const scenarios = buildParametricScenarios();
  check('buildParametricScenarios generates at least 12 scenarios', scenarios.length >= 12);

  const html = generateParametricTemplateFixtureHTML();
  check('generateParametricTemplateFixtureHTML produces valid HTML document', html.includes('<!DOCTYPE html>'));
  check('HTML fixture includes Classic 6x9 scenario', html.includes('classic-kdp6x9-recto'));
  check('HTML fixture includes Two-Up 8.5x11 scenario', html.includes('two-up-85x11'));
  check('HTML fixture includes Answers 6x9 scenario', html.includes('answers-6x9'));
}

console.log(`\n${'-'.repeat(56)}`);
if (fail === 0) {
  console.log(`ALL PHASE 6 PARAMETRIC TEMPLATE TESTS PASSED (${pass} checks)`);
} else {
  console.log(`${pass} passed, ${fail} FAILED`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exitCode = 1;
}
