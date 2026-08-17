import { useEffect, useState } from 'react';
import { storage, type StoredProject } from '../services/storage';
import { PARAMETRIC_TEMPLATES } from '../domain/template-registry';
import { VALIDATED_TRIM_SIZES } from '../domain/geometry';
import { Icon, type IconName } from './Icon';

interface Props {
  onOpenQuickWordSearch: () => void;
  onOpenProject: (p: StoredProject) => void;
  onExportProject: (p: StoredProject) => void;
  onGoToTab: (tab: 'create' | 'projects' | 'templates') => void;
  onUseTemplate: (templateId: string) => void;
  onOpenModuleInEditor: (moduleId: 'sudoku' | 'crossword' | 'handwriting' | 'maze') => void;
  onOpenEditor: () => void;
}

/** A generator card on the home page. */
const MODULES: {
  id: 'sudoku' | 'crossword' | 'handwriting' | 'maze';
  icon: IconName;
  title: string;
  tag: string;
  blurb: string;
  accent: 'violet' | 'blue' | 'teal' | 'amber';
}[] = [
  {
    id: 'sudoku',
    icon: 'crossword',
    title: 'Sudoku',
    tag: '4×4 → 16×16',
    blurb: 'Unique, solvable grids with rotational symmetry and answer-key pages.',
    accent: 'violet',
  },
  {
    id: 'crossword',
    icon: 'grid',
    title: 'Crossword',
    tag: 'Themed banks',
    blurb: 'Ready clue banks, adaptive grids and clean ACROSS / DOWN layout.',
    accent: 'blue',
  },
  {
    id: 'maze',
    icon: 'shapes',
    title: 'Maze',
    tag: '4 shapes',
    blurb: 'Square, circular, triangular and hexagonal mazes — always solvable.',
    accent: 'teal',
  },
  {
    id: 'handwriting',
    icon: 'type',
    title: 'Handwriting',
    tag: 'Worksheets',
    blurb: 'Letter tracing with guide lines, stroke order and practice rows.',
    accent: 'amber',
  },
];

