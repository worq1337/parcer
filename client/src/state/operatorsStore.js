import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OPERATORS_DICTIONARY } from '../data/operatorsDict';
import { operatorsAPI } from '../services/api';

/**
 * Zustand store для управления операторами
 * patch-008 §11: Экран операторы
 */

export const useOperatorsStore = create(
  persist(
    (set, get) => ({
      // Список операторов (будет загружен с сервера)
      operators: [],
      operatorsLoaded: false,

      // Текущий выбранный оператор для редактирования
      selectedOperator: null,

      // Режим редактирования ('add' | 'edit' | null)
      editMode: null,

      // Поиск и фильтры
      searchQuery: '',
      filterByApp: null, // null или название приложения
      filterByP2P: null, // null | true | false
      showUnknownOnly: false, // показать только неизвестных

      /**
       * Загрузить операторов с сервера
       */
      loadOperators: async () => {
        try {
          const response = await operatorsAPI.getAll();
          // Backend возвращает массив операторов напрямую или { success, operators }
          const operators = Array.isArray(response) ? response : (response.operators || response.data || []);

          // Преобразуем snake_case в camelCase
          const normalizedOperators = operators.map(op => ({
            id: op.id,
            canonicalName: op.canonical_name || op.canonicalName,
            appName: op.app_name || op.appName,
            synonyms: op.synonyms || [],
            isP2P: op.is_p2p !== undefined ? op.is_p2p : op.isP2P,
            createdAt: op.created_at || op.createdAt,
            updatedAt: op.updated_at || op.updatedAt,
          }));

          set({ operators: normalizedOperators, operatorsLoaded: true });
          return { success: true };
        } catch (error) {
          console.error('Error loading operators:', error);
          // Фоллбек на локальный словарь
          const fallbackOperators = OPERATORS_DICTIONARY.map((op, idx) => ({
            id: -(idx + 1), // отрицательный id для временных
            canonicalName: op.canonicalName,
            appName: op.appName,
            synonyms: op.synonyms,
            isP2P: op.isP2P,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
          set({ operators: fallbackOperators, operatorsLoaded: true });
          return { success: false, error: error.message };
        }
      },

      /**
       * Получить список операторов с учётом фильтров
       */
      getFilteredOperators: () => {
        const { operators, searchQuery, filterByApp, filterByP2P, showUnknownOnly } = get();

        return operators.filter((op) => {
          // Поиск по имени или синонимам
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const nameMatch = op.canonicalName.toLowerCase().includes(query);
            const synonymMatch = op.synonyms.some((syn) =>
              syn.toLowerCase().includes(query)
            );
            if (!nameMatch && !synonymMatch) return false;
          }

          // Фильтр по приложению
          if (filterByApp && op.appName !== filterByApp) return false;

          // Фильтр по P2P
          if (filterByP2P !== null && op.isP2P !== filterByP2P) return false;

          // Фильтр "только неизвестные" - пока заглушка
          // В реальности нужен запрос к API для списка неизвестных
          if (showUnknownOnly) return false;

          return true;
        });
      },

      /**
       * Получить список уникальных приложений
       */
      getUniqueApps: () => {
        const { operators } = get();
        const apps = new Set(operators.map((op) => op.appName));
        return Array.from(apps).sort();
      },

      /**
       * Выбрать оператора для редактирования
       */
      selectOperator: (operator) => {
        set({ selectedOperator: operator, editMode: 'edit' });
      },

      /**
       * Начать добавление нового оператора
       */
      startAddOperator: () => {
        set({
          selectedOperator: {
            id: null,
            canonicalName: '',
            appName: '',
            synonyms: [],
            isP2P: false,
          },
          editMode: 'add',
        });
      },

      /**
       * Отменить редактирование
       */
      cancelEdit: () => {
        set({ selectedOperator: null, editMode: null });
      },

      /**
       * Сохранить оператора (добавить или обновить)
       */
      saveOperator: async (operatorData) => {
        const { operators, editMode } = get();

        try {
          if (editMode === 'add') {
            // Добавляем нового оператора через API
            const response = await operatorsAPI.create(operatorData);
            // Backend возвращает { success, message, data: operator }
            const rawOperator = response.data || response.operator || response;

            // Нормализуем snake_case -> camelCase
            const newOperator = {
              id: rawOperator.id,
              canonicalName: rawOperator.canonical_name || rawOperator.canonicalName,
              appName: rawOperator.app_name || rawOperator.appName,
              synonyms: rawOperator.synonyms || [],
              isP2P: rawOperator.is_p2p !== undefined ? rawOperator.is_p2p : rawOperator.isP2P,
              createdAt: rawOperator.created_at || rawOperator.createdAt,
              updatedAt: rawOperator.updated_at || rawOperator.updatedAt,
            };

            set({
              operators: [...operators, newOperator],
              selectedOperator: null,
              editMode: null,
            });

            return { success: true, operator: newOperator };
          } else if (editMode === 'edit') {
            // Обновляем существующего оператора через API
            const response = await operatorsAPI.update(operatorData.id, operatorData);
            const rawOperator = response.data || response.operator || response;

            // Нормализуем snake_case -> camelCase
            const updatedOperator = {
              id: rawOperator.id,
              canonicalName: rawOperator.canonical_name || rawOperator.canonicalName,
              appName: rawOperator.app_name || rawOperator.appName,
              synonyms: rawOperator.synonyms || [],
              isP2P: rawOperator.is_p2p !== undefined ? rawOperator.is_p2p : rawOperator.isP2P,
              createdAt: rawOperator.created_at || rawOperator.createdAt,
              updatedAt: rawOperator.updated_at || rawOperator.updatedAt,
            };

            const updatedOperators = operators.map((op) =>
              op.id === operatorData.id ? updatedOperator : op
            );

            set({
              operators: updatedOperators,
              selectedOperator: null,
              editMode: null,
            });

            return { success: true, operator: updatedOperator };
          }
        } catch (error) {
          console.error('Error saving operator:', error);
          return { success: false, error: error.message };
        }
      },

      /**
       * Удалить оператора
       */
      deleteOperator: async (operatorId) => {
        const { operators } = get();

        try {
          await operatorsAPI.delete(operatorId);

          set({
            operators: operators.filter((op) => op.id !== operatorId),
            selectedOperator: null,
            editMode: null,
          });

          return { success: true };
        } catch (error) {
          console.error('Error deleting operator:', error);
          return { success: false, error: error.message };
        }
      },

      /**
       * Добавить синоним к существующему оператору
       */
      addSynonym: async (operatorId, synonym) => {
        const { operators } = get();
        const operator = operators.find(op => op.id === operatorId);

        if (!operator) return { success: false, error: 'Operator not found' };

        const updatedSynonyms = [...operator.synonyms, synonym];

        try {
          await operatorsAPI.update(operatorId, {
            ...operator,
            synonyms: updatedSynonyms
          });

          const updatedOperators = operators.map((op) =>
            op.id === operatorId
              ? {
                  ...op,
                  synonyms: updatedSynonyms,
                  updatedAt: new Date().toISOString(),
                }
              : op
          );

          set({ operators: updatedOperators });
          return { success: true };
        } catch (error) {
          console.error('Error adding synonym:', error);
          return { success: false, error: error.message };
        }
      },

      /**
       * Удалить синоним
       */
      removeSynonym: async (operatorId, synonym) => {
        const { operators } = get();
        const operator = operators.find(op => op.id === operatorId);

        if (!operator) return { success: false, error: 'Operator not found' };

        const updatedSynonyms = operator.synonyms.filter((s) => s !== synonym);

        try {
          await operatorsAPI.update(operatorId, {
            ...operator,
            synonyms: updatedSynonyms
          });

          const updatedOperators = operators.map((op) =>
            op.id === operatorId
              ? {
                  ...op,
                  synonyms: updatedSynonyms,
                  updatedAt: new Date().toISOString(),
                }
              : op
          );

          set({ operators: updatedOperators });
          return { success: true };
        } catch (error) {
          console.error('Error removing synonym:', error);
          return { success: false, error: error.message };
        }
      },

      /**
       * Обновить фильтры поиска
       */
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterByApp: (app) => set({ filterByApp: app }),
      setFilterByP2P: (isP2P) => set({ filterByP2P: isP2P }),
      setShowUnknownOnly: (show) => set({ showUnknownOnly: show }),

      /**
       * Очистить все фильтры
       */
      clearFilters: () =>
        set({
          searchQuery: '',
          filterByApp: null,
          filterByP2P: null,
          showUnknownOnly: false,
        }),

      /**
       * Получить список неподтверждённых операторов из чеков
       * (операторы, которые встречаются в чеках, но не в словаре)
       */
      getUnknownOperators: async () => {
        // TODO: Запрос к API GET /api/operators/unknown
        // Пока заглушка
        return [];
      },

      /**
       * Импорт/Экспорт словаря
       */
      exportDictionary: () => {
        const { operators } = get();
        const data = JSON.stringify(operators, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `operators-dictionary-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
      },

      importDictionary: (file) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const operators = JSON.parse(e.target.result);
              set({ operators });
              resolve({ success: true, count: operators.length });
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      },
    }),
    {
      name: 'operators-store',
      version: 1,
    }
  )
);
