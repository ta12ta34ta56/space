import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { browseGeneratorTemplates, useGeneratorStore } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { useTextStyleStore } from '../../stores/text-style-store';
import { FONTS, loadFont } from '../../engine/font-manager';
import {
  CW_PROFILES,
  parseClueList,
  type CWDifficulty,
  type CrosswordPuzzle,
} from './generator';
import { CLUE_BANKS } from './clue-banks';
import {
  DEFAULT_CW_STYLE,
  suggestCwSolutionsPerPage,
  type BlockStyle,
  type CrosswordStyle,
} from './renderer';
import {
  DEFAULT_CW_LAYOUT,
  buildCrosswordPages,
  cwMetaOf,
  type CwContentMode,
  type CwLayoutOptions,
  type CwSolutionPlacement,
} from './build-pages';
import type { CwWorkerRequest, CwWorkerResponse } from './worker';
import { cwTemplatesFor } from './templates';
import {
  DEFAULT_CW_SPEC,
  applyCwStyleToPages,

  cwGroupsOf,
  cwMaxBoxSize,
  cwMeasure,
  cwRelayoutCanvas,
  patchCwStyleOnCanvas,
  type CwLayoutSpec,
} from './layout';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';
import { ApplyToAllButton } from '../../components/editor/ApplyToAllButton';
import {
  placeGeneratedPages,
  generationPage,
  PLACEMENT_OPTIONS,
  type PuzzlePlacement,
} from '../shared/placement';

const DIFFS: { v: CWDifficulty; label: string }[] = [
  { v: 'easy', label: 'Easy' },
  { v: 'medium', label: 'Medium' },
  { v: 'hard', label: 'Hard' },
  { v: 'expert', label: 'Expert' },
];

const BLOCKS: { v: BlockStyle; label: string }[] = [
  { v: 'none', label: 'Open' },
  { v: 'hollow', label: 'Faint' },
  { v: 'solid', label: 'Blocks' },
];

/** Minimal content-mode pills — labels are exactly Clues / Words / Both. */
const CONTENT_MODES: { v: CwContentMode; label: string }[] = [
  { v: 'clues', label: 'Clues' },
  { v: 'words', label: 'Words' },
  { v: 'both', label: 'Both' },
];

