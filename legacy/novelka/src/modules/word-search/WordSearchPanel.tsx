import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { browseGeneratorTemplates, useGeneratorStore } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { useTextStyleStore } from '../../stores/text-style-store';
import { FONTS, loadFont } from '../../engine/font-manager';
import {
  WS_PROFILES,
  cleanWord,
  minSizeFor,
  parseWordList,
  type DirectionId,
  type WSDifficulty,
  type WordSearchPuzzle,
} from './generator';
import { WORD_BANKS } from './word-banks';
import {
  DEFAULT_WS_STYLE,
  suggestWsPerPage,
  suggestWsSolutionsPerPage,
  type WordSearchStyle,
} from './renderer';
import {
  DEFAULT_WS_LAYOUT,
  buildWordSearchPages,
  wsMetaOf,
  type WsLayoutOptions,
  type WsSolutionPlacement,
} from './build-pages';
import type { WsWorkerRequest, WsWorkerResponse } from './worker';
import { wsTemplatesFor } from './templates';
import {
  DEFAULT_WS_SPEC,
  applyWsStyleToPages,
  patchWsStyleOnCanvas,

  wsGroupsOf,
  wsMaxBoxSize,
  wsMeasure,
  wsRelayoutCanvas,
  type WsLayoutSpec,
} from './layout';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';
import { ApplyToAllButton } from '../../components/editor/ApplyToAllButton';
import {
  placeGeneratedPages,
  generationPage,
  PLACEMENT_OPTIONS,
  type PuzzlePlacement,
} from '../shared/placement';

const DIFFS: { v: WSDifficulty; label: string }[] = [
  { v: 'easy', label: 'Easy' },
  { v: 'medium', label: 'Medium' },
  { v: 'hard', label: 'Hard' },
  { v: 'expert', label: 'Expert' },
];

const ALL_DIRS: { v: DirectionId; label: string }[] = [
  { v: 'E', label: '→ across' },
  { v: 'S', label: '↓ down' },
  { v: 'SE', label: '↘ diag' },
  { v: 'NE', label: '↗ diag' },
  { v: 'W', label: '← back' },
  { v: 'N', label: '↑ up' },
  { v: 'NW', label: '↖ diag' },
  { v: 'SW', label: '↙ diag' },
];

