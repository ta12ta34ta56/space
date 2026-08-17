import { useEffect, useState, useMemo } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { useToastStore } from '../../stores/toast-store';
import { useFlagStore, useGate } from '../../stores/flag-store';
import { useAccessToken } from '../../stores/auth-store';
import { UpgradePrompt } from '../UpgradePrompt';
import type { GateResult } from '../../services/feature-flags';
import { isSupabaseConfigured } from '../../services/auth';
import { consumeFeature } from '../../services/payments';
import { runComprehensivePreflight } from '../../domain/preflight';
import { bookDiagnostics, withBookDiagnostics } from '../../services/book';
import {
  downloadBlob,
  exportImages,
  exportPDF,
  triggerDownload,
  type ExportDPI,
} from '../../engine/pdf-export';

type Format = 'pdf' | 'png' | 'jpeg';

export function ExportModal({
  onClose,
  onExported,
}: {
  onClose: () => void;
  /** called once after a successful export (used for the rating prompt) */
  onExported?: () => void;
}) {
  const { pages, projectName, activePageId, serialize } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const [format, setFormat] = useState<Format>('pdf');
  const [dpi, setDpi] = useState<ExportDPI>(300);
  const [range, setRange] = useState('');
  const [preset, setPreset] = useState<'all' | 'interior' | 'cover'>('interior');
  const [watermark, setWatermark] = useState(true);
  const [watermarkLocked, setWatermarkLocked] = useState(false);

  const pdfGate = useGate('export.pdf');
  const noWatermarkGate = useGate('export.nowatermark');
  const dpiGate = useGate('export.300dpi');
  const recordUse = useFlagStore((st) => st.recordUse);
  const accessToken = useAccessToken();
  const [blocked, setBlocked] = useState<{ gate: GateResult; key: string } | null>(null);
  const [transparent, setTransparent] = useState(false);
  const [selectable, setSelectable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState('');

  const coverIdx = pages.findIndex((p) => p.role === 'cover');
  const hasCover = coverIdx >= 0;

  // If the user is standing on the cover, default the dialog to exporting it.
  useEffect(() => {
    if (!hasCover) return;
    if (pages[coverIdx]?.id === activePageId) {
      setPreset('cover');
      setRange('1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (k: 'all' | 'interior' | 'cover') => {
    setPreset(k);
    if (k === 'all') return setRange('');
    if (k === 'cover') return setRange('1');
    const interiorCount = pages.filter((p) => p.role !== 'cover').length;
    setRange(interiorCount ? `1-${interiorCount}` : '');
  };

  // Page preflight + book-level checks (spine, paper/binding page limits,
  // cover geometry). An invalid spine blocks export the same way page
  // blockers do — details live in the right-side KDP Check panel.
  const book = useCanvasStore((s) => s.book);
  const preflightResult = useMemo(
    () =>
      withBookDiagnostics(
        runComprehensivePreflight(pages, { exportPreset: preset, dpi }),
        bookDiagnostics(pages, book),
      ),
    [pages, preset, dpi, book],
  );

  const parseRange = (targetPagesCount: number): number[] => {
    if (!range.trim()) return [];
    const out = new Set<number>();
    range.split(',').forEach((part) => {
      const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        for (let i = Number(m[1]); i <= Number(m[2]); i++) out.add(i);
      } else if (/^\d+$/.test(part.trim())) {
        out.add(Number(part.trim()));
      }
    });
    return [...out].filter((n) => n >= 1 && n <= targetPagesCount).sort((a, b) => a - b);
  };

  const run = async () => {
    // 1. Check preflight blockers first
    if (preflightResult.status === 'blocked') {
      setError(preflightResult.summary);
      setStatus('error', preflightResult.summary);
      return;
    }

    // 2. Check entitlement gates
    if (format === 'pdf' && !pdfGate.allowed) {
      setBlocked({ gate: pdfGate, key: 'export.pdf' });
      return;
    }
    if (format === 'pdf' && !watermark && !noWatermarkGate.allowed) {
      setBlocked({ gate: noWatermarkGate, key: 'export.nowatermark' });
      return;
    }
    if (dpi === 300 && !dpiGate.allowed) {
      setBlocked({ gate: dpiGate, key: 'export.300dpi' });
      return;
    }

    if (format === 'pdf' && isSupabaseConfigured() && accessToken) {
      try {
        const grant = await consumeFeature('export_pdf', accessToken);
        if (grant.watermark && !watermark) {
          setWatermark(true);
          setWatermarkLocked(true);
        }
      } catch (e) {
        const status = (e as { status?: number }).status;
        const message = e instanceof Error ? e.message : 'Could not check your allowance.';
        if (status === 401) {
          setError('Please sign in to export your book.');
          return;
        }
        if (status === 402) {
          setBlocked({
            gate: {
              status: 'needs_upgrade',
              allowed: false,
              reason: message,
              upgradeTo: 'basic',
              canUpgrade: true,
            },
            key: 'export.nowatermark',
          });
          return;
        }
        setError(message);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      const file = serialize();
      const base = projectName.replace(/\s+/g, '-').toLowerCase() || 'document';

      // Strict separation of interior and cover pages
      const targetPages =
        preset === 'cover'
          ? file.pages.filter((p) => p.role === 'cover')
          : preset === 'interior'
            ? file.pages.filter((p) => p.role !== 'cover')
            : file.pages;

      const pageRange = parseRange(targetPages.length);

      const tag = (t: string) => (base.endsWith(t) ? base : `${base}-${t}`);
      const safeName =
        preset === 'cover' ? tag('cover')
        : preset === 'interior' ? tag('interior')
        : base;

      if (format === 'pdf') {
        setStatus('busy', 'Generating PDF…');
        const blob = await exportPDF(targetPages, projectName, {
          dpi,
          pageRange,
          watermark,
          transparent,
          mode: selectable ? 'hybrid' : 'raster',
          onProgress: (done, total, label) => setProgress({ done, total, label }),
        });
        downloadBlob(blob, `${safeName}.pdf`);
      } else {
        setStatus('busy', 'Rendering images…');
        const imgs = await exportImages(targetPages, {
          format,
          dpi,
          pageRange,
          transparent,
        });
        imgs.forEach((img, i) =>
          setTimeout(() => triggerDownload(img.url, `${safeName}-${i + 1}.${format}`), i * 300),
        );
      }
      setStatus('success', 'Export complete');
      if (format === 'pdf' && !(isSupabaseConfigured() && accessToken)) {
        await recordUse('export.pdf');
      }
      onClose();
      onExported?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setError(msg);
      setStatus('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const targetPagesCount =
    preset === 'cover'
      ? pages.filter((p) => p.role === 'cover').length
      : preset === 'interior'
        ? pages.filter((p) => p.role !== 'cover').length
        : pages.length;

  const exportCount = parseRange(targetPagesCount).length || targetPagesCount;

  return (
    <>
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <span>Export Document</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {/* Format Selection */}
          <div className="section">
            <div className="section-title">Format</div>
            <div className="opt-grid">
              {(['pdf', 'png', 'jpeg'] as Format[]).map((f) => (
                <button
                  key={f}
                  className={`opt ${format === f ? 'active' : ''}`}
                  onClick={() => setFormat(f)}
                >
                  <div className="t">{f.toUpperCase()}</div>
                  <div className="s">
                    {f === 'pdf' ? 'Print ready' : f === 'png' ? 'Transparency' : 'Small file'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quality DPI Selection */}
          <div className="section">
            <div className="section-title">Print Quality</div>
            <div className="opt-grid">
              {([72, 150, 300] as ExportDPI[]).map((d) => (
                <button key={d} className={`opt ${dpi === d ? 'active' : ''}`} onClick={() => setDpi(d)}>
                  <div className="t">{d} DPI</div>
                  <div className="s">{d === 72 ? 'Screen' : d === 150 ? 'Standard' : 'KDP Print Standard (300+ DPI)'}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Page Scope & Preset */}
          <div className="section">
            <div className="section-title">Pages & Target File</div>
            {hasCover && (
              <>
                <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 8 }}>
                  <button
                    className={`opt ${preset === 'interior' ? 'active' : ''}`}
                    onClick={() => applyPreset('interior')}
                  >
                    <div className="t">Interior Only</div>
                    <div className="s">{pages.filter((p) => p.role !== 'cover').length} pages</div>
                  </button>
                  <button
                    className={`opt ${preset === 'cover' ? 'active' : ''}`}
                    onClick={() => applyPreset('cover')}
                  >
                    <div className="t">Cover Only</div>
                    <div className="s">Wraparound file</div>
                  </button>
                  <button
                    className={`opt ${preset === 'all' ? 'active' : ''}`}
                    onClick={() => applyPreset('all')}
                  >
                    <div className="t">Combined</div>
                    <div className="s">All {pages.length} pages</div>
                  </button>
                </div>
                <p className="hint" style={{ marginBottom: 8 }}>
                  Amazon KDP requires separate interior and cover files. Filenames are tagged automatically.
                </p>
              </>
            )}
            <input
              placeholder={`All ${targetPagesCount} pages — or e.g. 1,3,5-8`}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
            <p className="hint" style={{ marginTop: 6 }}>
              {exportCount} {preset} page{exportCount === 1 ? '' : 's'} will be exported.
            </p>
          </div>

          {/* Options */}
          <div className="section">
            <div className="section-title">Options</div>
            {format === 'pdf' && (
              <label className="toggle-row">
                <span>Keep text selectable &amp; searchable (Vector text)</span>
                <input type="checkbox" checked={selectable} onChange={(e) => setSelectable(e.target.checked)} />
              </label>
            )}
            {format !== 'jpeg' && (
              <label className="toggle-row">
                <span>Transparent background</span>
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              </label>
            )}
            {format === 'pdf' && (
              <label className="toggle-row">
                <span>
                  Watermark{' '}
                  {noWatermarkGate.allowed
                    ? <span className="badge">optional</span>
                    : <span className="tile-lock pro" style={{ position: 'static' }}>PRO</span>}
                </span>
                <input
                  type="checkbox"
                  checked={watermark}
                  disabled={watermarkLocked}
                  onChange={(e) => {
                    if (!e.target.checked && !noWatermarkGate.allowed) {
                      setBlocked({ gate: noWatermarkGate, key: 'export.nowatermark' });
                      return;
                    }
                    setWatermark(e.target.checked);
                  }}
                />
                {watermarkLocked && (
                  <span className="hint" style={{ marginLeft: 8 }}>
                    included with the free plan — upgrade to remove
                  </span>
                )}
              </label>
            )}
          </div>

          {/* Preflight status — compact. Full diagnostics live in the right
              panel's KDP Check, so the export dialog stays calm. */}
          <div className="section">
            <div className="section-title">Preflight Status</div>
            {preflightResult.status === 'pass' && (
              <div className="preflight ok">
                <strong>✓ Preflight passed</strong> — Ready for Novelka export checks.
              </div>
            )}

            {preflightResult.status === 'warnings' && (
              <div className="preflight warn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>
                  <strong>⚠ {preflightResult.warnings.length} warning{preflightResult.warnings.length === 1 ? '' : 's'}</strong> — review before publishing.
                </span>
                <button
                  className="btn sm"
                  style={{ flex: 'none' }}
                  onClick={() => {
                    useEditorUiStore.getState().setRightDock('kdp');
                    onClose();
                  }}
                >
                  Open KDP Check
                </button>
              </div>
            )}

            {preflightResult.status === 'blocked' && (
              <div className="preflight error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>
                  <strong>⛔ {preflightResult.errors.length} blocking error{preflightResult.errors.length === 1 ? '' : 's'}</strong> — export is blocked until they are resolved.
                </span>
                <button
                  className="btn sm"
                  style={{ flex: 'none' }}
                  onClick={() => {
                    useEditorUiStore.getState().setRightDock('kdp');
                    onClose();
                  }}
                >
                  Open KDP Check
                </button>
              </div>
            )}
          </div>

          {busy && (
            <div className="section">
              <div className="progress">
                <div
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 15}%`,
                  }}
                />
              </div>
              <p className="hint" style={{ marginTop: 6 }}>{progress.label || 'Working…'}</p>
            </div>
          )}

          {error && (
            <p className="hint" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={run}
            disabled={busy || preflightResult.status === 'blocked'}
            title={preflightResult.status === 'blocked' ? 'Export is blocked by preflight errors' : ''}
          >
            {busy ? 'Exporting…' : preflightResult.status === 'blocked' ? 'Export Blocked' : `Export ${format.toUpperCase()}`}
          </button>
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
