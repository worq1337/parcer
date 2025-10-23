/**
 * patch-008 §1: Слой преобразования viewModel ↔ apiModel
 * Решает проблему 500 ошибок при отправке форматированных значений в API
 */

/**
 * Преобразование из UI модели (viewModel) в API модель
 * UI: "- 200000,00" → API: -200000.00 (число)
 *
 * @param {string} field - Название поля
 * @param {any} value - Значение из UI
 * @returns {any} - Значение для API
 */
export const toApiModel = (field, value) => {
  // Пропускаем undefined и null
  if (value === undefined || value === null) {
    return value;
  }

  // Числовые поля: нормализуем к числу с точкой
  if (field === 'amount' || field === 'balance') {
    // Убираем пробелы, заменяем запятую на точку
    const strValue = String(value).replace(/\s/g, '').replace(',', '.');
    const numValue = parseFloat(strValue);

    // Проверяем на NaN
    if (isNaN(numValue)) {
      throw new Error(`Invalid number value for field ${field}: ${value}`);
    }

    // Отправляем как число (не строку!)
    return numValue;
  }

  // ПК: только 4 цифры, без звездочек
  if (field === 'card_last4') {
    const cleaned = String(value).replace(/\D/g, '');
    return cleaned.slice(-4) || null;
  }

  // P2P: нормализуем к boolean
  if (field === 'is_p2p') {
    return Boolean(value);
  }

  // Валюта: строго UZS или USD
  if (field === 'currency') {
    if (!['UZS', 'USD'].includes(value)) {
      throw new Error(`Invalid currency: ${value}. Must be UZS or USD`);
    }
    return value;
  }

  // Источник: строго Telegram, SMS, Manual
  if (field === 'source') {
    if (!['Telegram', 'SMS', 'Manual'].includes(value)) {
      throw new Error(`Invalid source: ${value}. Must be Telegram, SMS, or Manual`);
    }
    return value;
  }

  // Дата и время: ISO string
  if (field === 'datetime') {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return date.toISOString();
  }

  // Поле "Приложение" отправляем как строку (или null, если поле очищено)
  if (field === 'app') {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed || trimmed === '—') {
        return null;
      }
      return trimmed;
    }
    if (value === false) {
      return null;
    }
    return value ?? null;
  }

  // Поддержка числового идентификатора приложения для обратной совместимости
  if (field === 'application_id') {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(numeric)) {
      throw new Error(`Invalid application id: ${value}`);
    }
    return numeric;
  }

  // Остальные поля без изменений
  return value;
};

/**
 * Преобразование объекта для отправки в API
 * Убирает undefined/null поля и применяет toApiModel к каждому полю
 *
 * @param {object} data - Данные из UI
 * @returns {object} - Данные для API (только определённые поля)
 */
export const prepareForApi = (data) => {
  const result = {};
  const allowNullFields = new Set(['app', 'application_id']);

  for (const [key, value] of Object.entries(data)) {
    // Пропускаем undefined и null
    if (value === undefined || value === null) {
      if (allowNullFields.has(key)) {
        result[key] = null;
      }
      continue;
    }

    try {
      if (key === 'app') {
        if (value && typeof value === 'object') {
          const {
            id,
            application_id: appIdFromObject,
            name,
            label,
            value: rawValue,
          } = value;

          const displayName = typeof name === 'string'
            ? name
            : typeof label === 'string'
              ? label
              : typeof rawValue === 'string'
                ? rawValue
                : '';

          result.app = toApiModel('app', displayName);

          const maybeId = appIdFromObject ?? id;
          const normalizedId = toApiModel('application_id', maybeId);
          if (normalizedId !== null && normalizedId !== undefined) {
            result.application_id = normalizedId;
          }
        } else {
          result.app = toApiModel('app', value);
        }
      } else if (key === 'application_id') {
        const normalizedId = toApiModel('application_id', value);
        if (normalizedId !== null && normalizedId !== undefined) {
          result.application_id = normalizedId;
        }
      } else {
        result[key] = toApiModel(key, value);
      }
    } catch (error) {
      console.error(`Error transforming field ${key}:`, error);
      throw error;
    }
  }

  return result;
};

/**
 * Преобразование из API модели в UI модель
 * API: -200000.00 → UI: отображается через formatAmount как "- 200000,00"
 * (Само форматирование происходит в valueFormatter)
 *
 * @param {string} field - Название поля
 * @param {any} value - Значение из API
 * @returns {any} - Значение для UI
 */
export const toViewModel = (field, value) => {
  // Числа приходят как числа, форматирование в valueFormatter
  if (field === 'amount' || field === 'balance') {
    return value;
  }

  // ПК: добавляем звёздочку в valueFormatter
  if (field === 'card_last4') {
    return value;
  }

  // P2P: уже boolean
  if (field === 'is_p2p') {
    return Boolean(value);
  }

  // Остальные поля без изменений
  return value;
};

/**
 * Throttle для тостов - предотвращает спам одинаковыми сообщениями
 */
const toastThrottleMap = new Map();

export const shouldShowToast = (key, throttleMs = 5000) => {
  const now = Date.now();
  const lastShown = toastThrottleMap.get(key);

  if (lastShown && (now - lastShown) < throttleMs) {
    return false; // Троттлим
  }

  toastThrottleMap.set(key, now);
  return true;
};

/**
 * Очистка старых записей из throttle map
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of toastThrottleMap.entries()) {
    if (now - timestamp > 60000) { // Удаляем через минуту
      toastThrottleMap.delete(key);
    }
  }
}, 60000);
