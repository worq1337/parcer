import { create } from 'zustand';
import { checksAPI } from '../services/api';

/**
 * Store для управления чеками
 * Обновлен согласно patch-002-remove-kpi-cards.md
 * Метрики KPI удалены - статистика только в StatusBar по выделению
 */
export const useChecksStore = create((set, get) => ({
  // Данные
  checks: [],
  loading: false,
  error: null,

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
  loadChecks: async () => {
    set({ loading: true, error: null });
    try {
      const response = await checksAPI.getAll();
      const checks = response.data || [];
      set({ checks, loading: false });
    } catch (error) {
      console.error('Error loading checks:', error);
      set({ error: error.message, loading: false });
    }
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
      }));
    } catch (error) {
      console.error('Error deleting check:', error);
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
}));
