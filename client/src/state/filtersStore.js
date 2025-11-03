import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fuzzyIncludes } from '../utils/searchNormalization';

/**
 * Store для управления фильтрами
 * Согласно patch.md §2 и patch-003 §1
 */
export const useFiltersStore = create(
  persist(
    (set, get) => ({
      // Быстрые фильтры
      p2pFilter: 'all', // 'all' | 'p2p' | 'non_p2p'
      currencyFilter: 'all', // 'all' | 'UZS' | 'USD'
      quickSearch: '',

      // Фильтр по дате (patch-005 - упрощено, убран timeOfDay и ignoreTime)
      dateFilter: null, // { preset: 'today'|..., from?: string, to?: string, weekdays?: number[] }

      // Текстовые фильтры (patch-005 - Operator и App станут dropdown)
      textFilters: {
        operator: '',
        app: '',
        transaction_type: 'all',
        source: 'all',
      },

      // Расширенные фильтры
      advancedFilters: [],
      savedFilterSets: [],

      // Состояние панели фильтров
      filtersPanelOpen: false,

      // Настройки колонок
      columnSettings: {
        widths: {},
        order: [],
        hidden: [],
        frozen: [],
        alignment: {},  // { fieldName: 'left'|'center'|'right' }
        wrapText: {},   // { fieldName: true|false }
      },

      // Плотность ячеек
      cellDensity: 'standard', // 'compact' | 'standard' | 'large'

      // Объединения ячеек
      cellMerges: [], // [{ rowId, colStartKey, colEndKey }]

      // Actions для быстрых фильтров
      setP2PFilter: (value) => set({ p2pFilter: value }),

      setCurrencyFilter: (value) => set({ currencyFilter: value }),

      setQuickSearch: (value) => set({ quickSearch: value }),

      // Фильтр по дате
      setDateFilter: (value) => set({ dateFilter: value }),

      // Текстовые фильтры
      updateTextFilter: (field, value) =>
        set((state) => ({
          textFilters: {
            ...state.textFilters,
            [field]: value,
          },
        })),

      // Управление панелью фильтров
      setFiltersPanelOpen: (isOpen) => set({ filtersPanelOpen: isOpen }),
      toggleFiltersPanel: () => set((state) => ({ filtersPanelOpen: !state.filtersPanelOpen })),

      // Очистка всех фильтров (patch-005 - убраны numericFilters)
      clearAllFilters: () =>
        set({
          p2pFilter: 'all',
          currencyFilter: 'all',
          dateFilter: null,
          textFilters: {
            operator: '',
            app: '',
            transaction_type: 'all',
            source: 'all',
          },
          advancedFilters: [],
        }),

      // Получение количества активных фильтров (patch-005 - упрощено)
      getActiveFiltersCount: () => {
        const state = get();
        let count = 0;

        if (state.p2pFilter !== 'all') count++;
        if (state.currencyFilter !== 'all') count++;

        // Считаем датные фильтры (patch-008 §5: включая время)
        if (state.dateFilter) {
          const df = state.dateFilter;
          if (df.preset || df.from || df.to) count++;
          if (df.weekdays && df.weekdays.length > 0) count++;
          if (!df.ignoreTime && (df.timeFrom || df.timeTo)) count++;
        }

        if (state.textFilters.operator) count++;
        if (state.textFilters.app) count++;
        if (state.textFilters.transaction_type !== 'all') count++;
        if (state.textFilters.source !== 'all') count++;
        count += state.advancedFilters.length;

        return count;
      },

      // Плотность ячеек
      setCellDensity: (density) => set({ cellDensity: density }),
      cycleCellDensity: () =>
        set((state) => {
          const densities = ['compact', 'standard', 'large'];
          const currentIndex = densities.indexOf(state.cellDensity);
          const nextIndex = (currentIndex + 1) % densities.length;
          return { cellDensity: densities[nextIndex] };
        }),

      // Объединения ячеек
      addCellMerge: (merge) =>
        set((state) => ({
          cellMerges: [...state.cellMerges, merge],
        })),

      removeCellMerge: (rowId, colStartKey) =>
        set((state) => ({
          cellMerges: state.cellMerges.filter(
            (m) => !(m.rowId === rowId && m.colStartKey === colStartKey)
          ),
        })),

      clearCellMerges: () => set({ cellMerges: [] }),

      // Расширенные фильтры
      addAdvancedFilter: (filter) =>
        set((state) => ({
          advancedFilters: [...state.advancedFilters, filter],
        })),

      removeAdvancedFilter: (index) =>
        set((state) => ({
          advancedFilters: state.advancedFilters.filter((_, i) => i !== index),
        })),

      updateAdvancedFilter: (index, filter) =>
        set((state) => ({
          advancedFilters: state.advancedFilters.map((f, i) =>
            i === index ? filter : f
          ),
        })),

      clearAdvancedFilters: () => set({ advancedFilters: [] }),

      // Сохраненные наборы фильтров
      saveFilterSet: (name, filters) => {
        const newSet = {
          id: Date.now(),
          name,
          filters,
          p2pFilter: get().p2pFilter,
          currencyFilter: get().currencyFilter,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          savedFilterSets: [...state.savedFilterSets, newSet],
        }));

        return newSet;
      },

      loadFilterSet: (id) => {
        const filterSet = get().savedFilterSets.find((s) => s.id === id);
        if (filterSet) {
          set({
            advancedFilters: filterSet.filters,
            p2pFilter: filterSet.p2pFilter,
            currencyFilter: filterSet.currencyFilter,
          });
        }
      },

      deleteFilterSet: (id) =>
        set((state) => ({
          savedFilterSets: state.savedFilterSets.filter((s) => s.id !== id),
        })),

      // Настройки колонок
      setColumnWidth: (field, width) =>
        set((state) => ({
          columnSettings: {
            ...state.columnSettings,
            widths: {
              ...state.columnSettings.widths,
              [field]: width,
            },
          },
        })),

      setColumnOrder: (order) =>
        set((state) => ({
          columnSettings: {
            ...state.columnSettings,
            order,
          },
        })),

      toggleColumnVisibility: (field) =>
        set((state) => {
          const hidden = state.columnSettings.hidden.includes(field)
            ? state.columnSettings.hidden.filter((f) => f !== field)
            : [...state.columnSettings.hidden, field];

          return {
            columnSettings: {
              ...state.columnSettings,
              hidden,
            },
          };
        }),

      toggleColumnFreeze: (field) =>
        set((state) => {
          const frozen = state.columnSettings.frozen.includes(field)
            ? state.columnSettings.frozen.filter((f) => f !== field)
            : [...state.columnSettings.frozen, field];

          return {
            columnSettings: {
              ...state.columnSettings,
              frozen,
            },
          };
        }),

      setColumnAlignment: (field, alignment) =>
        set((state) => ({
          columnSettings: {
            ...state.columnSettings,
            alignment: {
              ...state.columnSettings.alignment,
              [field]: alignment,
            },
          },
        })),

      setColumnWrapText: (field, wrap) =>
        set((state) => ({
          columnSettings: {
            ...state.columnSettings,
            wrapText: {
              ...state.columnSettings.wrapText,
              [field]: wrap,
            },
          },
        })),

      resetColumnSettings: () =>
        set((state) => ({
          columnSettings: {
            widths: {},
            order: [],
            hidden: [],
            frozen: [],
            alignment: {},
            wrapText: {},
          },
        })),

      // Применение фильтров к данным (patch-005 - убраны numericFilters)
      applyFilters: (checks) => {
        const {
          p2pFilter,
          currencyFilter,
          quickSearch,
          dateFilter,
          textFilters,
          advancedFilters,
        } = get();

        let filtered = [...checks];

        // P2P фильтр
        if (p2pFilter === 'p2p') {
          filtered = filtered.filter((check) => check.is_p2p);
        } else if (p2pFilter === 'non_p2p') {
          filtered = filtered.filter((check) => !check.is_p2p);
        }

        // Валюта фильтр
        if (currencyFilter !== 'all') {
          filtered = filtered.filter((check) => check.currency === currencyFilter);
        }

        // Фильтр по дате (patch-005 - убран timeOfDay, patch-008 §5 - добавлено время)
        if (dateFilter) {
          const { from, to } = getDateRange(dateFilter);

          filtered = filtered.filter((check) => {
            const checkDate = new Date(check.datetime);

            // Проверка диапазона дат
            if (from && checkDate < from) return false;
            if (to && checkDate > to) return false;

            // patch-008 §5: Фильтр по времени
            if (!dateFilter.ignoreTime) {
              if (dateFilter.timeFrom) {
                const [hour] = dateFilter.timeFrom.split(':').map(Number);
                if (checkDate.getHours() < hour) return false;
              }
              if (dateFilter.timeTo) {
                const [hour] = dateFilter.timeTo.split(':').map(Number);
                if (checkDate.getHours() > hour) return false;
              }
            }

            // Фильтр по дням недели (0 = Вс, 1 = Пн, ..., 6 = Сб)
            if (dateFilter.weekdays && dateFilter.weekdays.length > 0) {
              const dayOfWeek = checkDate.getDay();
              if (!dateFilter.weekdays.includes(dayOfWeek)) return false;
            }

            return true;
          });
        }

        // Текстовые фильтры с fuzzy search (patch-004 §8)
        if (textFilters.operator) {
          filtered = filtered.filter((check) =>
            check.operator ? fuzzyIncludes(check.operator, textFilters.operator) : false
          );
        }
        if (textFilters.app) {
          filtered = filtered.filter((check) =>
            check.app ? fuzzyIncludes(check.app, textFilters.app) : false
          );
        }
        if (textFilters.transaction_type !== 'all') {
          filtered = filtered.filter((check) => check.transaction_type === textFilters.transaction_type);
        }
        if (textFilters.source !== 'all') {
          filtered = filtered.filter((check) => check.source === textFilters.source);
        }

        // Быстрый поиск
        if (quickSearch) {
          const searchLower = quickSearch.toLowerCase();
          filtered = filtered.filter((check) =>
            Object.values(check).some((value) =>
              String(value).toLowerCase().includes(searchLower)
            )
          );
        }

        // Расширенные фильтры
        advancedFilters.forEach((filter) => {
          filtered = filtered.filter((check) => {
            const value = check[filter.field];
            return evaluateCondition(value, filter.operator, filter.value);
          });
        });

        return filtered;
      },
    }),
    {
      name: 'filters-storage',
      partialize: (state) => ({
        savedFilterSets: state.savedFilterSets,
        columnSettings: state.columnSettings,
        cellDensity: state.cellDensity,
        cellMerges: state.cellMerges,
        filtersPanelOpen: state.filtersPanelOpen,
      }),
    }
  )
);

