/**
 * Утилиты для работы с выделением ячеек в AG Grid
 * patch-014: Массовые операции по выделению
 */
import { findColorKeyByHex } from '../constants/cellColors';

/**
 * Получить плоский список всех выделенных ячеек
 * @param {GridApi} api - AG Grid API
 * @returns {Array<{rowId: string, rowNodeId: string|null, colKey: string, rowIndex: number}>}
 */
export function getSelectedCells(api) {
  if (!api) return [];

  const ranges = api.getCellRanges() || [];
  if (!ranges.length) {
    return [];
  }

  const visibleRowsByIndex = new Map();

  api.forEachNodeAfterFilterAndSort((node) => {
    if (!node || node.rowPinned) {
      return;
    }
    const index = node.rowIndex;
    if (index === null || index === undefined) {
      return;
    }
    visibleRowsByIndex.set(index, node);
  });

  const result = new Map();

  ranges.forEach((range) => {
    if (!range || !range.columns || range.columns.length === 0) {
      return;
    }

    const columns = range.columns
      .map((col) => col?.getColId?.())
      .filter(Boolean);

    if (!columns.length) {
      return;
    }

    const startRowIndex = Math.min(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
    const endRowIndex = Math.max(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);

    for (let rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex += 1) {
      const rowNode = visibleRowsByIndex.get(rowIndex);
      if (!rowNode || !rowNode.data) {
        continue;
      }

      columns.forEach((colKey) => {
        const dataId = rowNode.data?.id;
        const nodeId = rowNode.id;

        const resolvedRowId = dataId !== undefined && dataId !== null
          ? dataId
          : nodeId;

        if (resolvedRowId === undefined || resolvedRowId === null) {
          return;
        }

        const dedupeKey = `${resolvedRowId}:${colKey}`;
        if (result.has(dedupeKey)) {
          return;
        }

        result.set(dedupeKey, {
          rowId: String(resolvedRowId),
          rowNodeId: nodeId !== undefined && nodeId !== null ? String(nodeId) : null,
          colKey,
          rowIndex: rowNode.rowIndex,
        });
      });
    }
  });

  return Array.from(result.values());
}

/**
 * Проверить, находится ли ячейка внутри текущего выделения
 * @param {GridApi} api - AG Grid API
 * @param {number} rowIndex - индекс строки
 * @param {string} colId - ID колонки
 * @returns {boolean}
 */
export function isCellInSelection(api, rowIndex, colId) {
  if (!api) return false;

  const ranges = api.getCellRanges() || [];

  return ranges.some((range) => {
    if (!range.startRow || !range.endRow || !range.columns) return false;

    const startRowIndex = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
    const endRowIndex = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);

    const isRowInRange = rowIndex >= startRowIndex && rowIndex <= endRowIndex;
    const isColInRange = range.columns.some((col) => col.getColId() === colId);

    return isRowInRange && isColInRange;
  });
}

/**
 * Собрать числовые значения из выделения для конкретной колонки
 * @param {GridApi} api - AG Grid API
 * @param {string} colKey - ключ колонки
 * @param {Object} options - опции
 * @param {boolean} options.incomeExpense - режим "Приход-расход" (учитывать знак)
 * @returns {number[]}
 */
export function collectNumericValuesFromSelection(api, colKey, options = {}) {
  if (!api || !colKey) {
    return [];
  }

  const { incomeExpense = false, cells: cellsOverride } = options;

  const cellsSource = Array.isArray(cellsOverride) && cellsOverride.length
    ? cellsOverride
    : getSelectedCells(api);

  const cells = cellsSource.filter((c) => c.colKey === colKey);
  const values = [];

  cells.forEach(({ rowIndex, rowId, rowNodeId }) => {
    let rowNode = null;

    if (typeof rowIndex === 'number') {
      rowNode = api.getDisplayedRowAtIndex(rowIndex);
    }

    if ((!rowNode || !rowNode.data) && rowNodeId !== undefined && rowNodeId !== null) {
      rowNode = api.getRowNode(String(rowNodeId));
    }

    if ((!rowNode || !rowNode.data) && rowId !== undefined && rowId !== null) {
      rowNode = findRowNodeByDataId(api, rowId);
    }

    if (!rowNode || !rowNode.data) return;

    const rawValue = rowNode.data[colKey];
    let value = parseNumericValue(rawValue);

    if (value === null || isNaN(value)) return;

    // Режим "Приход-расход": учитываем знак по типу транзакции
    if (incomeExpense) {
      const transactionType = rowNode.data.transaction_type;
      const isExpense = ['Оплата', 'Списание', 'E-Com', 'Платёж'].includes(transactionType);
      value = isExpense ? -Math.abs(value) : Math.abs(value);
    } else {
      value = Math.abs(value);
    }

    values.push(value);
  });

  return values;
}

