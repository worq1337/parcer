const { DateTime } = require('luxon');

const TASHKENT_TIMEZONE = 'Asia/Tashkent';
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DEBIT_TYPES = new Set(['Оплата', 'Списание', 'E-Com', 'Платёж']);

function isString(value) {
  return typeof value === 'string' || value instanceof String;
}

function hasExplicitZone(input) {
  if (!input || !isString(input)) {
    return false;
  }
  return /[zZ]$/.test(input) || /[+-]\d{2}:?\d{2}$/.test(input);
}

/**
 * Parse arbitrary datetime input into Luxon DateTime in Asia/Tashkent.
 * Falls back to current time when parsing fails.
 * @param {string|number|Date} input
 * @returns {DateTime}
 */
function parseToTashkentDateTime(input) {
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: 'utc' }).setZone(TASHKENT_TIMEZONE);
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    return DateTime.fromMillis(input, { zone: 'utc' }).setZone(TASHKENT_TIMEZONE);
  }

  if (!input) {
    return DateTime.now().setZone(TASHKENT_TIMEZONE);
  }

  const raw = String(input).trim();
  if (!raw) {
    return DateTime.now().setZone(TASHKENT_TIMEZONE);
  }

  let dt;
  if (hasExplicitZone(raw)) {
    dt = DateTime.fromISO(raw, { zone: 'utc' }).setZone(TASHKENT_TIMEZONE);
  } else {
    dt = DateTime.fromISO(raw, { zone: TASHKENT_TIMEZONE });
  }

  if (!dt.isValid) {
    dt = DateTime.fromSQL(raw, { zone: TASHKENT_TIMEZONE });
  }

  if (!dt.isValid) {
    dt = DateTime.fromFormat(raw, 'dd.MM.yyyy HH:mm', { zone: TASHKENT_TIMEZONE });
  }

  if (!dt.isValid) {
    const fallbackDate = new Date(raw);
    if (!Number.isNaN(fallbackDate.getTime())) {
      dt = DateTime.fromJSDate(fallbackDate, { zone: 'utc' }).setZone(TASHKENT_TIMEZONE);
    }
  }

  return dt?.isValid ? dt : DateTime.now().setZone(TASHKENT_TIMEZONE);
}

/**
 * Convert datetime into values ready for DB persistence and UI display.
 * @param {string|number|Date} input
 */
function resolveDateParts(input) {
  const dt = parseToTashkentDateTime(input);

  return {
    tzDateTime: dt,
    datetimeForDb: dt.toFormat('yyyy-MM-dd HH:mm:ss'),
    weekday: WEEKDAYS[dt.weekday % 7],
    dateDisplay: `${dt.day} ${MONTHS[dt.month - 1]}`,
    timeDisplay: dt.toFormat('HH:mm'),
    formattedDisplay: dt.toFormat('dd.MM.yyyy HH:mm'),
  };
}

/**
 * Decide whether transaction type should be treated as debit (expense).
 * @param {string} type
 * @returns {boolean}
 */
function isDebitType(type) {
  if (!type) {
    return false;
  }
  return DEBIT_TYPES.has(String(type).trim());
}

module.exports = {
  TASHKENT_TIMEZONE,
  parseToTashkentDateTime,
  resolveDateParts,
  isDebitType,
};
