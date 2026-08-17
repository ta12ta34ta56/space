import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  TEMPLATES,
  applyTemplate,
  buildTemplateJSON,
  getTemplateThumbnail,
  type TemplateDef,
} from '../../services/templates';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { useTextStyleStore } from '../../stores/text-style-store';
import { openGeneratorTool, useGeneratorStore, type GeneratorId } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { SUDOKU_TEMPLATES, type SudokuTemplate } from '../../modules/sudoku-maker/templates';
import { WS_TEMPLATES, type WsTemplate } from '../../modules/word-search/templates';
import { CW_TEMPLATES, type CwTemplate } from '../../modules/crossword/templates';
import { MZ_TEMPLATES, type MzTemplate } from '../../modules/maze/templates';
import { useFlagStore } from '../../stores/flag-store';
import { UpgradePrompt, LockBadge } from '../UpgradePrompt';
import { SafeSvgPreview } from '../SafeSvgPreview';
import { LinesPanel } from './LinesPanel';
import type { GateResult } from '../../services/feature-flags';

/**
 * Crisp template preview: renders a real miniature of the template (built with
 * the same code path as applying it, including the KDP safe-area clamp) via an
 * offscreen Fabric canvas at 2× the card size. The hand-drawn SVG stays as the
 * instant placeholder while the raster lands (and for puzzle templates, which
 * keep their SVG previews).
 */
function TemplateThumb({ t }: { t: TemplateDef }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getTemplateThumbnail(t)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        /* keep the SVG fallback */
      });
    return () => {
      alive = false;
    };
  }, [t]);
  if (url) {
    return <img src={url} alt="" className="template-thumb" draggable={false} />;
  }
  return (
    <SafeSvgPreview
      viewBox="0 0 100 141"
      preserveAspectRatio="none"
      markup={t.preview}
    />
  );
}

type Scope = 'page' | 'all' | 'blank';
type TemplateFilter = 'all' | 'planner' | 'interior' | 'puzzle' | 'lines' | 'school';
type PuzzleFilter = 'all' | 'sudoku' | 'wordsearch' | 'crossword' | 'maze';

type PuzzleTemplate = {
  key: string;
  id: string;
  name: string;
  description: string;
  preview: string;
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  generator: Exclude<GeneratorId, 'handwriting'>;
  source: SudokuTemplate | WsTemplate | CwTemplate | MzTemplate;
};

const PUZZLE_TEMPLATE_GROUPS: { key: PuzzleFilter; label: string }[] = [
  { key: 'all', label: 'All puzzle templates' },
  { key: 'sudoku', label: 'Sudoku' },
  { key: 'wordsearch', label: 'Word Search' },
  { key: 'crossword', label: 'Crossword' },
  { key: 'maze', label: 'Mazes' },
];

const TEMPLATE_FILTERS: { key: TemplateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'planner', label: 'Planners' },
  { key: 'interior', label: 'Interiors' },
  { key: 'puzzle', label: 'Puzzles' },
  { key: 'lines', label: 'Lines & Grids' },
  { key: 'school', label: 'School' },
];

const PUZZLE_TEMPLATES: PuzzleTemplate[] = [
  ...SUDOKU_TEMPLATES.map((t) => ({
    key: `sudoku:${t.id}`,
    id: t.id,
    name: `Sudoku · ${t.name}`,
    description: t.description,
    preview: t.preview,
    accessLevel: t.accessLevel,
    generator: 'sudoku' as const,
    source: t,
  })),
  ...WS_TEMPLATES.map((t) => ({
    key: `wordsearch:${t.id}`,
    id: t.id,
    name: `Word Search · ${t.name}`,
    description: t.description,
    preview: t.preview,
    accessLevel: t.accessLevel,
    generator: 'wordsearch' as const,
    source: t,
  })),
  ...CW_TEMPLATES.map((t) => ({
    key: `crossword:${t.id}`,
    id: t.id,
    name: `Crossword · ${t.name}`,
    description: t.description,
    preview: t.preview,
    accessLevel: t.accessLevel,
    generator: 'crossword' as const,
    source: t,
  })),
  ...MZ_TEMPLATES.map((t) => ({
    key: `maze:${t.id}`,
    id: t.id,
    name: `Maze · ${t.name}`,
    description: t.description,
    preview: t.preview,
    accessLevel: t.accessLevel,
    generator: 'maze' as const,
    source: t,
  })),
];

