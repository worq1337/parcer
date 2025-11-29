const crypto = require('crypto');
const { parseToTashkentDateTime } = require('./datetime');
const { normalizeCardLast4 } = require('./card');

// Расширяем окно дедупликации до 5 минут (по умолчанию), настраивается через DEDUP_WINDOW_SECONDS
const FINGERPRINT_WINDOW_SECONDS = (() => {
  const raw = parseInt(process.env.DEDUP_WINDOW_SECONDS || '300', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
})();

function normalizeOperator(value) {
  if (!value) {
    return '';
  }
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeType(value) {
  if (!value) {
    return '';
  }
  return String(value).trim().toLowerCase();
}

function normalizeAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num.toFixed(2);
}

/**
 * Build deterministic fingerprint hash for a transaction.
 * We bucket datetime to the configured window (default 5 minutes) to tolerate drift.
 * @param {object} payload
 * @param {string|Date|number} payload.datetime
 * @param {number|string} payload.amount
 * @param {string|number} payload.cardLast4
 * @param {string} payload.operator
 * @param {string} payload.transactionType
 * @returns {string|null}
 */
function computeFingerprint(payload = {}) {
  const normalizedAmount = normalizeAmount(payload.amount);
  const normalizedCard = normalizeCardLast4(payload.cardLast4);

  if (!normalizedAmount || !normalizedCard) {
    return null;
  }

  const dt = parseToTashkentDateTime(payload.datetime);
  const windowBucket = Math.floor(dt.toSeconds() / FINGERPRINT_WINDOW_SECONDS);

  const content = [
    windowBucket,
    normalizedAmount,
    normalizedCard,
    normalizeOperator(payload.operator || payload.merchant),
    normalizeType(payload.transactionType),
  ].join('|');

  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = {
  computeFingerprint,
};
