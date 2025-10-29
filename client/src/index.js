import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css'; // patch-016 §3, §10: Токены дизайна для светлой/тёмной темы
import './styles/index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));

// StrictMode only in development to avoid production issues
const isDevelopment = process.env.NODE_ENV === 'development';

root.render(
  <ErrorBoundary>
    {isDevelopment ? (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    ) : (
      <App />
    )}
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
