const NON_DIGIT_REGEX = /\D/g;

/**
 * Normalize card last-4 digits: strip non-digits and keep last 4.
 * @param {string|number|null|undefined} input
 * @returns {string|null}
 */
function normalizeCardLast4(input) {
  if (input === null || input === undefined) {
    return null;
  }

  const cleaned = String(input).replace(NON_DIGIT_REGEX, '');
  if (!cleaned) {
    return null;
  }

  const lastFour = cleaned.slice(-4);
  return lastFour || null;
}

module.exports = {
  normalizeCardLast4,
};
