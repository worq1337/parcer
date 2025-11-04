/**
 * Форматтеры для Receipt Parser
 * patch-019: DateTime форматирование через luxon с таймзоной Asia/Tashkent
 */
import { DateTime } from 'luxon';

const TASHKENT = 'Asia/Tashkent';

/**
 * Форматирование суммы согласно patch-006 §5, patch-016 §9
 * Использует настройки из settingsStore для разделителей
 * @param {number} amount - Сумма
 * @param {object} options - Опции форматирования из settingsStore.numberFormatting
 * @returns {string} Отформатированная сумма
 */
export const formatAmount = (amount, options = {}) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '';
  }

  const normalizedOptions =
    options && typeof options === 'object'
      ? options
      : {};

  const {
    thousandsSeparator = false,
    decimalSeparator = ',',
  } = normalizedOptions;
  const absAmount = Math.abs(Number(amount) || 0);

  // Форматирование с или без разделителя тысяч
  let formatted;
  if (thousandsSeparator && thousandsSeparator !== false) {
    // Используем Intl для группировки
    formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(absAmount);

    // Заменяем разделитель согласно настройкам
    if (thousandsSeparator === 'space') {
      formatted = formatted.replace(/\u00A0/g, ' '); // неразрывный пробел на обычный
    } else if (thousandsSeparator === 'thinSpace') {
      formatted = formatted.replace(/\u00A0/g, '\u2009'); // тонкий пробел
    } else if (thousandsSeparator === 'dot') {
      formatted = formatted.replace(/\u00A0/g, '.');
    } else if (thousandsSeparator === 'comma') {
      formatted = formatted.replace(/\u00A0/g, ',').replace(',', '.'); // запятая как разделитель тысяч, точка как десятичный
    }
  } else {
    formatted = absAmount.toFixed(2);
  }

  // Применяем десятичный разделитель
  if (decimalSeparator === ',') {
    formatted = formatted.replace('.', ',');
  }

  return formatted;
};

/**
 * Форматирование остатка согласно patch-006 §5, patch-016 §9
 * Использует настройки из settingsStore для разделителей
 * @param {number} balance - Остаток
 * @param {object} options - Опции форматирования из settingsStore.numberFormatting
 * @returns {string} Отформатированный остаток
 */
export const formatBalance = (balance, options = {}) => {
  if (balance === null || balance === undefined || isNaN(balance)) {
    return '—';
  }

  const {
    thousandsSeparator = false,
    decimalSeparator = ',',
  } = options;

  const absBalance = Math.abs(Number(balance) || 0);

  // Форматирование с или без разделителя тысяч
  let formatted;
  if (thousandsSeparator && thousandsSeparator !== false) {
    formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    }).format(absBalance);

    // Заменяем разделитель согласно настройкам
    if (thousandsSeparator === 'space') {
      formatted = formatted.replace(/\u00A0/g, ' ');
    } else if (thousandsSeparator === 'thinSpace') {
      formatted = formatted.replace(/\u00A0/g, '\u2009');
    } else if (thousandsSeparator === 'dot') {
      formatted = formatted.replace(/\u00A0/g, '.');
    } else if (thousandsSeparator === 'comma') {
      formatted = formatted.replace(/\u00A0/g, ',').replace(',', '.');
    }
  } else {
    formatted = absBalance.toFixed(2);
  }

  // Применяем десятичный разделитель
  if (decimalSeparator === ',') {
    formatted = formatted.replace('.', ',');
  }

  return formatted;
};

/**
 * Основной форматтер даты и времени согласно patch-019 §1
 * Использует luxon с таймзоной Asia/Tashkent (UTC+5)
 * Формат: ДД.ММ.ГГГГ ЧЧ:ММ (без секунд, без Z)
 * @param {string|number|Date} iso - ISO строка, timestamp или Date объект
 * @returns {string} Отформатированная строка в формате ДД.ММ.ГГГГ ЧЧ:ММ
 */
export const formatDateTime = (iso) => {
  if (!iso) return '';
  try {
    return DateTime.fromJSDate(new Date(iso), { zone: TASHKENT })
      .toFormat('dd.MM.yyyy HH:mm');
  } catch (error) {
    console.error('formatDateTime error:', error);
    return '';
  }
};

// Форматирование даты (ДД.ММ.ГГГГ)
export const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    return DateTime.fromJSDate(new Date(dateString), { zone: TASHKENT })
      .toFormat('dd.MM.yyyy');
  } catch (error) {
    console.error('formatDate error:', error);
    return '';
  }
};

