export type AdminTab = 'overview' | 'users' | 'flags' | 'templates' | 'audit';

interface AdminNavProps {
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  userEmail: string;
  onSignOut: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function AdminNav({
  activeTab,
  onSelectTab,
  userEmail,
  onSignOut,
  theme,
  onToggleTheme,
}: AdminNavProps) {
  return (
    <header className="adm-header">
      <div className="adm-brand">
        <span>Novelka</span>
        <span className="adm-brand-tag">Control Plane</span>
      </div>

      <nav className="adm-nav" aria-label="Admin Navigation">
        <button
          className={`adm-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => onSelectTab('overview')}
        >
          Overview
        </button>
        <button
          className={`adm-nav-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => onSelectTab('users')}
        >
          Users
        </button>
        <button
          className={`adm-nav-btn ${activeTab === 'flags' ? 'active' : ''}`}
          onClick={() => onSelectTab('flags')}
        >
          Plans & Flags
        </button>
        <button
          className={`adm-nav-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => onSelectTab('templates')}
        >
          Templates
        </button>
        <button
          className={`adm-nav-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => onSelectTab('audit')}
        >
          Audit Logs
        </button>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="adm-user-chip">
          <span>{userEmail}</span>
          <span className="adm-badge adm-badge-owner">Owner</span>
        </div>

        <button
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <button
          className="adm-btn adm-btn-secondary adm-btn-sm"
          onClick={onSignOut}
          title="Sign out of owner account"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
