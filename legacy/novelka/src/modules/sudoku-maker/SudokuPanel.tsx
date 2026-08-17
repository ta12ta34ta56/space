import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { browseGeneratorTemplates, useGeneratorStore } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { useTextStyleStore } from '../../stores/text-style-store';
import { FONTS, loadFont } from '../../engine/font-manager';
import {
  type Difficulty,
  type GridSize,
  type SudokuPuzzle,
} from './generator';
import {
  DEFAULT_STYLE,
  suggestPerPage,
  suggestSolutionsPerPage,
  type SudokuStyle,
} from './renderer';
import {
  DEFAULT_LAYOUT,
  buildSudokuPages,
  type LayoutOptions,
  type SolutionPlacement,
} from './build-pages';
import type { WorkerRequest, WorkerResponse } from './worker';
import { sudokuMetaOf } from './build-pages';
import { templatesFor } from './templates';
import {
  DEFAULT_SPEC,
  applySpecToPages,
  groupsOf,
  maxBoxSize,
  measure,
  relayoutCanvas,
  type LayoutSpec,
} from './layout';
import { forEachObjectDeep } from '../shared/live-style';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';
import { ApplyToAllButton } from '../../components/editor/ApplyToAllButton';
import {
  placeGeneratedPages,
  generationPage,
  PLACEMENT_OPTIONS,
  type PuzzlePlacement,
} from '../shared/placement';

const SIZES: { v: GridSize; label: string; note: string }[] = [
  { v: 4, label: '4 × 4', note: 'Kids' },
  { v: 9, label: '9 × 9', note: 'Classic' },
  { v: 16, label: '16 × 16', note: 'Advanced' },
];

const DIFFS: { v: Difficulty; label: string }[] = [
  { v: 'easy', label: 'Easy' },
  { v: 'medium', label: 'Medium' },
  { v: 'hard', label: 'Hard' },
  { v: 'expert', label: 'Expert' },
];

