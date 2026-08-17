import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  TEMPLATES,
  applyTemplate,
  buildTemplateJSON,
  type TemplateDef,
} from '../../services/templates';
import { RULINGS } from '../../services/rulings';
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
import { LinesPanel } from '../panels/LinesPanel';
import { Icon } from '../Icon';
import type { GateResult } from '../../services/feature-flags';

/**
 * Template LIBRARY — a big, calm window. Templates only; generators are NOT
 * in here (they keep their own panel in the left rail). Application logic is
 * the exact same code path the old template panel used — this file is shell.
 */

type Scope = 'page' | 'all' | 'blank';
type Category = 'all' | 'interior' | 'planner' | 'puzzle' | 'school' | 'lines' | 'covers';
type PuzzleFilter = 'all' | 'sudoku' | 'wordsearch' | 'crossword' | 'maze';
type Access = 'all' | 'free' | 'pro';

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

const GENERATOR_TAG: Record<PuzzleTemplate['generator'], string> = {
  sudoku: 'Sudoku',
  wordsearch: 'Word Search',
  crossword: 'Crossword',
  maze: 'Maze',
};

const PUZZLE_TEMPLATES: PuzzleTemplate[] = [
  ...SUDOKU_TEMPLATES.map((t) => ({
    key: `sudoku:${t.id}`, id: t.id, name: t.name, description: t.description,
    preview: t.preview, accessLevel: t.accessLevel, generator: 'sudoku' as const, source: t,
  })),
  ...WS_TEMPLATES.map((t) => ({
    key: `wordsearch:${t.id}`, id: t.id, name: t.name, description: t.description,
    preview: t.preview, accessLevel: t.accessLevel, generator: 'wordsearch' as const, source: t,
  })),
  ...CW_TEMPLATES.map((t) => ({
    key: `crossword:${t.id}`, id: t.id, name: t.name, description: t.description,
    preview: t.preview, accessLevel: t.accessLevel, generator: 'crossword' as const, source: t,
  })),
  ...MZ_TEMPLATES.map((t) => ({
    key: `maze:${t.id}`, id: t.id, name: t.name, description: t.description,
    preview: t.preview, accessLevel: t.accessLevel, generator: 'maze' as const, source: t,
  })),
];

const PUZZLE_SUBFILTERS: { key: PuzzleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sudoku', label: 'Sudoku' },
  { key: 'wordsearch', label: 'Word Search' },
  { key: 'crossword', label: 'Crossword' },
  { key: 'maze', label: 'Mazes' },
];

