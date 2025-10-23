import React from 'react';
import { useFiltersStore } from '../../state/filtersStore';
import Icon from '../icons/Icon';
import '../../styles/ActiveFiltersChips.css';

/**
 * Компонент чипов активных фильтров
 * Согласно patch-005 (упрощено, убраны numericFilters и timeOfDay)
 */
const ActiveFiltersChips = ({ onOpenFilters }) => {
  const {
    p2pFilter,
    currencyFilter,
    dateFilter,
    textFilters,
    setP2PFilter,
    setCurrencyFilter,
    setDateFilter,
    updateTextFilter,
    clearAllFilters,
    getActiveFiltersCount,
  } = useFiltersStore();

  const activeCount = getActiveFiltersCount();

  if (activeCount === 0) {
    return null; // Не показываем если нет активных фильтров
  }

  // Генерация массива чипов
  const chips = [];

  // P2P
  if (p2pFilter !== 'all') {
    const label = p2pFilter === 'p2p' ? 'Только P2P' : 'Без P2P';
    chips.push({
      id: 'p2p',
      label: `P2P: ${label}`,
      onRemove: () => setP2PFilter('all'),
      onClick: () => onOpenFilters('quick'),
    });
  }

  // Валюта
  if (currencyFilter !== 'all') {
    chips.push({
      id: 'currency',
      label: `Валюта: ${currencyFilter}`,
      onRemove: () => setCurrencyFilter('all'),
      onClick: () => onOpenFilters('quick'),
    });
  }

  // Дата
  if (dateFilter) {
    let dateLabel = '';
    if (dateFilter.preset && dateFilter.preset !== 'custom') {
      const presetLabels = {
        today: 'Сегодня',
        yesterday: 'Вчера',
        thisWeek: 'Эта неделя',
        thisMonth: 'Этот месяц',
        lastMonth: 'Прошлый месяц',
      };
      dateLabel = presetLabels[dateFilter.preset];
    } else if (dateFilter.from || dateFilter.to) {
      dateLabel = `${dateFilter.from || '...'} — ${dateFilter.to || '...'}`;
    }

    if (dateLabel) {
      chips.push({
        id: 'date',
        label: `Дата: ${dateLabel}`,
        onRemove: () => setDateFilter(null),
        onClick: () => onOpenFilters('date'),
      });
    }

    // Дни недели
    if (dateFilter.weekdays && dateFilter.weekdays.length > 0) {
      const weekdayLabels = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };
      const displayDays = dateFilter.weekdays.map(d => weekdayLabels[d]).join(', ');
      chips.push({
        id: 'weekdays',
        label: `Дни: ${displayDays}`,
        onRemove: () => setDateFilter({ ...dateFilter, weekdays: undefined }),
        onClick: () => onOpenFilters('date'),
      });
    }
  }

  // Оператор
  if (textFilters?.operator) {
    const value = textFilters.operator;
    const displayValue = value.length > 20 ? value.substring(0, 20) + '...' : value;
    chips.push({
      id: 'operator',
      label: `Оператор: ${displayValue}`,
      onRemove: () => updateTextFilter('operator', ''),
      onClick: () => onOpenFilters('text'),
    });
  }

  // Приложение
  if (textFilters?.app) {
    chips.push({
      id: 'app',
      label: `Приложение: ${textFilters.app}`,
      onRemove: () => updateTextFilter('app', ''),
      onClick: () => onOpenFilters('text'),
    });
  }

  // Тип
  if (textFilters?.transaction_type && textFilters.transaction_type !== 'all') {
    chips.push({
      id: 'type',
      label: `Тип: ${textFilters.transaction_type}`,
      onRemove: () => updateTextFilter('transaction_type', 'all'),
      onClick: () => onOpenFilters('text'),
    });
  }

  // Источник
  if (textFilters?.source && textFilters.source !== 'all') {
    chips.push({
      id: 'source',
      label: `Источник: ${textFilters.source}`,
      onRemove: () => updateTextFilter('source', 'all'),
      onClick: () => onOpenFilters('text'),
    });
  }

  return (
    <div className="active-filters-chips">
      <div className="chips-container">
        {chips.map((chip) => (
          <div
            key={chip.id}
            className="filter-chip"
            onClick={chip.onClick}
            title="Кликните для редактирования"
          >
            <span className="chip-label">{chip.label}</span>
            <button
              className="chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                chip.onRemove();
              }}
              title="Удалить фильтр"
              aria-label={`Удалить фильтр: ${chip.label}`}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        className="clear-all-filters"
        onClick={clearAllFilters}
        title="Очистить все фильтры"
      >
        Очистить все
      </button>
    </div>
  );
};

export default ActiveFiltersChips;