// Форматирование времени (ЧЧ:ММ)
export const formatTime = (dateString) => {
  if (!dateString) return '';
  try {
    return DateTime.fromJSDate(new Date(dateString), { zone: TASHKENT })
      .toFormat('HH:mm');
  } catch (error) {
    console.error('formatTime error:', error);
    return '';
  }
};

// Получить день недели
export const getWeekday = (dateString) => {
  const date = new Date(dateString);
  const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return weekdays[date.getDay()];
};

// Получить короткую дату (6 апр)
export const getShortDate = (dateString) => {
  const date = new Date(dateString);
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};

// Нормализация типа транзакции
export const normalizeTransactionType = (type) => {
  const types = {
    'Pokupka': 'Оплата',
    'Popolnenie': 'Пополнение',
    'Spisanie': 'Списание',
    'Platezh': 'Платёж',
    'Operacija': 'Операция',
    'Konversiya': 'Конверсия',
    'OTMENA': 'Возврат'
  };
  return types[type] || type;
};

// Получить цвет для типа транзакции
export const getTransactionTypeColor = (amount) => {
  return amount >= 0 ? 'var(--status-success)' : 'var(--status-error)';
};

// Получить иконку для типа транзакции
export const getTransactionTypeIcon = (amount) => {
  return amount >= 0 ? '↑' : '↓';
};

/**
 * Форматирование последних цифр карты согласно patch-019 §2
 * Показываем только 4 цифры БЕЗ звёздочек (например: 1116)
 * @param {string|number} last4 - Последние цифры карты
 * @returns {string} 4 цифры без звёздочек
 */
export const formatCardLast4 = (last4) => {
  if (!last4) return '';

  // Убираем все нечисловые символы
  const cleaned = String(last4).replace(/\D/g, '');

  // Берем последние 4 цифры
  const lastFour = cleaned.slice(-4);

  return lastFour || '';
};

/**
 * Нормализация ПК при вводе согласно patch-019 §2
 * Убирает все нечисловые символы и берёт последние 4 цифры
 * @param {string|number} src - Исходное значение
 * @returns {string|null} 4 цифры или null
 */
export const normalizePC = (src) => {
  if (!src) return null;
  const last4 = String(src).replace(/\D/g, '').slice(-4);
  return last4 || null;
};

/**
 * Форматирование P2P согласно patch-006 §6, patch-016 §9
 * Использует настройку p2pSymbol из settingsStore
 * @param {boolean} isP2P - Является ли P2P
 * @param {object} options - Опции форматирования
 * @returns {string} Символ P2P или пусто
 */
export const formatP2P = (isP2P, options = {}) => {
  if (!isP2P) return '';

  const { p2pSymbol = '✓' } = options;

  // Возвращаем выбранный символ
  return p2pSymbol || '';
};

/**
 * Нормализация значения P2P при вводе
 * Принимаем любое значение, возвращаем boolean
 */
export const normalizeP2PInput = (value) => {
  if (!value || value === '' || value === '0' || value === 'false') {
    return false;
  }
  return true;
};

/**
 * Форматирование относительной даты обновления
 * Показывает "только что", "сегодня", "вчера", "3 дня назад", "12.04.2025"
 * @param {string} dateString - ISO строка даты
 * @returns {string} Отформатированная относительная дата
 */
export const formatRelativeDate = (dateString) => {
  if (!dateString) return '';

  const dt = DateTime.fromISO(dateString, { zone: TASHKENT });
  if (!dt.isValid) return '';

  const now = DateTime.now().setZone(TASHKENT);
  const diff = now.diff(dt, ['days', 'hours', 'minutes']).toObject();

  // Только что (менее 1 минуты)
  if (diff.minutes < 1) {
    return 'только что';
  }

  // Менее часа назад
  if (diff.hours < 1) {
    const mins = Math.floor(diff.minutes);
    return `${mins} мин. назад`;
  }

  // Сегодня
  if (dt.hasSame(now, 'day')) {
    return `сегодня в ${dt.toFormat('HH:mm')}`;
  }

  // Вчера
  const yesterday = now.minus({ days: 1 });
  if (dt.hasSame(yesterday, 'day')) {
    return `вчера в ${dt.toFormat('HH:mm')}`;
  }

  // Менее 7 дней назад
  if (diff.days < 7) {
    const days = Math.floor(diff.days);
    return `${days} дн. назад`;
  }

  // Более 7 дней - показываем дату
  return dt.toFormat('dd.MM.yyyy');
};
