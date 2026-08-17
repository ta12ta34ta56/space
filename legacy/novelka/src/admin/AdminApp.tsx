import { useEffect, useState, useCallback } from 'react';
import { AdminNav, type AdminTab } from './components/AdminNav';
import { AdminOverview } from './components/AdminOverview';
import { AdminUsers } from './components/AdminUsers';
import { AdminFlags } from './components/AdminFlags';
import { AdminTemplates } from './components/AdminTemplates';
import { AdminAuditLogs } from './components/AdminAuditLogs';
import { AdminAuthGate } from './components/AdminAuthGate';
import { adminApi, type AdminApiError } from './api';
import { auth } from '../services/auth';
import './admin.css';

const TOKEN_KEY = 'novelka.admin-token.v1';
const EMAIL_KEY = 'novelka.admin-email.v1';
const THEME_KEY = 'novelka.admin-theme.v1';

export function AdminApp() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [userEmail, setUserEmail] = useState<string>(() => {
    try {
      return sessionStorage.getItem(EMAIL_KEY) || 'owner@novelka.example';
    } catch {
      return 'owner@novelka.example';
    }
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [authStatus, setAuthStatus] = useState<
    'loading' | 'unauthenticated' | 'forbidden' | 'network_error' | 'authenticated'
  >('loading');
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // Verify token against the server API
  const verifySession = useCallback(async (jwtToken: string | null) => {
    if (!jwtToken) {
      setAuthStatus('unauthenticated');
      return;
    }

    try {
      setAuthStatus('loading');
      setAuthErrorMessage(null);
      // Make a real call to overview to verify requireOwner
      await adminApi.getOverview(jwtToken);
      setAuthStatus('authenticated');
    } catch (err: unknown) {
      const apiErr = err as AdminApiError;
      if (apiErr.isAuthError || apiErr.status === 401) {
        setAuthStatus('unauthenticated');
        setAuthErrorMessage('Session expired. Please sign in again.');
      } else if (apiErr.isForbidden || apiErr.status === 403) {
        setAuthStatus('forbidden');
        setAuthErrorMessage(apiErr.message || 'Access denied: Account is not an owner.');
      } else if (apiErr.isNetworkError || apiErr.status === 0) {
        setAuthStatus('network_error');
        setAuthErrorMessage('Server is unavailable. Could not connect to API.');
      } else {
        setAuthStatus('unauthenticated');
        setAuthErrorMessage(apiErr.message || 'Authentication error.');
      }
    }
  }, []);

  useEffect(() => {
    void verifySession(token);
  }, [token, verifySession]);

  const handleLoginSuccess = (newToken: string, email: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, newToken);
      sessionStorage.setItem(EMAIL_KEY, email);
    } catch {}
    setToken(newToken);
    setUserEmail(email);
  };

  const handleSignOut = () => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EMAIL_KEY);
    } catch {}
    void auth.signOut();
    setToken(null);
    setAuthStatus('unauthenticated');
  };

  return (
    <div className="adm-app">
      {authStatus === 'authenticated' && token ? (
        <>
          <AdminNav
            activeTab={tab}
            onSelectTab={setTab}
            userEmail={userEmail}
            onSignOut={handleSignOut}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <main className="adm-main">
            {tab === 'overview' && <AdminOverview token={token} onNavigateTab={setTab} />}
            {tab === 'users' && <AdminUsers token={token} />}
            {tab === 'flags' && <AdminFlags token={token} />}
            {tab === 'templates' && <AdminTemplates token={token} />}
            {tab === 'audit' && <AdminAuditLogs token={token} />}
          </main>
        </>
      ) : (
        <main className="adm-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AdminAuthGate
            authStatus={authStatus === 'authenticated' ? 'loading' : authStatus}
            errorMessage={authErrorMessage}
            currentEmail={userEmail}
            onLoginSuccess={handleLoginSuccess}
            onRetry={() => void verifySession(token)}
            onSignOut={handleSignOut}
          />
        </main>
      )}
    </div>
  );
}
