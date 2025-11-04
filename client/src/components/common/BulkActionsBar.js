import React, { useState } from 'react';
import Icon from '../icons/Icon';
import './BulkActionsBar.css';

/**
 * BulkActionsBar - Панель массовых действий с операторами
 *
 * @param {Object} props
 * @param {number} props.selectedCount - Количество выбранных операторов
 * @param {Function} props.onClearSelection - Callback для снятия выбора
 * @param {Function} props.onBulkUpdateApp - Callback для массового обновления appName (appName)
 * @param {Function} props.onBulkUpdateP2P - Callback для массового обновления P2P (isP2P)
 * @param {Function} props.onBulkDelete - Callback для массового удаления
 * @param {Array} props.uniqueApps - Список уникальных приложений для выбора
 */
const BulkActionsBar = ({
  selectedCount,
  onClearSelection,
  onBulkUpdateApp,
  onBulkUpdateP2P,
  onBulkDelete,
  uniqueApps = [],
}) => {
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [showP2PMenu, setShowP2PMenu] = useState(false);

  const handleUpdateApp = (appName) => {
    onBulkUpdateApp(appName);
    setShowAppMenu(false);
  };

  const handleUpdateP2P = (isP2P) => {
    onBulkUpdateP2P(isP2P);
    setShowP2PMenu(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Удалить ${selectedCount} оператор(ов)?`)) {
      onBulkDelete();
    }
  };

  return (
    <div className="bulk-actions-bar">
      <div className="bulk-actions-info">
        <Icon name="check_circle" size={20} />
        <span className="bulk-count">Выбрано: {selectedCount}</span>
        <button
          className="btn-text bulk-clear"
          onClick={onClearSelection}
          title="Снять выбор"
        >
          <Icon name="close" size={16} />
          <span>Отменить</span>
        </button>
      </div>

      <div className="bulk-actions-buttons">
        {/* Изменить приложение */}
        <div className="bulk-action-dropdown">
          <button
            className="btn-secondary bulk-action-btn"
            onClick={() => setShowAppMenu(!showAppMenu)}
          >
            <Icon name="apps" size={18} />
            <span>Изменить приложение</span>
            <Icon name={showAppMenu ? 'expand_less' : 'expand_more'} size={16} />
          </button>

          {showAppMenu && (
            <div className="bulk-action-menu">
              <div className="bulk-action-menu-header">Выберите приложение:</div>
              {uniqueApps.map((app) => (
                <button
                  key={app}
                  className="bulk-action-menu-item"
                  onClick={() => handleUpdateApp(app)}
                >
                  {app}
                </button>
              ))}
              {uniqueApps.length === 0 && (
                <div className="bulk-action-menu-empty">Нет доступных приложений</div>
              )}
            </div>
          )}
        </div>

        {/* Изменить P2P */}
        <div className="bulk-action-dropdown">
          <button
            className="btn-secondary bulk-action-btn"
            onClick={() => setShowP2PMenu(!showP2PMenu)}
          >
            <Icon name="swap_horiz" size={18} />
            <span>Изменить P2P</span>
            <Icon name={showP2PMenu ? 'expand_less' : 'expand_more'} size={16} />
          </button>

          {showP2PMenu && (
            <div className="bulk-action-menu">
              <div className="bulk-action-menu-header">Установить P2P:</div>
              <button
                className="bulk-action-menu-item"
                onClick={() => handleUpdateP2P(true)}
              >
                <Icon name="check" size={16} />
                P2P
              </button>
              <button
                className="bulk-action-menu-item"
                onClick={() => handleUpdateP2P(false)}
              >
                <Icon name="close" size={16} />
                Не P2P
              </button>
            </div>
          )}
        </div>

        {/* Удалить */}
        <button
          className="btn-danger bulk-action-btn"
          onClick={handleDelete}
          title={`Удалить ${selectedCount} оператор(ов)`}
        >
          <Icon name="delete" size={18} />
          <span>Удалить ({selectedCount})</span>
        </button>
      </div>
    </div>
  );
};

export default BulkActionsBar;
