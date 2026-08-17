import { useState, useMemo, useRef, useEffect } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { WORD_BANKS } from '../../modules/word-search/word-banks';
import { parseWordList } from '../../modules/word-search/generator';
import { wsMetaOf } from '../../modules/word-search/build-pages';
import {
  DEFAULT_QUICK_WORD_SEARCH_OPTIONS,
  calculateQuickModeAllocation,
  generateQuickWordSearchBook,
  validateQuickModeOptions,
  type QuickWordSearchOptions,
  type StylePresetId,
  type QuickWordSearchBookResult,
} from '../../domain/quick-word-search';
import { VALIDATED_TRIM_SIZES, GUTTER_BANDS } from '../../domain/geometry';
import { resolveParametricTemplate } from '../../domain/template-registry';
import { runComprehensivePreflight, type PreflightDiagnostic } from '../../domain/preflight';
import type { WsSolutionPlacement } from '../../modules/word-search/build-pages';
import type { LetterCase } from '../../modules/word-search/renderer';
import { Icon } from '../Icon';

export interface Props {
  onClose: () => void;
  onOpenEditor: () => void;
  onExportBook?: () => void;
  onOpenPreview?: (initialView?: 'single' | 'spread' | 'grid') => void;
  initialTemplateId?: string;
}

export type WizardStep = 'concept' | 'words' | 'format' | 'solutions' | 'style' | 'review' | 'preview';

const SAMPLE_WORDS = [
  'ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER',
  'MARIGOLD', 'VIOLET', 'JASMINE', 'LAVENDER', 'PEONY', 'CARNATION',
];

