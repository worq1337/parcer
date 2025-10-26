import React from 'react';
import Icon from '../icons/Icon';

/**
 * Bulk actions bar (shown when messages selected)
 */
const BulkActionsBar = ({
  selectedCount,
  onProcessSelected,
  onClearSelection,
  onSelectAll
}) => {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="bulk-actions-bar">
      <div className="bulk-actions-info">
        Выбрано: {selectedCount}
      </div>
      <div className="bulk-actions-buttons">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onSelectAll}
        >
          <Icon name="select_all" size={16} />
          Выбрать все
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={onProcessSelected}
        >
          <Icon name="play_arrow" size={16} />
          Обработать выбранные
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onClearSelection}
        >
          <Icon name="close" size={16} />
          Снять выделение
        </button>
      </div>
    </div>
  );
};

export default BulkActionsBar;