export function TemplatePanel() {
  const canUseContent = useFlagStore((s) => s.canUseContent);
  const [blocked, setBlocked] = useState<{ gate: GateResult; key: string } | null>(null);
  const { pages, activePageId, replaceAllPages, commit } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const font = useTextStyleStore((s) => s.fontFamily);

  const [cat, setCat] = useState<TemplateFilter>('all');
  const [puzzleFilter, setPuzzleFilter] = useState<PuzzleFilter>('all');
  const templateBrowser = useGeneratorStore((s) => s.templateBrowser);
  const [scope, setScope] = useState<Scope>('page');
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () => (cat === 'all' ? TEMPLATES : cat === 'puzzle' || cat === 'lines' ? [] : TEMPLATES.filter((t) => t.category === cat)),
    [cat],
  );

  const puzzleList = useMemo(
    () => puzzleFilter === 'all'
      ? PUZZLE_TEMPLATES
      : PUZZLE_TEMPLATES.filter((t) => t.generator === puzzleFilter),
    [puzzleFilter],
  );

  useEffect(() => {
    if (!templateBrowser) return;
    setCat('puzzle');
    setPuzzleFilter(templateBrowser.filter);
  }, [templateBrowser]);

  const applyToOne = async (t: TemplateDef) => {
    const idx = pages.findIndex((p) => p.id === activePageId);
    await applyTemplate(t, font, replace, {
      pageNumber: idx + 1,
      pageCount: pages.length,
    });
    commit(`Template: ${t.name}`);
  };

  /** Master-page behaviour: stamp the template onto every page. */
  const applyToMany = async (t: TemplateDef, onlyBlank: boolean) => {
    useCanvasStore.getState().syncActivePage();
    const current = useCanvasStore.getState().pages;

    const next = [];
    for (let i = 0; i < current.length; i++) {
      const page = current[i];
      // Never stamp an interior layout onto the wraparound cover.
      if (page.role === 'cover') {
        next.push(page);
        continue;
      }
      const existing =
        ((page.data as { objects?: unknown[] } | null)?.objects ?? []) as unknown[];

      if (onlyBlank && existing.length > 0) {
        next.push(page);
        continue;
      }

      const objs = await buildTemplateJSON(t, {
        w: page.width,
        h: page.height,
        font,
        pageNumber: i + 1,
        pageCount: current.length,
      });

      next.push({
        ...page,
        data: {
          version: '6.0.0',
          background: page.background ?? '#ffffff',
          objects: replace ? objs : [...objs, ...existing],
        },
      });
    }
    await replaceAllPages(next);
  };

  const applyPuzzleTemplate = async (t: PuzzleTemplate) => {
    const gate = canUseContent(`${t.generator}-design`, t.id, t.accessLevel, t.name);
    if (!gate.allowed) {
      setBlocked({ gate, key: `${t.generator}-design:${t.id}` });
      return;
    }

    setBusy(true);
    try {
      setStatus('busy', `Applying ${t.name}…`);
      const c = engine.requireCanvas();
      const idx = pages.findIndex((p) => p.id === activePageId);
      const page = pages[idx] ?? pages[0];
      if (replace) c.remove(...c.getObjects());
      const common = {
        page,
        pageNumber: idx + 1,
        pageCount: pages.length,
        count: 1,
        font,
        kdpSafe: true,
        title: t.name.split(' · ')[0],
        subtitle: t.name,
        folio: idx + 1,
        ink: '#111827',
        accent: '#2b7fb8',
      };
      const result =
        t.generator === 'sudoku'
          ? (t.source as SudokuTemplate).build({ ...common, gridSize: 9 })
          : t.generator === 'wordsearch'
            ? (t.source as WsTemplate).build({
                ...common,
                gridSize: 13,
                wordCount: 12,
                bankHeight: 80,
                theme: 'Preview',
              })
            : t.generator === 'crossword'
              ? (t.source as CwTemplate).build({
                  ...common,
                  gridSize: 15,
                  clueHeight: 120,
                  theme: 'Preview',
                  level: 'Medium',
                })
              : (t.source as MzTemplate).build({
                  ...common,
                  difficulty: 'Medium',
                });
      engine.addObjects(result.chrome);
      commit(`Template: ${t.name}`);
      openGeneratorTool(t.generator, t.id);
      setStatus('success', `${t.name} applied — generator opened`);
    } catch {
      setStatus('error', 'Puzzle template failed to apply');
    } finally {
      setBusy(false);
    }
  };

  const use = async (t: TemplateDef) => {
    // Enforcement, not decoration: a PRO badge used to be paint. Check the
    // registry (which honours the owner's override) before applying anything.
    const gate = canUseContent('page-template', t.id, t.accessLevel, t.name);
    if (!gate.allowed) {
      setBlocked({ gate, key: `page-template:${t.id}` });
      return;
    }
    setBusy(true);
    try {
      if (scope === 'page') {
        setStatus('busy', `Applying ${t.name}…`);
        await applyToOne(t);
        setStatus('success', `${t.name} applied`);
      } else {
        const onlyBlank = scope === 'blank';
        setStatus('busy', `Applying ${t.name} to ${pages.length} pages…`);
        await applyToMany(t, onlyBlank);
        setStatus('success', `${t.name} applied to ${onlyBlank ? 'blank' : 'all'} pages`);
      }
    } catch {
      setStatus('error', 'Template failed to apply');
    } finally {
      setBusy(false);
    }
  };

  const renderTemplateGrid = (items: TemplateDef[]) => (
    <div className="grid-2">
      {items.map((t) => (
        <button
          key={t.id}
          className="template-card"
          onClick={() => use(t)}
          disabled={busy}
          title={t.description ?? t.name}
        >
          <div className="prev">
            <TemplateThumb t={t} />
            <LockBadge gate={canUseContent('page-template', t.id, t.accessLevel, t.name)} />
            {t.kdpSafe && <span className="kdp-flag">KDP</span>}
          </div>
          <div className="cap">
            {t.name}
            <div style={{ fontSize: 9, color: 'var(--text-mute)' }}>{t.category}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderPuzzleGrid = (items: PuzzleTemplate[]) => (
    <div className="grid-2">
      {items.map((t) => (
        <button
          key={t.key}
          className="template-card"
          onClick={() => void applyPuzzleTemplate(t)}
          disabled={busy}
          title={t.description}
        >
          <div className="prev">
            <SafeSvgPreview
              viewBox="0 0 100 141"
              preserveAspectRatio="none"
              markup={t.preview}
            />
            <LockBadge gate={canUseContent(`${t.generator}-design`, t.id, t.accessLevel, t.name)} />
            <span className="kdp-flag">KDP</span>
          </div>
          <div className="cap">
            {t.name}
            <div style={{ fontSize: 9, color: 'var(--text-mute)' }}>{t.generator}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderSection = (title: string, body: ReactNode) => (
    <section className="section">
      <div className="section-title">{title}</div>
      {body}
    </section>
  );

  return (
    <>
    <div className="panel">
      <div className="panel-head">
        <span>Templates</span>
        <div className="row" style={{ gap: 6 }}>
          <span className="badge">{list.length}</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Apply to</div>
          <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <button
              className={`opt ${scope === 'page' ? 'active' : ''}`}
              onClick={() => setScope('page')}
            >
              <div className="t">This page</div>
            </button>
            <button
              className={`opt ${scope === 'all' ? 'active' : ''}`}
              onClick={() => setScope('all')}
            >
              <div className="t">All {pages.length}</div>
            </button>
            <button
              className={`opt ${scope === 'blank' ? 'active' : ''}`}
              onClick={() => setScope('blank')}
            >
              <div className="t">Blank only</div>
            </button>
          </div>
          <label className="toggle-row" style={{ marginTop: 8 }}>
            <span>Replace existing content</span>
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
          </label>
          {scope !== 'page' && (
            <p className="hint">
              Works like a master page — the layout is rebuilt per page, so the
              gutter flips correctly on left and right pages.
            </p>
          )}
        </div>

        <div className="chips" style={{ marginBottom: 12 }}>
          <button
            className={`chip ${cat === 'all' ? 'active' : ''}`}
            onClick={() => setCat('all')}
          >
            All
          </button>
          {TEMPLATE_FILTERS.filter((c) => c.key !== 'all').map((c) => (
            <button
              key={c.key}
              className={`chip ${cat === c.key ? 'active' : ''}`}
              onClick={() => setCat(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {cat === 'puzzle' && (
          <div className="chips" style={{ marginBottom: 12 }}>
            {PUZZLE_TEMPLATE_GROUPS.map((g) => (
              <button
                key={g.key}
                className={`chip ${puzzleFilter === g.key ? 'active' : ''}`}
                onClick={() => setPuzzleFilter(g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {cat === 'all' ? (
          <>
            {renderSection('Planners', renderTemplateGrid(TEMPLATES.filter((t) => t.category === 'planner')))}
            {renderSection('Interiors', renderTemplateGrid(TEMPLATES.filter((t) => t.category === 'interior')))}
            {renderSection('Puzzles', renderPuzzleGrid(PUZZLE_TEMPLATES))}
            {renderSection('Lines & Grids', <LinesPanel embedded />)}
            {renderSection('School', renderTemplateGrid(TEMPLATES.filter((t) => t.category === 'school')))}
          </>
        ) : cat === 'puzzle' ? (
          renderPuzzleGrid(puzzleList)
        ) : cat === 'lines' ? (
          <LinesPanel embedded />
        ) : (
          renderTemplateGrid(list)
        )}

        <p className="hint" style={{ marginTop: 12 }}>
          <strong>KDP</strong> templates lay themselves out inside the safe area, with
          the gutter on the correct side for each page. Everything lands as ordinary
          editable elements.
        </p>
      </div>
    </div>
    {blocked && (
      <UpgradePrompt
        gate={blocked.gate}
        featureKey={blocked.key}
        onClose={() => setBlocked(null)}
        onUnlocked={() => setBlocked(null)}
      />
    )}
    </>
  );
}
