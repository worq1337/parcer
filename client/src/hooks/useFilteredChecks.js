import { useMemo } from 'react';
import { useChecksStore } from '../state/checksStore';
import { useFiltersStore } from '../state/filtersStore';

/**
 * Оптимизированный хук для получения отфильтрованных чеков
 * Использует мемоизацию для избежания лишних пересчетов
 * 
 * @returns {Array} Массив отфильтрованных чеков
 */
export const useFilteredChecks = () => {
  // Получаем checks из checksStore
  const checks = useChecksStore((state) => state.checks);

  // Получаем все необходимые фильтры из filtersStore
  const p2pFilter = useFiltersStore((state) => state.p2pFilter);
  const currencyFilter = useFiltersStore((state) => state.currencyFilter);
  const quickSearch = useFiltersStore((state) => state.quickSearch);
  const dateFilter = useFiltersStore((state) => state.dateFilter);
  const textFilters = useFiltersStore((state) => state.textFilters);
  const advancedFilters = useFiltersStore((state) => state.advancedFilters);
  const applyFilters = useFiltersStore((state) => state.applyFilters);

  // Мемоизируем результат фильтрации
  // Пересчитывается только при изменении checks или любого из фильтров
  const filteredChecks = useMemo(() => {
    return applyFilters(checks);
  }, [
    checks,
    p2pFilter,
    currencyFilter,
    quickSearch,
    dateFilter,
    textFilters,
    advancedFilters,
    applyFilters,
  ]);

  return filteredChecks;
};

export default useFilteredChecks;
