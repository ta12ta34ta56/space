import { computePageGeometry, VALIDATED_TRIM_SIZES } from './geometry';
import { layoutWordSearchPage } from './word-search-solver';
import {
  CLASSIC_WS_TEMPLATE,
  TWO_UP_WS_TEMPLATE,
  ANSWERS_WS_TEMPLATE,
} from './template-registry';
import type { ParametricTemplate } from './template-types';
import type {
  PageGeometry,
  WordSearchContentSpec,
  WordSearchLayoutResult,
  StyleConfiguration,
} from './types';

export interface ParametricFixtureScenario {
  id: string;
  name: string;
  template: ParametricTemplate;
  trimKey: string;
  pageNumber: number;
  pageCount: number;
  geometry: PageGeometry;
  layout: WordSearchLayoutResult;
}

const FLOWERS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
];

export function buildParametricScenarios(): ParametricFixtureScenario[] {
  const scenarios: ParametricFixtureScenario[] = [];

  const trims = [
    { key: 'kdp6x9', label: '6 × 9 in' },
    { key: 'kdp8x10', label: '8 × 10 in' },
    { key: 'kdp85x11', label: '8.5 × 11 in' },
    { key: 'A4', label: 'A4' },
    { key: 'custom7x9', label: '7 × 9 in Custom' },
  ];

  // 1. Classic Template across 5 trims (Recto & Verso)
  trims.forEach((t) => {
    const size = VALIDATED_TRIM_SIZES[t.key];

    // Recto
    const geoR = computePageGeometry({ width: size.width, height: size.height, pageNumber: 1, pageCount: 100 });
    const specR: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: `${t.label} Classic Layout`,
      subtitle: 'Puzzle 1 · Recto (Gutter Left)',
      showFolio: true,
      folio: 1,
      puzzles: [{ id: `p-${t.key}-r`, index: 1, size: 14, words: FLOWERS }],
    };
    const styleR: StyleConfiguration = {
      ...CLASSIC_WS_TEMPLATE.styleTokens,
      fontFamily: 'Georgia',
      letterColor: '#111827',
      gridLineColor: '#c7ced8',
      gridLineWidth: 0.6,
      frameWidth: 1.6,
      backgroundColor: null,
      fontScale: 0.56,
      letterSpacing: 0,
      letterCase: 'upper',
      gridStyle: 'plain',
      bankStyle: 'columns',
      bankColumns: 3,
      bankFontSize: 11,
      bankColor: '#111827',
      showTitle: true,
      showDifficulty: false,
      showWordBank: true,
      answerStyle: 'oval',
      answerColor: '#d64550',
    };
    scenarios.push({
      id: `classic-${t.key}-recto`,
      name: `Classic Template — ${t.label} (Recto / Gutter Left)`,
      template: CLASSIC_WS_TEMPLATE,
      trimKey: t.key,
      pageNumber: 1,
      pageCount: 100,
      geometry: geoR,
      layout: layoutWordSearchPage(geoR, specR, styleR),
    });

    // Verso
    const geoV = computePageGeometry({ width: size.width, height: size.height, pageNumber: 2, pageCount: 100 });
    const specV: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: `${t.label} Classic Layout`,
      subtitle: 'Puzzle 2 · Verso (Gutter Right)',
      showFolio: true,
      folio: 2,
      puzzles: [{ id: `p-${t.key}-v`, index: 2, size: 14, words: FLOWERS }],
    };
    scenarios.push({
      id: `classic-${t.key}-verso`,
      name: `Classic Template — ${t.label} (Verso / Gutter Right)`,
      template: CLASSIC_WS_TEMPLATE,
      trimKey: t.key,
      pageNumber: 2,
      pageCount: 100,
      geometry: geoV,
      layout: layoutWordSearchPage(geoV, specV, styleR),
    });
  });

  // 2. Two-Up Template on 8.5 x 11 in
  {
    const size = VALIDATED_TRIM_SIZES.kdp85x11;
    const geo2up = computePageGeometry({ width: size.width, height: size.height, pageNumber: 1, pageCount: 100 });
    const spec2up: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 2,
      title: 'Two-Up Template Layout',
      showFolio: true,
      folio: 1,
      puzzles: [
        { id: 'p2u-1', index: 1, size: 12, words: FLOWERS.slice(0, 8), title: 'Puzzle 1 · Birds' },
        { id: 'p2u-2', index: 2, size: 12, words: FLOWERS.slice(0, 8), title: 'Puzzle 2 · Trees' },
      ],
    };
    const style2up: StyleConfiguration = {
      ...TWO_UP_WS_TEMPLATE.styleTokens,
      fontFamily: 'Inter',
      letterColor: '#111827',
      gridLineColor: '#cbd5e1',
      gridLineWidth: 0.6,
      frameWidth: 1.4,
      backgroundColor: null,
      fontScale: 0.56,
      letterSpacing: 0,
      letterCase: 'upper',
      gridStyle: 'lines',
      bankStyle: 'columns',
      bankColumns: 3,
      bankFontSize: 10,
      bankColor: '#111827',
      showTitle: true,
      showDifficulty: false,
      showWordBank: true,
      answerStyle: 'oval',
      answerColor: '#d64550',
    };
    scenarios.push({
      id: 'two-up-85x11',
      name: 'Two-Up Template — 8.5 × 11 in',
      template: TWO_UP_WS_TEMPLATE,
      trimKey: 'kdp85x11',
      pageNumber: 1,
      pageCount: 100,
      geometry: geo2up,
      layout: layoutWordSearchPage(geo2up, spec2up, style2up),
    });
  }

  // 3. Answer Key Template on 6 x 9 in
  {
    const size = VALIDATED_TRIM_SIZES.kdp6x9;
    const geoAns = computePageGeometry({ width: size.width, height: size.height, pageNumber: 50, pageCount: 100 });
    const specAns: WordSearchContentSpec = {
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
    const styleAns: StyleConfiguration = {
      ...ANSWERS_WS_TEMPLATE.styleTokens,
      fontFamily: 'Inter',
      letterColor: '#111827',
      gridLineColor: '#c7ced8',
      gridLineWidth: 0.6,
      frameWidth: 1.6,
      backgroundColor: null,
      fontScale: 0.504,
      letterSpacing: 0,
      letterCase: 'upper',
      gridStyle: 'plain',
      bankStyle: 'columns',
      bankColumns: 3,
      bankFontSize: 11,
      bankColor: '#111827',
      showTitle: true,
      showDifficulty: false,
      showWordBank: false,
      answerStyle: 'oval',
      answerColor: '#d64550',
    };
    scenarios.push({
      id: 'answers-6x9',
      name: 'Answer Key Template — 6 × 9 in (4-Up Grid)',
      template: ANSWERS_WS_TEMPLATE,
      trimKey: 'kdp6x9',
      pageNumber: 50,
      pageCount: 100,
      geometry: geoAns,
      layout: layoutWordSearchPage(geoAns, specAns, styleAns),
    });
  }

  return scenarios;
}

