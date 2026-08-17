import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { browseGeneratorTemplates, useGeneratorStore } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { useTextStyleStore } from '../../stores/text-style-store';
import {
  DEFAULT_MAZE, generateMazes,
  type MazeDifficulty, type MazeOptions, type MazeShape,
} from './generator';
import { DEFAULT_MAZE_STYLE, type MarkerStyle, type MazeStyle } from './renderer';
import { mzTemplatesFor, MZ_TEMPLATES } from './templates';
import {
  DEFAULT_MZ_LAYOUT, buildMazePages, mzMetaOf, suggestMzPerPage,
  type MzLayoutOptions, type MzSolutionPlacement,
} from './build-pages';
import {
  mzApplySpecToPages,
  mzRelayoutCanvas,
  mzMaxBoxSize,
  measureMazeSize,
  patchMzStyleOnCanvas,
  type MzLayoutSpec,
} from './layout';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';
import { ApplyToAllButton } from '../../components/editor/ApplyToAllButton';
import {
  placeGeneratedPages,
  generationPage,
  PLACEMENT_OPTIONS,
  type PuzzlePlacement,
} from '../shared/placement';

const SHAPES: { v: MazeShape; label: string; note: string }[] = [
  { v: 'rectangular', label: 'Square', note: 'Classic' },
  { v: 'circular', label: 'Circular', note: 'Rings' },
  { v: 'triangular', label: 'Triangle', note: 'Unusual' },
  { v: 'hexagonal', label: 'Hexagon', note: 'Honeycomb' },
];

const LEVELS: { v: MazeDifficulty; label: string }[] = [
  { v: 'easy', label: 'Easy' },
  { v: 'medium', label: 'Medium' },
  { v: 'hard', label: 'Hard' },
  { v: 'expert', label: 'Expert' },
];

const MARKERS: { v: MarkerStyle; label: string }[] = [
  { v: 'dot', label: 'Dots' },
  { v: 'arrow', label: 'Arrows' },
  { v: 'label', label: 'START / END' },
  { v: 'none', label: 'None' },
];

