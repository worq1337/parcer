import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OPERATORS_DICTIONARY } from '../data/operatorsDict';

/**
 * Zustand store для управления операторами
 * patch-008 §11: Экран операторы
 */

export const useOperatorsStore = create(
  persist(
    (set, get) => ({
      // Список операторов (загружаем из словаря по умолчанию)
      operators: OPERATORS_DICTIONARY.map((op, idx) => ({
        id: idx + 1, // временный id, в БД будет настоящий
        canonicalName: op.canonicalName,
        appName: op.appName,
        synonyms: op.synonyms,
        isP2P: op.isP2P,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),

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

        if (editMode === 'add') {
          // Добавляем нового оператора
          const newOperator = {
            ...operatorData,
            id: Math.max(...operators.map((o) => o.id), 0) + 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          set({
            operators: [...operators, newOperator],
            selectedOperator: null,
            editMode: null,
          });

          // TODO: Отправить POST /api/operators
          return { success: true };
        } else if (editMode === 'edit') {
          // Обновляем существующего оператора
          const updatedOperators = operators.map((op) =>
            op.id === operatorData.id
              ? { ...operatorData, updatedAt: new Date().toISOString() }
              : op
          );

          set({
            operators: updatedOperators,
            selectedOperator: null,
            editMode: null,
          });

          // TODO: Отправить PUT /api/operators/:id
          return { success: true };
        }
      },

      /**
       * Удалить оператора
       */
      deleteOperator: async (operatorId) => {
        const { operators } = get();

        set({
          operators: operators.filter((op) => op.id !== operatorId),
          selectedOperator: null,
          editMode: null,
        });

        // TODO: Отправить DELETE /api/operators/:id
        return { success: true };
      },

      /**
       * Добавить синоним к существующему оператору
       */
      addSynonym: (operatorId, synonym) => {
        const { operators } = get();

        const updatedOperators = operators.map((op) =>
          op.id === operatorId
            ? {
                ...op,
                synonyms: [...op.synonyms, synonym],
                updatedAt: new Date().toISOString(),
              }
            : op
        );

        set({ operators: updatedOperators });

        // TODO: Отправить PATCH /api/operators/:id/synonyms
      },

      /**
       * Удалить синоним
       */
      removeSynonym: (operatorId, synonym) => {
        const { operators } = get();

        const updatedOperators = operators.map((op) =>
          op.id === operatorId
            ? {
                ...op,
                synonyms: op.synonyms.filter((s) => s !== synonym),
                updatedAt: new Date().toISOString(),
              }
            : op
        );

        set({ operators: updatedOperators });

        // TODO: Отправить PATCH /api/operators/:id/synonyms
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