/** Render a scenario into SVG representation highlighting template regions. */
export function renderParametricScenarioSVG(s: ParametricFixtureScenario): string {
  const { geometry, layout, template } = s;
  const { width, height, safeArea, margins, isRecto } = geometry;
  const { frames, warnings, ok } = layout;

  const gutterX = isRecto ? 0 : width - margins.gutter;
  const gutterW = margins.gutter;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width * 0.7}" height="${height * 0.7}" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid #d1d5db; background: #ffffff; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">`;

  // Page background
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

  // Gutter band
  svg += `<rect x="${gutterX}" y="0" width="${gutterW}" height="${height}" fill="#fee2e2" opacity="0.6"/>`;
  svg += `<text x="${gutterX + gutterW / 2}" y="${height / 2}" font-size="9" fill="#991b1b" text-anchor="middle" transform="rotate(-90 ${gutterX + gutterW / 2} ${height / 2})" font-family="sans-serif">GUTTER ${margins.gutter}pt (${isRecto ? 'LEFT / RECTO' : 'RIGHT / VERSO'})</text>`;

  // Safe Area
  svg += `<rect x="${safeArea.left}" y="${safeArea.top}" width="${safeArea.width}" height="${safeArea.height}" fill="none" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  svg += `<text x="${safeArea.left + 4}" y="${safeArea.top - 4}" font-size="8" fill="#6366f1" font-family="sans-serif">Safe Area [Template: ${template.name}]</text>`;

  // Title Region
  if (frames.titleFrame) {
    const tf = frames.titleFrame;
    svg += `<rect x="${tf.left}" y="${tf.top}" width="${tf.width}" height="${tf.height}" fill="#e0e7ff" stroke="#4338ca" stroke-width="1"/>`;
    svg += `<text x="${tf.left + tf.width / 2}" y="${tf.top + tf.height / 2 + 3}" font-size="10" font-weight="bold" fill="#312e81" text-anchor="middle" font-family="sans-serif">Region: Title</text>`;
  }

  // Puzzles
  frames.puzzles.forEach((pf) => {
    // Caption
    if (pf.captionFrame) {
      const cf = pf.captionFrame;
      svg += `<rect x="${cf.left}" y="${cf.top}" width="${cf.width}" height="${cf.height}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.8"/>`;
      svg += `<text x="${cf.left + cf.width / 2}" y="${cf.top + cf.height / 2 + 2}" font-size="8" fill="#334155" text-anchor="middle" font-family="sans-serif">Region: Caption (Puzzle ${pf.puzzleIndex})</text>`;
    }

    // Grid Region
    const gf = pf.gridFrame;
    svg += `<rect x="${gf.left}" y="${gf.top}" width="${gf.width}" height="${gf.height}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.4"/>`;
    const step = gf.width / pf.gridSize;
    for (let c = 1; c < pf.gridSize; c++) {
      svg += `<line x1="${gf.left + c * step}" y1="${gf.top}" x2="${gf.left + c * step}" y2="${gf.top + gf.height}" stroke="#e2e8f0" stroke-width="0.5"/>`;
      svg += `<line x1="${gf.left}" y1="${gf.top + c * step}" x2="${gf.left + gf.width}" y2="${gf.top + c * step}" stroke="#e2e8f0" stroke-width="0.5"/>`;
    }
    svg += `<text x="${gf.left + gf.width / 2}" y="${gf.top + gf.height / 2}" font-size="9" fill="#0f172a" text-anchor="middle" font-family="sans-serif">Region: Grid (${gf.width.toFixed(0)}pt · cell: ${pf.cellSize.toFixed(1)}pt)</text>`;

    // Word List Region
    if (pf.wordListFrame) {
      const wf = pf.wordListFrame;
      svg += `<rect x="${wf.left}" y="${wf.top}" width="${wf.width}" height="${wf.height}" fill="#f0fdf4" stroke="#16a34a" stroke-width="1"/>`;
      svg += `<text x="${wf.left + wf.width / 2}" y="${wf.top + 10}" font-size="8" font-weight="bold" fill="#14532d" text-anchor="middle" font-family="sans-serif">Region: Word List (${pf.bankColumns} cols)</text>`;
    }

    // Divider
    if (pf.dividerFrame) {
      const df = pf.dividerFrame;
      svg += `<line x1="${df.left}" y1="${df.top}" x2="${df.left + df.width}" y2="${df.top}" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    }
  });

  // Page Number Region
  if (frames.pageNumberFrame) {
    const fn = frames.pageNumberFrame;
    svg += `<text x="${fn.left + fn.width / 2}" y="${fn.top + 10}" font-size="9" fill="#64748b" text-anchor="middle" font-family="sans-serif">— ${s.pageNumber} —</text>`;
  }

  // Status Badge
  const statusColor = ok ? '#16a34a' : '#dc2626';
  const statusText = ok ? '✓ VALID TEMPLATE' : `⚠ ${warnings.length} WARN`;
  svg += `<rect x="${width - 120}" y="8" width="112" height="18" rx="4" fill="${statusColor}"/>`;
  svg += `<text x="${width - 64}" y="20" font-size="8.5" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${statusText}</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * Generate full HTML document for parametric template developer inspection.
 */
export function generateParametricTemplateFixtureHTML(): string {
  const scenarios = buildParametricScenarios();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Novelka Phase 6: Parametric Template Rules Fixtures</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    p.sub { color: #94a3b8; font-size: 14px; margin-top: 0; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .card h2 { font-size: 15px; margin: 0; color: #38bdf8; display: flex; justify-content: space-between; align-items: center; }
    .metrics { font-size: 12px; color: #94a3b8; font-family: monospace; background: #0f172a; padding: 8px 12px; border-radius: 4px; line-height: 1.5; }
    .ok-badge { font-size: 11px; padding: 4px 8px; border-radius: 4px; background: #14532d; color: #bbf7d0; font-weight: 500; }
    .svg-container { display: flex; justify-content: center; background: #334155; padding: 16px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Novelka Phase 6: Parametric Template Rules Fixtures</h1>
  <p class="sub">Validating parametric template regions (title, grid, word-list, divider, folio), slot arrangements (1-up, 2-up, 4-up), and recto/verso mirroring.</p>
  <div class="grid">
    ${scenarios
      .map(
        (s) => `
      <div class="card" id="${s.id}">
        <h2>
          <span>${s.name}</span>
          <span class="ok-badge">${s.template.status.toUpperCase()}</span>
        </h2>
        <div class="svg-container">
          ${renderParametricScenarioSVG(s)}
        </div>
        <div class="metrics">
          Template: ${s.template.name} (v${s.template.version}) [ID: ${s.template.templateId}]<br/>
          Regions: ${s.template.regions.map((r) => r.role).join(', ')}<br/>
          Dimensions: ${s.geometry.width} × ${s.geometry.height} pt | Gutter: ${s.geometry.margins.gutter}pt (${s.geometry.isRecto ? 'Recto' : 'Verso'})<br/>
          Grid Side: ${s.layout.measurements.gridSide.toFixed(1)} pt | Cell: ${s.layout.measurements.cellSize.toFixed(1)} pt
        </div>
      </div>
    `,
      )
      .join('')}
  </div>
</body>
</html>`;
}
