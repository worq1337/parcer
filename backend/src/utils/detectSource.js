/**
 * Определение источника данных чека на основе явных и эвристических признаков.
 * Возможные значения: 'Фото' | 'Telegram' | 'SMS' | 'Manual'.
 *
 * @param {Object} ctx
 * @param {'telegram'|'sms'|'manual'|'photo'|string} [ctx.explicit] Явно переданный источник
 * @param {string} [ctx.text] Текстовое содержимое сообщения
 * @param {boolean} [ctx.hasPhoto] Признак наличия фото/изображения
 * @param {boolean} [ctx.hasImage] Альтернативный признак наличия изображения
 * @param {string} [ctx.mediaType] MIME-тип вложения
 * @param {Object} [ctx.message] Оригинальное сообщение (Telegram update)
 * @returns {'Фото'|'Telegram'|'SMS'|'Manual'}
 */
function detectSource(ctx = {}) {
  const {
    explicit,
    text,
    hasPhoto,
    hasImage,
    mediaType,
    message,
  } = ctx;

  const normalizedExplicit = normalizeExplicitSource(explicit);

  if (normalizedExplicit === 'manual') {
    return 'Manual';
  }
  if (normalizedExplicit === 'photo') {
    return 'Фото';
  }
  if (normalizedExplicit === 'telegram') {
    return 'Telegram';
  }
  if (normalizedExplicit === 'sms') {
    return 'SMS';
  }

  if (message) {
    return detectSourceFromMessage(message);
  }

  if (
    hasPhoto ||
    hasImage ||
    (typeof mediaType === 'string' && mediaType.startsWith('image/'))
  ) {
    return 'Фото';
  }

  if (hasEmoji(text)) {
    return 'Telegram';
  }

  return 'SMS';
}

/**
 * Определение источника по сообщению Telegram.
 * @param {Object} msg
 * @returns {'Фото'|'Telegram'|'SMS'}
 */
function detectSourceFromMessage(msg = {}) {
  const hasPhoto =
    Array.isArray(msg.photo) && msg.photo.length > 0 ||
    Boolean(msg.photo_sizes);
  const hasImageDocument =
    msg.document && typeof msg.document.mime_type === 'string'
      ? msg.document.mime_type.toLowerCase().startsWith('image/')
      : false;

  if (hasPhoto || hasImageDocument) {
    return 'Фото';
  }

  const text = msg.text || msg.caption || '';
  return hasEmoji(text) ? 'Telegram' : 'SMS';
}

function normalizeExplicitSource(raw) {
  if (!raw) {
    return null;
  }

  const value = String(raw).trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value === 'telegram' || value === 'tg' || value === 'telegram_bot') {
    return 'telegram';
  }

  if (value === 'sms' || value === 'text' || value === 'smstext') {
    return 'sms';
  }

  if (
    value === 'manual' ||
    value === 'ui' ||
    value === 'user' ||
    value === 'frontend' ||
    value === 'import'
  ) {
    return 'manual';
  }

  if (
    value === 'photo' ||
    value === 'image' ||
    value === 'photo_bot' ||
    value === 'ocr' ||
    value === 'scan'
  ) {
    return 'photo';
  }

  return null;
}

function hasEmoji(input) {
  if (!input || typeof input !== 'string') {
    return false;
  }

  try {
    return /\p{Extended_Pictographic}/u.test(input);
  } catch (error) {
    return /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(input);
  }
}

module.exports = {
  detectSource,
  detectSourceFromMessage,
  normalizeExplicitSource,
};
