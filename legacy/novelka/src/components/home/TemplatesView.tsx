import { PARAMETRIC_TEMPLATES } from '../../domain/template-registry';
import { VALIDATED_TRIM_SIZES } from '../../domain/geometry';
import { Icon } from '../Icon';

interface Props {
  onUseTemplate: (templateId: string) => void;
  onOpenQuickWordSearch: () => void;
}

export function TemplatesView({ onUseTemplate, onOpenQuickWordSearch }: Props) {
  // Only published templates are displayed in the customer gallery
  const publishedTemplates = PARAMETRIC_TEMPLATES.filter((t) => t.status === 'published');

  return (
    <div className="lp-scroll" style={{ padding: '32px 24px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 28 }}>
        <span className="lp-eyebrow" style={{ marginBottom: 6 }}>
          <span className="lp-dot" />
          Parametric Layout System
        </span>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
          Published Layout Templates
        </h2>
        <p className="hint" style={{ fontSize: 14, margin: 0, maxWidth: 640 }}>
          Deterministic, responsive layout templates with automatic safe-area margin calculations and multi-up grid budgeting.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {publishedTemplates.map((t) => {
          const supportedLabels = t.supportedSizes.includes('*')
            ? 'All validated sizes'
            : t.supportedSizes
                .map((s) => VALIDATED_TRIM_SIZES[s]?.label ?? s)
                .join(', ');

          const isPuzzle = t.pageModes.includes('puzzle');

          return (
            <div
              key={t.templateId}
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '1px solid var(--lp-line, #334155)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--lp-text, #f8fafc)' }}>
                      {t.name}
                    </h3>
                    <div className="hint" style={{ fontSize: 12, marginTop: 2 }}>
                      ID: <code style={{ color: 'var(--lp-accent, #6366f1)' }}>{t.templateId}</code> · v{t.version}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: isPuzzle ? 'var(--accent-soft, #ede9fe)' : '#dcfce7',
                      color: isPuzzle ? 'var(--accent, #6366f1)' : '#15803d',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {isPuzzle ? 'Puzzle Page' : 'Answer Key'}
                  </span>
                </div>

                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  {t.description}
                </p>

                <div style={{ background: 'var(--lp-bg-2, #0f172a)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Supported Print Sizes:</strong> {supportedLabels}
                  </div>
                  <div>
                    <strong>Generator:</strong> {t.generatorKinds.map((k) => k === 'wordsearch' ? 'Word Search' : k).join(', ')}
                  </div>
                </div>
              </div>

              <button
                className="lp-btn lp-btn-primary lp-btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  if (isPuzzle) {
                    onUseTemplate(t.templateId);
                  } else {
                    onOpenQuickWordSearch();
                  }
                }}
              >
                <Icon name="wandSparkles" size={14} /> Use in Word-Search Book
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
