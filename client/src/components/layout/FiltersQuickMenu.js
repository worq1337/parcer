import React from 'react';
import { useFiltersStore } from '../../state/filtersStore';
import Icon from '../icons/Icon';
import './FiltersQuickMenu.css';

/**
 * Filters Quick Menu Component
 * Быстрое меню фильтров с сохранёнными наборами и предустановленными фильтрами
 */
const FiltersQuickMenu = ({ onClose }) => {
  const {
    savedFilterSets,
    loadFilterSet,
    deleteFilterSet,
    setDateFilter,
    setCurrencyFilter,
    setP2PFilter,
    clearAllFilters,
  } = useFiltersStore();

  const handleQuickFilter = (filterAction) => {
    filterAction();
    if (onClose) onClose();
  };

  const handleLoadFilterSet = (id) => {
    loadFilterSet(id);
    if (onClose) onClose();
  };

  const handleDeleteFilterSet = (e, id) => {
    e.stopPropagation();
    if (window.confirm('Удалить сохранённый набор фильтров?')) {
      deleteFilterSet(id);
    }
  };

  // Быстрые фильтры (теги)
  const quickFilters = [
    {
      icon: 'today',
      label: 'Сегодня',
      action: () => setDateFilter({ preset: 'today' }),
    },
    {
      icon: 'date_range',
      label: 'Вчера',
      action: () => setDateFilter({ preset: 'yesterday' }),
    },
    {
      icon: 'calendar_month',
      label: 'Этот месяц',
      action: () => setDateFilter({ preset: 'thisMonth' }),
    },
    {
      icon: 'currency_exchange',
      label: 'Валюта: UZS',
      action: () => setCurrencyFilter('UZS'),
    },
    {
      icon: 'attach_money',
      label: 'Валюта: USD',
      action: () => setCurrencyFilter('USD'),
    },
    {
      icon: 'swap_horiz',
      label: 'Только P2P',
      action: () => setP2PFilter('p2p'),
    },
    {
      icon: 'block',
      label: 'Без P2P',
      action: () => setP2PFilter('non_p2p'),
    },
  ];

  return (
    <div className="filters-quick-menu">
      {/* Быстрые теги */}
      <div className="quick-menu-section">
        <div className="quick-menu-header">Быстрые фильтры</div>
        <div className="quick-filters-grid">
          {quickFilters.map((filter, index) => (
            <button
              key={index}
              className="quick-filter-tag"
              onClick={() => handleQuickFilter(filter.action)}
              title={filter.label}
            >
              <Icon name={filter.icon} size={16} />
              <span>{filter.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Разделитель */}
      {savedFilterSets.length > 0 && <div className="quick-menu-divider" />}

      {/* Сохранённые наборы */}
      {savedFilterSets.length > 0 && (
        <div className="quick-menu-section">
          <div className="quick-menu-header">Сохранённые наборы</div>
          <div className="saved-filter-sets">
            {savedFilterSets.map((filterSet) => (
              <div
                key={filterSet.id}
                className="saved-filter-set"
                onClick={() => handleLoadFilterSet(filterSet.id)}
                title={`Загрузить набор: ${filterSet.name}`}
              >
                <Icon name="bookmark" size={16} />
                <span className="filter-set-name">{filterSet.name}</span>
                <span className="filter-set-count">
                  {filterSet.filters.length} фильтр(ов)
                </span>
                <button
                  className="filter-set-delete"
                  onClick={(e) => handleDeleteFilterSet(e, filterSet.id)}
                  title="Удалить набор"
                >
                  <Icon name="delete" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Разделитель */}
      <div className="quick-menu-divider" />

      {/* Очистить все фильтры */}
      <div className="quick-menu-section">
        <button
          className="quick-menu-action clear-filters"
          onClick={() => handleQuickFilter(clearAllFilters)}
        >
          <Icon name="filter_alt_off" size={18} />
          <span>Очистить все фильтры</span>
        </button>
      </div>
    </div>
  );
};

export default FiltersQuickMenu;
