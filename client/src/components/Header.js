import React from 'react';
import '../styles/Header.css';

const Header = ({ currentView, onViewChange, onAddCheck, onRefresh }) => {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Парсер банковских чеков</h1>
        <nav className="header-nav">
          <button
            className={`nav-button ${currentView === 'checks' ? 'active' : ''}`}
            onClick={() => onViewChange('checks')}
          >
            Чеки
          </button>
          <button
            className={`nav-button ${currentView === 'operators' ? 'active' : ''}`}
            onClick={() => onViewChange('operators')}
          >
            Справочник операторов
          </button>
          <button
            className={`nav-button ${currentView === 'admin' ? 'active' : ''}`}
            onClick={() => onViewChange('admin')}
          >
            Администрирование
          </button>
          <button
            className={`nav-button ${currentView === 'userbot' ? 'active' : ''}`}
            onClick={() => onViewChange('userbot')}
          >
            Telegram userbot
          </button>
        </nav>
      </div>

      <div className="header-actions">
        {currentView === 'checks' && (
          <button className="action-button primary" onClick={onAddCheck}>
            <span className="button-icon">+</span>
            Добавить чек
          </button>
        )}
        <button className="action-button" onClick={onRefresh}>
          <span className="button-icon">⟳</span>
          Обновить
        </button>
      </div>
    </header>
  );
};

export default Header;
