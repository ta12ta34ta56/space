import { Icon } from '../Icon';
import { useThemeStore } from '../../stores/theme-store';

export type CustomerTab = 'home' | 'create' | 'projects' | 'templates';

interface Props {
  activeTab: CustomerTab;
  onSelectTab: (tab: CustomerTab) => void;
  onOpenEditor: () => void;
  onOpenHelp: () => void;
}

export function CustomerNav({ activeTab, onSelectTab, onOpenEditor, onOpenHelp }: Props) {
  const themeChoice = useThemeStore((s) => s.choice);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <header className="lp-nav" role="banner">
      <button
        className="lp-brand"
        onClick={() => onSelectTab('home')}
        title="Novelka Home"
        aria-label="Novelka Home"
      >
        <span className="lp-brand-mark">N</span>
        <span>Novelka</span>
      </button>

      <nav className="lp-links" aria-label="Main Navigation">
        <button
          className={activeTab === 'home' ? 'active' : ''}
          onClick={() => onSelectTab('home')}
          aria-current={activeTab === 'home' ? 'page' : undefined}
        >
          Home
        </button>
        <button
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => onSelectTab('create')}
          aria-current={activeTab === 'create' ? 'page' : undefined}
        >
          Create
        </button>
        <button
          className={activeTab === 'projects' ? 'active' : ''}
          onClick={() => onSelectTab('projects')}
          aria-current={activeTab === 'projects' ? 'page' : undefined}
        >
          Projects
        </button>
        <button
          className={activeTab === 'templates' ? 'active' : ''}
          onClick={() => onSelectTab('templates')}
          aria-current={activeTab === 'templates' ? 'page' : undefined}
        >
          Templates
        </button>
      </nav>

      <div className="lp-nav-right">
        <button
          className="lp-icon-btn"
          onClick={onOpenHelp}
          title="Formatting & Preflight Guide"
          aria-label="Formatting & Preflight Guide"
        >
          <Icon name="bookOpen" size={16} />
        </button>

        <button
          className="lp-icon-btn"
          onClick={toggleTheme}
          title={
            themeChoice === 'light'
              ? 'Theme: light — click for dark'
              : 'Theme: dark — click for light'
          }
          aria-label={`Theme: ${themeChoice}. Click to switch to ${themeChoice === 'light' ? 'dark' : 'light'}.`}
        >
          <Icon name={themeChoice === 'light' ? 'sun' : 'moon'} size={16} />
        </button>

        <button
          className="lp-btn lp-btn-ghost lp-btn-sm"
          onClick={onOpenEditor}
          title="Open Canvas Editor for manual overrides"
          aria-label="Open Canvas Editor"
        >
          <Icon name="sidebar" size={14} /> Open Editor
        </button>
      </div>
    </header>
  );
}