/**
 * Парсинг числового значения из различных форматов
 * @param {any} value - значение для парсинга
 * @returns {number|null}
 */
function parseNumericValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  // Убираем пробелы, заменяем запятую на точку
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(normalized);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Вычислить статистику по массиву чисел
 * @param {number[]} arr - массив чисел
 * @returns {Object|null} - {sum, avg, min, max, count}
 */
export function calculateStats(arr) {
  if (!arr || arr.length === 0) return null;

  let sum = 0;
  let min = arr[0];
  let max = arr[0];

  arr.forEach((x) => {
    sum += x;
    if (x < min) min = x;
    if (x > max) max = x;
  });

  return {
    sum,
    avg: sum / arr.length,
    min,
    max,
    count: arr.length,
  };
}

/**
 * Применить стиль к выделению (batch-операция)
 * @param {GridApi} api - AG Grid API
 * @param {Function} setCellStyle - функция из cellStylesStore
 * @param {Object} stylePatch - частичный объект стиля {backgroundColor?, backgroundColorKey?, alignment?, wrapText?}
 * @param {Function} onProgress - callback для прогресса (optional)
 * @returns {Promise<{cellsAffected: number}>}
 */
export async function applyCellStyleToSelection({
  api,
  stylePatch,
  getCellStyle,
  applyStylesBatch,
  pushHistory,
  onProgress,
  cells: cellsSnapshot,
  batchSize = 1000,
  logger = console,
}) {
  if (!api || typeof applyStylesBatch !== 'function') {
    return { cellsAffected: 0 };
  }

  const cells = Array.isArray(cellsSnapshot) && cellsSnapshot.length > 0
    ? cellsSnapshot
    : getSelectedCells(api);

  if (!cells.length) {
    return { cellsAffected: 0 };
  }

  const normalizeStyle = (style) => {
    if (!style) {
      return null;
    }

    const normalized = {};

    Object.keys(style).forEach((key) => {
      const value = style[key];
      if (value !== undefined && value !== null) {
        normalized[key] = value;
      }
    });

    return Object.keys(normalized).length > 0 ? normalized : null;
  };

  const mergeStylePatch = (prevStyle) => {
    const nextStyle = { ...prevStyle };

    Object.entries(stylePatch || {}).forEach(([key, value]) => {
      switch (key) {
        case 'backgroundColor':
          if (value) {
            nextStyle.backgroundColor = value;
            const inferredKey = findColorKeyByHex(value);
            if (inferredKey) {
              nextStyle.backgroundColorKey = inferredKey;
            } else {
              delete nextStyle.backgroundColorKey;
            }
          } else {
            delete nextStyle.backgroundColor;
            delete nextStyle.backgroundColorKey;
          }
          break;
        case 'backgroundColorKey':
          if (value) {
            nextStyle.backgroundColorKey = value;
            delete nextStyle.backgroundColor;
          } else {
            delete nextStyle.backgroundColorKey;
            delete nextStyle.backgroundColor;
          }
          break;
        case 'alignment':
          if (value) {
            nextStyle.alignment = value;
          } else {
            delete nextStyle.alignment;
          }
          break;
        case 'wrapText':
          if (value) {
            nextStyle.wrapText = true;
          } else {
            delete nextStyle.wrapText;
          }
          break;
        default:
          if (value === null || value === undefined) {
            delete nextStyle[key];
          } else {
            nextStyle[key] = value;
          }
      }
    });

    return normalizeStyle(nextStyle);
  };

  const beforePayload = cells.map(({ rowId, colKey }) => {
    const prevStyle = typeof getCellStyle === 'function'
      ? getCellStyle(rowId, colKey)
      : {};

    return {
      rowId,
      field: colKey,
      style: normalizeStyle(prevStyle),
    };
  });

  const beforeMap = new Map();
  beforePayload.forEach((entry) => {
    const key = `${entry.rowId}:${entry.field}`;
    beforeMap.set(key, entry.style ? { ...entry.style } : null);
  });

  const stylesDiffer = (a, b) => {
    if (!a && !b) return false;
    if (!a || !b) return true;

    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (a[key] !== b[key]) {
        return true;
      }
    }
    return false;
  };

  const updates = [];
  cells.forEach(({ rowId, colKey }) => {
    const mapKey = `${rowId}:${colKey}`;
    const prevStyle = beforeMap.has(mapKey)
      ? { ...(beforeMap.get(mapKey) || {}) }
      : {};
    const nextStyle = mergeStylePatch(prevStyle);

    if (!stylesDiffer(beforeMap.get(mapKey), nextStyle)) {
      return;
    }

    updates.push({
      rowId,
      field: colKey,
      style: nextStyle,
    });
  });

  if (updates.length === 0) {
    return { cellsAffected: 0, durationMs: 0 };
  }

  const affectedKeys = new Set(
    updates.map(({ rowId, field }) => `${rowId}:${field}`)
  );

  const filteredBeforePayload = beforePayload.filter((entry) =>
    affectedKeys.has(`${entry.rowId}:${entry.field}`)
  );

  const batches = [];
  for (let i = 0; i < updates.length; i += batchSize) {
    batches.push(updates.slice(i, i + batchSize));
  }

  let processed = 0;
  const total = updates.length;
  const startedAt = performance.now();

  for (const batch of batches) {
    applyStylesBatch(batch);
    processed += batch.length;

    if (typeof onProgress === 'function') {
      onProgress(processed, total);
    }

    if (batches.length > 1) {
      // Yield to the event loop to keep UI responsive on large selections
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  api.refreshCells({ force: true });

  const durationMs = Math.round(performance.now() - startedAt);
  if (logger && typeof logger.info === 'function') {
    logger.info('[selection] applyCellStyleToSelection', {
      cells: total,
      batchSize,
      batches: batches.length,
      durationMs,
    });
  } else if (logger && typeof logger.log === 'function') {
    logger.log('[selection] applyCellStyleToSelection', {
      cells: total,
      batchSize,
      batches: batches.length,
      durationMs,
    });
  }

  if (typeof pushHistory === 'function') {
    const undoPayload = filteredBeforePayload;
    const redoPayload = updates;
    const runBatch = (payload) => {
      const grouped = [];
      for (let i = 0; i < payload.length; i += batchSize) {
        grouped.push(payload.slice(i, i + batchSize));
      }
      grouped.forEach((group) => applyStylesBatch(group));
      api.refreshCells({ force: true });
    };

    pushHistory({
      undo: () => runBatch(undoPayload),
      redo: () => runBatch(redoPayload),
    });
  }

  return { cellsAffected: total, durationMs };
}

/**
 * Найти rowNode по идентификатору чека (data.id)
 * @param {GridApi} api
 * @param {string|number} dataId
 * @returns {RowNode|null}
 */
function findRowNodeByDataId(api, dataId) {
  if (!api || dataId === undefined || dataId === null) {
    return null;
  }

  const target = String(dataId);
  let found = null;

  api.forEachNode((node) => {
    if (found) {
      return;
    }
    if (node?.data && String(node.data.id) === target) {
      found = node;
    }
  });

  return found;
}

/**
 * Форматировать число для отображения
 * @param {number} value - число
 * @param {Object} options - опции форматирования
 * @returns {string}
 */
export function formatNumber(value, options = {}) {
  if (value === null || value === undefined || isNaN(value)) return '—';

  const {
    decimalSeparator = ',',
    thousandsSeparator = false,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: thousandsSeparator,
  }).format(value);

  // Заменяем разделитель если нужно
  if (decimalSeparator === ',') {
    return formatted;
  } else {
    return formatted.replace(',', decimalSeparator);
  }
}