/** Card preview that only mounts its SVG once scrolled near the viewport. */
function LazyPreview({ markup, root }: { markup: string; root: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: root.current ?? null, rootMargin: '320px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, root]);

  return (
    <div ref={ref} className="tpl-lib-prev">
      {visible ? (
        <SafeSvgPreview
          viewBox="0 0 100 141"
          preserveAspectRatio="xMidYMid meet"
          markup={markup}
        />
      ) : (
        <div className="tpl-lib-skeleton" />
      )}
    </div>
  );
}

export function TemplateLibraryModal({
  onClose,
  onOpenCover,
}: {
  onClose: () => void;
  onOpenCover: () => void;
}) {
  const canUseContent = useFlagStore((s) => s.canUseContent);
  const [blocked, setBlocked] = useState<{ gate: GateResult; key: string } | null>(null);
  const { pages, activePageId, replaceAllPages, commit } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const font = useTextStyleStore((s) => s.fontFamily);
  const templateBrowser = useGeneratorStore((s) => s.templateBrowser);

  const [cat, setCat] = useState<Category>('all');
  const [puzzleFilter, setPuzzleFilter] = useState<PuzzleFilter>('all');
  const [access, setAccess] = useState<Access>('all');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('page');
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Opened via "browse puzzle templates" from a generator? Land on that filter.
  useEffect(() => {
    if (!templateBrowser) return;
    setCat('puzzle');
    setPuzzleFilter(templateBrowser.filter);
  }, [templateBrowser]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accessOk = (level: 'free' | 'ad_unlock' | 'premium_only') =>
    access === 'all' ? true : access === 'free' ? level !== 'premium_only' : level === 'premium_only';

  const q = query.trim().toLowerCase();
  const matches = (name: string, description?: string) =>
    !q || name.toLowerCase().includes(q) || (description ?? '').toLowerCase().includes(q);

  const pageTemplates = useMemo(
    () =>
      TEMPLATES.filter(
        (t) =>
          (cat === 'all' || t.category === cat) &&
          accessOk(t.accessLevel) &&
          matches(t.name, t.description),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, access, q],
  );

  const puzzleTemplates = useMemo(
    () =>
      PUZZLE_TEMPLATES.filter(
        (t) =>
          (puzzleFilter === 'all' || t.generator === puzzleFilter) &&
          accessOk(t.accessLevel) &&
          matches(t.name, t.description),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [puzzleFilter, access, q],
  );

  const categories: { key: Category; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: TEMPLATES.length + PUZZLE_TEMPLATES.length + RULINGS.length + 1 },
    { key: 'interior', label: 'Interiors', count: TEMPLATES.filter((t) => t.category === 'interior').length },
    { key: 'planner', label: 'Planners', count: TEMPLATES.filter((t) => t.category === 'planner').length },
    { key: 'puzzle', label: 'Puzzles', count: PUZZLE_TEMPLATES.length },
    { key: 'lines', label: 'Lines & Grids', count: RULINGS.length },
    { key: 'school', label: 'School', count: TEMPLATES.filter((t) => t.category === 'school').length },
    { key: 'covers', label: 'Covers', count: 1 },
  ];

  /* ------------------------------------------------- existing apply logic */

  const applyToOne = async (t: TemplateDef) => {
    const idx = pages.findIndex((p) => p.id === activePageId);
    await applyTemplate(t, font, replace, {
      pageNumber: idx + 1,
      pageCount: pages.length,
    });
    commit(`Template: ${t.name}`);
  };

  const applyToMany = async (t: TemplateDef, onlyBlank: boolean) => {
    useCanvasStore.getState().syncActivePage();
    const current = useCanvasStore.getState().pages;
    const next = [];
    for (let i = 0; i < current.length; i++) {
      const page = current[i];
      if (page.role === 'cover') {
        next.push(page);
        continue;
      }
      const existing = ((page.data as { objects?: unknown[] } | null)?.objects ?? []) as unknown[];
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

  const use = async (t: TemplateDef) => {
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
      onClose();
    } catch {
      setStatus('error', 'Template failed to apply');
    } finally {
      setBusy(false);
    }
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
        title: GENERATOR_TAG[t.generator],
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
                ...common, gridSize: 13, wordCount: 12, bankHeight: 80, theme: 'Preview',
              })
            : t.generator === 'crossword'
              ? (t.source as CwTemplate).build({
                  ...common, gridSize: 15, clueHeight: 120, theme: 'Preview', level: 'Medium',
                })
              : (t.source as MzTemplate).build({ ...common, difficulty: 'Medium' });
      engine.addObjects(result.chrome);
      commit(`Template: ${t.name}`);
      openGeneratorTool(t.generator, t.id);
      setStatus('success', `${t.name} applied — generator opened`);
      onClose();
    } catch {
      setStatus('error', 'Puzzle template failed to apply');
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------- render */

  const renderPageCards = (items: TemplateDef[]) =>
    items.map((t) => (
      <button
        key={t.id}
        className="tpl-lib-card"
        onClick={() => use(t)}
        disabled={busy}
        title={t.description ?? t.name}
      >
        <div className="tpl-lib-art">
          <LazyPreview markup={t.preview} root={gridRef} />
          <LockBadge gate={canUseContent('page-template', t.id, t.accessLevel, t.name)} />
          {t.kdpSafe && <span className="kdp-flag">KDP</span>}
        </div>
        <div className="tpl-lib-cap">
          <span className="tpl-lib-name">{t.name}</span>
        </div>
      </button>
    ));

  const renderPuzzleCards = (items: PuzzleTemplate[]) =>
    items.map((t) => (
      <button
        key={t.key}
        className="tpl-lib-card"
        onClick={() => void applyPuzzleTemplate(t)}
        disabled={busy}
        title={t.description}
      >
        <div className="tpl-lib-art">
          <LazyPreview markup={t.preview} root={gridRef} />
          <LockBadge gate={canUseContent(`${t.generator}-design`, t.id, t.accessLevel, t.name)} />
          <span className="kdp-flag">KDP</span>
        </div>
        <div className="tpl-lib-cap">
          <span className="tpl-lib-name">{t.name}</span>
          <span className="tpl-lib-tag">{GENERATOR_TAG[t.generator]}</span>
        </div>
      </button>
    ));

  const coverCard = (
    <button
      key="cover-creator"
      className="tpl-lib-card"
      onClick={() => {
        onClose();
        onOpenCover();
      }}
      title="Design a full wraparound KDP cover with computed spine width"
    >
      <div className="tpl-lib-art">
        <div className="tpl-lib-prev tpl-lib-coverart">
          <Icon name="book" size={38} />
        </div>
        <span className="kdp-flag">KDP</span>
      </div>
      <div className="tpl-lib-cap">
        <span className="tpl-lib-name">KDP cover creator</span>
        <span className="tpl-lib-tag">Wizard</span>
      </div>
    </button>
  );

  let body: ReactNode;
  if (cat === 'lines') {
    body = (
      <div className="tpl-lib-lines">
        <LinesPanel embedded />
      </div>
    );
  } else if (cat === 'covers') {
    body = <div className="tpl-lib-grid">{coverCard}</div>;
  } else if (cat === 'puzzle') {
    body = <div className="tpl-lib-grid">{renderPuzzleCards(puzzleTemplates)}</div>;
  } else if (cat === 'all') {
    body = (
      <div className="tpl-lib-grid">
        {renderPageCards(pageTemplates)}
        {renderPuzzleCards(puzzleTemplates)}
        {!q && access === 'all' && coverCard}
      </div>
    );
  } else {
    body = <div className="tpl-lib-grid">{renderPageCards(pageTemplates)}</div>;
  }

  const empty =
    cat !== 'lines' &&
    cat !== 'covers' &&
    ((cat === 'puzzle' && puzzleTemplates.length === 0) ||
      (cat !== 'puzzle' && cat !== 'all' && pageTemplates.length === 0) ||
      (cat === 'all' && pageTemplates.length + puzzleTemplates.length === 0));

  return (
    <>
      <div className="tpl-lib-overlay" onClick={onClose}>
        <div
          className="tpl-lib"
          role="dialog"
          aria-modal="true"
          aria-label="Template library"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ------------------------------------------------ header row */}
          <div className="tpl-lib-head">
            <span className="tpl-lib-title">Templates</span>
            <div className="tpl-lib-search">
              <Icon name="search" size={14} />
              <input
                placeholder="Search templates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search templates"
                autoFocus
              />
            </div>
            <button className="btn icon" onClick={onClose} title="Close" aria-label="Close template library">
              <Icon name="close" size={15} />
            </button>
          </div>

          <div className="tpl-lib-body">
            {/* -------------------------------------- thin category rail */}
            <div className="tpl-lib-rail">
              {categories.map((c) => (
                <button
                  key={c.key}
                  className={`tpl-lib-cat ${cat === c.key ? 'active' : ''}`}
                  onClick={() => setCat(c.key)}
                >
                  <span>{c.label}</span>
                  <span className="tpl-lib-count">{c.count}</span>
                </button>
              ))}

              {cat === 'puzzle' && (
                <div className="tpl-lib-sub">
                  {PUZZLE_SUBFILTERS.map((g) => (
                    <button
                      key={g.key}
                      className={`tpl-lib-cat sub ${puzzleFilter === g.key ? 'active' : ''}`}
                      onClick={() => setPuzzleFilter(g.key)}
                    >
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="tpl-lib-railsec">
                <div className="section-title">Access</div>
                <div className="chips">
                  {(['all', 'free', 'pro'] as Access[]).map((a) => (
                    <button
                      key={a}
                      className={`chip ${access === a ? 'active' : ''}`}
                      onClick={() => setAccess(a)}
                    >
                      {a === 'all' ? 'All' : a === 'free' ? 'Free' : 'Pro'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tpl-lib-railsec">
                <div className="section-title">Apply to</div>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                  aria-label="Apply template to"
                >
                  <option value="page">This page</option>
                  <option value="all">All {pages.length} pages</option>
                  <option value="blank">Blank pages only</option>
                </select>
                <label className="toggle-row" style={{ marginTop: 8 }}>
                  <span>Replace content</span>
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                </label>
              </div>
            </div>

            {/* -------------------------------------------------- grid */}
            <div className="tpl-lib-scroll" ref={gridRef}>
              {empty ? (
                <div className="empty" style={{ margin: 24 }}>
                  No templates match{q ? ` “${query}”` : ' these filters'}.
                </div>
              ) : (
                body
              )}
            </div>
          </div>
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