export function MazePanel() {
  const { pages, activePageId, appendPages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);
  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  // Generated content is ALWAYS built at interior page size — never the cover.
  const genPage = generationPage(pages, activePageId);
  const pageNumber = pages.findIndex((x) => x.id === activePageId) + 1;

  const [opts, setOpts] = useState<MazeOptions>(DEFAULT_MAZE);
  const [count, setCount] = useState(20);
  const [placement, setPlacement] = useState<PuzzlePlacement>('sequence');
  const [layout, setLayout] = useState<MzLayoutOptions>(DEFAULT_MZ_LAYOUT);
  const deepLinkedTemplateId = useGeneratorStore((st) => st.templates.maze);
  const [style, setStyle] = useState<MazeStyle>({ ...DEFAULT_MAZE_STYLE, fontFamily: docFont });
  const [useDocFont, setUseDocFont] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingApply, setPendingApply] = useState(false);
  const [appliedApply, setAppliedApply] = useState(false);

  const meta = mzMetaOf(page);
  const onMazePage = !!meta;

  // Phase 8E live restyling. Refs keep the *latest* style/options readable
  // from callbacks (setState closures would be stale by one render).
  const mzStyleRef = useRef(style);
  mzStyleRef.current = style;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  /** Surgical restyle of the maze objects already on the page. The spec keeps
   *  in step so a later structural relayout reuses the same values. */
  const liveMzStyle = (next: MazeStyle) => {
    mzStyleRef.current = next;
    setStyle(next);
    setPendingApply(true);
    setAppliedApply(false);
    setSpec((s) => ({
      ...s,
      wallColor: next.wallColor,
      wallWidth: next.wallWidth,
      solutionColor: next.solutionColor,
      roundCaps: next.roundCaps,
    }));
    const c = engine.canvas;
    if (!c) return;
    patchMzStyleOnCanvas(c, next);
  };

  useEffect(() => {
    if (useDocFont) setStyle((s) => ({ ...s, fontFamily: docFont }));
  }, [docFont, useDocFont]);

  const perPageChoices = useMemo(
    () => suggestMzPerPage(genPage.width, genPage.height),
    [genPage.width, genPage.height],
  );
  const templateChoices = useMemo(
    () => mzTemplatesFor(layout.mazesPerPage),
    [layout.mazesPerPage],
  );

  // Keep the selections legal when the page count changes.
  useEffect(() => {
    if (!templateChoices.some((t) => t.id === layout.templateId)) {
      setLayout((l) => ({ ...l, templateId: templateChoices[0]?.id ?? 'classic' }));
    }
  }, [templateChoices, layout.templateId]);


  useEffect(() => {
    if (deepLinkedTemplateId && layout.templateId !== deepLinkedTemplateId) {
      setLayout((l) => ({ ...l, templateId: deepLinkedTemplateId }));
    }
  }, [deepLinkedTemplateId, layout.templateId]);

  const [spec, setSpec] = useState<MzLayoutSpec>({
    boxSize: 300,
    wallColor: DEFAULT_MAZE_STYLE.wallColor,
    wallWidth: DEFAULT_MAZE_STYLE.wallWidth,
    solutionColor: DEFAULT_MAZE_STYLE.solutionColor,
    showSolution: false,
    roundCaps: false,
    kdpSafe: true,
    offsetX: 0,
    offsetY: 0,
  });

  const capSize = onMazePage && meta
    ? mzMaxBoxSize(page, pageNumber, pages.length, meta, spec)
    : 400;

  // Read the current size off the page so the slider starts where the art is.
  useEffect(() => {
    if (!onMazePage) return;
    let done = false;
    const read = () => {
      if (done) return;
      const c = engine.canvas;
      if (!c) return;
      flattenPuzzleGroups(c);
      const s = measureMazeSize(c.getObjects());
      if (s && s > 10) {
        setSpec((sp) => ({ ...sp, boxSize: s }));
        done = true;
      }
      groupPuzzleUnits(c);
    };
    read();
    const t = setInterval(read, 250);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => { clearInterval(t); clearTimeout(stop); done = true; };
  }, [onMazePage, activePageId]);

  const patchSpec = (patch: Partial<MzLayoutSpec>) => {
    if (!meta) return;
    const c = engine.canvas;
    let next = { ...spec, ...patch };
    // Preserve the user's current on-screen size for style-only edits.
    if (!('boxSize' in patch) && c && onMazePage) {
      flattenPuzzleGroups(c);
      const s = measureMazeSize(c.getObjects());
      if (s && s > 10) next.boxSize = Math.round(s);
      groupPuzzleUnits(c);
    }
    next.boxSize = Math.min(next.boxSize, capSize);
    setSpec(next);
    setPendingApply(true);
    setAppliedApply(false);
    if (!c) return;
    mzRelayoutCanvas(c, page, pageNumber, pages.length, meta, next, mzStyleRef.current, {
      width: optsRef.current.width,
      height: optsRef.current.height,
      braid: optsRef.current.braid,
      startsAt: optsRef.current.startsAt,
    });
  };

  /** Structural change (size, markers, entrance, solution) — rebuilds the
   *  mazes on the page from their stored seeds, then persists. */
  const commitLive = async () => {
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Maze layout');
  };

  /** Intelligent apply-to-all: push the full spec + style to every same-design
   *  maze page (handles wall/solution colours, widths, markers and size). */
  const applyToAll = async () => {
    if (!meta) return;
    setBusy(true);
    setStatus('busy', 'Updating all maze puzzles…');
    try {
      useCanvasStore.getState().syncActivePage();
      const cur = useCanvasStore.getState().pages;
      const { pages: next, changed } = await mzApplySpecToPages(
        cur,
        spec,
        mzStyleRef.current,
        meta.templateId,
        {
          width: optsRef.current.width,
          height: optsRef.current.height,
          braid: optsRef.current.braid,
          startsAt: optsRef.current.startsAt,
        },
        activePageId,
      );
      if (changed) await replaceAllPages(next);
      setAppliedApply(true);
      setPendingApply(false);
      setStatus('success', changed ? `Updated ${changed + 1} maze pages` : 'Already up to date');
    } catch {
      setStatus('error', 'Could not update all maze pages');
    } finally {
      setBusy(false);
    }
  };

  /** Structural maze option (markers / entrance) — relayout the page. */
  const structural = (mutate: () => void) => {
    mutate();
    patchSpec({});
    setPendingApply(true);
    setAppliedApply(false);
  };

  const generate = async () => {
    setBusy(true);
    setStatus('busy', `Building ${count} maze${count === 1 ? '' : 's'}…`);
    try {
      const mazes = generateMazes(opts, count);
      const { pages: built } = buildMazePages(
        mazes, layout, style,
        { width: genPage.width, height: genPage.height },
        pages.length + 1,
      );
      // Placement only reorders PUZZLE pages; answer pages follow their own rule.
      const placed = placeGeneratedPages({
        built,
        current: pages,
        placement,
        kindOf: (p) => {
          const m = mzMetaOf(p);
          if (!m) return null;
          if (m.kind === 'solution') return 'solution';
          if (m.kind === 'puzzle') return 'puzzle';
          return null;
        },
      });
      if (placed) await replaceAllPages(placed);
      else await appendPages(built);
      setStatus('success', `${built.length} pages added`);
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : 'Could not build the mazes');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof MazeOptions>(k: K, v: MazeOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }));
  const setL = <K extends keyof MzLayoutOptions>(k: K, v: MzLayoutOptions[K]) =>
    setLayout((l) => ({ ...l, [k]: v }));

  const sizeLabel = opts.shape === 'circular'
    ? `${opts.width} rings`
    : opts.shape === 'triangular'
      ? `${opts.height} rows`
      : `${opts.width} × ${opts.height}`;

  void MZ_TEMPLATES;
  void setUseDocFont;
  void sizeLabel;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Maze maker</span>
        <span className="badge">module</span>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Core Setup</div>
          <div className="opt-grid">
            {SHAPES.map((s) => (
              <button key={s.v} className={`opt ${opts.shape === s.v ? 'active' : ''}`} onClick={() => set('shape', s.v)} disabled={busy}>
                <div className="t">{s.label}</div>
                <div className="s">{s.note}</div>
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {LEVELS.map((l) => (
              <button key={l.v} className={`chip ${opts.difficulty === l.v ? 'active' : ''}`} onClick={() => set('difficulty', l.v)} disabled={busy}>{l.label}</button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-title">Volume & Layout</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} className={`chip ${count === n ? 'active' : ''}`} onClick={() => setCount(n)} disabled={busy}>{n}</button>
            ))}
          </div>
          <input type="number" min={1} max={300} value={count} onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} disabled={busy} aria-label="How many mazes" />
          <span className="label" style={{ marginTop: 10 }}>Mazes per page</span>
          <div className="chips">
            {perPageChoices.map((n) => (
              <button key={n} className={`chip ${layout.mazesPerPage === n ? 'active' : ''}`} onClick={() => setL('mazesPerPage', n)} disabled={busy}>{n}</button>
            ))}
          </div>
        </div>

        <details className="section">
          <summary className="section-title">⚙️ Advanced Settings</summary>
          <div className="stack" style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          style={{ justifyContent: 'center' }}
          onClick={() => browseGeneratorTemplates('maze')}
          disabled={busy}
        >
          Browse Templates
        </button>

        <div className="section">
          <div className="section-title">Start & finish</div>
          <div className="chips">
            {MARKERS.map((m) => (
              <button
                key={m.v}
                className={`chip ${mzStyleRef.current.markers === m.v ? 'active' : ''}`}
                onClick={() =>
                  structural(() => {
                    mzStyleRef.current = { ...mzStyleRef.current, markers: m.v };
                    setStyle(mzStyleRef.current);
                  })
                }
                disabled={busy}
              >
                {m.label}
              </button>
            ))}
          </div>
          {opts.shape !== 'circular' && (
            <>
              <span className="label" style={{ marginTop: 10 }}>Entrance</span>
              <div className="chips">
                {(['top', 'bottom', 'left', 'right'] as const).map((s) => (
                  <button
                    key={s}
                    className={`chip ${optsRef.current.startsAt === s ? 'active' : ''}`}
                    onClick={() =>
                      structural(() => {
                        optsRef.current = { ...optsRef.current, startsAt: s };
                        setOpts(optsRef.current);
                      })
                    }
                    disabled={busy || opts.difficulty === 'expert'}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {opts.difficulty === 'expert' && (
                <p className="hint" style={{ marginTop: 6 }}>
                  Expert places the entrance and exit at the two furthest points,
                  so the side cannot be chosen.
                </p>
              )}
            </>
          )}
        </div>

        <div className="section">
          <div className="section-title">Answers</div>
          <div className="opt-grid">
            {([
              ['back_of_book', 'Back of book'],
              ['next_page', 'After each'],
              ['none', 'No answers'],
            ] as [MzSolutionPlacement, string][]).map(([v, l]) => (
              <button
                key={v}
                className={`opt ${layout.solutionPlacement === v ? 'active' : ''}`}
                onClick={() => setL('solutionPlacement', v)}
                disabled={busy}
              >
                <div className="t">{l}</div>
              </button>
            ))}
          </div>
          {layout.solutionPlacement === 'back_of_book' && (
            <>
              <span className="label" style={{ marginTop: 10 }}>Answers per page</span>
              <div className="chips">
                {[1, 4, 6, 9].map((n) => (
                  <button
                    key={n}
                    className={`chip ${layout.solutionsPerPage === n ? 'active' : ''}`}
                    onClick={() => setL('solutionsPerPage', n)}
                    disabled={busy}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {onMazePage && meta && (
          <div className="section" style={{ marginTop: 14 }}>
            <div className="section-title">Maze look</div>
            <p className="hint" style={{ marginBottom: 10 }}>
              {meta.seeds.length} maze{meta.seeds.length === 1 ? '' : 's'} on this page.
              Each maze is a single group — move and resize it with the mouse.
            </p>

            <div className="row between" style={{ marginTop: 8 }}>
              <span className="label" style={{ margin: 0 }}>Walls</span>
              <input
                type="color"
                value={mzStyleRef.current.wallColor}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, wallColor: e.target.value })}
                style={{ width: 50 }}
                aria-label="Wall colour"
              />
            </div>
            <div>
              <span className="label">Wall width — {mzStyleRef.current.wallWidth.toFixed(1)}pt</span>
              <input
                type="range" min={0.5} max={5} step={0.1}
                value={mzStyleRef.current.wallWidth}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, wallWidth: Number(e.target.value) })}
                onMouseUp={() => void commitLive()}
                onTouchEnd={() => void commitLive()}
                aria-label="Wall width"
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Solution</span>
              <input
                type="color"
                value={mzStyleRef.current.solutionColor}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, solutionColor: e.target.value })}
                style={{ width: 50 }}
                aria-label="Solution colour"
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Solution width — {mzStyleRef.current.solutionWidth.toFixed(1)}pt</span>
              <input
                type="number" min={0.5} max={6} step={0.1}
                value={mzStyleRef.current.solutionWidth}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, solutionWidth: Number(e.target.value) || 0.5 })}
                onBlur={() => void commitLive()}
                aria-label="Solution width (pt)"
                style={{ width: 90 }}
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Start marker</span>
              <input
                type="color"
                value={mzStyleRef.current.startColor}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, startColor: e.target.value })}
                style={{ width: 50 }}
                aria-label="Start marker colour"
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>End marker</span>
              <input
                type="color"
                value={mzStyleRef.current.endColor}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, endColor: e.target.value })}
                style={{ width: 50 }}
                aria-label="End marker colour"
              />
            </div>

            <label className="toggle-row" style={{ marginTop: 6 }}>
              <span>Rounded line caps</span>
              <input
                type="checkbox"
                checked={mzStyleRef.current.roundCaps}
                onChange={(e) => liveMzStyle({ ...mzStyleRef.current, roundCaps: e.target.checked })}
                aria-label="Rounded line caps"
              />
            </label>
            <label className="toggle-row">
              <span>Show solution</span>
              <input
                type="checkbox"
                checked={spec.showSolution}
                onChange={(e) => {
                  patchSpec({ showSolution: e.target.checked });
                  setPendingApply(true);
                  setAppliedApply(false);
                }}
                aria-label="Show solution"
              />
            </label>

            <p className="hint" style={{ marginTop: 8 }}>
              Slider/color changes save automatically when you release the control.
            </p>
          </div>
        )}

        <ApplyToAllButton
          label="maze"
          pending={pendingApply}
          applied={appliedApply}
          onApply={applyToAll}
          busy={busy}
        />

       </div>
        </details>

        <details className="section" style={{ marginBottom: 10 }}>
          <summary className="section-title">Placement</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="chips">
              {PLACEMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.v}
                  className={`chip ${placement === opt.v ? 'active' : ''}`}
                  onClick={() => setPlacement(opt.v)}
                  title={opt.hint}
                  disabled={busy}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {PLACEMENT_OPTIONS.find((o) => o.v === placement)?.hint}. Answer
              pages always follow their own rule and are never mixed into the
              puzzle placement.
            </p>
          </div>
        </details>

        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', position: 'sticky', bottom: 0, zIndex: 2 }}
          onClick={() => void generate()}
          disabled={busy}
        >
          {busy ? 'Working…' : 'Generate & Insert'}
        </button>

      </div>
    </div>
  );
}
