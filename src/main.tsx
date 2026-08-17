import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Novelka could not start: the page is missing its #root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
