import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from '../icons/Icon';
import { useChecksStore } from '../../state/checksStore';
import { useCellStylesStore } from '../../state/cellStylesStore';
import { useSettingsStore } from '../../state/settingsStore';
import { toast } from 'react-toastify';
import '../../styles/FormulaStatusBar.css';

/**
 * Строка формул и статуса — patch-013
 * Объединяет редактирование ячеек + сводные расчеты по выделению
 */
const FormulaStatusBar = React.forwardRef(({
  gridApi,
  activeCell,
  selectedRanges = [],
  onCellValueChange
}, ref) => {
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [showFxDropdown, setShowFxDropdown] = useState(false);
  const inputRef = useRef(null);
  const fxDropdownRef = useRef(null);

  // patch-016 §11: Список доступных функций с подробными описаниями
  const functions = useMemo(() => [
    {
      name: 'SUM',
      syntax: '=SUM(A1:A10)',
      description: 'Сумма значений в диапазоне',
      example: 'Пример: =SUM(A1:A10) вернёт сумму всех чисел от A1 до A10'
    },
    {
      name: 'AVERAGE',
      syntax: '=AVERAGE(A1:A10)',
      description: 'Среднее арифметическое значений',
      example: 'Пример: =AVERAGE(A1:A5) вернёт (A1+A2+A3+A4+A5)/5'
    },
    {
      name: 'COUNT',
      syntax: '=COUNT(A1:A10)',
      description: 'Количество непустых ячеек в диапазоне',
      example: 'Пример: =COUNT(A1:A10) подсчитает все непустые ячейки'
    },
    {
      name: 'MIN',
      syntax: '=MIN(A1:A10)',
      description: 'Минимальное (наименьшее) значение в диапазоне',
      example: 'Пример: =MIN(A1:A10) найдёт самое маленькое число'
    },
    {
      name: 'MAX',
      syntax: '=MAX(A1:A10)',
      description: 'Максимальное (наибольшее) значение в диапазоне',
      example: 'Пример: =MAX(A1:A10) найдёт самое большое число'
    },
    {
      name: 'IF',
      syntax: '=IF(A1>0, "Да", "Нет")',
      description: 'Условие: если … то … иначе …',
      example: 'Пример: =IF(A1>1000, "Много", "Мало") проверит условие и вернёт результат'
    },
    {
      name: 'CONCAT',
      syntax: '=CONCAT(A1, " ", B1)',
      description: 'Объединение текста из нескольких ячеек',
      example: 'Пример: =CONCAT(A1, " - ", B1) склеит значения с разделителем'
    },
  ], []);

  const { updateCheck } = useChecksStore();
  const { clearCellStyle } = useCellStylesStore();
  const numberFormatting = useSettingsStore((state) => state.numberFormatting);

  // Expose methods to parent via ref
  useEffect(() => {
    if (ref) {
      ref.current = {
        focusInput: () => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
            setIsEditing(true);
          }
        }
      };
    }
  }, [ref]);

  // Обновляем поле ввода при изменении активной ячейки
  useEffect(() => {
    if (activeCell && !isEditing) {
      const rawValue = getRawValue(activeCell);
      setInputValue(rawValue);
      setValidationError(null);
    } else if (!activeCell) {
      setInputValue('');
      setValidationError(null);
    }
  }, [activeCell, isEditing]);

  // Получить сырое (RAW) значение ячейки без форматирования
  const getRawValue = (cell) => {
    if (!cell || !cell.data) return '';

    const value = cell.data[cell.colDef.field];

    if (value === null || value === undefined) return '';

    const field = cell.colDef.field;

    // Для сумм и остатков: показываем с запятой, без разделителя тысяч
    if (field === 'amount' || field === 'balance') {
      if (typeof value === 'number') {
        const absValue = Math.abs(value);
        return absValue.toFixed(2).replace('.', ',');
      }
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return Math.abs(numeric).toFixed(2).replace('.', ',');
      }
      return String(value).replace('-', '').replace('.', ',');
    }

    // Для даты/времени: ISO локализованное
    if (field === 'datetime' && value) {
      const date = new Date(value);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    return String(value);
  };

  // Преобразовать индекс колонки в букву (A, B, C, ..., Z, AA, AB, ...)
  const columnIndexToLetter = (index) => {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  };

  // Получить адрес ячейки в стиле A1
  const getCellAddress = () => {
    if (!activeCell || !gridApi) return '—';

    const displayedColumns = typeof gridApi.getAllDisplayedColumns === 'function'
      ? gridApi.getAllDisplayedColumns()
      : [];

    if (!Array.isArray(displayedColumns) || displayedColumns.length === 0) {
      return '—';
    }

    const activeColumn = activeCell.column;
    if (!activeColumn) {
      return '—';
    }

    const colId = typeof activeColumn.getColId === 'function'
      ? activeColumn.getColId()
      : activeColumn.colId;

    const colIndex = displayedColumns.findIndex((column) => {
      if (column === activeColumn) {
        return true;
      }
      const columnId = typeof column.getColId === 'function' ? column.getColId() : column.colId;
      return columnId !== undefined && columnId === colId;
    });

    if (colIndex < 0) {
      return '—';
    }

    const rowIndexRaw = typeof activeCell.rowIndex === 'number'
      ? activeCell.rowIndex
      : (typeof activeCell.node?.rowIndex === 'number' ? activeCell.node.rowIndex : null);

    if (rowIndexRaw === null) {
      return columnIndexToLetter(colIndex);
    }

    const rowIndex = rowIndexRaw + 1; // Строки с 1

    return `${columnIndexToLetter(colIndex)}${rowIndex}`;
  };

  // Определить тип данных ячейки
  const getCellType = () => {
    if (!activeCell || !activeCell.data) return null;

    const field = activeCell.colDef.field;
    const value = activeCell.data[field];

    if (field === 'amount' || field === 'balance') return 'Число';
    if (field === 'currency') return 'Валюта';
    if (field === 'datetime') return 'Дата и время';
    if (field === 'date_display') return 'Дата';
    if (field === 'time_display') return 'Время';
    if (field === 'is_p2p') return 'Булево';

    if (typeof value === 'number') return 'Число';
    if (typeof value === 'boolean') return 'Булево';

    return 'Текст';
  };

  // Проверить, является ли колонка read-only
  const isReadOnly = () => {
    if (!activeCell) return false;

    const field = activeCell.colDef.field;
    const readOnlyFields = ['id', 'weekday', 'date_display', 'time_display', 'is_p2p'];

    return readOnlyFields.includes(field) || activeCell.colDef.editable === false;
  };

  // Валидация значения перед сохранением
  const validateValue = (field, value) => {
    // Пустые значения разрешены (будут null в БД)
    if (!value || value.trim() === '') {
      return { valid: true, normalized: null };
    }

    // Для сумм/остатков: нормализуем запятую к точке
    if (field === 'amount' || field === 'balance') {
      const normalized = value.replace(',', '.').replace(/\s/g, '').replace(/[^\d.-]/g, '');
      const num = parseFloat(normalized);

      if (isNaN(num)) {
        return { valid: false, error: 'Введите корректное число (например: 200000,00)' };
      }

      if (num < 0 && field === 'balance') {
        return { valid: false, error: 'Остаток не может быть отрицательным' };
      }

      return { valid: true, normalized: num.toFixed(2) };
    }

    // Для ПК: только 4 цифры
    if (field === 'card_last4') {
      const normalized = value.replace(/[^0-9]/g, '').slice(0, 4);

      if (normalized.length !== 4) {
        return { valid: false, error: 'ПК должен содержать ровно 4 цифры (например: 1234)' };
      }

      return { valid: true, normalized };
    }

    // Для даты/времени
    if (field === 'datetime') {
      // Попытка парсинга различных форматов
      let parsed;

      // ISO формат
      parsed = new Date(value);

      // Локальный формат (DD.MM.YYYY, HH:MM)
      if (isNaN(parsed.getTime())) {
        const match = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{1,2})/);
        if (match) {
          const [, day, month, year, hour, minute] = match;
          parsed = new Date(year, month - 1, day, hour, minute);
        }
      }

      if (isNaN(parsed.getTime())) {
        return { valid: false, error: 'Некорректная дата. Формат: ДД.ММ.ГГГГ, ЧЧ:ММ' };
      }

      return { valid: true, normalized: parsed.toISOString() };
    }

    // Для валюты: проверка на корректный код
    if (field === 'currency') {
      const normalized = value.toUpperCase().trim();
      const validCurrencies = ['UZS', 'USD', 'EUR', 'RUB'];

      if (normalized && !validCurrencies.includes(normalized)) {
        return { valid: false, error: `Валюта должна быть одной из: ${validCurrencies.join(', ')}` };
      }

      return { valid: true, normalized };
    }

    // Для остальных полей — просто trim
    return { valid: true, normalized: value.trim() };
  };

  // Сохранить значение ячейки (с оптимистическим обновлением)
  const saveCell = async () => {
    if (!activeCell || !activeCell.data) return;

    const field = activeCell.colDef.field;
    const checkId = activeCell.data.id;

    // Сохраняем старое значение для отката
    const oldValue = activeCell.data[field];

    try {
      // Валидация
      const validation = validateValue(field, inputValue);

      if (!validation.valid) {
        setValidationError(validation.error);
        return;
      }

      const normalizedValue = validation.normalized;

      // Оптимистическое обновление UI
      if (gridApi && activeCell.node) {
        activeCell.node.setDataValue(field, normalizedValue);
        gridApi.refreshCells({ rowNodes: [activeCell.node], force: true });
      }

      // Отправляем обновление в API
      const updateData = { [field]: normalizedValue };
      await updateCheck(checkId, updateData);

      // Успех
      setValidationError(null);
      setIsEditing(false);

      if (onCellValueChange) {
        onCellValueChange();
      }

    } catch (error) {
      console.error('Error saving cell:', error);

      // Откат при ошибке
      if (gridApi && activeCell.node) {
        activeCell.node.setDataValue(field, oldValue);
        gridApi.refreshCells({ rowNodes: [activeCell.node], force: true });
      }

      const errorMessage = error.response?.data?.message || error.message || 'Ошибка сохранения';
      setValidationError(errorMessage);

      // Toast с дебаунсом (не показываем слишком часто)
      const now = Date.now();
      const lastToastTime = window._lastErrorToast || 0;
      if (now - lastToastTime > 5000) {
        toast.error(`Не удалось сохранить: ${errorMessage}`);
        window._lastErrorToast = now;
      }
    }
  };

  // Навигация по ячейкам
  const navigateToCell = useCallback((direction) => {
    if (!gridApi || !activeCell) return;

    const focusedCell = gridApi.getFocusedCell();
    if (!focusedCell) return;

    let newRowIndex = focusedCell.rowIndex;
    let newColIndex = gridApi.getAllDisplayedColumns().indexOf(focusedCell.column);

    switch (direction) {
      case 'down':
        newRowIndex++;
        break;
      case 'up':
        newRowIndex--;
        break;
      case 'right':
        newColIndex++;
        break;
      case 'left':
        newColIndex--;
        break;
      default:
        return;
    }

    // Проверяем границы
    const rowCount = gridApi.getDisplayedRowCount();
    const colCount = gridApi.getAllDisplayedColumns().length;

    if (newRowIndex < 0 || newRowIndex >= rowCount) return;
    if (newColIndex < 0 || newColIndex >= colCount) return;

    const newColumn = gridApi.getAllDisplayedColumns()[newColIndex];
    if (!newColumn) return;

    // Устанавливаем фокус на новую ячейку
    gridApi.setFocusedCell(newRowIndex, newColumn);
  }, [gridApi, activeCell]);

  // Обработка клавиш
  const handleKeyDown = useCallback(async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await saveCell();
      navigateToCell('down');
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      await saveCell();
      navigateToCell('up');
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      await saveCell();
      navigateToCell('right');
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      await saveCell();
      navigateToCell('left');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(getRawValue(activeCell));
      setValidationError(null);
    }
  }, [activeCell, inputValue, saveCell, navigateToCell]);

  // Обработка клика по адресу (копирование)
  const handleAddressClick = () => {
    const address = getCellAddress();
    if (address !== '—') {
      navigator.clipboard.writeText(address);
      toast.success(`Адрес ${address} скопирован`);
    }
  };

  // Обработка очистки формата
  const handleClearFormat = () => {
    if (!activeCell || !activeCell.data) return;

    const checkId = activeCell.data.id;
    const field = activeCell.colDef.field;

    clearCellStyle(checkId, field);

    if (gridApi) {
      gridApi.refreshCells({ force: true });
    }

    toast.success('Формат очищен');
  };

  // Вычисление сводных данных по выделению
  // УЛУЧШЕНО: теперь работает для ВСЕХ числовых значений, не только amount/balance
  const aggregates = useMemo(() => {
    if (!gridApi || selectedRanges.length === 0) return null;

    const values = [];

    selectedRanges.forEach(range => {
      const startRow = Math.min(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const endRow = Math.max(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const columns = range.columns || [];

      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
        const rowNode = gridApi.getDisplayedRowAtIndex(rowIndex);
        if (rowNode) {
          columns.forEach(col => {
            const field = col.getColDef().field;
            const value = rowNode.data[field];

            // Попытка преобразовать любое значение в число
            let numValue = null;

            if (typeof value === 'number' && !isNaN(value)) {
              numValue = value;
            } else if (typeof value === 'string' && value.trim() !== '') {
              // Убираем пробелы и заменяем запятую на точку
              const cleaned = value.replace(/\s/g, '').replace(',', '.');
              const parsed = parseFloat(cleaned);
              if (!isNaN(parsed)) {
                numValue = parsed;
              }
            }

            if (numValue !== null) {
              values.push(numValue);
            }
          });
        }
      }
    });

    if (values.length === 0) return null;

    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: values.length,
      sum,
      avg,
      min,
      max
    };
  }, [gridApi, selectedRanges]);

  // Форматирование числа для отображения
  const formatNumber = (value) => {
    if (value === null || value === undefined) return '—';

    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Копировать сумму в буфер
  const handleCopySum = () => {
    if (aggregates?.sum !== undefined) {
      navigator.clipboard.writeText(formatNumber(aggregates.sum));
      toast.success('Сумма скопирована');
    }
  };

  // Вставка функции в поле ввода
  const handleInsertFunction = (func) => {
    if (!inputRef.current) return;

    // Вставляем синтаксис функции
    setInputValue(func.syntax);
    setShowFxDropdown(false);

    // Фокус на input и выделение аргументов
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        setIsEditing(true);

        // Выделяем часть с аргументами (между скобками)
        const match = func.syntax.match(/\(([^)]+)\)/);
        if (match) {
          const argsStart = func.syntax.indexOf('(') + 1;
          const argsEnd = func.syntax.indexOf(')');
          inputRef.current.setSelectionRange(argsStart, argsEnd);
        }
      }
    }, 0);
  };

  // Закрытие dropdown при клике вне
  useEffect(() => {
    if (!showFxDropdown) return;

    const handleClickOutside = (e) => {
      if (
        fxDropdownRef.current &&
        !fxDropdownRef.current.contains(e.target) &&
        !e.target.closest('.fsb-button')
      ) {
        setShowFxDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFxDropdown]);

  const cellAddress = getCellAddress();
  const cellType = getCellType();
  const readOnly = isReadOnly();
  const hasSelection = selectedRanges.length > 0;
  const hasMultipleSelection = selectedRanges.length > 1 ||
    (selectedRanges.length === 1 && selectedRanges[0].columns?.length > 1);

  return (
    <div className="formula-status-bar">
      {/* Левая секция: адрес, тип, lock */}
      <div className="fsb-left">
        <div
          className="fsb-address"
          onClick={handleAddressClick}
          title="Кликните, чтобы скопировать адрес"
        >
          {cellAddress}
        </div>

        {cellType && (
          <div className="fsb-type-badge">
            Тип: {cellType}
          </div>
        )}

        {readOnly && (
          <div className="fsb-readonly-icon" title="Поле рассчитывается автоматически">
            🔒
          </div>
        )}
      </div>

      <div className="fsb-divider" />

      {/* Средняя секция: поле ввода */}
      <div className="fsb-input-container">
        <input
          ref={inputRef}
          type="text"
          className={`fsb-input ${validationError ? 'fsb-input-error' : ''}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            if (!showFxDropdown) {
              saveCell();
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={!activeCell ? 'Выберите ячейку' : (hasMultipleSelection ? '—' : '')}
          disabled={!activeCell || readOnly || hasMultipleSelection}
          readOnly={readOnly}
        />

        {validationError && (
          <div className="fsb-error-icon" title={validationError}>
            ⚠
          </div>
        )}
      </div>

      <div className="fsb-divider" />

      {/* Правая секция: кнопки и сводные */}
      <div className="fsb-right">
        <button
          className="fsb-button"
          onClick={() => setShowFxDropdown(!showFxDropdown)}
          title="Вставить функцию"
          disabled={!activeCell || readOnly}
        >
          fx
        </button>

        <button
          className="fsb-button"
          onClick={handleClearFormat}
          title="Очистить формат ячейки"
          disabled={!activeCell}
        >
          ⌫ формат
        </button>

        {/* Сводные чипы */}
        {aggregates && (
          <>
            <div className="fsb-divider" />
            <div className="fsb-aggregates">
              <span className="fsb-chip">
                Выделено: {aggregates.count}
              </span>
              <span
                className="fsb-chip fsb-chip-clickable"
                onClick={handleCopySum}
                title="Кликните, чтобы скопировать"
              >
                Σ {formatNumber(aggregates.sum)}
              </span>
              <span className="fsb-chip">
                Avg {formatNumber(aggregates.avg)}
              </span>
              <span className="fsb-chip">
                Min {formatNumber(aggregates.min)}
              </span>
              <span className="fsb-chip">
                Max {formatNumber(aggregates.max)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Dropdown для функций - patch-016 §11 */}
      {showFxDropdown && (
        <div className="fsb-fx-dropdown" ref={fxDropdownRef}>
          <div className="fsb-fx-header">
            <Icon name="info" size={16} />
            <span>Доступные функции</span>
          </div>
          {functions.map((func) => (
            <div
              key={func.name}
              className="fsb-fx-item"
              onClick={() => handleInsertFunction(func)}
            >
              <div className="fsb-fx-name">{func.name}</div>
              <div className="fsb-fx-syntax">{func.syntax}</div>
              <div className="fsb-fx-description">{func.description}</div>
              {func.example && (
                <div className="fsb-fx-example">{func.example}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

FormulaStatusBar.displayName = 'FormulaStatusBar';

export default FormulaStatusBar;