export function WordSearchPanel() {
  const { pages, activePageId, appendPages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);

  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  // Generated content is ALWAYS built at interior page size — never the cover.
  const genPage = generationPage(pages, activePageId);

  // ---- generation settings -------------------------------------------------
  const [levels, setLevels] = useState<WSDifficulty[]>(['medium']);
  const [count, setCount] = useState(20);
  const [placement, setPlacement] = useState<PuzzlePlacement>('sequence');
  const [bankIds, setBankIds] = useState<string[]>(['animals']);
  const [customWords, setCustomWords] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  // Grid is auto-sized to fit the page; difficulty drives word count.
  const autoSize = true;
  const gridSize = 0;
  const wordsPer = 0; // 0 = follow difficulty
  const [dirOverride, setDirOverride] = useState<DirectionId[] | null>(null);
  const [secret, setSecret] = useState('');
  const [useSecret, setUseSecret] = useState(false);

  const [layout, setLayout] = useState<WsLayoutOptions>(DEFAULT_WS_LAYOUT);
  const deepLinkedTemplateId = useGeneratorStore((st) => st.templates.wordsearch);
  const [bookTitle, setBookTitle] = useState('Word Search');
  const [style, setStyle] = useState<WordSearchStyle>({
    ...DEFAULT_WS_STYLE,
    fontFamily: docFont,
  });
  const [useDocFont, setUseDocFont] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const workerRef = useRef<Worker | null>(null);

  // ---- live adjust ---------------------------------------------------------
  const [spec, setSpec] = useState<WsLayoutSpec>({ ...DEFAULT_WS_SPEC, boxSize: 0 });
  const [pendingApply, setPendingApply] = useState(false);
  const [appliedApply, setAppliedApply] = useState(false);
  const [puzzlesHere, setPuzzlesHere] = useState(0);
  const [wordsHere, setWordsHere] = useState(0);
  const meta = wsMetaOf(page);
  const onWsPage = !!meta;
  const pageNumber = pages.findIndex((x) => x.id === activePageId) + 1;

  const liveWsStyle = (next: WordSearchStyle) => {
    setStyle(next);
    setPendingApply(true);
    setAppliedApply(false);
    const c = engine.canvas;
    if (!c) return;
    patchWsStyleOnCanvas(c, next);
  };

  const expectedHere = meta?.puzzleIds.length ?? 0;
  // prefer the canvas reading, but never fewer than the page says it holds
  const countHere = Math.max(1, puzzlesHere, expectedHere);
  const capSize = onWsPage
    ? wsMaxBoxSize(
        page, pageNumber, pages.length, countHere, wordsHere,
        spec, meta?.templateId,
      )
    : 400;

  // keep the module in step with the document font (CRITICAL RULE #3)
  useEffect(() => {
    if (useDocFont) setStyle((s) => ({ ...s, fontFamily: docFont }));
  }, [docFont, useDocFont]);

  // Live font family: the doc-font select must reach the canvas instantly,
  // and reach every word-search page when "apply to all" is on.
  useEffect(() => {
    if (!style.fontFamily) return;
    const c = engine.canvas;
    if (!c) return;
    patchWsStyleOnCanvas(c, style);
    useCanvasStore.getState().syncActivePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.fontFamily]);

  // The "Keep inside KDP safe area" checkbox must govern the drag clamp on
  // these pages, not just the generated geometry.
  useEffect(() => {
    engine.setKdpBoundaryLock(layout.kdpSafe, pageNumber, pages.length);
  }, [layout.kdpSafe, pageNumber, pages.length]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  // Read the current grid geometry off the page so the sliders start where the
  // art actually is.
  //
  // The canvas loads asynchronously after a page change, so we must not trust a
  // partially-populated canvas: reading it too early on a two-up page reports
  // one puzzle, which makes the size cap far too generous and the slider's top
  // half do nothing. The page's own metadata knows the real count, so wait for
  // the canvas to actually hold that many puzzles before believing it.
  useEffect(() => {
    if (!onWsPage) return;
    let done = false;
    const read = () => {
      if (done) return;
      const c = engine.canvas;
      if (!c) return;
      flattenPuzzleGroups(c);
      const groups = wsGroupsOf(c.getObjects());
      if (!groups.length) { groupPuzzleUnits(c); return; }
      if (expectedHere && groups.length < expectedHere) { groupPuzzleUnits(c); return; } // still loading
      const geo = wsMeasure(groups[0][1]);
      if (geo && geo.size > 1) {
        setPuzzlesHere(groups.length);
        setWordsHere(
          groups[0][1].filter(
            (o) => (o as unknown as Record<string, unknown>).wsRole === 'ws-bank',
          ).length,
        );
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
  }, [activePageId, onWsPage, expectedHere]);

  // ---- derived -------------------------------------------------------------
  const themes = useMemo(() => {
    if (useCustom) {
      const words = parseWordList(customWords);
      return words.length ? [{ name: bookTitle, words }] : [];
    }
    return WORD_BANKS.filter((b) => bankIds.includes(b.id)).map((b) => ({
      name: b.name,
      words: b.words,
    }));
  }, [useCustom, customWords, bankIds, bookTitle]);

  const totalWords = themes.reduce((s, t) => s + t.words.length, 0);
  const profile = WS_PROFILES[levels[0] ?? 'medium'];
  const effWords = wordsPer || profile.words;
  const effSize = autoSize
    ? Math.max(
        profile.size,
        minSizeFor(themes.flatMap((t) => t.words), effWords),
      )
    : gridSize;

  const longestWord = useMemo(() => {
    const all = themes.flatMap((t) => t.words).map(cleanWord);
    return all.length ? Math.max(...all.map((w) => w.length)) : 0;
  }, [themes]);

  const perPageChoices = useMemo(
    () => suggestWsPerPage(effSize, genPage.width, genPage.height),
    [effSize, genPage.width, genPage.height],
  );
  const solPerPageChoices = useMemo(
    () => suggestWsSolutionsPerPage(effSize, genPage.width, genPage.height),
    [effSize, genPage.width, genPage.height],
  );

  const templateChoices = useMemo(
    () => wsTemplatesFor(effSize, layout.puzzlesPerPage),
    [effSize, layout.puzzlesPerPage],
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
      puzzlesPerPage: perPageChoices.includes(l.puzzlesPerPage)
        ? l.puzzlesPerPage
        : perPageChoices[0],
      solutionsPerPage: solPerPageChoices.includes(l.solutionsPerPage)
        ? l.solutionsPerPage
        : solPerPageChoices[Math.floor(solPerPageChoices.length / 2)],
    }));
  }, [perPageChoices, solPerPageChoices]);

  const toggleLevel = (d: WSDifficulty) =>
    setLevels((cur) =>
      cur.includes(d)
        ? cur.length > 1
          ? cur.filter((x) => x !== d)
          : cur
        : [...cur, d],
    );

  const toggleBank = (id: string) =>
    setBankIds((cur) =>
      cur.includes(id)
        ? cur.length > 1
          ? cur.filter((x) => x !== id)
          : cur
        : [...cur, id],
    );

  const toggleDir = (d: DirectionId) => {
    const base = dirOverride ?? [...profile.directions];
    const next = base.includes(d)
      ? base.length > 1
        ? base.filter((x) => x !== d)
        : base
      : [...base, d];
    setDirOverride(next);
  };
  const activeDirs = dirOverride ?? profile.directions;

  const estPages =
    Math.ceil(count / layout.puzzlesPerPage) +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? Math.ceil(count / layout.puzzlesPerPage)
        : Math.ceil(count / layout.solutionsPerPage));

  const canGenerate = themes.length > 0 && totalWords >= 4 && !busy;

  // ---- generation ----------------------------------------------------------
  const generate = () => {
    if (!canGenerate) return;
    setBusy(true);
    setProgress({ done: 0, total: count });
    setStatus('busy', `Generating ${count} word searches…`);

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = async (e: MessageEvent<WsWorkerResponse>) => {
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

    const req: WsWorkerRequest = {
      type: 'generate',
      options: {
        count,
        difficulties: levels,
        themes,
        wordsPerPuzzle: wordsPer,
        gridSize: autoSize ? 0 : gridSize,
        size: effSize,
        directions: dirOverride ?? undefined,
        allowOverlap: true,
        secretMessage: useSecret && secret.trim() ? secret : undefined,
      },
    };
    worker.postMessage(req);
  };

  const place = async (puzzles: WordSearchPuzzle[], incomplete: number) => {
    const built = buildWordSearchPages(
      puzzles,
      style,
      { ...layout, title: bookTitle },
      { width: genPage.width, height: genPage.height },
    );
    // Placement only reorders PUZZLE pages; answer pages follow their own rule.
    const placed = placeGeneratedPages({
      built: built.pages,
      current: pages,
      placement,
      kindOf: (p) => {
        const m = wsMetaOf(p);
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
    if (built.solutionPageCount) bits.push(`${built.solutionPageCount} answer pages`);

    const errorWarnings = built.warnings.filter((w) => w.severity === 'error');
    if (!built.ok || errorWarnings.length > 0) {
      const topCodes = [...new Set(errorWarnings.map((w) => w.code))].join(', ');
      setStatus('error', `Layout warning: ${topCodes} (${bits.join(' · ')})`);
    } else {
      setStatus(
        'success',
        incomplete
          ? `${bits.join(' · ')} — ${incomplete} had a word that would not fit`
          : bits.join(' · '),
      );
    }
  };

  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setStatus('idle', 'Generation cancelled');
  };

  // ---- live adjust ---------------------------------------------------------
  const patchSpec = (patch: Partial<WsLayoutSpec>) => {
    const next = { ...spec, ...patch };
    next.boxSize = Math.min(next.boxSize, capSize);
    setSpec(next);
    const c = engine.canvas;
    if (!c) return;
    wsRelayoutCanvas(c, page, pageNumber, pages.length, next, meta?.templateId);
  };

  const commitLive = async () => {
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Word search layout');
  };

  /** Intelligent apply-to-all: push the current style to every word-search page. */
  const applyToAll = async () => {
    if (!meta) return;
    setBusy(true);
    setStatus('busy', 'Updating all word search puzzles…');
    try {
      useCanvasStore.getState().syncActivePage();
      const cur = useCanvasStore.getState().pages;
      const { pages: next, changed } = await applyWsStyleToPages(
        cur, style, activePageId,
      );
      if (changed) await replaceAllPages(next);
      setAppliedApply(true);
      setPendingApply(false);
      setStatus('success', changed ? `Updated ${changed + 1} word search pages` : 'Already up to date');
    } catch {
      setStatus('error', 'Could not update all word search pages');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof WsLayoutOptions>(k: K, v: WsLayoutOptions[K]) =>
    setLayout((l) => ({ ...l, [k]: v }));

  /** Persist live styling changes (called when a control is released). */
  const commitLiveStyle = () => {
    if (!onWsPage) return;
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Word search styling');
  };

  // --------------------------------------------------------------- render
  void longestWord;
  void patchSpec;
  void commitLive;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Word search</span>
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
              {WORD_BANKS.map((b) => (
                <button key={b.id} className={`chip ${bankIds.includes(b.id) ? 'active' : ''}`} onClick={() => toggleBank(b.id)} disabled={busy} title={`${b.words.length} words`}>
                  {bankIds.includes(b.id) ? '✓ ' : ''}{b.name}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={customWords}
              onChange={(e) => setCustomWords(e.target.value)}
              placeholder={'One word per line, or comma separated\nCAT, DOG, BIRD'}
              rows={5}
              style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
              disabled={busy}
            />
          )}
          <div className="section-title" style={{ marginTop: 12 }}>Difficulty</div>
          <div className="chips">
            {DIFFS.map((d) => (
              <button key={d.v} className={`chip ${levels.includes(d.v) ? 'active' : ''}`} onClick={() => toggleLevel(d.v)} disabled={busy}>
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
            type="number" min={1} max={300} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
            disabled={busy}
            aria-label="How many word searches"
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
          onClick={() => browseGeneratorTemplates('wordsearch')}
          disabled={busy}
        >
          Browse Templates
        </button>
        <div className="section"><div className="section-title">Word Rules &amp; Modes</div><div className="chips">{ALL_DIRS.map((d) => (<button key={d.v} className={`chip ${activeDirs.includes(d.v) ? 'active' : ''}`} onClick={() => toggleDir(d.v)} disabled={busy}>{d.label}</button>))}</div>{dirOverride && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setDirOverride(null)} disabled={busy}>Follow difficulty directions</button>}<label className="toggle-row" style={{ marginTop: 8 }}><span>Secret leftover message</span><input type="checkbox" checked={useSecret} onChange={(e) => setUseSecret(e.target.checked)} disabled={busy} /></label>{useSecret && <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="READ THE LEFTOVER LETTERS" style={{ width: '100%', marginTop: 6 }} disabled={busy} />}</div>
        <div className="section"><div className="section-title">Solutions &amp; Metadata</div><div className="opt-grid">{([['back_of_book', 'Back of book'], ['next_page', 'After each'], ['none', 'No solutions']] as [WsSolutionPlacement, string][]).map(([v, l]) => (<button key={v} className={`opt ${layout.solutionPlacement === v ? 'active' : ''}`} onClick={() => set('solutionPlacement', v)} disabled={busy}><div className="t">{l}</div></button>))}</div><div className="chips" style={{ marginTop: 8 }}>{solPerPageChoices.map((n) => <button key={n} className={`chip ${layout.solutionsPerPage === n ? 'active' : ''}`} onClick={() => set('solutionsPerPage', n)} disabled={busy}>{n}</button>)}</div><span className="label" style={{ marginTop: 10 }}>Book title</span><input value={bookTitle} onChange={(e) => setBookTitle(e.target.value)} disabled={busy} style={{ width: '100%' }} /><label className="toggle-row"><span>Print page numbers</span><input type="checkbox" checked={layout.showFolio} onChange={(e) => set('showFolio', e.target.checked)} /></label></div>
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
          <span className="label" style={{ marginTop: 8 }}>
            Letter size — {Math.round(style.fontScale * 100)}%
          </span>
          <input
            type="range" min={0.3} max={0.85} step={0.01}
            value={style.fontScale}
            onChange={(e) => liveWsStyle({ ...style, fontScale: Number(e.target.value) })}
            onMouseUp={commitLiveStyle}
            onTouchEnd={commitLiveStyle}
            aria-label="Letter size"
          />
          <span className="label">Word list size — {style.bankFontSize}pt</span>
          <input
            type="number" min={7} max={18} step={0.5}
            value={style.bankFontSize}
            onChange={(e) => liveWsStyle({ ...style, bankFontSize: Number(e.target.value) || 9 })}
            onBlur={commitLiveStyle}
            aria-label="Word list size (pt)"
          />
          <span className="label">Letter spacing — {style.letterSpacing}</span>
          <input
            type="number" min={-80} max={220} step={10}
            value={style.letterSpacing}
            onChange={(e) => liveWsStyle({ ...style, letterSpacing: Number(e.target.value) || 0 })}
            onBlur={commitLiveStyle}
            aria-label="Letter spacing"
          />
          <span className="label">Grid border — {style.frameWidth.toFixed(1)}pt</span>
          <input
            type="range" min={0} max={5} step={0.1}
            value={style.frameWidth}
            onChange={(e) => liveWsStyle({ ...style, frameWidth: Number(e.target.value) })}
            onMouseUp={commitLiveStyle}
            onTouchEnd={commitLiveStyle}
            aria-label="Grid border"
          />
        </div>
        <div className="section"><div className="section-title">Canvas Rules</div><label className="toggle-row"><span>Keep inside KDP safe area</span><input type="checkbox" checked={layout.kdpSafe} onChange={(e) => set('kdpSafe', e.target.checked)} /></label></div>

        <ApplyToAllButton
          label="word search"
          pending={pendingApply}
          applied={appliedApply}
          onApply={applyToAll}
          busy={busy}
        />

        {/* ------------------------------------------------ words */}
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
          <p className="hint" style={{ marginTop: 6, color: 'var(--warn, #d08b3a)' }}>
            Pick a theme or type at least four words first.
          </p>
        )}
        <p className="hint" style={{ marginTop: 8 }}>
          Adds about <strong>{estPages}</strong> page{estPages === 1 ? '' : 's'} to the end
          of the document. Everything lands as normal editable elements.
        </p>
      </div>
    </div>
  );
}
