import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { useGeneratorStore } from '../../stores/generator-store';
import { engine } from '../../engine/canvas-engine';
import { useTextStyleStore } from '../../stores/text-style-store';
import {
  DEFAULT_OPTIONS, charactersFor,
  type CaseMode, type HandwritingOptions,
} from './generator';
import { DEFAULT_STYLE, type HandwritingStyle } from './renderer';
import { HW_TEMPLATES, hwTemplatesFor } from './templates';
import {
  DEFAULT_HW_LAYOUT, buildHandwritingPages, hwMetaOf, type HwLayoutOptions,
} from './build-pages';
import {
  hwApplySpecToPages,
  hwRelayoutCanvas,
  hwMaxRowHeight,
  measureRowHeight,
  patchHwStyleOnCanvas,
  type HwLayoutSpec,
} from './layout';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';
import { ApplyToAllButton } from '../../components/editor/ApplyToAllButton';
import {
  placeGeneratedPages,
  generationPage,
  PLACEMENT_OPTIONS,
  type PuzzlePlacement,
} from '../shared/placement';
import { wordsFor, wordFor } from './word-banks';

const CASES: { v: CaseMode; label: string; note: string }[] = [
  { v: 'upper', label: 'A B C', note: 'Capitals' },
  { v: 'lower', label: 'a b c', note: 'Lowercase' },
  { v: 'both', label: 'A a', note: 'Both' },
  { v: 'numbers', label: '1 2 3', note: 'Numbers' },
];

