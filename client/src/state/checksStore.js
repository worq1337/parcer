import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { checksAPI } from '../services/api';

/**
 * Store для управления чеками
 * Обновлен согласно patch-002-remove-kpi-cards.md
 * Метрики KPI удалены - статистика только в StatusBar по выделению
 */
let activeRequestId = 0;
let currentRequestController = null;

const normalizeRowId = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }
  if (row.id !== undefined && row.id !== null) {
    return String(row.id);
  }
  if (row.check_id !== undefined && row.check_id !== null) {
    return String(row.check_id);
  }
  return null;
};

const mergeChecks = (existing = [], incoming = []) => {
  const map = new Map();

  existing.forEach((row) => {
    const key = normalizeRowId(row);
    if (key) {
      map.set(key, row);
    }
  });

  incoming.forEach((row) => {
    const key = normalizeRowId(row);
    if (!key) {
      return;
    }
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...row } : row);
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const da = a?.datetime ? new Date(a.datetime).getTime() : 0;
    const db = b?.datetime ? new Date(b.datetime).getTime() : 0;
    return da - db;
  });

  return merged;
};

export const useChecksStore = create(
  persist(
    (set, get) => ({
      // Данные
      checks: [],
      loading: false,
      error: null,
      lastSyncedAt: null,

      // Состояние выделения
      selectedRows: [],
      selectedRange: null,

      // Dirty state для отслеживания изменений
      isDirty: false,
      modifiedCells: new Map(),

      // История для Undo/Redo
      history: [],
      historyIndex: -1,

      // Actions
      setChecks: (checks) => {
        set({ checks });
      },

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error }),

      // Загрузка данных
      loadChecks: async (options = {}) => {
        const { silent = false, forceFullRefresh = false } = options;
        const hasCachedData = Array.isArray(get().checks) && get().checks.length > 0;
        const shouldShowLoading = !silent || !hasCachedData;
        const lastSyncedAt = get().lastSyncedAt;

        // Отменяем предыдущий запрос, если он ещё идёт
        if (currentRequestController) {
          currentRequestController.abort();
          currentRequestController = null;
        }

        const requestId = ++activeRequestId;
        const controller = new AbortController();
        currentRequestController = controller;

        if (shouldShowLoading) {
          set({ loading: true, error: null });
        } else {
          set({ error: null });
        }

        try {
          const filters = {};
          if (!forceFullRefresh && lastSyncedAt) {
            filters.updated_after = lastSyncedAt;
          }

          const payload = await checksAPI.getAll(filters, { signal: controller.signal });
          const incoming = payload?.data || payload || [];
          const nextChecks = (Array.isArray(incoming) && filters.updated_after)
            ? mergeChecks(get().checks, incoming)
            : (incoming || []);

          // Обновление состояния только если это актуальный запрос
          if (requestId === activeRequestId) {
            set({
              checks: nextChecks,
              loading: false,
              lastSyncedAt: new Date().toISOString(),
            });
            if (currentRequestController === controller) {
              currentRequestController = null;
            }
          }
        } catch (error) {
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError') {
            // Игнорируем отменённый запрос
            return;
          }
          console.error('Error loading checks:', error);
          if (requestId === activeRequestId) {
            set({ error: error.message, loading: false });
            if (currentRequestController === controller) {
              currentRequestController = null;
            }
          }
        }
      },

      // Помечаем кэш устаревшим (можно вызвать после мутирующих действий)
      markStale: () => {
        activeRequestId += 1; // Обрубить актуальность старых запросов
        currentRequestController = null;
      },

      // Добавление чека
      addCheck: async (checkData, options = {}) => {
        try {
          const response = await checksAPI.create(checkData);
          const newCheck = response.data;
          set((state) => ({
            checks: (() => {
              const nextChecks = [...state.checks];
              if (typeof options.insertAt === 'number' && options.insertAt >= 0 && options.insertAt <= nextChecks.length) {
                nextChecks.splice(options.insertAt, 0, newCheck);
                return nextChecks;
              }
              return [...nextChecks, newCheck];
            })(),
            lastSyncedAt: new Date().toISOString(),
          }));
          return newCheck;
        } catch (error) {
          console.error('Error adding check:', error);
          throw error;
        }
      },

      // Обновление чека
      updateCheck: async (id, updates) => {
        try {
          const response = await checksAPI.update(id, updates);
          const updatedCheck = response.data;
          set((state) => ({
            checks: state.checks.map((check) =>
              check.id === id ? { ...check, ...updatedCheck } : check
            ),
            lastSyncedAt: new Date().toISOString(),
          }));
          return updatedCheck;
        } catch (error) {
          console.error('Error updating check:', error);
          throw error;
        }
      },

      // Удаление чека
      deleteCheck: async (id) => {
        try {
          await checksAPI.delete(id);
          set((state) => ({
            checks: state.checks.filter((check) => check.id !== id),
            lastSyncedAt: new Date().toISOString(),
          }));
        } catch (error) {
          console.error('Error deleting check:', error);
          throw error;
        }
      },

      // Массовое удаление чеков
      deleteChecks: async (ids) => {
        try {
          const idsArray = Array.isArray(ids) ? ids : [ids];
          if (idsArray.length === 0) return;

          // Delete each check sequentially
          const errors = [];
          for (const id of idsArray) {
            try {
              await checksAPI.delete(id);
            } catch (error) {
              console.error(`Error deleting check ${id}:`, error);
              errors.push({ id, error });
            }
          }

          // Update state to remove all successfully deleted checks
          set((state) => ({
            checks: state.checks.filter((check) => !idsArray.includes(check.id)),
            lastSyncedAt: new Date().toISOString(),
          }));

          if (errors.length > 0) {
            throw new Error(`Failed to delete ${errors.length} of ${idsArray.length} checks`);
          }
        } catch (error) {
          console.error('Error in bulk delete:', error);
          throw error;
        }
      },

      // Массовое обновление чеков
      updateChecks: async (updates) => {
        try {
          if (!Array.isArray(updates) || updates.length === 0) return;

          const errors = [];
          const updatedChecks = [];

          for (const { id, data } of updates) {
            try {
              const updated = await checksAPI.update(id, data);
              updatedChecks.push(updated);
            } catch (error) {
              console.error(`Error updating check ${id}:`, error);
              errors.push({ id, error });
            }
          }

          // Update state with successfully updated checks
          set((state) => ({
            checks: state.checks.map((check) => {
              const updated = updatedChecks.find((u) => u.id === check.id);
              return updated || check;
            }),
            lastSyncedAt: new Date().toISOString(),
          }));

          if (errors.length > 0) {
            throw new Error(`Failed to update ${errors.length} of ${updates.length} checks`);
          }

          return updatedChecks;
        } catch (error) {
          console.error('Error in bulk update:', error);
          throw error;
        }
      },

      // Управление выделением
      setSelectedRows: (selectedRows) => set({ selectedRows }),

      setSelectedRange: (range) => set({ selectedRange }),

      // Управление dirty state
      markDirty: () => set({ isDirty: true }),

      clearDirty: () => set({ isDirty: false, modifiedCells: new Map() }),

      updateCell: (rowId, field, value) => {
        const { modifiedCells } = get();
        const key = `${rowId}-${field}`;
        modifiedCells.set(key, value);
        set({ modifiedCells, isDirty: true });
      },

      // История для Undo/Redo
      pushHistory: (action) => {
        const { history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(action);
        set({ history: newHistory, historyIndex: historyIndex + 1 });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= 0) {
          const action = history[historyIndex];
          // Выполнить откат действия
          if (action.undo) {
            action.undo();
          }
          set({ historyIndex: historyIndex - 1 });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const action = history[historyIndex + 1];
          // Повторить действие
          if (action.redo) {
            action.redo();
          }
          set({ historyIndex: historyIndex + 1 });
        }
      },

      canUndo: () => {
        const { historyIndex } = get();
        return historyIndex >= 0;
      },

      canRedo: () => {
        const { history, historyIndex } = get();
        return historyIndex < history.length - 1;
      },
    }),
    {
      name: 'checks-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Не сохраняем тяжёлые/несериализуемые поля
      partialize: (state) => ({
        checks: state.checks,
        lastSyncedAt: state.lastSyncedAt,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to rehydrate checks cache', error);
        }
      },
    }
  )
);