export function QuickWordSearchWizard({
  onClose,
  onOpenEditor,
  onExportBook,
  onOpenPreview,
  initialTemplateId,
}: Props) {
  const { replaceAllPages, setProjectName } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);

  const [step, setStep] = useState<WizardStep>('concept');
  const [options, setOptions] = useState<QuickWordSearchOptions>(() => ({
    ...DEFAULT_QUICK_WORD_SEARCH_OPTIONS,
    ...(initialTemplateId ? { templateId: initialTemplateId } : {}),
  }));
  const [customInput, setCustomInput] = useState('');

  // Generation & Results state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [generationResult, setGenerationResult] = useState<QuickWordSearchBookResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [preflightBlockers, setPreflightBlockers] = useState<PreflightDiagnostic[]>([]);
  const cancelRef = useRef(false);

  // Keyboard navigation for escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [generating, onClose]);

  // Derived metrics
  const allocation = useMemo(() => calculateQuickModeAllocation(options), [options]);

  const parsedCustomWords = useMemo(() => parseWordList(customInput), [customInput]);
  const customWordCount = parsedCustomWords.length;

  const activeTemplateResolution = useMemo(() => {
    const requestedId = options.templateId || (options.puzzlesPerPage === 2 ? 'two-up-ws' : 'classic-ws');
    return resolveParametricTemplate({
      templateId: requestedId,
      generatorKind: 'wordsearch',
      pageMode: 'puzzle',
      trimSize: options.trimSize,
      publishedOnly: true,
    });
  }, [options.templateId, options.puzzlesPerPage, options.trimSize]);

  // Gutter band calculation based on total allocation
  const gutterBand = useMemo(() => {
    for (const b of GUTTER_BANDS) {
      if (allocation.totalPages <= b.maxPages) return b;
    }
    return GUTTER_BANDS[GUTTER_BANDS.length - 1];
  }, [allocation.totalPages]);

  const updateOpt = <K extends keyof QuickWordSearchOptions>(key: K, value: QuickWordSearchOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBank = (id: string) => {
    setOptions((prev) => {
      const exists = prev.presetBankIds.includes(id);
      const next = exists
        ? prev.presetBankIds.filter((b) => b !== id)
        : [...prev.presetBankIds, id];
      return { ...prev, presetBankIds: next };
    });
  };

  const selectAllBanks = () => {
    updateOpt('presetBankIds', WORD_BANKS.map((b) => b.id));
  };

  const clearAllBanks = () => {
    updateOpt('presetBankIds', []);
  };

  const handleInsertSampleWords = () => {
    setCustomInput(SAMPLE_WORDS.join(', '));
    setErrorMsg('');
  };

  // Run generation
  const handleGenerate = async () => {
    setErrorMsg('');
    setPreflightBlockers([]);
    const fullOpts: QuickWordSearchOptions = {
      ...options,
      customWordsText: customInput,
    };

    const val = validateQuickModeOptions(fullOpts);
    if (!val.valid) {
      setErrorMsg(Object.values(val.errors)[0] || 'Please complete all required fields.');
      return;
    }

    setGenerating(true);
    cancelRef.current = false;
    setProgress({ done: 0, total: options.puzzleCount });
    setStatus('busy', `Generating ${options.puzzleCount} word-search puzzles…`);

    // Allow UI to paint loading state
    await new Promise((r) => setTimeout(r, 60));

    try {
      const result = generateQuickWordSearchBook(fullOpts, (done, total) => {
        if (!cancelRef.current) {
          setProgress({ done, total });
        }
      });

      if (cancelRef.current) {
        setGenerating(false);
        setStatus('idle', 'Generation cancelled');
        return;
      }

      setGenerationResult(result);
      setPreviewPageIndex(0);
      setStep('preview');
      setGenerating(false);

      if (result.ok) {
        setStatus('success', `Book generated: ${result.puzzlePageCount} puzzle pages + ${result.solutionPageCount} solution pages`);
      } else {
        setStatus('error', result.errorSummary || 'Layout warnings detected');
      }
    } catch (e) {
      setGenerating(false);
      const msg = e instanceof Error ? e.message : 'Generation failed.';
      setErrorMsg(msg);
      setStatus('error', msg);
    }
  };

  const handleOpenInEditor = async () => {
    if (!generationResult) return;
    setProjectName(options.title || 'Word Search Book');
    await replaceAllPages(generationResult.pages);
    onClose();
    onOpenEditor();
    setStatus('success', `Loaded ${generationResult.pages.length} pages into the editor`);
  };

  const handleExportWithPreflight = () => {
    if (!generationResult) return;
    const preflightRes = runComprehensivePreflight(generationResult.pages, { exportPreset: 'interior' });

    if (preflightRes.status === 'blocked' || preflightRes.errors.length > 0) {
      setPreflightBlockers(preflightRes.errors);
      setStatus('error', `Export blocked: ${preflightRes.errors.length} preflight issue(s) must be resolved.`);
      return;
    }

    setPreflightBlockers([]);
    setProjectName(options.title || 'Word Search Book');
    void replaceAllPages(generationResult.pages).then(() => {
      onClose();
      onExportBook?.();
    });
  };

  const currentPreviewPage = generationResult?.pages[previewPageIndex];
  const currentMeta = currentPreviewPage ? wsMetaOf(currentPreviewPage) : null;
  const isSolutionPage = currentMeta?.kind === 'solution';

  const STEP_TITLES: { id: WizardStep; label: string }[] = [
    { id: 'concept', label: '1. Concept' },
    { id: 'words', label: '2. Words' },
    { id: 'format', label: '3. Format' },
    { id: 'solutions', label: '4. Solutions' },
    { id: 'style', label: '5. Style' },
    { id: 'review', label: '6. Review' },
  ];

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !generating && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-heading"
    >
      <div className="modal" style={{ maxWidth: 800, width: '94%' }}>
        {/* Header */}
        <div className="modal-head">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span id="wizard-heading" style={{ fontWeight: 700, fontSize: 16 }}>
              Quick Word Search Creator
            </span>
            <span className="badge" style={{ background: 'var(--accent-soft, #ede9fe)', color: 'var(--accent, #6366f1)' }}>
              Automated Pipeline
            </span>
          </div>
          <button className="btn icon ghost" onClick={onClose} disabled={generating} aria-label="Close Wizard">
            ✕
          </button>
        </div>

        {/* Stepper Navigation */}
        {!generating && step !== 'preview' && (
          <div
            className="row"
            style={{
              padding: '10px 18px',
              background: 'var(--bg-2, #1e293b)',
              borderBottom: '1px solid var(--line, #334155)',
              gap: 8,
              overflowX: 'auto',
            }}
            role="tablist"
            aria-label="Wizard Steps"
          >
            {STEP_TITLES.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={step === s.id}
                className={`btn sm ${step === s.id ? 'primary' : 'ghost'}`}
                onClick={() => setStep(s.id)}
                style={{ fontSize: 12.5, padding: '5px 12px', whiteSpace: 'nowrap' }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: '24px 28px' }}>
          {errorMsg && (
            <div
              id="wizard-error-msg"
              style={{
                padding: '10px 14px',
                background: '#fef2f2',
                border: '1px solid #f87171',
                color: '#991b1b',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          {/* ------------------------------------ STEP 1: CONCEPT ------------------------------------ */}
          {step === 'concept' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>1. Book Concept</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Define the primary title and optional theme printed across your book volume.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="wizard-book-title" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Book Title *
                </label>
                <input
                  id="wizard-book-title"
                  value={options.title}
                  onChange={(e) => updateOpt('title', e.target.value)}
                  placeholder="e.g. Botanical Flower Word Search"
                  style={{ width: '100%' }}
                  aria-invalid={!options.title.trim() && Boolean(errorMsg)}
                  aria-describedby={errorMsg ? 'wizard-error-msg' : undefined}
                  autoFocus
                />
                <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>
                  Printed at the top of puzzle pages and on cover sheets.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="wizard-book-subtitle" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Subtitle / Theme Description (Optional)
                </label>
                <input
                  id="wizard-book-subtitle"
                  value={options.theme || ''}
                  onChange={(e) => updateOpt('theme', e.target.value)}
                  placeholder="e.g. 50 Relaxing Puzzles with Full Solutions"
                  style={{ width: '100%' }}
                />
                <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>
                  Appears below the title on single-puzzle pages.
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------------ STEP 2: WORDS ------------------------------------ */}
          {step === 'words' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>2. Words and Themes</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Choose curated theme word banks or paste your own custom word list.
                </p>
              </div>

              <div className="seg">
                <button
                  className={options.wordsSource === 'preset' ? 'active' : ''}
                  onClick={() => updateOpt('wordsSource', 'preset')}
                >
                  Curated Themes ({WORD_BANKS.length} Categories)
                </button>
                <button
                  className={options.wordsSource === 'custom' ? 'active' : ''}
                  onClick={() => updateOpt('wordsSource', 'custom')}
                >
                  My Custom Word List
                </button>
              </div>

              {options.wordsSource === 'preset' ? (
                <div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="label">Selected Categories ({options.presetBankIds.length}):</span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm ghost" onClick={selectAllBanks}>Select All</button>
                      <button className="btn sm ghost" onClick={clearAllBanks}>Clear</button>
                    </div>
                  </div>
                  <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {WORD_BANKS.map((b) => {
                      const active = options.presetBankIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          className={`chip ${active ? 'active' : ''}`}
                          onClick={() => toggleBank(b.id)}
                          style={{ padding: '7px 14px' }}
                        >
                          {active ? '✓ ' : ''}{b.name} ({b.words.length})
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="label" htmlFor="custom-words-input">
                      Type or Paste Custom Words:
                    </label>
                    <button className="btn sm ghost" onClick={handleInsertSampleWords} style={{ fontSize: 11.5 }}>
                      + Insert 12 Sample Nature Words
                    </button>
                  </div>
                  <textarea
                    id="custom-words-input"
                    rows={6}
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder={"ROSE, TULIP, DAISY, LILY\nORCHID, SUNFLOWER, MARIGOLD, VIOLET"}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                  />
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                    <span className="hint">
                      <strong>{customWordCount}</strong> valid word{customWordCount === 1 ? '' : 's'} parsed
                    </span>
                    {customWordCount < 4 ? (
                      <span style={{ color: 'var(--bad, #ef4444)' }}>Minimum 4 words required for generation</span>
                    ) : (
                      <span className="hint" style={{ color: 'var(--accent, #6366f1)' }}>✓ Words valid</span>
                    )}
                  </div>
                  <p className="hint" style={{ fontSize: 11.5, marginTop: 8 }}>
                    Words must contain at least 3 letters. Punctuation and symbols are filtered automatically.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------ STEP 3: FORMAT & VOLUME ------------------------------------ */}
          {step === 'format' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>3. Format and Volume</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Select validated print dimensions, volume, and inspect page allocation.
                </p>
              </div>

              <div>
                <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Validated Print Size
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  {Object.entries(VALIDATED_TRIM_SIZES).map(([k, size]) => (
                    <button
                      key={k}
                      className={`opt ${options.trimSize === k ? 'active' : ''}`}
                      onClick={() => updateOpt('trimSize', k)}
                      style={{ padding: 10, textAlign: 'center' }}
                    >
                      <div className="t">{size.label}</div>
                      <div className="s">{size.width} × {size.height} pt</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label className="label" htmlFor="puzzle-count-input" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Number of Puzzles
                  </label>
                  <div className="chips" style={{ marginBottom: 8 }}>
                    {[10, 20, 25, 50, 100].map((n) => (
                      <button
                        key={n}
                        className={`chip ${options.puzzleCount === n ? 'active' : ''}`}
                        onClick={() => updateOpt('puzzleCount', n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <input
                    id="puzzle-count-input"
                    type="number"
                    min={1}
                    max={300}
                    value={options.puzzleCount}
                    onChange={(e) => updateOpt('puzzleCount', Math.max(1, Math.min(300, Number(e.target.value) || 1)))}
                    style={{ width: 140 }}
                  />
                </div>

                <div style={{ width: 220 }}>
                  <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Puzzles Per Page
                  </span>
                  <div className="seg">
                    <button
                      className={options.puzzlesPerPage === 1 ? 'active' : ''}
                      onClick={() => {
                        updateOpt('puzzlesPerPage', 1);
                        updateOpt('templateId', 'classic-ws');
                      }}
                    >
                      1-Up
                    </button>
                    <button
                      className={options.puzzlesPerPage === 2 ? 'active' : ''}
                      onClick={() => {
                        updateOpt('puzzlesPerPage', 2);
                        updateOpt('templateId', 'two-up-ws');
                      }}
                    >
                      2-Up
                    </button>
                  </div>
                  {options.puzzlesPerPage === 2 && (options.trimSize === 'kdp6x9' || options.trimSize === 'custom7x9') && (
                    <p className="hint" style={{ color: 'var(--warn, #f59e0b)', fontSize: 11.5, marginTop: 4 }}>
                      Note: 2-Up is optimized for 8.5×11, 8×10, or A4.
                    </p>
                  )}
                </div>
              </div>

              {/* Live Allocation & Exportability Card */}
              <div
                style={{
                  background: 'var(--bg-2, #1e293b)',
                  padding: 16,
                  borderRadius: 10,
                  border: `1px solid ${allocation.isExportable ? 'var(--line, #334155)' : 'var(--warn, #f59e0b)'}`,
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Calculated Book Allocation:</div>
                  <span
                    className="badge"
                    style={{
                      background: allocation.isExportable ? '#dcfce7' : '#fef3c7',
                      color: allocation.isExportable ? '#15803d' : '#b45309',
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    {allocation.isExportable ? '✓ Exportable (24+ Pages)' : '⚠ Preview Only — Below 24 Pages'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, fontSize: 12.5 }}>
                  <div><strong>Puzzle Pages:</strong> {allocation.puzzlePages}</div>
                  <div><strong>Solution Pages:</strong> {allocation.solutionPages}</div>
                  <div><strong>Total Interior:</strong> {allocation.totalPages} pages</div>
                  <div><strong>Spine Gutter:</strong> {(gutterBand.inches).toFixed(3)}″ ({gutterBand.inches * 72} pt)</div>
                </div>

                {!allocation.isExportable && (
                  <p style={{ margin: '10px 0 0 0', fontSize: 12, color: 'var(--warn, #f59e0b)', lineHeight: 1.4 }}>
                    {allocation.exportStatusMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ------------------------------------ STEP 4: SOLUTIONS ------------------------------------ */}
          {step === 'solutions' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>4. Solution Arrangement</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Define how answer keys are organized and formatted in the book volume.
                </p>
              </div>

              <div>
                <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Answer Key Mode
                </span>
                <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { id: 'back_of_book', title: 'Back of Book', sub: 'Compact answer key grids at the end' },
                    { id: 'next_page', title: 'After Each Puzzle', sub: 'Alternates: puzzle then answer key' },
                    { id: 'none', title: 'No Solutions', sub: 'Puzzle pages only' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      className={`opt ${options.solutionArrangement === m.id ? 'active' : ''}`}
                      onClick={() => updateOpt('solutionArrangement', m.id as WsSolutionPlacement)}
                      style={{ padding: 12 }}
                    >
                      <div className="t">{m.title}</div>
                      <div className="s">{m.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {options.solutionArrangement === 'back_of_book' && (
                <div>
                  <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Solutions Per Page (Density)
                  </span>
                  <div className="chips">
                    {[4, 5, 6].map((n) => (
                      <button
                        key={n}
                        className={`chip ${options.solutionsPerPage === n ? 'active' : ''}`}
                        onClick={() => updateOpt('solutionsPerPage', n)}
                      >
                        {n} per page
                      </button>
                    ))}
                  </div>
                  <p className="hint" style={{ fontSize: 12, marginTop: 4 }}>
                    Allocates {allocation.solutionPages} answer key page{allocation.solutionPages === 1 ? '' : 's'} at {options.solutionsPerPage} solutions/page.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------ STEP 5: STYLE & TEMPLATE ------------------------------------ */}
          {step === 'style' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>5. Style and Template</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Select visual style presets and review the active published parametric template.
                </p>
              </div>

              <div>
                <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Visual Style Preset
                </span>
                <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { id: 'classic', title: 'Classic Book', sub: 'Georgia serif, clean borderless grid' },
                    { id: 'modern', title: 'Modern Clean', sub: 'Inter sans, ruled grid lines' },
                    { id: 'playful', title: 'Playful / Kids', sub: 'Boxed cells, checklist tick-boxes' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      className={`opt ${options.stylePreset === p.id ? 'active' : ''}`}
                      onClick={() => updateOpt('stylePreset', p.id as StylePresetId)}
                      style={{ padding: 12 }}
                    >
                      <div className="t">{p.title}</div>
                      <div className="s">{p.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Parametric Template Preview Card */}
              <div style={{ background: 'var(--bg-2, #0f172a)', padding: 14, borderRadius: 10, border: '1px solid var(--line, #334155)', fontSize: 12.5 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong>Resolved Parametric Template:</strong>
                  <span className="badge" style={{ background: 'var(--accent-soft, #ede9fe)', color: 'var(--accent, #6366f1)', fontSize: 11 }}>
                    {activeTemplateResolution.template.name} ({activeTemplateResolution.template.templateId})
                  </span>
                </div>
                <p className="hint" style={{ margin: '0 0 6px 0', fontSize: 12 }}>
                  {activeTemplateResolution.template.description}
                </p>
                {activeTemplateResolution.fallbackApplied && (
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--warn, #f59e0b)' }}>
                    ⚠ Note: {activeTemplateResolution.reason}
                  </p>
                )}
              </div>

              <div className="row" style={{ gap: 20, alignItems: 'center' }}>
                <div>
                  <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Letter Case
                  </span>
                  <div className="seg">
                    <button
                      className={options.letterCase === 'upper' ? 'active' : ''}
                      onClick={() => updateOpt('letterCase', 'upper' as LetterCase)}
                    >
                      UPPERCASE
                    </button>
                    <button
                      className={options.letterCase === 'lower' ? 'active' : ''}
                      onClick={() => updateOpt('letterCase', 'lower' as LetterCase)}
                    >
                      lowercase
                    </button>
                  </div>
                </div>

                <div style={{ paddingTop: 18 }}>
                  <label className="toggle-row">
                    <span>Print Page Numbers (Folios)</span>
                    <input
                      type="checkbox"
                      checked={options.showFolio}
                      onChange={(e) => updateOpt('showFolio', e.target.checked)}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------ STEP 6: REVIEW ------------------------------------ */}
          {step === 'review' && !generating && (
            <div className="stack" style={{ gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0' }}>6. Review and Generate</h3>
                <p className="hint" style={{ margin: '0 0 16px 0', fontSize: 13 }}>
                  Verify your book configuration before running the automated layout solver.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-2, #1e293b)',
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid var(--line, #334155)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: 13 }}>
                  <div><strong>Title:</strong> {options.title}</div>
                  <div><strong>Theme:</strong> {options.theme || 'Standard'}</div>
                  <div><strong>Trim Size:</strong> {VALIDATED_TRIM_SIZES[options.trimSize]?.label} ({options.trimSize})</div>
                  <div><strong>Puzzles:</strong> {options.puzzleCount} ({options.wordsPerPuzzle || 12} words/puzzle)</div>
                  <div><strong>Total Interior:</strong> {allocation.totalPages} pages ({allocation.puzzlePages} puzzle + {allocation.solutionPages} solution)</div>
                  <div><strong>Solutions:</strong> {options.solutionArrangement.replace(/_/g, ' ')}</div>
                  <div><strong>Template:</strong> {activeTemplateResolution.template.name}</div>
                  <div><strong>Style:</strong> {options.stylePreset} ({options.letterCase})</div>
                </div>
              </div>

              {/* Status Banner */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: allocation.isExportable ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${allocation.isExportable ? '#86efac' : '#fcd34d'}`,
                  color: allocation.isExportable ? '#166534' : '#92400e',
                  fontSize: 13,
                }}
              >
                <strong>
                  {allocation.isExportable
                    ? '✓ Ready for Complete Book Generation & Preflight'
                    : '⚠ Below KDP Minimum Profile (24 Pages)'}
                </strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {allocation.isExportable
                    ? `This volume produces ${allocation.totalPages} interior pages and satisfies Amazon KDP paperback requirements.`
                    : allocation.exportStatusMessage}
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------ GENERATING PROGRESS ------------------------------------ */}
          {generating && (
            <div className="stack" style={{ padding: '36px 16px', textAlign: 'center', alignItems: 'center' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  border: '3px solid var(--line, #334155)',
                  borderTopColor: 'var(--accent, #6366f1)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <h3 style={{ marginTop: 18, marginBottom: 4 }}>Generating Complete Volume…</h3>
              <p className="hint" style={{ fontSize: 13 }} aria-live="polite">
                Building puzzle {progress.done} of {progress.total} with responsive layout solver…
              </p>
              <div
                style={{ width: '100%', maxWidth: 380, height: 8, background: 'var(--bg-2, #1e293b)', borderRadius: 4, overflow: 'hidden', marginTop: 10 }}
                role="progressbar"
                aria-valuenow={progress.total ? Math.round((progress.done / progress.total) * 100) : 5}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Book generation progress"
              >
                <div
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%`,
                    height: '100%',
                    background: 'var(--accent, #6366f1)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <button className="btn sm danger" style={{ marginTop: 24 }} onClick={() => { cancelRef.current = true; }}>
                Cancel
              </button>
            </div>
          )}

          {/* ------------------------------------ STEP 7: PREVIEW ------------------------------------ */}
          {step === 'preview' && generationResult && !generating && (
            <div className="stack" style={{ gap: 16 }}>
              {/* Status Header */}
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: generationResult.ok && allocation.isExportable ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${generationResult.ok && allocation.isExportable ? '#86efac' : '#fcd34d'}`,
                  color: generationResult.ok && allocation.isExportable ? '#14532d' : '#92400e',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>
                    {generationResult.ok
                      ? allocation.isExportable
                        ? '✓ Book Generated — Run Preflight Before Export'
                        : `Preview Generated (${generationResult.pages.length} Pages — Below 24-Page Minimum)`
                      : '⚠ Layout Issues Detected — Review Diagnostics Below'}
                  </strong>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    {generationResult.puzzlePageCount} Puzzle Pages + {generationResult.solutionPageCount} Solution Pages ({generationResult.pages.length} Total Interior Pages)
                  </div>
                </div>
                <span
                  className="badge"
                  style={{
                    background: generationResult.ok && allocation.isExportable ? '#16a34a' : '#d97706',
                    color: '#fff',
                  }}
                >
                  {generationResult.ok && allocation.isExportable ? 'Exportable' : 'Preview Only'}
                </span>
              </div>

              {/* Preflight Blockers */}
              {preflightBlockers.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #ef4444', borderRadius: 8, padding: 14, color: '#991b1b' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                    ⛔ Export Blocked by Preflight ({preflightBlockers.length} issue{preflightBlockers.length === 1 ? '' : 's'}):
                  </div>
                  <ul style={{ margin: '0 0 10px 0', paddingLeft: 20, fontSize: 12 }}>
                    {preflightBlockers.map((b, idx) => (
                      <li key={idx}>
                        <strong>{b.code}:</strong> {b.message}
                      </li>
                    ))}
                  </ul>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn sm danger" onClick={handleOpenInEditor}>
                      Open in Canvas Editor to Fix
                    </button>
                    <button className="btn sm ghost" onClick={() => setStep('review')}>
                      Back to Setup
                    </button>
                  </div>
                </div>
              )}

              {/* Page Navigator */}
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-2, #1e293b)', padding: '10px 14px', borderRadius: 8 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <button
                    className="btn sm"
                    disabled={previewPageIndex <= 0}
                    onClick={() => setPreviewPageIndex((i) => Math.max(0, i - 1))}
                    aria-label="Previous Page"
                  >
                    ← Previous
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    Page {previewPageIndex + 1} of {generationResult.pages.length}
                    <span className="hint" style={{ marginLeft: 6 }}>
                      ({isSolutionPage ? 'Answer Key' : 'Puzzle Page'})
                    </span>
                  </span>
                  <button
                    className="btn sm"
                    disabled={previewPageIndex >= generationResult.pages.length - 1}
                    onClick={() => setPreviewPageIndex((i) => Math.min(generationResult.pages.length - 1, i + 1))}
                    aria-label="Next Page"
                  >
                    Next →
                  </button>
                </div>

                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="range"
                    min={0}
                    max={generationResult.pages.length - 1}
                    value={previewPageIndex}
                    onChange={(e) => setPreviewPageIndex(Number(e.target.value))}
                    style={{ width: 140 }}
                    aria-label="Preview page slider"
                  />
                </div>
              </div>

              {/* Page Metadata Frame */}
              {currentPreviewPage && (
                <div style={{ background: 'var(--bg-2, #1e293b)', padding: 14, borderRadius: 8, border: '1px solid var(--line, #334155)', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Page {previewPageIndex + 1} Specifications:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                    <div><strong>Type:</strong> {isSolutionPage ? 'Solutions' : 'Puzzle Page'}</div>
                    <div><strong>Dimensions:</strong> {currentPreviewPage.width} × {currentPreviewPage.height} pt</div>
                    <div><strong>Gutter Spine:</strong> {(previewPageIndex + 1) % 2 === 1 ? 'Recto (Left)' : 'Verso (Right)'}</div>
                    <div><strong>Layout Status:</strong> {currentPreviewPage.data && (currentPreviewPage.data as { ok?: boolean }).ok !== false ? '✓ OK' : '⚠ Invalid'}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!generating && step !== 'preview' ? (
            <>
              {step !== 'concept' ? (
                <button
                  className="btn"
                  onClick={() => {
                    if (step === 'words') setStep('concept');
                    else if (step === 'format') setStep('words');
                    else if (step === 'solutions') setStep('format');
                    else if (step === 'style') setStep('solutions');
                    else if (step === 'review') setStep('style');
                  }}
                  aria-label="Previous step"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}

              <div className="row" style={{ gap: 8 }}>
                <button className="btn" onClick={onClose} aria-label="Cancel wizard">
                  Cancel
                </button>
                {step !== 'review' ? (
                  <button
                    className="btn primary"
                    onClick={() => {
                      if (step === 'concept') {
                        if (!options.title.trim()) {
                          setErrorMsg('Book title is required.');
                          return;
                        }
                        setErrorMsg('');
                        setStep('words');
                      } else if (step === 'words') {
                        if (options.wordsSource === 'preset' && !options.presetBankIds.length) {
                          setErrorMsg('Please select at least one theme category.');
                          return;
                        }
                        if (options.wordsSource === 'custom' && customWordCount < 4) {
                          setErrorMsg('Please enter at least 4 valid custom words.');
                          return;
                        }
                        setErrorMsg('');
                        setStep('format');
                      } else if (step === 'format') {
                        setStep('solutions');
                      } else if (step === 'solutions') {
                        setStep('style');
                      } else if (step === 'style') {
                        setStep('review');
                      }
                    }}
                    aria-label="Next step"
                  >
                    Continue →
                  </button>
                ) : (
                  <button
                    className={`btn ${allocation.isExportable ? 'primary' : ''}`}
                    onClick={handleGenerate}
                    aria-label={allocation.isExportable ? 'Generate Complete Book' : 'Generate Preview Only'}
                  >
                    {allocation.isExportable
                      ? '✨ Generate Complete Book'
                      : `✨ Generate Preview Only (${allocation.totalPages} Pages)`}
                  </button>
                )}
              </div>
            </>
          ) : step === 'preview' && !generating ? (
            <>
              <button className="btn" onClick={() => setStep('review')} aria-label="Adjust book settings">
                ← Adjust Setup
              </button>
              <div className="row" style={{ gap: 8 }}>
                {onOpenPreview && (
                  <button
                    className="btn"
                    onClick={async () => {
                      if (!generationResult) return;
                      setProjectName(options.title || 'Word Search Book');
                      await replaceAllPages(generationResult.pages);
                      onClose();
                      onOpenPreview('spread');
                    }}
                    aria-label="Open Full-Book Spread Preview"
                  >
                    <Icon name="eye" size={14} /> Full-Book Preview
                  </button>
                )}
                {onExportBook && (
                  <button
                    className="btn"
                    onClick={handleExportWithPreflight}
                    disabled={!allocation.isExportable}
                    title={!allocation.isExportable ? 'Export requires at least 24 interior pages' : 'Export PDF'}
                    aria-label="Export PDF"
                  >
                    <Icon name="download" size={14} /> Export PDF
                  </button>
                )}
                <button className="btn primary" onClick={handleOpenInEditor} aria-label="Open in Canvas Editor">
                  Open in Canvas Editor →
                </button>
              </div>
            </>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
}
