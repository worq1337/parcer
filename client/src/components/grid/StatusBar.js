import React from 'react';
import { useChecksStore } from '../../state/checksStore';
import { useFiltersStore } from '../../state/filtersStore';
import { getFormulaEngine } from '../../services/formulaEngine';
import '../../styles/StatusBar.css';

/**
 * Строка состояния с агрегатными данными
 * Согласно patch.md §2.3
 */
const StatusBar = ({ selectedCells = [] }) => {
  const checks = useChecksStore((state) => state.checks);
  const { p2pFilter, currencyFilter, quickSearch, advancedFilters } = useFiltersStore();

  // Применяем фильтры
  const filteredChecks = useFiltersStore.getState().applyFilters(checks);

  // Вычисляем агрегаты для выделенных ячеек
  const aggregates = React.useMemo(() => {
    if (selectedCells.length === 0) {
      return null;
    }

    const engine = getFormulaEngine();
    const values = selectedCells.map(cell => cell.value);
    return engine.calculateAggregates(values);
  }, [selectedCells]);

  // Подсчет активных фильтров
  const activeFiltersCount =
    (p2pFilter !== 'all' ? 1 : 0) +
    (currencyFilter !== 'all' ? 1 : 0) +
    (quickSearch ? 1 : 0) +
    advancedFilters.length;

  return (
    <div className="status-bar">
      <div className="status-section">
        <span className="status-item">
          <strong>Строк:</strong>{' '}
          {filteredChecks.length.toLocaleString('ru-RU')} / {checks.length.toLocaleString('ru-RU')}
        </span>

        {activeFiltersCount > 0 && (
          <span className="status-item status-filter">
            Активных фильтров: {activeFiltersCount}
          </span>
        )}
      </div>

      {aggregates && (
        <div className="status-section status-aggregates">
          <span className="status-item">
            <strong>Количество:</strong> {aggregates.count}
          </span>
          <span className="status-item">
            <strong>Сумма:</strong> {formatNumber(aggregates.sum)}
          </span>
          <span className="status-item">
            <strong>Среднее:</strong> {formatNumber(aggregates.average)}
          </span>
          <span className="status-item">
            <strong>Мин:</strong> {formatNumber(aggregates.min)}
          </span>
          <span className="status-item">
            <strong>Макс:</strong> {formatNumber(aggregates.max)}
          </span>
        </div>
      )}
    </div>
  );
};

function formatNumber(value) {
  if (value === null || value === undefined) return '—';

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default StatusBar;
