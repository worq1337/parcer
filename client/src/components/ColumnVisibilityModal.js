import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import Icon from './icons/Icon';
import { useFiltersStore } from '../state/filtersStore';
import '../styles/ColumnVisibilityModal.css';

/**
 * Модальное окно для управления видимостью колонок
 * Phase 1, Task 7
 */
const ColumnVisibilityModal = ({ isOpen, onClose, columnDefs, api }) => {
  const columnSettings = useFiltersStore((state) => state.columnSettings);
  const toggleColumnVisibility = useFiltersStore((state) => state.toggleColumnVisibility);
  const [searchQuery, setSearchQuery] = useState('');

  // Закрытие по Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Получаем список колонок с их состоянием видимости
  const columns = useMemo(() => {
    if (!columnDefs) return [];

    return columnDefs
      .filter((colDef) => colDef.field) // Только колонки с field
      .map((colDef) => ({
        field: colDef.field,
        headerName: colDef.headerName || colDef.field,
        visible: !columnSettings.hidden.includes(colDef.field),
      }));
  }, [columnDefs, columnSettings.hidden]);

  // Фильтрация колонок по поисковому запросу
  const filteredColumns = useMemo(() => {
    if (!searchQuery.trim()) return columns;

    const query = searchQuery.toLowerCase();
    return columns.filter(
      (col) =>
        col.headerName.toLowerCase().includes(query) ||
        col.field.toLowerCase().includes(query)
    );
  }, [columns, searchQuery]);

  const handleToggle = (field) => {
    toggleColumnVisibility(field);

    // Обновляем видимость в AG Grid
    if (api) {
      const isCurrentlyVisible = !columnSettings.hidden.includes(field);
      api.setColumnsVisible([field], !isCurrentlyVisible);
    }
  };

  const handleShowAll = () => {
    columns.forEach((col) => {
      if (!col.visible) {
        toggleColumnVisibility(col.field);
        if (api) {
          api.setColumnsVisible([col.field], true);
        }
      }
    });
    toast.success('Все колонки показаны');
  };

  const handleHideAll = () => {
    columns.forEach((col) => {
      if (col.visible) {
        toggleColumnVisibility(col.field);
        if (api) {
          api.setColumnsVisible([col.field], false);
        }
      }
    });
    toast.success('Все колонки скрыты');
  };

  if (!isOpen) return null;

  const visibleCount = columns.filter((col) => col.visible).length;
  const hiddenCount = columns.length - visibleCount;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="column-visibility-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Показать/скрыть колонки</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Поиск */}
          <div className="column-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              placeholder="Поиск колонок..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                className="search-clear-button"
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          {/* Статистика */}
          <div className="column-stats">
            <span className="stat-item">
              <strong>Всего:</strong> {columns.length}
            </span>
            <span className="stat-item stat-visible">
              <strong>Показано:</strong> {visibleCount}
            </span>
            <span className="stat-item stat-hidden">
              <strong>Скрыто:</strong> {hiddenCount}
            </span>
          </div>

          {/* Кнопки быстрых действий */}
          <div className="column-actions">
            <button className="action-button" onClick={handleShowAll}>
              <Icon name="visibility" size={16} />
              <span>Показать все</span>
            </button>
            <button className="action-button" onClick={handleHideAll}>
              <Icon name="visibility_off" size={16} />
              <span>Скрыть все</span>
            </button>
          </div>

          {/* Список колонок */}
          <div className="column-list">
            {filteredColumns.length === 0 ? (
              <div className="empty-state">
                <Icon name="search" size={32} />
                <p>Колонки не найдены</p>
              </div>
            ) : (
              filteredColumns.map((col) => (
                <div
                  key={col.field}
                  className={`column-item ${col.visible ? 'column-visible' : 'column-hidden'}`}
                  onClick={() => handleToggle(col.field)}
                >
                  <label className="column-checkbox">
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => handleToggle(col.field)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="checkbox-custom">
                      {col.visible && <Icon name="check" size={14} />}
                    </span>
                  </label>

                  <div className="column-info">
                    <div className="column-name">{col.headerName}</div>
                    {col.field !== col.headerName && (
                      <div className="column-field">{col.field}</div>
                    )}
                  </div>

                  <Icon
                    name={col.visible ? 'visibility' : 'visibility_off'}
                    size={16}
                    className="column-status-icon"
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="button-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnVisibilityModal;
