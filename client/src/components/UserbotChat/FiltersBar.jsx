import React from 'react';
import { calculateStats } from '../../utils/messageHelpers';

/**
 * Status filters bar
 */
const FiltersBar = ({ statusFilter, onChangeFilter, messages }) => {
  const stats = calculateStats(messages);

  const filters = [
    { value: 'all', label: 'Все', count: stats.total },
    { value: 'unprocessed', label: 'Не обработано', count: stats.unprocessed },
    { value: 'processed', label: 'Обработано', count: stats.processed },
    { value: 'error', label: 'Ошибки', count: stats.error }
  ];

  return (
    <div className="filters-bar">
      {filters.map(filter => (
        <button
          key={filter.value}
          className={`filter-button ${statusFilter === filter.value ? 'active' : ''}`}
          onClick={() => onChangeFilter(filter.value)}
        >
          {filter.label}
          {filter.count > 0 && (
            <span className="filter-badge">{filter.count}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default FiltersBar;