/**
 * Вспомогательная функция для оценки условия фильтра
 */
function evaluateCondition(value, operator, filterValue) {
  switch (operator) {
    case 'equals':
      return value === filterValue;
    case 'notEqual':
      return value !== filterValue;
    case 'contains':
      return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
    case 'notContains':
      return !String(value).toLowerCase().includes(String(filterValue).toLowerCase());
    case 'startsWith':
      return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
    case 'endsWith':
      return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
    case 'greaterThan':
      return Number(value) > Number(filterValue);
    case 'lessThan':
      return Number(value) < Number(filterValue);
    case 'greaterThanOrEqual':
      return Number(value) >= Number(filterValue);
    case 'lessThanOrEqual':
      return Number(value) <= Number(filterValue);
    case 'between':
      return Number(value) >= Number(filterValue[0]) && Number(value) <= Number(filterValue[1]);
    case 'blank':
      return !value || value === '';
    case 'notBlank':
      return value && value !== '';
    default:
      return true;
  }
}

/**
 * Вспомогательная функция для получения диапазона дат по пресету
 */
function getDateRange(dateFilter) {
  if (!dateFilter) return { from: null, to: null };

  const now = new Date();
  let from, to;

  switch (dateFilter.preset) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;

    case 'yesterday':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      break;

    case 'thisWeek':
      const dayOfWeek = now.getDay() || 7; // 1-7, понедельник = 1
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 7, 23, 59, 59);
      break;

    case 'thisMonth':
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;

    case 'lastMonth':
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;

    case 'custom':
      from = dateFilter.from ? new Date(dateFilter.from + 'T00:00:00') : null;
      to = dateFilter.to ? new Date(dateFilter.to + 'T23:59:59') : null;
      break;

    default:
      return { from: null, to: null };
  }

  return { from, to };
}
