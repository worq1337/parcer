import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css'; // patch-016 §3, §10: Токены дизайна для светлой/тёмной темы
import './styles/index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>
);

if (typeof window !== 'undefined' && !window.__APP_ERROR_LISTENERS__) {
  window.addEventListener('error', (event) => {
    console.error('[window error]', event.error || event.message || event);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[promise rejection]', event.reason || event);
  });
  window.__APP_ERROR_LISTENERS__ = true;
}
