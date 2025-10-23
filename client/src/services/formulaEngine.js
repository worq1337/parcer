import { HyperFormula } from 'hyperformula';

/**
 * Движок формул на базе HyperFormula
 * Согласно patch.md §5
 */
class FormulaEngine {
  constructor() {
    this.hf = null;
    this.sheetId = null;
    this.initialized = false;
  }

  /**
   * Инициализация движка
   */
  initialize(data = []) {
    const options = {
      licenseKey: 'gpl-v3',
      language: 'ru-RU',
      // Функции, которые нужны согласно §5.3
      functionPlugins: [
        'SUM',
        'AVERAGE',
        'COUNT',
        'COUNTA',
        'MIN',
        'MAX',
        'ROUND',
        'ROUNDUP',
        'ROUNDDOWN',
        'IF',
        'IFS',
        'AND',
        'OR',
        'NOT',
        'LEFT',
        'RIGHT',
        'MID',
        'LEN',
        'TEXT',
        'VALUE',
        'TRIM',
        'DATE',
        'TIME',
        'NOW',
        'TODAY',
        'WEEKDAY',
        'EDATE',
        'EOMONTH',
        'VLOOKUP',
        'HLOOKUP',
        'INDEX',
        'MATCH',
        'IFERROR',
      ],
    };

    this.hf = HyperFormula.buildEmpty(options);
    this.sheetId = this.hf.addSheet('checks');

    if (data && data.length > 0) {
      this.loadData(data);
    }

    this.initialized = true;
  }

  /**
   * Загрузка данных в движок
   */
  loadData(data) {
    if (!this.initialized) {
      this.initialize(data);
      return;
    }

    // Преобразуем данные в формат HyperFormula (2D массив)
    const sheetData = this.convertToSheetData(data);

    // Очищаем и загружаем новые данные
    this.hf.setSheetContent(this.sheetId, sheetData);
  }

  /**
   * Преобразование данных чеков в формат листа
   */
  convertToSheetData(data) {
    if (!data || data.length === 0) return [];

    // Заголовки колонок
    const headers = Object.keys(data[0]);

    // Строки данных
    const rows = data.map(row => headers.map(key => row[key]));

    return [headers, ...rows];
  }

  /**
   * Получение значения ячейки
   */
  getCellValue(row, col) {
    if (!this.initialized) return null;

    const address = { sheet: this.sheetId, row, col };
    return this.hf.getCellValue(address);
  }

  /**
   * Установка значения ячейки
   */
  setCellValue(row, col, value) {
    if (!this.initialized) return;

    const address = { sheet: this.sheetId, row, col };

    // Если значение начинается с '=', это формула
    if (typeof value === 'string' && value.startsWith('=')) {
      this.hf.setCellContents(address, value);
    } else {
      this.hf.setCellContents(address, [[value]]);
    }
  }

  /**
   * Установка формулы в ячейку
   */
  setFormula(row, col, formula) {
    if (!this.initialized) return;

    const address = { sheet: this.sheetId, row, col };
    const formulaString = formula.startsWith('=') ? formula : `=${formula}`;

    this.hf.setCellContents(address, formulaString);
  }

  /**
   * Получение формулы из ячейки
   */
  getFormula(row, col) {
    if (!this.initialized) return null;

    const address = { sheet: this.sheetId, row, col };
    const formula = this.hf.getCellFormula(address);

    return formula;
  }

  /**
   * Вычисление формулы и получение результата
   */
  evaluateFormula(formula) {
    if (!this.initialized) return null;

    try {
      // Создаем временную ячейку для вычисления
      const tempAddress = { sheet: this.sheetId, row: 0, col: 0 };
      const formulaString = formula.startsWith('=') ? formula : `=${formula}`;

      this.hf.setCellContents(tempAddress, formulaString);
      const result = this.hf.getCellValue(tempAddress);

      // Очищаем временную ячейку
      this.hf.setCellContents(tempAddress, [[]]);

      return result;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return { error: error.message, type: '#ERROR' };
    }
  }

  /**
   * Получение зависимостей ячейки (какие ячейки влияют на данную)
   */
  getCellDependencies(row, col) {
    if (!this.initialized) return [];

    const address = { sheet: this.sheetId, row, col };
    const dependencies = this.hf.getCellDependents(address);

    return dependencies;
  }

  /**
   * Проверка наличия ошибки в ячейке
   */
  hasError(row, col) {
    if (!this.initialized) return false;

    const value = this.getCellValue(row, col);
    return value && typeof value === 'object' && value.type && value.type.startsWith('#');
  }

  /**
   * Получение ошибки ячейки
   */
  getError(row, col) {
    if (!this.initialized) return null;

    const value = this.getCellValue(row, col);

    if (value && typeof value === 'object' && value.type && value.type.startsWith('#')) {
      return {
        type: value.type,
        message: this.getErrorMessage(value.type),
      };
    }

    return null;
  }

  /**
   * Получение сообщения об ошибке по типу
   */
  getErrorMessage(errorType) {
    const messages = {
      '#DIV/0!': 'Деление на ноль',
      '#N/A': 'Значение недоступно',
      '#NAME?': 'Неизвестное имя функции',
      '#NULL!': 'Пустое пересечение диапазонов',
      '#NUM!': 'Недопустимое числовое значение',
      '#REF!': 'Недопустимая ссылка на ячейку',
      '#VALUE!': 'Неверный тип аргумента',
      '#ERROR': 'Общая ошибка',
    };

    return messages[errorType] || 'Неизвестная ошибка';
  }

  /**
   * Пересчет всех формул
   */
  recalculate() {
    if (!this.initialized) return;
    // HyperFormula автоматически пересчитывает формулы
    // при изменении зависимых ячеек
  }

  /**
   * Получение всех данных листа
   */
  getSheetData() {
    if (!this.initialized) return [];

    const serialized = this.hf.getSheetSerialized(this.sheetId);
    return serialized;
  }

  /**
   * Очистка движка
   */
  destroy() {
    if (this.hf) {
      this.hf.destroy();
      this.hf = null;
      this.sheetId = null;
      this.initialized = false;
    }
  }

  /**
   * Вычисление агрегатных функций для диапазона
   * Используется в статус-баре согласно §2.3
   */
  calculateAggregates(values) {
    if (!values || values.length === 0) {
      return {
        count: 0,
        sum: 0,
        average: 0,
        min: 0,
        max: 0,
      };
    }

    const numericValues = values
      .map(v => Number(v))
      .filter(v => !isNaN(v));

    if (numericValues.length === 0) {
      return {
        count: 0,
        sum: 0,
        average: 0,
        min: 0,
        max: 0,
      };
    }

    const sum = numericValues.reduce((acc, val) => acc + val, 0);
    const count = numericValues.length;
    const average = sum / count;
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    return {
      count,
      sum,
      average,
      min,
      max,
    };
  }
}

// Singleton instance
let formulaEngineInstance = null;

export const getFormulaEngine = () => {
  if (!formulaEngineInstance) {
    formulaEngineInstance = new FormulaEngine();
  }
  return formulaEngineInstance;
};

export default FormulaEngine;