export function HomeScreen({
  onOpenQuickWordSearch,
  onOpenProject,
  onExportProject,
  onGoToTab,
  onUseTemplate,
  onOpenModuleInEditor,
  onOpenEditor,
}: Props) {
  const [recent, setRecent] = useState<StoredProject[]>(
    () => storage.listCached().slice(0, 3) as StoredProject[],
  );

  useEffect(() => {
    let cancelled = false;
    storage.list().then((all) => {
      if (!cancelled) setRecent(all.slice(0, 3));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const publishedTemplates = PARAMETRIC_TEMPLATES.filter((t) => t.status === 'published').slice(0, 4);

  return (
    <div className="lp-scroll">
      <div className="home-shell">
        {/* ---------------------------------------------------------- hero */}
        <section className="hm-hero">
          <div className="hm-hero-inner">
            <span className="lp-eyebrow">
              <span className="lp-dot" />
              KDP book production
            </span>
            <h1 className="hm-hero-title">
              Make the book.
              <br />
              <span className="hm-hero-grad">We handle the printing math.</span>
            </h1>
            <p className="hm-hero-sub">
              Novelka turns puzzle ideas into print-ready KDP books — with
              automatic layout, gutters, safe areas, covers and preflight checks.
            </p>
            <div className="hm-hero-actions">
              <button className="lp-btn lp-btn-primary" onClick={onOpenQuickWordSearch}>
                <Icon name="wandSparkles" size={16} /> Quick Word-Search Creator
              </button>
              <button className="lp-btn lp-btn-ghost" onClick={() => onGoToTab('create')}>
                <Icon name="plus" size={15} /> Start a new book
              </button>
              <button className="lp-btn lp-btn-ghost" onClick={onOpenEditor}>
                <Icon name="sidebar" size={15} /> Open the editor
              </button>
            </div>
            <div className="hm-hero-stats">
              <span><strong>5</strong> generators</span>
              <span><strong>17</strong> KDP trims</span>
              <span><strong>0.125″</strong> bleed</span>
              <span><strong>KDP</strong> preflight</span>
            </div>
          </div>

          <div className="hm-hero-art" aria-hidden="true">
            <div className="hm-book">
              <span className="hm-sheet hm-back" />
              <span className="hm-sheet hm-spine" />
              <span className="hm-sheet hm-front">
                <span className="hm-front-mark">N</span>
                <span className="hm-front-line l1" />
                <span className="hm-front-line l2" />
              </span>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- quick start */}
        <section className="hm-section">
          <div className="hm-section-head">
            <h2>Get started</h2>
            <button className="btn sm ghost" onClick={() => onGoToTab('create')}>
              All options →
            </button>
          </div>
          <div className="hm-start-grid">
            <button className="hm-start-card" onClick={onOpenQuickWordSearch}>
              <span className="hm-start-ic violet"><Icon name="wandSparkles" size={20} /></span>
              <span className="hm-start-title">Word Search book</span>
              <span className="hm-start-desc">One-click generator with built-in answers.</span>
            </button>
            <button className="hm-start-card" onClick={() => onGoToTab('templates')}>
              <span className="hm-start-ic blue"><Icon name="layoutTemplate" size={20} /></span>
              <span className="hm-start-title">Use a template</span>
              <span className="hm-start-desc">Published parametric layouts for any trim.</span>
            </button>
            <button className="hm-start-card" onClick={onOpenEditor}>
              <span className="hm-start-ic teal"><Icon name="page" size={20} /></span>
              <span className="hm-start-title">Blank canvas</span>
              <span className="hm-start-desc">Design interiors and covers from scratch.</span>
            </button>
          </div>
        </section>

        {/* ----------------------------------------------------- recent */}
        {recent.length > 0 && (
          <section className="hm-section">
            <div className="hm-section-head">
              <h2>Recent projects</h2>
              <button className="btn sm ghost" onClick={() => onGoToTab('projects')}>
                All projects →
              </button>
            </div>
            <div className="hm-recent-grid">
              {recent.map((p) => (
                <button key={p.id} className="hm-recent-card" onClick={() => onOpenProject(p)}>
                  <span className="hm-recent-thumb">
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" />
                    ) : (
                      <Icon name="book" size={18} />
                    )}
                  </span>
                  <span className="hm-recent-meta">
                    <strong>{p.name}</strong>
                    <span>{p.pageCount} pages · {new Date(p.updatedAt).toLocaleDateString()}</span>
                  </span>
                  <span
                    className="hm-recent-export"
                    title="Export PDF"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportProject(p);
                    }}
                  >
                    <Icon name="download" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ----------------------------------------------------- generators */}
        <section className="hm-section">
          <div className="hm-section-head">
            <h2>Puzzle generators</h2>
            <button className="btn sm ghost" onClick={() => onGoToTab('create')}>
              Generator hub →
            </button>
          </div>
          <div className="hm-mod-grid">
            {MODULES.map((m) => (
              <button key={m.id} className="hm-mod-card" onClick={() => onOpenModuleInEditor(m.id)}>
                <span className={`hm-mod-ic ${m.accent}`}><Icon name={m.icon} size={20} /></span>
                <span className="hm-mod-title">{m.title}</span>
                <span className="hm-mod-tag">{m.tag}</span>
                <span className="hm-mod-desc">{m.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- templates */}
        {publishedTemplates.length > 0 && (
          <section className="hm-section">
            <div className="hm-section-head">
              <h2>Published templates</h2>
              <button className="btn sm ghost" onClick={() => onGoToTab('templates')}>
                View all →
              </button>
            </div>
            <div className="hm-tpl-row">
              {publishedTemplates.map((t) => {
                const supported = t.supportedSizes.includes('*')
                  ? 'All validated sizes'
                  : t.supportedSizes.map((s) => VALIDATED_TRIM_SIZES[s]?.label ?? s).join(', ');
                return (
                  <button
                    key={t.templateId}
                    className="hm-tpl-card"
                    onClick={() =>
                      t.pageModes.includes('puzzle')
                        ? onUseTemplate(t.templateId)
                        : onOpenQuickWordSearch()
                    }
                  >
                    <span className="hm-tpl-prev">
                      <Icon name="layoutTemplate" size={22} />
                    </span>
                    <span className="hm-tpl-name">{t.name}</span>
                    <span className="hm-tpl-sizes">{supported}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ----------------------------------------------------- trust */}
        <section className="hm-section">
          <div className="hm-trust">
            <span className="hm-trust-ic"><Icon name="shield" size={22} /></span>
            <div className="hm-trust-copy">
              <strong>KDP preflight built in</strong>
              <span>
                Automatic gutters, safe-area margins, minimum text size and strict
                cover/interior PDF separation — before you export.
              </span>
            </div>
            <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={onOpenEditor}>
              <Icon name="check" size={14} /> Try the checks
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