export function SudokuPanel() {
  const { pages, activePageId, appendPages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);

  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  // Generated content is ALWAYS built at interior page size — never the cover
  // (the cover is a different, oversized flat surface).
  const genPage = generationPage(pages, activePageId);

  const [size, setSize] = useState<GridSize>(9);
  const [levels, setLevels] = useState<Difficulty[]>(['medium']);
  const [count, setCount] = useState(20);
  const [placement, setPlacement] = useState<PuzzlePlacement>('sequence');
  const [layout, setLayout] = useState<LayoutOptions>(DEFAULT_LAYOUT);
  const deepLinkedTemplateId = useGeneratorStore((st) => st.templates.sudoku);
  const [bookTitle, setBookTitle] = useState('Sudoku');
  const [style, setStyle] = useState<SudokuStyle>({
    ...DEFAULT_STYLE,
    fontFamily: docFont,
  });
  const [useDocFont, setUseDocFont] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const workerRef = useRef<Worker | null>(null);

  // live adjustment of an already-generated page
  const [spec, setSpec] = useState<LayoutSpec>({ ...DEFAULT_SPEC, boxSize: 0 });
  const [pendingApply, setPendingApply] = useState(false);
  const [appliedApply, setAppliedApply] = useState(false);
  const [puzzlesHere, setPuzzlesHere] = useState(0);
  const meta = sudokuMetaOf(page);
  const onSudokuPage = !!meta;
  const pageNumber = pages.findIndex((x) => x.id === activePageId) + 1;

  const capSize = onSudokuPage
    ? maxBoxSize(
        page, pageNumber, pages.length, Math.max(1, puzzlesHere), spec,
        meta?.templateId, size,
      )
    : 400;

  // keep the module in step with the document font (CRITICAL RULE #3)
  useEffect(() => {
    if (useDocFont) setStyle((s) => ({ ...s, fontFamily: docFont }));
  }, [docFont, useDocFont]);

  // Live font family — deep search so text inside Groups (template furniture)
  // is found too, and replay to every Sudoku page when "apply to all" is on.
  useEffect(() => {
    if (!style.fontFamily) return;
    const c = engine.canvas;
    if (!c) return;
    forEachObjectDeep(c.getObjects(), (o) => {
      const any = o as unknown as Record<string, unknown>;
      if (
        any.moduleId === 'sudoku' &&
        (o.type === 'textbox' || o.type === 'text' || o.type === 'i-text')
      ) {
        o.set('fontFamily' as never, style.fontFamily);
        o.dirty = true;
      }
    });
    c.requestRenderAll();
    useCanvasStore.getState().syncActivePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.fontFamily]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  // Read the current grid size off the page so the slider starts where the art
  // is. The canvas finishes loading asynchronously after a page change, so poll
  // briefly until the puzzle objects actually exist.
  useEffect(() => {
    if (!onSudokuPage) return;
    let done = false;
    const read = () => {
      if (done) return;
      const c = engine.canvas;
      if (!c) return;
      flattenPuzzleGroups(c);
      const groups = groupsOf(c.getObjects());
      if (!groups.length) { groupPuzzleUnits(c); return; }
      const geo = measure(groups[0][1]);
      if (geo && geo.size > 1) {
        setPuzzlesHere(groups.length);
        setSpec((sp) => ({ ...sp, boxSize: Math.round(geo.size) }));
        done = true;
      }
      groupPuzzleUnits(c);
    };
    read();
    const t = setInterval(read, 250);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => {
      done = true;
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [activePageId, onSudokuPage]);

  const perPageChoices = useMemo(
    () => suggestPerPage(size, genPage.width, genPage.height),
    [size, genPage.width, genPage.height],
  );
  const solPerPageChoices = useMemo(
    () => suggestSolutionsPerPage(size, genPage.width, genPage.height),
    [size, genPage.width, genPage.height],
  );

  const templateChoices = useMemo(
    () => templatesFor(size, layout.puzzlesPerPage),
    [size, layout.puzzlesPerPage],
  );

  useEffect(() => {
    if (!templateChoices.length) return;
    if (!templateChoices.some((t) => t.id === layout.templateId)) {
      setLayout((l) => ({ ...l, templateId: templateChoices[0].id }));
    }
  }, [templateChoices, layout.templateId]);


  useEffect(() => {
    if (deepLinkedTemplateId && layout.templateId !== deepLinkedTemplateId) {
      setLayout((l) => ({ ...l, templateId: deepLinkedTemplateId }));
    }
  }, [deepLinkedTemplateId, layout.templateId]);

  // keep the selections legal when the grid size changes
  useEffect(() => {
    setLayout((l) => ({
      ...l,
      puzzlesPerPage: perPageChoices.includes(l.puzzlesPerPage)
        ? l.puzzlesPerPage
        : perPageChoices[0],
      solutionsPerPage: solPerPageChoices.includes(l.solutionsPerPage)
        ? l.solutionsPerPage
        : solPerPageChoices[Math.floor(solPerPageChoices.length / 2)],
    }));
  }, [perPageChoices, solPerPageChoices]);

  const toggleLevel = (d: Difficulty) =>
    setLevels((cur) =>
      cur.includes(d)
        ? cur.length > 1
          ? cur.filter((x) => x !== d)  // never allow an empty selection
          : cur
        : [...cur, d],
    );

  const estPages =
    Math.ceil(count / layout.puzzlesPerPage) +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? Math.ceil(count / layout.puzzlesPerPage)
        : Math.ceil(count / layout.solutionsPerPage));

  const generate = () => {
    setBusy(true);
    setProgress({ done: 0, total: count });
    setStatus('busy', `Generating ${count} puzzles…`);

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = async (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress({ done: msg.done, total: msg.total });
        return;
      }
      if (msg.type === 'error') {
        setStatus('error', msg.message);
        setBusy(false);
        worker.terminate();
        return;
      }
      // done
      try {
        await loadFont(style.fontFamily);
        await place(msg.puzzles, msg.degraded);
      } finally {
        setBusy(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    const req: WorkerRequest = {
      type: 'generate',
      options: { size, difficulties: levels, count, symmetric: true },
    };
    worker.postMessage(req);
  };

  const place = async (puzzles: SudokuPuzzle[], degraded: number) => {
    const built = buildSudokuPages(puzzles, style, { ...layout, title: bookTitle }, {
      width: genPage.width,
      height: genPage.height,
    });
    // Placement only reorders PUZZLE pages; solution pages follow their own rule.
    const placed = placeGeneratedPages({
      built: built.pages,
      current: pages,
      placement,
      kindOf: (p) => {
        const m = sudokuMetaOf(p);
        if (!m) return null;
        if (m.kind === 'solution') return 'solution';
        if (m.kind === 'puzzle') return 'puzzle';
        return null;
      },
    });
    if (placed) await replaceAllPages(placed);
    else await appendPages(built.pages);

    const bits = [
      `${puzzles.length} puzzles`,
      `${built.puzzlePageCount} puzzle page${built.puzzlePageCount === 1 ? '' : 's'}`,
    ];
    if (built.solutionPageCount) bits.push(`${built.solutionPageCount} solution pages`);
    setStatus(
      degraded ? 'success' : 'success',
      degraded
        ? `${bits.join(' · ')} — ${degraded} were eased slightly to finish in time`
        : bits.join(' · '),
    );
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setStatus('idle', 'Generation cancelled');
  };

  /**
   * Single source of truth for live edits: change the spec, re-lay the page
   * from the stored puzzles. Because the target is always recomputed from the
   * spec (never from the last render) repeated drags converge instead of drift.
   */
  const patchSpec = (patch: Partial<LayoutSpec>) => {
    const c = engine.canvas;
    let next = { ...spec, ...patch };
    // Preserve the user's current on-screen size: style-only edits (color,
    // border thickness, number size) must NOT reset the scale they set by
    // dragging the group on the canvas. Measure the live size and use it.
    if (!('boxSize' in patch) && c && onSudokuPage) {
      flattenPuzzleGroups(c);
      const groups = groupsOf(c.getObjects());
      const geo = groups.length ? measure(groups[0][1]) : null;
      if (geo && geo.size > 1) next.boxSize = Math.round(geo.size);
      groupPuzzleUnits(c);
    }
    next.boxSize = Math.min(next.boxSize, capSize);
    setSpec(next);
    // A change was made that hasn't been pushed to the rest of the book yet.
    setPendingApply(true);
    setAppliedApply(false);
    if (!c) return;
    relayoutCanvas(c, page, pageNumber, pages.length, next, size, meta?.templateId);
  };

  /** Persist the active page's layout (no silent apply-to-all). */
  const commitLive = async () => {
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Sudoku layout');
  };

  /** Intelligent apply-to-all: push the current spec to every same-kind page. */
  const applyToAll = async () => {
    if (!meta) return;
    setBusy(true);
    setStatus('busy', 'Updating all Sudoku puzzles…');
    try {
      const cur = useCanvasStore.getState().pages;
      const { pages: next, changed } = await applySpecToPages(
        cur,
        spec,
        size,
        meta.kind,
        meta.perPage,
        activePageId, // already correct on screen
      );
      if (changed) await replaceAllPages(next);
      setAppliedApply(true);
      setPendingApply(false);
      setStatus('success', changed ? `Updated ${changed + 1} ${meta.kind} pages` : 'Already up to date');
    } catch {
      setStatus('error', 'Could not update all Sudoku pages');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof LayoutOptions>(k: K, v: LayoutOptions[K]) =>
    setLayout((l) => ({ ...l, [k]: v }));
  const setSt = <K extends keyof SudokuStyle>(k: K, v: SudokuStyle[K]) =>
    setStyle((s) => ({ ...s, [k]: v }));

  void setBookTitle;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Sudoku maker</span>
        <span className="badge">module</span>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Core Setup</div>
          <div className="opt-grid">
            {SIZES.map((s) => (
              <button
                key={s.v}
                className={`opt ${size === s.v ? 'active' : ''}`}
                onClick={() => setSize(s.v)}
                disabled={busy}
              >
                <div className="t">{s.label}</div>
                <div className="s">{s.note}</div>
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {DIFFS.map((d) => (
              <button
                key={d.v}
                className={`chip ${levels.includes(d.v) ? 'active' : ''}`}
                onClick={() => toggleLevel(d.v)}
                disabled={busy}
              >
                {levels.includes(d.v) ? '✓ ' : ''}{d.label}
              </button>
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
          <input
            type="number"
            min={1}
            max={300}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
            disabled={busy}
            aria-label="How many puzzles"
          />
          <span className="label" style={{ marginTop: 10 }}>Puzzles per page</span>
          <div className="chips">
            {perPageChoices.map((n) => (
              <button key={n} className={`chip ${layout.puzzlesPerPage === n ? 'active' : ''}`} onClick={() => set('puzzlesPerPage', n)} disabled={busy}>{n}</button>
            ))}
          </div>
        </div>

        <details className="section">
          <summary className="section-title">⚙️ Advanced Settings</summary>
          <div className="stack" style={{ marginTop: 10 }}>
        <button
          className="btn primary"
          style={{ justifyContent: 'center' }}
          onClick={() => browseGeneratorTemplates('sudoku')}
          disabled={busy}
        >
          Browse Templates
        </button>
        <div className="section">
          <div className="section-title">Typography &amp; Styling</div>
          <label className="toggle-row">
            <span>Use the document font</span>
            <input
              type="checkbox"
              checked={useDocFont}
              onChange={(e) => setUseDocFont(e.target.checked)}
            />
          </label>
          {!useDocFont && (
            <select
              value={style.fontFamily}
              onChange={(e) => setSt('fontFamily', e.target.value)}
              style={{ marginTop: 6 }}
            >
              {FONTS.map((f) => (
                <option key={f.family} value={f.family}>{f.label}</option>
              ))}
            </select>
          )}
          <label className="toggle-row">
            <span>Show puzzle number</span>
            <input
              type="checkbox"
              checked={style.showTitle}
              onChange={(e) => setSt('showTitle', e.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <span>Show difficulty</span>
            <input
              type="checkbox"
              checked={style.showDifficulty}
              onChange={(e) => setSt('showDifficulty', e.target.checked)}
            />
          </label>
        </div>
        <div className="section">
          <div className="section-title">Solutions</div>
          <div className="opt-grid">
            {([
              ['back_of_book', 'Back of book'],
              ['next_page', 'After each'],
              ['none', 'No solutions'],
            ] as [SolutionPlacement, string][]).map(([v, l]) => (
              <button
                key={v}
                className={`opt ${layout.solutionPlacement === v ? 'active' : ''}`}
                onClick={() => set('solutionPlacement', v)}
                disabled={busy}
              >
                <div className="t">{l}</div>
              </button>
            ))}
          </div>
          {layout.solutionPlacement === 'back_of_book' && (
            <>
              <span className="label" style={{ marginTop: 10 }}>
                Solutions per page
              </span>
              <div className="chips">
                {solPerPageChoices.map((n) => (
                  <button
                    key={n}
                    className={`chip ${layout.solutionsPerPage === n ? 'active' : ''}`}
                    onClick={() => set('solutionsPerPage', n)}
                    disabled={busy}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {onSudokuPage && (
          <div className="section">
            <div className="section-title">
              Puzzle look
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>
              {puzzlesHere} puzzle{puzzlesHere === 1 ? '' : 's'} on this page. The puzzle
              is a single group — move and resize it with the mouse on the page.
            </p>

            <div>
              <span className="label">Box border — {spec.thickLineWidth.toFixed(1)}px</span>
              <input
                type="range" min={0.5} max={5} step={0.1}
                value={spec.thickLineWidth}
                onChange={(e) => patchSpec({ thickLineWidth: Number(e.target.value) })}
                onMouseUp={commitLive}
                onTouchEnd={commitLive}
                aria-label="Box border width"
              />
            </div>
            <div>
              <span className="label">Number size — {Math.round(spec.fontScale * 100)}%</span>
              <input
                type="range" min={0.3} max={0.85} step={0.01}
                value={spec.fontScale}
                onChange={(e) => patchSpec({ fontScale: Number(e.target.value) })}
                onMouseUp={commitLive}
                onTouchEnd={commitLive}
                aria-label="Number size"
              />
            </div>

            <div className="row between" style={{ marginTop: 8 }}>
              <span className="label" style={{ margin: 0 }}>Numbers</span>
              <input
                type="color"
                value={spec.numberColor}
                onChange={(e) => patchSpec({ numberColor: e.target.value })}
                onBlur={commitLive}
                style={{ width: 50 }}
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Grid lines</span>
              <input
                type="color"
                value={spec.gridLineColor}
                onChange={(e) => patchSpec({ gridLineColor: e.target.value })}
                onBlur={commitLive}
                style={{ width: 50 }}
              />
            </div>

            <label className="toggle-row">
              <span>Keep inside KDP safe area</span>
              <input
                type="checkbox"
                checked={spec.kdpSafe}
                onChange={(e) => patchSpec({ kdpSafe: e.target.checked })}
              />
            </label>

            <ApplyToAllButton
              label="Sudoku"
              pending={pendingApply}
              applied={appliedApply}
              onApply={applyToAll}
              busy={busy}
            />
          </div>
        )}

       </div>
        </details>

        {busy && (
          <div className="section">
            <div className="progress">
              <div
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%`,
                }}
              />
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Generated {progress.done} of {progress.total}…
            </p>
            <button className="btn sm danger" style={{ marginTop: 6 }} onClick={cancel}>
              Cancel
            </button>
          </div>
        )}

        {/* Placement is hidden by default (Sequence). It only appears when the
            user opens this small drawer. */}
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
              {PLACEMENT_OPTIONS.find((o) => o.v === placement)?.hint}. Solution
              pages always follow their own rule and are never mixed into the
              puzzle placement.
            </p>
          </div>
        </details>

        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', position: 'sticky', bottom: 0, zIndex: 2 }}
          onClick={generate}
          disabled={busy}
        >
          {busy ? 'Generating…' : 'Generate & Insert'}
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          Adds about <strong>{estPages}</strong> page{estPages === 1 ? '' : 's'} to the
          document. Everything lands as normal editable elements.
        </p>
      </div>
    </div>
  );
}
