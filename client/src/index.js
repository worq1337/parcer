import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css'; // patch-016 §3, §10: Токены дизайна для светлой/тёмной темы
import './styles/index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
