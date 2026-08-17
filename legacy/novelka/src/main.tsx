import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useThemeStore } from './stores/theme-store';

// NOTE: StrictMode is intentionally off — its double-invoked effects
// mount/dispose the Fabric.js canvas twice and break the editor in dev.
// Resolve the theme before the first render. index.html already set the
// data-theme attribute synchronously to avoid a flash; this syncs the store.
useThemeStore.getState().init();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