export function HandwritingPanel() {
  const { pages, activePageId, appendPages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);
  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  // Generated content is ALWAYS built at interior page size — never the cover.
  const genPage = generationPage(pages, activePageId);
  const pageNumber = pages.findIndex((x) => x.id === activePageId) + 1;

  const [opts, setOpts] = useState<HandwritingOptions>(DEFAULT_OPTIONS);
  const [placement, setPlacement] = useState<PuzzlePlacement>('sequence');
  const [layout, setLayout] = useState<HwLayoutOptions>(DEFAULT_HW_LAYOUT);
  const deepLinkedTemplateId = useGeneratorStore((st) => st.templates.handwriting);
  const [style, setStyle] = useState<HandwritingStyle>({ ...DEFAULT_STYLE, fontFamily: docFont });
  const [useDocFont, setUseDocFont] = useState(true);
  const [busy, setBusy] = useState(false);
  const [customChars, setCustomChars] = useState('');
  const [pendingApply, setPendingApply] = useState(false);
  const [appliedApply, setAppliedApply] = useState(false);

  const meta = hwMetaOf(page);
  const onHwPage = !!meta && meta.kind === 'worksheet';

  // Phase 8E live restyling. Refs keep the latest style readable from
  // callbacks (setState closures would be stale by one render).
  const hwStyleRef = useRef(style);
  hwStyleRef.current = style;

  /** Surgical restyle of the worksheet objects already on the page. The spec
   *  keeps in step so a later structural relayout reuses the same values. */
  const liveHwStyle = (next: HandwritingStyle) => {
    hwStyleRef.current = next;
    setStyle(next);
    setPendingApply(true);
    setAppliedApply(false);
    setSpec((s) => ({
      ...s,
      traceColor: next.traceColor,
      guideColor: next.guideColor,
      traceWidth: next.traceWidth,
      guideWidth: next.guideWidth,
      guideStyle: next.guideStyle,
      showStrokeNumbers: next.showStrokeNumbers,
    }));
    const c = engine.canvas;
    if (!c) return;
    patchHwStyleOnCanvas(c, next);
  };

  // Keep the module in step with the document font (CRITICAL RULE #3).
  useEffect(() => {
    if (useDocFont) setStyle((s) => ({ ...s, fontFamily: docFont }));
  }, [docFont, useDocFont]);

  // Live font family: reach the canvas instantly (deep search), and every
  // worksheet page when "apply to all" is on.
  useEffect(() => {
    if (!style.fontFamily) return;
    const c = engine.canvas;
    if (!c) return;
    const next = { ...style };
    hwStyleRef.current = next;
    patchHwStyleOnCanvas(c, next);
    useCanvasStore.getState().syncActivePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.fontFamily]);

  const templateChoices = useMemo(() => hwTemplatesFor(opts.charset), [opts.charset]);

  // Keep the chosen design legal when the character set changes.
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

  const effectiveOpts: HandwritingOptions = useMemo(() => {
    const only = customChars.trim()
      ? customChars.replace(/\s+/g, '').split('')
      : undefined;
    return { ...opts, only };
  }, [opts, customChars]);

  const charCount = useMemo(
    () => charactersFor(effectiveOpts).length,
    [effectiveOpts],
  );

  // ---- live adjust ---------------------------------------------------------
  const [spec, setSpec] = useState<HwLayoutSpec>({
    rowHeight: 120,
    rows: DEFAULT_OPTIONS.rows,
    tracePerRow: DEFAULT_OPTIONS.tracePerRow,
    traceColor: DEFAULT_STYLE.traceColor,
    guideColor: DEFAULT_STYLE.guideColor,
    traceWidth: DEFAULT_STYLE.traceWidth,
    guideWidth: DEFAULT_STYLE.guideWidth,
    guideStyle: DEFAULT_STYLE.guideStyle,
    showStrokeNumbers: DEFAULT_STYLE.showStrokeNumbers,
    strokeArrows: DEFAULT_OPTIONS.strokeArrows,
    startDots: DEFAULT_OPTIONS.startDots,
    style: DEFAULT_OPTIONS.style,
    kdpSafe: true,
    offsetY: 0,
  });

  const capHeight = onHwPage && meta
    ? hwMaxRowHeight(page, pageNumber, pages.length, meta, spec)
    : 200;

  // Read the current row height off the page so the slider starts where the
  // art is. The canvas loads asynchronously, so poll briefly.
  useEffect(() => {
    if (!onHwPage || !meta) return;
    let done = false;
    const read = () => {
      if (done) return;
      const c = engine.canvas;
      if (!c) return;
      flattenPuzzleGroups(c);
      const h = measureRowHeight(c.getObjects());
      if (h && h > 10) {
        setSpec((s) => ({
          ...s, rowHeight: h, rows: meta.rows,
          tracePerRow: meta.tracePerRow, style: meta.style,
        }));
        done = true;
      }
      groupPuzzleUnits(c);
    };
    read();
    const t = setInterval(read, 250);
    const stop = setTimeout(() => clearInterval(t), 4000);
    return () => { clearInterval(t); clearTimeout(stop); done = true; };
  }, [onHwPage, activePageId, meta]);

  const patchSpec = (patch: Partial<HwLayoutSpec>) => {
    if (!meta) return;
    const next = { ...spec, ...patch };
    next.rowHeight = Math.min(next.rowHeight, capHeight);
    setSpec(next);
    const c = engine.canvas;
    if (!c) return;
    hwRelayoutCanvas(c, page, pageNumber, pages.length, meta, next, hwStyleRef.current);
  };

  const commitLive = async () => {
    useCanvasStore.getState().syncActivePage();
    useCanvasStore.getState().commit('Handwriting layout');
  };

  /** Intelligent apply-to-all: push the current style to every worksheet page. */
  const applyToAll = async () => {
    if (!meta) return;
    setBusy(true);
    setStatus('busy', 'Updating all handwriting worksheets…');
    try {
      useCanvasStore.getState().syncActivePage();
      const cur = useCanvasStore.getState().pages;
      const { pages: next, changed } = await hwApplySpecToPages(
        cur, spec, hwStyleRef.current, meta.templateId, activePageId,
      );
      if (changed) await replaceAllPages(next);
      setAppliedApply(true);
      setPendingApply(false);
      setStatus('success', changed ? `Updated ${changed + 1} worksheet pages` : 'Already up to date');
    } catch {
      setStatus('error', 'Could not update all worksheet pages');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (charCount === 0) {
      setStatus('error', 'No valid characters — check the custom list');
      return;
    }
    setBusy(true);
    setStatus('busy', `Building ${charCount} worksheet${charCount === 1 ? '' : 's'}…`);
    try {
      const { pages: built } = buildHandwritingPages(
        effectiveOpts, layout, style,
        { width: genPage.width, height: genPage.height },
        pages.length + 1,
      );
      // Worksheets are placed like puzzle pages; title pages stay with them.
      const placed = placeGeneratedPages({
        built,
        current: pages,
        placement,
        kindOf: (p) => {
          const m = hwMetaOf(p);
          if (!m) return null;
          return m.kind === 'worksheet' ? 'puzzle' : null;
        },
      });
      if (placed) await replaceAllPages(placed);
      else await appendPages(built);
      setStatus('success', `${built.length} pages added`);
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : 'Could not build the worksheets');
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof HandwritingOptions>(k: K, v: HandwritingOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }));
  const setL = <K extends keyof HwLayoutOptions>(k: K, v: HwLayoutOptions[K]) =>
    setLayout((l) => ({ ...l, [k]: v }));

  const sampleChar = charactersFor(effectiveOpts)[0] ?? 'A';
  const wordOptions = wordsFor(sampleChar);

  void HW_TEMPLATES;
  void wordFor;
  void wordOptions;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Handwriting</span>
        <span className="badge">module</span>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Core Setup</div>
          <div className="opt-grid">
            {CASES.map((c) => (
              <button key={c.v} className={`opt ${opts.charset === c.v ? 'active' : ''}`} onClick={() => set('charset', c.v)} disabled={busy}>
                <div className="t">{c.label}</div>
                <div className="s">{c.note}</div>
              </button>
            ))}
          </div>
          <span className="label" style={{ marginTop: 10 }}>Custom text</span>
          <input value={customChars} onChange={(e) => setCustomChars(e.target.value)} placeholder="e.g. Sara" disabled={busy} />
        </div>

        <div className="section">
          <div className="section-title">Volume & Layout</div>
          <p className="hint" style={{ marginTop: -4 }}>{charCount} worksheet{charCount === 1 ? '' : 's'} will be created.</p>
          <span className="label">Practice rows</span>
          <div className="chips">
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={`chip ${opts.rows === n ? 'active' : ''}`} onClick={() => set('rows', n)} disabled={busy}>{n}</button>
            ))}
          </div>
        </div>

        <details className="section">
          <summary className="section-title">⚙️ Advanced Settings</summary>
          <div className="stack" style={{ marginTop: 10 }}>

        <div className="section">
          <div className="section-title">Book</div>
          <span className="label">Title</span>
          <input
            value={layout.title}
            onChange={(e) => setL('title', e.target.value)}
            disabled={busy}
          />
          <label className="toggle-row" style={{ marginTop: 6 }}>
            <span>Add a title page</span>
            <input
              type="checkbox"
              checked={layout.includeTitlePage}
              onChange={(e) => setL('includeTitlePage', e.target.checked)}
              aria-label="Add a title page"
            />
          </label>
          <label className="toggle-row">
            <span>Print page numbers</span>
            <input
              type="checkbox"
              checked={layout.showFolio}
              onChange={(e) => setL('showFolio', e.target.checked)}
              aria-label="Print page numbers"
            />
          </label>
          <label className="toggle-row">
            <span>Use the document font</span>
            <input
              type="checkbox"
              checked={useDocFont}
              onChange={(e) => setUseDocFont(e.target.checked)}
              aria-label="Use the document font"
            />
          </label>
        </div>


        {onHwPage && meta && (
          <div className="section" style={{ marginTop: 14 }}>
            <div className="section-title">
              Worksheet look
            </div>
            <p className="hint" style={{ marginBottom: 10 }}>
              Letter “{meta.char}” · {meta.rows} rows. The worksheet is a single
              group — move and resize it with the mouse on the page.
            </p>

            <div>
              <span className="label">
                Traced copies — {spec.tracePerRow}
              </span>
              <input
                type="number"
                min={0}
                max={6}
                value={spec.tracePerRow}
                onChange={(e) => patchSpec({ tracePerRow: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })}
                onBlur={() => void commitLive()}
                aria-label="Traced copies per row"
              />
            </div>

            <div className="row between" style={{ marginTop: 8 }}>
              <span className="label" style={{ margin: 0 }}>Letters</span>
              <input
                type="color"
                value={hwStyleRef.current.traceColor}
                onChange={(e) => liveHwStyle({ ...hwStyleRef.current, traceColor: e.target.value })}
                onBlur={() => void commitLive()}
                aria-label="Traced letter colour"
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Guide lines</span>
              <input
                type="color"
                value={hwStyleRef.current.guideColor}
                onChange={(e) => liveHwStyle({ ...hwStyleRef.current, guideColor: e.target.value })}
                onBlur={() => void commitLive()}
                aria-label="Guide line colour"
              />
            </div>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Midline</span>
              <input
                type="color"
                value={hwStyleRef.current.midlineColor}
                onChange={(e) => liveHwStyle({ ...hwStyleRef.current, midlineColor: e.target.value })}
                onBlur={() => void commitLive()}
                aria-label="Midline colour"
              />
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Updates live on the active page. Slider/color changes save automatically when you release the control.
            </p>
          </div>
        )}

        <ApplyToAllButton
          label="handwriting"
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
              {PLACEMENT_OPTIONS.find((o) => o.v === placement)?.hint}.
            </p>
          </div>
        </details>

        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center', position: 'sticky', bottom: 0, zIndex: 2 }}
          onClick={() => void generate()}
          disabled={busy || charCount === 0}
        >
          {busy ? 'Working…' : 'Generate & Insert'}
        </button>

      </div>
    </div>
  );
}
