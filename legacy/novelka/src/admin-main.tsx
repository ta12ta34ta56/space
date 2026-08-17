import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './admin/AdminApp';

const container = document.getElementById('admin-root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <AdminApp />
    </React.StrictMode>,
  );
}
