import { computePageGeometry, VALIDATED_TRIM_SIZES } from './geometry';
import { layoutWordSearchPage } from './word-search-solver';
import type {
  PageGeometry,
  WordSearchContentSpec,
  WordSearchLayoutResult,
  StyleConfiguration,
} from './types';

export interface FixtureScenario {
  id: string;
  name: string;
  presetKey: string;
  pageNumber: number;
  pageCount: number;
  spec: WordSearchContentSpec;
  style?: Partial<StyleConfiguration>;
  geometry: PageGeometry;
  layout: WordSearchLayoutResult;
}

const SAMPLE_WORDS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
  'BEGONIA', 'DAHLIA', 'HIBISCUS', 'IRIS',
];

export function buildFixtureScenarios(): FixtureScenario[] {
  const scenarios: FixtureScenario[] = [];

  const trims = [
    { key: 'kdp6x9', label: '6 × 9 in' },
    { key: 'kdp8x10', label: '8 × 10 in' },
    { key: 'kdp85x11', label: '8.5 × 11 in' },
    { key: 'A4', label: 'A4' },
    { key: 'custom7x9', label: '7 × 9 in Custom' },
  ];

  // 1. All 5 Trims - Recto (Odd Page, Gutter Left, 100-page case)
  trims.forEach((t) => {
    const size = VALIDATED_TRIM_SIZES[t.key];
    const geo = computePageGeometry({
      width: size.width,
      height: size.height,
      pageNumber: 1,
      pageCount: 100,
    });
    const spec: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: `${t.label} Word Search`,
      subtitle: 'Puzzle 1 · Botanical Garden',
      showFolio: true,
      folio: 1,
      puzzles: [
        {
          id: `p-${t.key}-r`,
          index: 1,
          size: 14,
          words: SAMPLE_WORDS.slice(0, 12),
        },
      ],
    };
    const layout = layoutWordSearchPage(geo, spec);
    scenarios.push({
      id: `${t.key}-100p-recto`,
      name: `${t.label} (100-Page Case — Recto / Odd — Gutter 27pt on Left)`,
      presetKey: t.key,
      pageNumber: 1,
      pageCount: 100,
      spec,
      geometry: geo,
      layout,
    });
  });

  // 2. All 5 Trims - Verso (Even Page, Gutter Right, 100-page case)
  trims.forEach((t) => {
    const size = VALIDATED_TRIM_SIZES[t.key];
    const geo = computePageGeometry({
      width: size.width,
      height: size.height,
      pageNumber: 2,
      pageCount: 100,
    });
    const spec: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: `${t.label} Word Search`,
      subtitle: 'Puzzle 2 · Botanical Garden',
      showFolio: true,
      folio: 2,
      puzzles: [
        {
          id: `p-${t.key}-v`,
          index: 2,
          size: 14,
          words: SAMPLE_WORDS.slice(0, 12),
        },
      ],
    };
    const layout = layoutWordSearchPage(geo, spec);
    scenarios.push({
      id: `${t.key}-100p-verso`,
      name: `${t.label} (100-Page Case — Verso / Even — Gutter 27pt on Right)`,
      presetKey: t.key,
      pageNumber: 2,
      pageCount: 100,
      spec,
      geometry: geo,
      layout,
    });
  });

  // 3. 200-Page Case (6 × 9 in — Recto & Verso with Gutter 36pt / Safe Width 369pt)
  {
    const size = VALIDATED_TRIM_SIZES.kdp6x9;
    const geo200R = computePageGeometry({
      width: size.width,
      height: size.height,
      pageNumber: 1,
      pageCount: 200,
    });
    const spec200R: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: '6 × 9 in (200-Page Book)',
      subtitle: 'Puzzle 1 · Recto',
      showFolio: true,
      folio: 1,
      puzzles: [{ id: 'p-6x9-200p-r', index: 1, size: 14, words: SAMPLE_WORDS.slice(0, 12) }],
    };
    scenarios.push({
      id: 'kdp6x9-200p-recto',
      name: '6 × 9 in (200-Page Case — Recto — Gutter 36pt on Left, Safe Width 369pt)',
      presetKey: 'kdp6x9',
      pageNumber: 1,
      pageCount: 200,
      spec: spec200R,
      geometry: geo200R,
      layout: layoutWordSearchPage(geo200R, spec200R),
    });

    const geo200V = computePageGeometry({
      width: size.width,
      height: size.height,
      pageNumber: 2,
      pageCount: 200,
    });
    const spec200V: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: '6 × 9 in (200-Page Book)',
      subtitle: 'Puzzle 2 · Verso',
      showFolio: true,
      folio: 2,
      puzzles: [{ id: 'p-6x9-200p-v', index: 2, size: 14, words: SAMPLE_WORDS.slice(0, 12) }],
    };
    scenarios.push({
      id: 'kdp6x9-200p-verso',
      name: '6 × 9 in (200-Page Case — Verso — Gutter 36pt on Right, Safe Width 369pt)',
      presetKey: 'kdp6x9',
      pageNumber: 2,
      pageCount: 200,
      spec: spec200V,
      geometry: geo200V,
      layout: layoutWordSearchPage(geo200V, spec200V),
    });
  }

  // 4. Multi-Up 2-per-page (8.5 × 11, 100-page case)
  {
    const size = VALIDATED_TRIM_SIZES.kdp85x11;
    const geo = computePageGeometry({
      width: size.width,
      height: size.height,
      pageNumber: 3,
      pageCount: 100,
    });
    const spec: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 2,
      title: 'Two Puzzles Per Page',
      showFolio: true,
      folio: 3,
      puzzles: [
        { id: 'p-2up-1', index: 3, size: 12, words: SAMPLE_WORDS.slice(0, 8) },
        { id: 'p-2up-2', index: 4, size: 12, words: SAMPLE_WORDS.slice(8, 16) },
      ],
    };
    const layout = layoutWordSearchPage(geo, spec);
    scenarios.push({
      id: '85x11-100p-2up',
      name: '8.5 × 11 in (100-Page Case — 2 Puzzles Per Page)',
      presetKey: 'kdp85x11',
      pageNumber: 3,
      pageCount: 100,
      spec,
      geometry: geo,
      layout,
    });
  }

  // 5. Intentional Constraint Failure / Invalid Preview Demonstration
  {
    const geo = computePageGeometry({
      width: 4 * 72, // 288 pt (tiny 4x6 page)
      height: 6 * 72, // 432 pt
      pageNumber: 5,
      pageCount: 200,
    });
    const massiveWordList = [
      ...SAMPLE_WORDS,
      'CHRYSANTHEMUM', 'RHODODENDRON', 'BOUGAINVILLEA',
      'ALSTROEMERIA', 'AMARYLLIS', 'ANEMONE', 'ANTHURIUM',
    ];
    const spec: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: 1,
      title: 'Dense 25x25 Grid on 4x6 Page',
      showFolio: false,
      puzzles: [
        { id: 'p-invalid-1', index: 5, size: 25, words: massiveWordList },
      ],
    };
    // minCellSize 14pt -> 25 * 14 = 350pt grid needed on a 234pt wide safe area
    const layout = layoutWordSearchPage(geo, spec, {}, { minCellSize: 14 });
    scenarios.push({
      id: 'invalid-preview-demo',
      name: 'Constraint Failure Demo (INVALID FOR PRODUCTION — Diagnostic Preview Only)',
      presetKey: 'custom4x6',
      pageNumber: 5,
      pageCount: 200,
      spec,
      geometry: geo,
      layout,
    });
  }

  return scenarios;
}