export function CrosswordPanel() {
  const { pages, activePageId, appendPages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);

  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  // Generated content is ALWAYS built at interior page size — never the cover.
  const genPage = generationPage(pages, activePageId);

  // ---- generation settings -------------------------------------------------
  const [levels, setLevels] = useState<CWDifficulty[]>(['medium']);
  const [count, setCount] = useState(20);
  const [placement, setPlacement] = useState<PuzzlePlacement>('sequence');
  const [bankIds, setBankIds] = useState<string[]>(['animals']);
  const [customList, setCustomList] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [autoSize, setAutoSize] = useState(true);
  const [gridSize, setGridSize] = useState(15);
  const [wordsPer, setWordsPer] = useState(0);

  const [layout, setLayout] = useState<CwLayoutOptions>(DEFAULT_CW_LAYOUT);
  const deepLinkedTemplateId = useGeneratorStore((st) => st.templates.crossword);
  const [bookTitle, setBookTitle] = useState('Crossword');
  const [style, setStyle] = useState<CrosswordStyle>({
    ...DEFAULT_CW_STYLE,
    fontFamily: docFont,
  });
  const [useDocFont, setUseDocFont] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const workerRef = useRef<Worker | null>(null);

  // ---- live adjust ---------------------------------------------------------
  const [spec, setSpec] = useState<CwLayoutSpec>({ ...DEFAULT_CW_SPEC, boxSize: 0 });
  const [pendingApply, setPendingApply] = useState(false);
  const [appliedApply, setAppliedApply] = useState(false);
  const [puzzlesHere, setPuzzlesHere] = useState(0);
  const [clueH, setClueH] = useState(0);
  const meta = cwMetaOf(page);
  const onCwPage = !!meta;
  const pageNumber = pages.findIndex((x) => x.id === activePageId) + 1;

  const liveCwStyle = (next: CrosswordStyle) => {
    setStyle(next);
    setPendingApply(true);
    setAppliedApply(false);
    const c = engine.canvas;
    if (!c) return;
    patchCwStyleOnCanvas(c, next);
  };

  const expectedHere = meta?.puzzleIds.length ?? 0;
  const countHere = Math.max(1, puzzlesHere, expectedHere);
  const capSize = onCwPage
    ? cwMaxBoxSize(page, pageNumber, pages.length, countHere, clueH, spec, meta?.templateId)
    : 400;

  useEffect(() => {
    if (useDocFont) setStyle((s) => ({ ...s, fontFamily: docFont }));
  }, [docFont, useDocFont]);

  // Live font family: the doc-font select must reach the canvas instantly,
  // and reach every crossword page when "apply to all" is on.
  useEffect(() => {
    if (!style.fontFamily) return;
    const c = engine.canvas;
    if (!c) return;
    patchCwStyleOnCanvas(c, style);
    useCanvasStore.getState().syncActivePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.fontFamily]);

  // The "Keep inside KDP safe area" checkbox must govern the drag clamp on
  // these pages, not just the generated geometry — ON means the red margins
  // are a hard stop, OFF means content may leave the safe area.
  useEffect(() => {
    engine.setKdpBoundaryLock(layout.kdpSafe, pageNumber, pages.length);
  }, [layout.kdpSafe, pageNumber, pages.length]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  // Read current geometry off the page. The canvas loads asynchronously, so
  // wait until it actually holds as many puzzles as the page metadata claims —
  // reading early reports the wrong count and mis-sizes the slider cap.
  useEffect(() => {
    if (!onCwPage) return;
    let done = false;
    const read = () => {
      if (done) return;
      const c = engine.canvas;
      if (!c) return;
      flattenPuzzleGroups(c);
      const groups = cwGroupsOf(c.getObjects());
      if (!groups.length) { groupPuzzleUnits(c); return; }
      if (expectedHere && groups.length < expectedHere) { groupPuzzleUnits(c); return; }
      const geo = cwMeasure(groups[0][1]);
      if (geo && geo.size > 1) {
        setPuzzlesHere(groups.length);
        // measure the clue block from what is actually on the page
        const clues = groups[0][1].filter((o) => {
          const r = (o as unknown as Record<string, unknown>).cwRole;
          return r === 'cw-clue' || r === 'cw-clue-head';
        });
        if (clues.length) {
          let top = Infinity, bottom = -Infinity;
          for (const o of clues) {
            const b = o.getBoundingRect();
            top = Math.min(top, b.top);
            bottom = Math.max(bottom, b.top + b.height);
          }
          setClueH(Math.max(0, bottom - top));
        } else {
          setClueH(0);
        }
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
  }, [activePageId, onCwPage, expectedHere]);

  // ---- derived -------------------------------------------------------------
  const themes = useMemo(() => {
    if (useCustom) {
      const words = parseClueList(customList);
      return words.length ? [{ name: bookTitle, words }] : [];
    }
    return CLUE_BANKS.filter((b) => bankIds.includes(b.id)).map((b) => ({
      name: b.name,
      words: b.words,
    }));
  }, [useCustom, customList, bankIds, bookTitle]);

  const totalWords = themes.reduce((s, t) => s + t.words.length, 0);
  const profile = CW_PROFILES[levels[0] ?? 'medium'];
  const effWords = wordsPer || profile.words;

  const solPerPageChoices = useMemo(
    () => suggestCwSolutionsPerPage(genPage.width, genPage.height),
    [genPage.width, genPage.height],
  );
  const templateChoices = useMemo(
    () => cwTemplatesFor(layout.puzzlesPerPage),
    [layout.puzzlesPerPage],
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

  useEffect(() => {
    setLayout((l) => ({
      ...l,
      solutionsPerPage: solPerPageChoices.includes(l.solutionsPerPage)
        ? l.solutionsPerPage
        : solPerPageChoices[Math.floor(solPerPageChoices.length / 2)],
    }));
  }, [solPerPageChoices]);

  const toggleLevel = (d: CWDifficulty) =>
    setLevels((cur) =>
      cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d],
    );

  const toggleBank = (id: string) =>
    setBankIds((cur) =>
      cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id],
    );

  const estPages =
    count +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? count
        : Math.ceil(count / layout.solutionsPerPage));

  const canGenerate = themes.length > 0 && totalWords >= 4 && !busy;

  // ---- generation ----------------------------------------------------------
  const generate = () => {
    if (!canGenerate) return;
    setBusy(true);
    setProgress({ done: 0, total: count });
    setStatus('busy', `Generating ${count} crosswords…`);

    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = async (e: MessageEvent<CwWorkerResponse>) => {
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
      try {
        await loadFont(style.fontFamily);
        await place(msg.puzzles, msg.incomplete);
      } finally {
        setBusy(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    const req: CwWorkerRequest = {
      type: 'generate',
      options: {
        count,
        difficulties: levels,
        themes,
        wordsPerPuzzle: wordsPer,
        gridSize: autoSize ? 0 : gridSize,
      },
    };
    worker.postMessage(req);
  };

  const place = async (puzzles: CrosswordPuzzle[], incomplete: number) => {
    const built = buildCrosswordPages(
      puzzles, style, { ...layout, title: bookTitle },
      { width: genPage.width, height: genPage.height },
    );
    // Placement only reorders PUZZLE pages; answer pages follow their own rule.
    const placed = placeGeneratedPages({
      built: built.pages,
      current: pages,
      placement,
      kindOf: (p) => {
        const m = cwMetaOf(p);
        if (!m) return null;
        if (m.kind === 'solution') return 'solution';
        if (m.kind === 'puzzle') return 'puzzle';
        return null;
      },
    });
    if (placed) await replaceAllPages(placed);
    else await appendPages(built.pages);

    const bits = [
      `${puzzles.length} crosswords`,
      `${built.puzzlePageCount} puzzle page${built.puzzlePageCount === 1 ? '' : 's'}`,
    ];
    if (built.solutionPageCount) bits.push(`${built.solutionPageCount} answer pages`);
    setStatus(
      'success',
      incomplete
        ? `${bits.join(' · ')} — ${incomplete} could not fit every answer`
        : bits.join(' · '),
    );
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setStatus('idle', 'Generation cancelled');
  };

  // ---- live adjust ---------------------------------------------------------
  const patchSpec = (patch: Partial<CwLayoutSpec>) => {
    const next = { ...spec, ...patch };
    next.boxSize = Math.min(next.boxSize, capSize);
    setSpec(next);
    const c = engine.canvas;
    if (!c) return;
    cwRelayoutCanvas(c, page, pageNumber, pages.length, next, clueH, meta?.templateId);
  };

  const commitLive = async () => {
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Crossword layout');
  };

  /** Intelligent apply-to-all: push the current style to every crossword page. */
  const applyToAll = async () => {
    if (!meta) return;
    setBusy(true);
    setStatus('busy', 'Updating all crossword puzzles…');
    try {
      useCanvasStore.getState().syncActivePage();
      const cur = useCanvasStore.getState().pages;
      const { pages: next, changed } = await applyCwStyleToPages(
        cur, style, activePageId,
      );
      if (changed) await replaceAllPages(next);
      setAppliedApply(true);
      setPendingApply(false);
      setStatus('success', changed ? `Updated ${changed + 1} crossword pages` : 'Already up to date');
    } catch {
      setStatus('error', 'Could not update all crossword pages');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof CwLayoutOptions>(k: K, v: CwLayoutOptions[K]) =>
    setLayout((l) => ({ ...l, [k]: v }));

  /** Persist live styling changes (called when a control is released). */
  const commitLiveStyle = () => {
    if (!onCwPage) return;
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Crossword styling');
  };

  // --------------------------------------------------------------- render
  void patchSpec;
  void commitLive;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Crossword</span>
        <span className="badge">module</span>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Core Setup</div>
          <div className="seg">
            <button className={!useCustom ? 'active' : ''} onClick={() => setUseCustom(false)} disabled={busy}>Themes</button>
            <button className={useCustom ? 'active' : ''} onClick={() => setUseCustom(true)} disabled={busy}>My own list</button>
          </div>
          {!useCustom ? (
            <div className="chips" style={{ marginTop: 8 }}>
              {CLUE_BANKS.map((b) => (
                <button key={b.id} className={`chip ${bankIds.includes(b.id) ? 'active' : ''}`} onClick={() => toggleBank(b.id)} disabled={busy} title={`${b.words.length} ready-written clues`}>
                  {bankIds.includes(b.id) ? '✓ ' : ''}{b.name}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={customList}
              onChange={(e) => setCustomList(e.target.value)}
              placeholder={'ANSWER - clue\nPLANET - or just a word'}
              rows={5}
              style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
              disabled={busy}
            />
          )}
        </div>

        <div className="section">
          <div className="section-title">Volume & Layout</div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} className={`chip ${count === n ? 'active' : ''}`} onClick={() => setCount(n)} disabled={busy}>{n}</button>
            ))}
          </div>
          <input
            type="number" min={1} max={300} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
            disabled={busy}
            aria-label="How many crosswords"
          />
          <span className="label" style={{ marginTop: 10 }}>Puzzles per page</span>
          <div className="chips">
            {[1, 2].map((n) => (
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
          onClick={() => browseGeneratorTemplates('crossword')}
          disabled={busy}
        >
          Browse Templates
        </button>
        <div className="section"><div className="section-title">Difficulty &amp; Grid Rules</div><div className="chips">{DIFFS.map((d) => <button key={d.v} className={`chip ${levels.includes(d.v) ? 'active' : ''}`} onClick={() => toggleLevel(d.v)} disabled={busy}>{d.label}</button>)}</div><span className="label" style={{ marginTop: 8 }}>Answers per puzzle — {wordsPer || `${profile.words} (from difficulty)`}</span><input type="number" min={0} max={30} value={wordsPer} onChange={(e) => setWordsPer(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} disabled={busy} aria-label="Answers per puzzle" /><label className="toggle-row"><span>Pick grid size automatically</span><input type="checkbox" checked={autoSize} onChange={(e) => setAutoSize(e.target.checked)} disabled={busy} /></label>{!autoSize && <input type="number" min={9} max={25} value={gridSize} onChange={(e) => setGridSize(Math.max(9, Math.min(25, Number(e.target.value) || 9)))} disabled={busy} aria-label="Grid size" />}</div>
        <div className="section"><div className="section-title">Solutions &amp; Metadata</div><div className="opt-grid">{([['back_of_book', 'Back of book'], ['next_page', 'After each'], ['none', 'No answers']] as [CwSolutionPlacement, string][]).map(([v, l]) => <button key={v} className={`opt ${layout.solutionPlacement === v ? 'active' : ''}`} onClick={() => set('solutionPlacement', v)} disabled={busy}><div className="t">{l}</div></button>)}</div><div className="chips" style={{ marginTop: 8 }}>{solPerPageChoices.map((n) => <button key={n} className={`chip ${layout.solutionsPerPage === n ? 'active' : ''}`} onClick={() => set('solutionsPerPage', n)} disabled={busy}>{n}</button>)}</div><span className="label" style={{ marginTop: 10 }}>Book title</span><input type="text" value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} disabled={busy} style={{ width: '100%' }} /><label className="toggle-row"><span>Print page numbers</span><input type="checkbox" checked={layout.showFolio} onChange={(e) => set('showFolio', e.target.checked)} /></label></div>
        <div className="chips">
          {CONTENT_MODES.map((m) => (
            <button
              key={m.v}
              className={`chip ${layout.contentMode === m.v ? 'active' : ''}`}
              onClick={() => set('contentMode', m.v)}
              disabled={busy}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="section">
          <div className="section-title">Typography &amp; Styling</div>
          <label className="toggle-row">
            <span>Use the document font</span>
            <input type="checkbox" checked={useDocFont} onChange={(e) => setUseDocFont(e.target.checked)} />
          </label>
          {!useDocFont && (
            <select
              value={style.fontFamily}
              onChange={(e) => setStyle((s) => ({ ...s, fontFamily: e.target.value }))}
              style={{ marginTop: 6 }}
            >
              {FONTS.map((f) => <option key={f.family} value={f.family}>{f.label}</option>)}
            </select>
          )}
          <div className="chips" style={{ marginTop: 8 }}>
            {BLOCKS.map((b) => (
              <button
                key={b.v}
                className={`chip ${style.blockStyle === b.v ? 'active' : ''}`}
                onClick={() => liveCwStyle({ ...style, blockStyle: b.v })}
                disabled={busy}
              >
                {b.label}
              </button>
            ))}
          </div>
          <span className="label" style={{ marginTop: 8 }}>
            Letter size — {Math.round(style.fontScale * 100)}%
          </span>
          <input
            type="range" min={0.35} max={0.85} step={0.01}
            value={style.fontScale}
            onChange={(e) => {
              const v = Number(e.target.value);
              // Scale the clue numbers with the letters so the slider has a
              // visible effect on puzzle pages (which only carry numbers).
              const ratio = v / Math.max(style.fontScale, 0.05);
              liveCwStyle({
                ...style,
                fontScale: v,
                numberScale: Math.max(0.1, style.numberScale * ratio),
              });
            }}
            onMouseUp={commitLiveStyle}
            onTouchEnd={commitLiveStyle}
            aria-label="Letter size"
          />
          <span className="label">Clue text — {style.clueFontSize}pt</span>
          <input
            type="number" min={6} max={16} step={0.5}
            value={style.clueFontSize}
            onChange={(e) => liveCwStyle({ ...style, clueFontSize: Number(e.target.value) || 9 })}
            onBlur={commitLiveStyle}
            aria-label="Clue text size (pt)"
          />
          <span className="label">Grid line — {style.gridLineWidth.toFixed(1)}pt</span>
          <input
            type="range" min={0.2} max={3} step={0.1}
            value={style.gridLineWidth}
            onChange={(e) => liveCwStyle({ ...style, gridLineWidth: Number(e.target.value) })}
            onMouseUp={commitLiveStyle}
            onTouchEnd={commitLiveStyle}
            aria-label="Grid line width"
          />
        </div>
        <div className="section"><div className="section-title">Canvas Rules</div><label className="toggle-row"><span>Keep inside KDP safe area</span><input type="checkbox" checked={layout.kdpSafe} onChange={(e) => set('kdpSafe', e.target.checked)} /></label></div>

        <ApplyToAllButton
          label="crossword"
          pending={pendingApply}
          applied={appliedApply}
          onApply={applyToAll}
          busy={busy}
        />

        {/* ---------------------------------------------- clues */}
       </div>
        </details>

        {busy && (
          <div className="section">
            <div className="progress">
              <div style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%`,
              }} />
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Generated {progress.done} of {progress.total}…
            </p>
            <button className="btn sm danger" style={{ marginTop: 6 }} onClick={cancel}>
              Cancel
            </button>
          </div>
        )}

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
          onClick={generate}
          disabled={!canGenerate}
        >
          {busy ? 'Generating…' : 'Generate & Insert'}
        </button>
        {!canGenerate && !busy && (
          <p className="hint" style={{ marginTop: 6 }}>
            Pick a theme or type at least four answers first.
          </p>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Adds about <strong>{estPages}</strong> page{estPages === 1 ? '' : 's'} using{' '}
          <strong>{effWords}</strong> answers each. Everything lands as normal editable
          elements.
        </p>
      </div>
    </div>
  );
}
