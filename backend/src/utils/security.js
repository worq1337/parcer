const crypto = require('crypto');

/**
 * Утилиты безопасности
 * patch-017 §8: защита конфиденциальных данных
 */

/**
 * Маскировка номера карты
 * Оставляет только последние 4 цифры, остальное заменяет на звёздочки
 *
 * @param {string} cardNumber - Полный или частичный номер карты
 * @returns {string} - Замаскированный номер (*XXXX)
 *
 * @example
 * maskCardNumber('1234567812345678') // '*5678'
 * maskCardNumber('5678') // '*5678'
 * maskCardNumber('') // ''
 */
function maskCardNumber(cardNumber) {
  if (!cardNumber || typeof cardNumber !== 'string') {
    return '';
  }

  // Удаляем все нецифровые символы
  const digitsOnly = cardNumber.replace(/\D/g, '');

  if (digitsOnly.length === 0) {
    return '';
  }

  // Берём последние 4 цифры
  const last4 = digitsOnly.slice(-4);

  return `*${last4}`;
}

/**
 * Обезличивание ФИО
 * Заменяет имя на хэш для логирования
 *
 * @param {string} fullName - Полное имя
 * @returns {string} - Хэш имени (первые 8 символов SHA-256)
 *
 * @example
 * anonymizeName('Иван Иванов') // 'a3f2b1c9'
 */
function anonymizeName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return 'anonymous';
  }

  const hash = crypto
    .createHash('sha256')
    .update(fullName.trim().toLowerCase())
    .digest('hex')
    .substring(0, 8);

  return hash;
}

/**
 * Хэширование transaction ID для дедупликации
 * Используется для безопасного хранения и сравнения tx_id
 *
 * @param {string} txId - Transaction ID
 * @returns {string} - SHA-256 хэш
 *
 * @example
 * hashTransactionId('d5ef...fa1f8') // '8a3f2b1c...'
 */
function hashTransactionId(txId) {
  if (!txId || typeof txId !== 'string') {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(txId.trim())
    .digest('hex');
}

/**
 * Обезличивание объекта для логирования
 * Удаляет/маскирует конфиденциальные поля
 *
 * @param {object} data - Данные для логирования
 * @returns {object} - Обезличенные данные
 *
 * @example
 * sanitizeForLogging({
 *   cardNumber: '1234567812345678',
 *   fullName: 'Иван Иванов',
 *   txId: 'abc123',
 *   amount: 1000
 * })
 * // {
 * //   cardNumber: '*5678',
 * //   fullName: 'a3f2b1c9',
 * //   txIdHash: '8a3f2b1c...',
 * //   amount: 1000
 * // }
 */
function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized = { ...data };

  // Маскируем номера карт
  if (sanitized.cardNumber) {
    sanitized.cardNumber = maskCardNumber(sanitized.cardNumber);
  }
  if (sanitized.card_number) {
    sanitized.card_number = maskCardNumber(sanitized.card_number);
  }
  if (sanitized.cardLast4) {
    sanitized.cardLast4 = maskCardNumber(sanitized.cardLast4);
  }
  if (sanitized.card_last4) {
    sanitized.card_last4 = maskCardNumber(sanitized.card_last4);
  }

  // Обезличиваем ФИО
  if (sanitized.fullName) {
    sanitized.fullName = anonymizeName(sanitized.fullName);
  }
  if (sanitized.full_name) {
    sanitized.full_name = anonymizeName(sanitized.full_name);
  }
  if (sanitized.name) {
    sanitized.name = anonymizeName(sanitized.name);
  }

  // Хэшируем transaction ID
  if (sanitized.txId || sanitized.tx_id || sanitized.transactionId) {
    const txId = sanitized.txId || sanitized.tx_id || sanitized.transactionId;
    sanitized.txIdHash = hashTransactionId(txId);
    delete sanitized.txId;
    delete sanitized.tx_id;
    delete sanitized.transactionId;
  }

  // Удаляем чувствительные поля
  delete sanitized.password;
  delete sanitized.apiKey;
  delete sanitized.api_key;
  delete sanitized.token;
  delete sanitized.session;

  return sanitized;
}

/**
 * Валидация типа файла по MIME-type
 * patch-017 §8: проверка безопасности загружаемых файлов
 *
 * @param {string} mimeType - MIME тип файла
 * @param {array} allowedTypes - Разрешённые типы (по умолчанию: изображения и PDF)
 * @returns {boolean} - true если тип разрешён
 */
function isAllowedFileType(mimeType, allowedTypes = null) {
  if (!mimeType || typeof mimeType !== 'string') {
    return false;
  }

  const defaultAllowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ];

  const allowed = allowedTypes || defaultAllowed;

  return allowed.includes(mimeType.toLowerCase());
}

/**
 * Проверка размера файла
 * patch-017 §8: ограничение размера загружаемых файлов
 *
 * @param {number} sizeInBytes - Размер файла в байтах
 * @param {number} maxSizeMB - Максимальный размер в МБ (по умолчанию 10 МБ)
 * @returns {boolean} - true если размер допустим
 */
function isAllowedFileSize(sizeInBytes, maxSizeMB = 10) {
  if (typeof sizeInBytes !== 'number' || sizeInBytes < 0) {
    return false;
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  return sizeInBytes <= maxSizeBytes;
}

/**
 * Генерация безопасного случайного токена
 * Используется для session tokens, API keys и т.д.
 *
 * @param {number} length - Длина токена в байтах (по умолчанию 32)
 * @returns {string} - Hex-строка токена
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Простое шифрование строки (AES-256-CBC)
 * Используется для шифрования session strings userbot
 *
 * @param {string} text - Текст для шифрования
 * @param {string} secretKey - Секретный ключ (должен быть в .env)
 * @returns {string} - Зашифрованный текст (iv:encrypted)
 */
function encrypt(text, secretKey) {
  if (!text || !secretKey) {
    throw new Error('Text and secretKey are required for encryption');
  }

  // Создаём ключ из секрета (32 байта для AES-256)
  const key = crypto.createHash('sha256').update(secretKey).digest();

  // Генерируем случайный IV
  const iv = crypto.randomBytes(16);

  // Шифруем
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Возвращаем IV + зашифрованный текст
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Расшифровка строки (AES-256-CBC)
 *
 * @param {string} encryptedText - Зашифрованный текст (iv:encrypted)
 * @param {string} secretKey - Секретный ключ (должен быть в .env)
 * @returns {string} - Расшифрованный текст
 */
function decrypt(encryptedText, secretKey) {
  if (!encryptedText || !secretKey) {
    throw new Error('EncryptedText and secretKey are required for decryption');
  }

  // Разделяем IV и зашифрованный текст
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  // Создаём ключ из секрета
  const key = crypto.createHash('sha256').update(secretKey).digest();

  // Расшифровываем
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  maskCardNumber,
  anonymizeName,
  hashTransactionId,
  sanitizeForLogging,
  isAllowedFileType,
  isAllowedFileSize,
  generateSecureToken,
  encrypt,
  decrypt,
};