/** Render a single fixture scenario as an SVG element string. */
export function renderScenarioToSVG(scenario: FixtureScenario): string {
  const { geometry, layout } = scenario;
  const { width, height, safeArea, margins, isRecto } = geometry;
  const { frames, warnings, ok } = layout;

  const gutterX = isRecto ? 0 : width - margins.gutter;
  const gutterW = margins.gutter;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width * 0.7}" height="${height * 0.7}" xmlns="http://www.w3.org/2000/svg" style="border: 1px solid #d1d5db; background: #ffffff; border-radius: 4px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">`;

  // Page background & outer boundary
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

  // Gutter band
  svg += `<rect x="${gutterX}" y="0" width="${gutterW}" height="${height}" fill="#fee2e2" opacity="0.6"/>`;
  svg += `<text x="${gutterX + gutterW / 2}" y="${height / 2}" font-size="9" fill="#991b1b" text-anchor="middle" transform="rotate(-90 ${gutterX + gutterW / 2} ${height / 2})" font-family="sans-serif">GUTTER ${margins.gutter}pt (${isRecto ? 'LEFT / RECTO' : 'RIGHT / VERSO'})</text>`;

  // Safe Area
  svg += `<rect x="${safeArea.left}" y="${safeArea.top}" width="${safeArea.width}" height="${safeArea.height}" fill="none" stroke="#6366f1" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  svg += `<text x="${safeArea.left + 4}" y="${safeArea.top - 4}" font-size="8" fill="#6366f1" font-family="sans-serif">Safe Area (${safeArea.width.toFixed(0)} × ${safeArea.height.toFixed(0)} pt)</text>`;

  // Title Frame
  if (frames.titleFrame) {
    const tf = frames.titleFrame;
    svg += `<rect x="${tf.left}" y="${tf.top}" width="${tf.width}" height="${tf.height}" fill="#e0e7ff" stroke="#4338ca" stroke-width="1"/>`;
    svg += `<text x="${tf.left + tf.width / 2}" y="${tf.top + tf.height / 2 + 3}" font-size="10" font-weight="bold" fill="#312e81" text-anchor="middle" font-family="sans-serif">TITLE: ${scenario.spec.title ?? 'Word Search'}</text>`;
  }

  // Subtitle Frame
  if (frames.subtitleFrame) {
    const sf = frames.subtitleFrame;
    svg += `<rect x="${sf.left}" y="${sf.top}" width="${sf.width}" height="${sf.height}" fill="#ede9fe" stroke="#6d28d9" stroke-width="0.8"/>`;
    svg += `<text x="${sf.left + sf.width / 2}" y="${sf.top + sf.height / 2 + 2.5}" font-size="8" fill="#4c1d95" text-anchor="middle" font-family="sans-serif">SUBTITLE</text>`;
  }

  // Puzzles
  frames.puzzles.forEach((pf) => {
    // Caption
    if (pf.captionFrame) {
      const cf = pf.captionFrame;
      svg += `<rect x="${cf.left}" y="${cf.top}" width="${cf.width}" height="${cf.height}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="0.8"/>`;
      svg += `<text x="${cf.left + cf.width / 2}" y="${cf.top + cf.height / 2 + 2}" font-size="8" fill="#334155" text-anchor="middle" font-family="sans-serif">Puzzle ${pf.puzzleIndex}</text>`;
    }

    // Grid Frame
    const gf = pf.gridFrame;
    svg += `<rect x="${gf.left}" y="${gf.top}" width="${gf.width}" height="${gf.height}" fill="#f8fafc" stroke="#0f172a" stroke-width="1.4"/>`;
    const step = gf.width / pf.gridSize;
    for (let c = 1; c < pf.gridSize; c++) {
      svg += `<line x1="${gf.left + c * step}" y1="${gf.top}" x2="${gf.left + c * step}" y2="${gf.top + gf.height}" stroke="#e2e8f0" stroke-width="0.5"/>`;
      svg += `<line x1="${gf.left}" y1="${gf.top + c * step}" x2="${gf.left + gf.width}" y2="${gf.top + c * step}" stroke="#e2e8f0" stroke-width="0.5"/>`;
    }
    svg += `<text x="${gf.left + gf.width / 2}" y="${gf.top + gf.height / 2}" font-size="9" fill="#0f172a" text-anchor="middle" font-family="sans-serif">${pf.gridSize}×${pf.gridSize} Grid (${gf.width.toFixed(0)}pt · cell: ${pf.cellSize.toFixed(1)}pt)</text>`;

    // Word List Frame
    if (pf.wordListFrame) {
      const wf = pf.wordListFrame;
      svg += `<rect x="${wf.left}" y="${wf.top}" width="${wf.width}" height="${wf.height}" fill="#f0fdf4" stroke="#16a34a" stroke-width="1"/>`;
      svg += `<text x="${wf.left + wf.width / 2}" y="${wf.top + 10}" font-size="8" font-weight="bold" fill="#14532d" text-anchor="middle" font-family="sans-serif">Word List (${pf.bankColumns} cols · ${pf.bankRows} rows)</text>`;
      if (pf.bankItemFrames) {
        pf.bankItemFrames.forEach((bf) => {
          svg += `<rect x="${bf.left}" y="${bf.top}" width="${bf.width}" height="${bf.height}" fill="none" stroke="#bbf7d0" stroke-width="0.5"/>`;
        });
      }
    }

    // Divider
    if (pf.dividerFrame) {
      const df = pf.dividerFrame;
      svg += `<line x1="${df.left}" y1="${df.top}" x2="${df.left + df.width}" y2="${df.top}" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    }
  });

  // Folio / Page Number
  if (frames.pageNumberFrame) {
    const fn = frames.pageNumberFrame;
    svg += `<text x="${fn.left + fn.width / 2}" y="${fn.top + 10}" font-size="9" fill="#64748b" text-anchor="middle" font-family="sans-serif">— ${scenario.pageNumber} —</text>`;
  }

  // Status Badge
  const statusColor = ok ? '#16a34a' : '#dc2626';
  const badgeWidth = ok ? 112 : 240;
  const statusText = ok ? '✓ VALID LAYOUT' : `⚠ INVALID FOR PRODUCTION (${warnings.length} WARN)`;
  svg += `<rect x="${width - (badgeWidth + 8)}" y="8" width="${badgeWidth}" height="18" rx="4" fill="${statusColor}"/>`;
  svg += `<text x="${width - (badgeWidth + 8) + badgeWidth / 2}" y="20" font-size="8.5" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${statusText}</text>`;

  svg += '</svg>';
  return svg;
}

/**
 * Generate a complete standalone HTML document displaying all developer fixtures.
 */
export function generateDeveloperFixtureHTML(): string {
  const scenarios = buildFixtureScenarios();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Novelka Responsive Word Search Layout Fixtures</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; margin: 0; }
    h1 { font-size: 22px; margin-bottom: 6px; }
    p.sub { color: #94a3b8; font-size: 14px; margin-top: 0; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .card h2 { font-size: 15px; margin: 0; color: #38bdf8; display: flex; justify-content: space-between; align-items: center; }
    .metrics { font-size: 12px; color: #94a3b8; font-family: monospace; background: #0f172a; padding: 8px 12px; border-radius: 4px; line-height: 1.5; }
    .warnings { margin-top: 4px; display: flex; flex-direction: column; gap: 4px; }
    .warn-badge { font-size: 11px; padding: 4px 8px; border-radius: 4px; background: #7f1d1d; color: #fecaca; font-weight: 500; font-family: monospace; }
    .ok-badge { font-size: 11px; padding: 4px 8px; border-radius: 4px; background: #14532d; color: #bbf7d0; font-weight: 500; }
    .svg-container { display: flex; justify-content: center; background: #334155; padding: 16px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Novelka Phase 1: Responsive Layout Solver Fixtures</h1>
  <p class="sub">Validating pure PDF-point geometry (6×9, 8×10, 8.5×11, A4, 7×9) for Recto/Verso gutters, responsive safe areas, and warning codes.</p>
  <div class="grid">
    ${scenarios
      .map(
        (s) => `
      <div class="card" id="${s.id}">
        <h2>
          <span>${s.name}</span>
          <span class="${s.layout.ok ? 'ok-badge' : 'warn-badge'}">${s.layout.ok ? 'OK' : `${s.layout.warnings.length} WARN`}</span>
        </h2>
        <div class="svg-container">
          ${renderScenarioToSVG(s)}
        </div>
        <div class="metrics">
          Dimensions: ${s.geometry.width} × ${s.geometry.height} pt (${(s.geometry.width / 72).toFixed(2)}" × ${(s.geometry.height / 72).toFixed(2)}")<br/>
          Safe Area: ${s.geometry.safeArea.width.toFixed(1)} × ${s.geometry.safeArea.height.toFixed(1)} pt | Gutter: ${s.geometry.margins.gutter}pt (${s.geometry.isRecto ? 'Recto / Left' : 'Verso / Right'})<br/>
          Grid Side: ${s.layout.measurements.gridSide.toFixed(1)} pt | Cell Size: ${s.layout.measurements.cellSize.toFixed(1)} pt<br/>
          Bank Height: ${s.layout.measurements.bankHeight.toFixed(1)} pt (${s.layout.measurements.bankColumns} cols × ${s.layout.measurements.bankRows} rows)
        </div>
        ${
          s.layout.warnings.length
            ? `<div class="warnings">${s.layout.warnings
                .map((w) => `<div class="warn-badge">[${w.code}] ${w.message}</div>`)
                .join('')}</div>`
            : ''
        }
      </div>
    `,
      )
      .join('')}
  </div>
</body>
</html>`;
}
