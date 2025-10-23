import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findColorKeyByHex } from '../constants/cellColors';

/**
 * patch-011 §2: Store для персистентности форматирования ячеек
 * Хранит фон, выравнивание, перенос слов и другие стили для каждой ячейки
 */

const sanitizeStyleForStorage = (style) => {
  if (!style || typeof style !== 'object') {
    return null;
  }

  const next = { ...style };

  if ('backgroundColorKey' in next) {
    if (next.backgroundColorKey) {
      // Используем токен, hex не храним
      delete next.backgroundColor;
    } else {
      delete next.backgroundColorKey;
      delete next.backgroundColor;
    }
  } else if (next.backgroundColor) {
    const inferredKey = findColorKeyByHex(next.backgroundColor);
    if (inferredKey) {
      next.backgroundColorKey = inferredKey;
      delete next.backgroundColor;
    }
  }

  if ('backgroundColor' in next && (next.backgroundColor === null || next.backgroundColor === undefined)) {
    delete next.backgroundColor;
  }

  Object.keys(next).forEach((key) => {
    if (next[key] === undefined) {
      delete next[key];
    }
  });

  return Object.keys(next).length === 0 ? null : next;
};

const useCellStylesStore = create(
  persist(
    (set, get) => ({
      // Структура: { "checkId_columnField": { backgroundColorKey, alignment, wrapText } }
      cellStyles: {},

      /**
       * Установить стиль для ячейки
       * @param {string|number} checkId - ID чека (rowId)
       * @param {string} field - Название колонки
       * @param {object} styles - Объект со стилями { backgroundColorKey, backgroundColor, alignment, wrapText }
       */
      setCellStyle: (checkId, field, styles) => {
        const key = `${checkId}_${field}`;
        set((state) => {
          const existing = state.cellStyles[key] || {};
          const merged = { ...existing, ...styles };
          const sanitized = sanitizeStyleForStorage(merged);

          const next = { ...state.cellStyles };
          if (!sanitized) {
            delete next[key];
          } else {
            next[key] = sanitized;
          }

          return { cellStyles: next };
        });
      },

      /**
       * Применить набор стилей к нескольким ячейкам за один проход
       * @param {Array<{rowId: string|number, field: string, style: object}>} updates
       */
      applyStylesBatch: (updates) => {
        if (!Array.isArray(updates) || updates.length === 0) {
          return;
        }

        set((state) => {
          const next = { ...state.cellStyles };

          updates.forEach(({ rowId, field, style }) => {
            if (!rowId || !field) {
              return;
            }

            const key = `${rowId}_${field}`;
            const sanitized = sanitizeStyleForStorage(style);

            if (!sanitized) {
              delete next[key];
              return;
            }

            next[key] = sanitized;
          });

          return { cellStyles: next };
        });
      },

      /**
       * Получить стиль ячейки
       * @param {string|number} checkId - ID чека
       * @param {string} field - Название колонки
       * @returns {object} - Объект со стилями или пустой объект
       */
      getCellStyle: (checkId, field) => {
        const key = `${checkId}_${field}`;
        const style = get().cellStyles[key];
        if (!style) {
          return {};
        }

        if (style.backgroundColorKey || !style.backgroundColor) {
          return { ...style };
        }

        const inferredKey = findColorKeyByHex(style.backgroundColor);
        if (!inferredKey) {
          return { ...style };
        }

        const sanitized = sanitizeStyleForStorage({ ...style, backgroundColorKey: inferredKey });
        set((state) => {
          const next = { ...state.cellStyles };
          if (!sanitized) {
            delete next[key];
          } else {
            next[key] = sanitized;
          }
          return { cellStyles: next };
        });

        return sanitized ? { ...sanitized } : {};
      },

      /**
       * Удалить стиль ячейки
       * @param {string|number} checkId - ID чека
       * @param {string} field - Название колонки
       */
      removeCellStyle: (checkId, field) => {
        const key = `${checkId}_${field}`;
        set((state) => {
          const newStyles = { ...state.cellStyles };
          delete newStyles[key];
          return { cellStyles: newStyles };
        });
      },

      clearCellStyle: (checkId, field) => {
        get().removeCellStyle(checkId, field);
      },

      /**
       * Установить цвет фона для ячейки
       * @param {string|number} checkId - ID чека
       * @param {string} field - Название колонки
       * @param {string|null} colorKey - Идентификатор цвета палитры или null для удаления
       */
      setBackgroundColor: (checkId, field, colorKey) => {
        if (!colorKey) {
          get().setCellStyle(checkId, field, { backgroundColorKey: null, backgroundColor: null });
          return;
        }

        const normalizedKey = typeof colorKey === 'string' && colorKey.startsWith('#')
          ? findColorKeyByHex(colorKey)
          : colorKey;
        if (!normalizedKey) {
          // Если не нашли токен, сохраняем кастомный цвет как есть
          get().setCellStyle(checkId, field, { backgroundColor: colorKey });
        } else {
          get().setCellStyle(checkId, field, { backgroundColorKey: normalizedKey });
        }
      },

      /**
       * Установить выравнивание для ячейки
       * @param {string|number} checkId - ID чека
       * @param {string} field - Название колонки
       * @param {string} alignment - left, center, right
       */
      setAlignment: (checkId, field, alignment) => {
        get().setCellStyle(checkId, field, { alignment });
      },

      /**
       * Установить перенос слов для ячейки
       * @param {string|number} checkId - ID чека
       * @param {string} field - Название колонки
       * @param {boolean} wrapText - Включить/выключить перенос
       */
      setWrapText: (checkId, field, wrapText) => {
        get().setCellStyle(checkId, field, { wrapText });
      },

      /**
       * Очистить все стили
       */
      clearAllStyles: () => {
        set({ cellStyles: {} });
      },

      /**
       * Получить все стили для строки (чека)
       * @param {string|number} checkId - ID чека
       * @returns {object} - Объект { field: styles }
       */
      getRowStyles: (checkId) => {
        const allStyles = get().cellStyles;
        const rowStyles = {};

        Object.keys(allStyles).forEach((key) => {
          if (key.startsWith(`${checkId}_`)) {
            const field = key.replace(`${checkId}_`, '');
            rowStyles[field] = allStyles[key];
          }
        });

        return rowStyles;
      },
    }),
    {
      name: 'cell-styles-storage',
      version: 1,
    }
  )
);

export { useCellStylesStore };
