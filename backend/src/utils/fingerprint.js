const crypto = require('crypto');
const { parseToTashkentDateTime } = require('./datetime');
const { normalizeCardLast4 } = require('./card');

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
 * We bucket datetime to the nearest minute to tolerate ±60 seconds drift.
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
  const minuteBucket = Math.round(dt.toSeconds() / 60);

  const content = [
    minuteBucket,
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
