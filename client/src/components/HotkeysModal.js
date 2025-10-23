import React, { useState, useEffect, useMemo } from 'react';
import Icon from './icons/Icon';
import { HOTKEY_GROUPS } from '../constants/hotkeys';
import '../styles/HotkeysModal.css';

/**
 * HotkeysModal - patch-010 §4
 * Модал с горячими клавишами и поиском
 * Открывается по Ctrl/Cmd+/ или клику на иконку keyboard
 */
const HotkeysModal = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return HOTKEY_GROUPS;
    }
    return HOTKEY_GROUPS.map((group) => {
      const items = group.items.filter((item) => {
        const haystack = [
          item.shortcut,
          item.description,
          group.category,
          ...(item.keywords || []),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
      if (items.length === 0) {
        return null;
      }
      return {
        ...group,
        items,
      };
    }).filter(Boolean);
  }, [searchQuery]);

  // Обработка Escape для закрытия
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Закрытие по клику на фон
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="hotkeys-modal-backdrop" onClick={handleBackdropClick}>
      <div className="hotkeys-modal">
        {/* Заголовок */}
        <div className="hotkeys-modal-header">
          <div className="hotkeys-modal-title">
            <Icon name="keyboard" size={24} />
            <h2>Горячие клавиши</h2>
          </div>
          <button className="hotkeys-modal-close" onClick={onClose}>
            <Icon name="close" size={24} />
          </button>
        </div>

        {/* Поиск */}
        <div className="hotkeys-modal-search">
          <Icon name="search" size={20} />
          <input
            type="text"
            placeholder="Поиск по клавише или описанию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {/* Список клавиш */}
        <div className="hotkeys-modal-content">
          {filteredGroups.length === 0 ? (
            <div className="hotkeys-empty">
              <Icon name="info" size={48} style={{ opacity: 0.3 }} />
              <p>Ничего не найдено</p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category} className="hotkeys-category">
                <h3 className="hotkeys-category-title">{group.category}</h3>
                <div className="hotkeys-list">
                  {group.items.map((hotkey) => (
                    <div key={hotkey.id} className="hotkeys-item">
                      <kbd className="hotkey-key">{hotkey.shortcut}</kbd>
                      <span className="hotkey-description">{hotkey.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Футер */}
        <div className="hotkeys-modal-footer">
          <div className="hotkeys-hint">
            <Icon name="info" size={16} />
            <span>Нажмите <kbd>Esc</kbd> или кликните вне окна для закрытия</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HotkeysModal;
