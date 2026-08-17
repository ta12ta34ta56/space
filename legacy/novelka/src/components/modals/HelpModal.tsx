import { useEffect } from 'react';
import { Icon } from '../Icon';
import { VALIDATED_TRIM_SIZES, GUTTER_BANDS, IN } from '../../domain/geometry';

interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="modal" style={{ maxWidth: 680, width: '92%' }}>
        <div className="modal-head">
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span id="help-modal-title" style={{ fontWeight: 700, fontSize: 16 }}>
              Formatting &amp; Preflight Guide
            </span>
            <span className="badge" style={{ background: 'var(--accent-soft, #ede9fe)', color: 'var(--accent, #6366f1)' }}>
              Reference
            </span>
          </div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close Guide">
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div className="stack" style={{ gap: 18 }}>
            {/* 1. Validated Print Sizes */}
            <div style={{ background: 'var(--bg-2, #1e293b)', padding: 14, borderRadius: 8, border: '1px solid var(--line, #334155)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Icon name="ruler" size={16} />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>1. Validated Print Sizes</h4>
              </div>
              <p className="hint" style={{ margin: '0 0 10px 0', fontSize: 12.5 }}>
                Novelka operates in exact PDF points (72 pt = 1 inch) across five validated print sizes:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, fontSize: 12 }}>
                {Object.entries(VALIDATED_TRIM_SIZES).map(([k, s]) => (
                  <div key={k} style={{ background: 'var(--card, #0f172a)', padding: 8, borderRadius: 6, border: '1px solid var(--line, #334155)' }}>
                    <strong>{s.label}</strong>
                    <div className="hint">{s.width} × {s.height} pt</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Automatic Gutter Calculation */}
            <div style={{ background: 'var(--bg-2, #1e293b)', padding: 14, borderRadius: 8, border: '1px solid var(--line, #334155)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Icon name="book" size={16} />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>2. Automatic Gutter &amp; Safe Area Calculations</h4>
              </div>
              <p className="hint" style={{ margin: '0 0 8px 0', fontSize: 12.5 }}>
                Inside margins dynamically expand on the spine side (left on odd recto pages, right on even verso pages) based on total book thickness:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6 }}>
                {GUTTER_BANDS.map((b, idx) => (
                  <li key={idx}>
                    Up to {b.maxPages} pages: <strong>{b.inches.toFixed(3)}″</strong> ({Math.round(b.inches * IN)} pt spine margin)
                  </li>
                ))}
              </ul>
            </div>

            {/* 3. Preflight Checks */}
            <div style={{ background: 'var(--bg-2, #1e293b)', padding: 14, borderRadius: 8, border: '1px solid var(--line, #334155)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <Icon name="shield" size={16} />
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>3. Preflight Engine Diagnostics</h4>
              </div>
              <p className="hint" style={{ margin: '0 0 8px 0', fontSize: 12.5 }}>
                Before export, Novelka automatically inspects:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.6 }}>
                <li><strong>Safe-area clearance:</strong> Ensures text and grid cells sit inside safe margins.</li>
                <li><strong>Readability threshold:</strong> Verifies text sizes meet minimum print standards (6pt for puzzle letters, 3.5pt for answer keys).</li>
                <li><strong>Solution coverage:</strong> Validates that every puzzle has a corresponding answer key solution.</li>
                <li><strong>Separate PDF exports:</strong> Generates Interior PDF and Wraparound Cover PDF as independent compliant files.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
