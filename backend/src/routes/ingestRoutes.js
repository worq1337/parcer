const express = require('express');
const router = express.Router();
const axios = require('axios'); // patch-017 §2: для вызова OCR сервиса
const fs = require('fs');
const parserService = require('../services/parserService');
const Check = require('../models/Check');
const { logQueueEvent, normalizeQueueSource } = require('../utils/queueLogger');
const { isAllowedFileType, isAllowedFileSize, sanitizeForLogging } = require('../utils/security'); // patch-017 §8
const eventBus = require('../utils/eventBus'); // patch-017 §5
const ocrFallbackService = require('../services/ocrFallbackService');
const { normalizeExplicitSource, detectSource } = require('../utils/detectSource');

// patch-017 §2: URL OCR сервиса с учётом окружения (Docker / локально)
const resolveOcrServiceUrl = () => {
  if (process.env.OCR_SERVICE_URL && process.env.OCR_SERVICE_URL.trim() !== '') {
    return process.env.OCR_SERVICE_URL;
  }

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const runningInDocker =
    process.env.RUNNING_IN_DOCKER === '1' ||
    process.env.DOCKER === 'true' ||
    fs.existsSync('/.dockerenv');

  // Локальная разработка (backend на хосте, OCR из docker compose → порт 5002)
  if (!runningInDocker) {
    return 'http://localhost:5002';
  }

  // Значение по умолчанию для docker-сети
  return 'http://ocr:5000';
};

const OCR_SERVICE_URL = resolveOcrServiceUrl();
console.log(`[OCR] Service URL set to: ${OCR_SERVICE_URL}`);

/**
 * POST /api/ingest/text
 * patch-017 §7: Инжест текстовых чеков (SMS/Telegram)
 *
 * Body: {
 *   source: 'telegram' | 'sms' | 'manual',
 *   text: string,
 *   chat_id?: string,
 *   message_id?: string,
 *   user_id?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   check_id?: string,
 *   status: 'saved' | 'duplicate' | 'error',
 *   message?: string,
 *   error?: string,
 *   data?: object
 * }
 */
router.post('/text', async (req, res) => {
  try {
    const {
      source: rawSource = null,
      explicit = null,
      text,
      chat_id,
      message_id,
      user_id
    } = req.body;

    const explicitNormalized = normalizeExplicitSource(explicit || rawSource);
    const tgMeta = message_id ? { messageId: Number(message_id) } : null;
    const addedVia = explicitNormalized === 'manual' ? 'manual' : 'bot';

    // Валидация
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        status: 'error',
        error: 'Текст чека обязателен и не может быть пустым'
      });
    }

    // Парсинг текста
    const parseResult = await parserService.parseReceipt(text, {
      explicit: explicitNormalized,
      tgMeta,
      addedVia,
    });

    if (!parseResult.success) {
      await logQueueEvent(
        null,
        'parse_failed',
        normalizeQueueSource(explicitNormalized || undefined),
        {
          status: 'error',
          message: parseResult.error || 'Failed to parse receipt',
          metadata: { chat_id, message_id, user_id }
        }
      );

      return res.status(422).json({
        success: false,
        status: 'error',
        error: parseResult.error || 'Не удалось распознать чек',
        message: 'Проверьте формат сообщения'
      });
    }

    const detectedSource = parseResult.source || detectSource({ explicit: explicitNormalized, tgMeta, text });
    const detectedSourceKey = detectedSource ? String(detectedSource).toLowerCase() : 'manual';

    const parsedItems = Array.isArray(parseResult.data) ? parseResult.data : [parseResult.data];
    const hasMeta = Boolean(chat_id || message_id || user_id);

    const createdChecks = [];
    const duplicateSummaries = [];

    for (const [index, rawItem] of parsedItems.entries()) {
      const payload = {
        ...rawItem,
        source: rawItem.source || detectedSource,
      };

      if (!payload.addedVia) {
        payload.addedVia = explicitNormalized === 'manual' ? 'manual' : 'bot';
      }

      if (!payload.rawText && text) {
        payload.rawText = text;
      }

      if (hasMeta) {
        payload.metadata = {
          ...(payload.metadata || {}),
          chat_id: chat_id || null,
          message_id: message_id || null,
          user_id: user_id || null,
          ingest_index: index,
        };
      }

      const duplicate = await Check.checkDuplicate(
        payload.cardLast4 || payload.card_last4,
        payload.datetime,
        Math.abs(Number(payload.amount))
      );

      if (duplicate) {
        await logQueueEvent(
          duplicate.check_id,
          'duplicate_checked',
          normalizeQueueSource(payload.source || detectedSourceKey),
          {
            status: 'warning',
            message: 'Duplicate detected',
            metadata: { chat_id, message_id, user_id, ingest_index: index }
          }
        );

        duplicateSummaries.push({
          id: duplicate.id,
          check_id: duplicate.check_id,
          datetime: duplicate.datetime,
          amount: duplicate.amount,
          currency: duplicate.currency,
          operator: duplicate.operator,
          card_last4: duplicate.card_last4
        });
        continue;
      }

      const newCheck = await Check.create(payload);

      await logQueueEvent(
        newCheck.check_id,
        'saved',
        normalizeQueueSource((payload.source || detectedSourceKey)),
        {
          status: 'ok',
          message: 'Check saved via ingest API',
          metadata: { chat_id, message_id, user_id, ingest_index: index }
        }
      );

      eventBus.emitCheckAdded(newCheck, payload.source || detectedSource);

      createdChecks.push({
        id: newCheck.id,
        check_id: newCheck.check_id,
        datetime: newCheck.datetime,
        amount: newCheck.amount,
        currency: newCheck.currency,
        operator: newCheck.operator,
        card_last4: newCheck.card_last4,
        date_display: newCheck.date_display,
        time_display: newCheck.time_display
      });
    }

    if (createdChecks.length === 0) {
      return res.status(200).json({
        success: true,
        status: 'duplicate',
        message: 'Все операции уже существуют',
        duplicates: duplicateSummaries
      });
    }

    const status = duplicateSummaries.length > 0 ? 'partial' : 'saved';
    const message = duplicateSummaries.length > 0
      ? `Добавлено ${createdChecks.length}, дубликатов: ${duplicateSummaries.length}`
      : 'Чек успешно добавлен';

    res.status(201).json({
      success: true,
      status,
      message,
      data: createdChecks,
      duplicates: duplicateSummaries
    });

  } catch (error) {
    console.error('Ошибка при инжесте текстового чека:', error);

    res.status(500).json({
      success: false,
      status: 'error',
      error: 'Внутренняя ошибка сервера',
      message: error.message
    });
  }
});

/**
 * POST /api/ingest/image
 * patch-017 §7: Инжест фото чеков (для будущего OCR)
 *
 * Body: {
 *   source: 'telegram' | 'manual',
 *   file_url?: string,
 *   file_id?: string,
 *   file_base64?: string,
 *   chat_id?: string,
 *   message_id?: string,
 *   user_id?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   check_id?: string,
 *   status: 'saved' | 'pending' | 'error',
 *   message?: string
 * }
 */
router.post('/image', async (req, res) => {
  try {
    const {
      source: rawSource = null,
      explicit = null,
      file_url,
      file_id,
      file_base64,
      chat_id,
      message_id,
      user_id,
      mime_type,
      file_size
    } = req.body;

    const explicitNormalized = normalizeExplicitSource(explicit || rawSource) || 'telegram';
    const tgMeta = message_id ? { messageId: Number(message_id) } : null;
    const addedVia = explicitNormalized === 'manual' ? 'manual' : 'bot';

    // Валидация: требуется хотя бы один источник файла
    if (!file_url && !file_id && !file_base64) {
      return res.status(400).json({
        success: false,
        status: 'error',
        error: 'Требуется один из параметров: file_url, file_id или file_base64'
      });
    }

    // patch-017 §8: Проверка типа файла
    if (mime_type && !isAllowedFileType(mime_type)) {
      return res.status(400).json({
        success: false,
        status: 'error',
        error: 'Недопустимый тип файла. Разрешены: JPEG, PNG, WEBP, HEIC, PDF'
      });
    }

    // patch-017 §8: Проверка размера файла (макс 10 МБ)
    if (file_size && !isAllowedFileSize(file_size, 10)) {
      return res.status(400).json({
        success: false,
        status: 'error',
        error: 'Файл слишком большой. Максимальный размер: 10 МБ'
      });
    }

    // patch-017 §2: Обработка через OCR сервис
    let imageBase64 = null;

    // Конвертируем изображение в base64
    if (file_base64) {
      // Если уже передан base64
      imageBase64 = file_base64;
    } else if (file_url) {
      // Загружаем из URL
      try {
        const response = await axios.get(file_url, { responseType: 'arraybuffer' });
        imageBase64 = Buffer.from(response.data).toString('base64');
      } catch (error) {
        await logQueueEvent(
          null,
          'image_download_failed',
          normalizeQueueSource(explicitNormalized),
          {
            status: 'error',
            message: `Failed to download image from URL: ${error.message}`,
            metadata: { file_url, chat_id, message_id, user_id }
          }
        );

        return res.status(400).json({
          success: false,
          status: 'error',
          error: 'Не удалось загрузить изображение по URL',
          details: error.message
        });
      }
    } else if (file_id) {
      // TODO: Загрузка через Telegram Bot API (требует интеграции с telegramBot.js)
      return res.status(501).json({
        success: false,
        status: 'error',
        error: 'Загрузка по file_id пока не реализована. Используйте file_url или file_base64.'
      });
    }

    // Вызываем OCR сервис
    const tryFallback = async (reason, payload = {}) => {
      if (!imageBase64) {
        return {
          success: false,
          status: 'error',
          error: 'OCR fallback невозможен: отсутствуют данные изображения'
        };
      }

      const result = await ocrFallbackService.processImage({
        imageBase64,
        source: explicitNormalized,
        mimeType: mime_type || payload.mimeType || 'image/png',
        meta: {
          reason,
          chat_id,
          message_id,
          user_id,
          ...payload
        }
      });

      return result;
    };

    let ocrData = null;
    let fallbackUsed = false;

    try {
      const ocrResponse = await axios.post(`${OCR_SERVICE_URL}/ocr/process`, {
        image: imageBase64,
        preprocess: true
      }, {
        timeout: 30000 // 30 секунд таймаут
      });

      ocrData = ocrResponse.data;

      if (!ocrData.success) {
        const fallbackResult = await tryFallback('primary_ocr_failed', {
          ocr_error: ocrData.error
        });
        if (fallbackResult?.success) {
          ocrData = fallbackResult;
          fallbackUsed = true;
        } else if (fallbackResult) {
          return res.status(503).json(fallbackResult);
        }
      }
    } catch (error) {
      // Ошибка вызова OCR сервиса
      console.error('OCR Service Error:', error.message);

      await logQueueEvent(
        null,
        'ocr_service_error',
        normalizeQueueSource(explicitNormalized),
        {
          status: 'error',
          message: `OCR service error: ${error.message}`,
          metadata: { chat_id, message_id, user_id }
        }
      );

      const fallbackResult = await tryFallback('primary_ocr_unavailable', { error: error.message });
      if (fallbackResult?.success) {
        ocrData = fallbackResult;
        fallbackUsed = true;
      } else if (fallbackResult) {
        return res.status(503).json(fallbackResult);
      } else {
        // Если OCR сервис недоступен
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          return res.status(503).json({
            success: false,
            status: 'error',
            error: 'OCR сервис временно недоступен',
            suggestion: 'Попробуйте отправить текстовое сообщение вместо фото'
          });
        }

        // Если OCR сервис вернул ошибку 4xx/5xx
        if (error.response) {
          return res.status(error.response.status).json({
            success: false,
            status: 'error',
            error: error.response.data?.error || 'Ошибка обработки изображения',
            details: error.response.data
          });
        }

        // Прочие ошибки
        return res.status(500).json({
          success: false,
          status: 'error',
          error: 'Ошибка при обработке изображения',
          details: error.message
        });
      }
    }

    if (!ocrData) {
      return res.status(500).json({
        success: false,
        status: 'error',
        error: 'OCR обработка не выполнена'
      });
    }

    // Логируем получение результата OCR (с учётом fallback)
    await logQueueEvent(
      null,
      fallbackUsed ? 'ocr_fallback_processed' : 'ocr_processed',
      normalizeQueueSource(explicitNormalized),
      {
        status: ocrData.success ? 'ok' : 'error',
        message: fallbackUsed
          ? `Fallback OCR completed with confidence: ${ocrData.parsed_data?.confidence || 0}%`
          : `OCR completed with confidence: ${ocrData.parsed_data?.confidence || 0}%`,
        metadata: {
          ocr_confidence: ocrData.ocr_result?.confidence,
          parse_confidence: ocrData.parsed_data?.confidence,
          classifier: ocrData.parsed_data?.classifier,
          chat_id,
          message_id,
          user_id,
          fallback_used: fallbackUsed
        }
      }
    );

    // Если OCR вернул ошибку
    if (!ocrData.success) {
      return res.status(422).json({
        success: false,
        status: 'ocr_failed',
        error: ocrData.error || 'Не удалось распознать чек',
        suggestion: ocrData.suggestion,
        ocr_confidence: ocrData.ocr_result?.confidence
      });
    }

    // Если чек распознан как черновик (низкая уверенность)
    if (ocrData.status === 'draft') {
      return res.status(200).json({
        success: true,
        status: 'draft',
        message: 'Чек распознан с низкой уверенностью. Требуется проверка.',
        data: ocrData.parsed_data?.data,
        ocr_confidence: ocrData.ocr_result?.confidence,
        parse_confidence: ocrData.parsed_data?.confidence,
        warning: ocrData.warning
      });
    }

    // Извлекаем данные чека из ответа OCR
    const checkData = ocrData.parsed_data.data;

    const detectedSource = detectSource({
      explicit: explicitNormalized,
      tgMeta,
      text: checkData.rawText || checkData.raw_text || ocrData.ocr_result?.text || '',
    });
    const detectedSourceKey = detectedSource.toLowerCase();

    // Проверка на дубликат
    const duplicate = await Check.checkDuplicate(
      checkData.card_last4,
      checkData.datetime,
      Math.abs(checkData.amount)
    );

    if (duplicate) {
      await logQueueEvent(
        duplicate.check_id,
        'duplicate_checked',
        normalizeQueueSource(detectedSourceKey),
        {
          status: 'warning',
          message: 'Duplicate detected from OCR',
          metadata: { chat_id, message_id, user_id }
        }
      );

      return res.status(200).json({
        success: true,
        status: 'duplicate',
        check_id: duplicate.check_id,
        message: 'Чек уже существует в базе',
        data: {
          id: duplicate.id,
          datetime: duplicate.datetime,
          amount: duplicate.amount,
          currency: duplicate.currency,
          operator: duplicate.operator,
          card_last4: duplicate.card_last4
        }
      });
    }

    // Добавляем метаданные
    checkData.source = detectedSource;
    checkData.addedVia = addedVia;
    const hasMeta = Boolean(chat_id || message_id || user_id);
    if (hasMeta) {
      checkData.metadata = {
        ...(checkData.metadata || {}),
        chat_id: chat_id || null,
        message_id: message_id || null,
        user_id: user_id || null,
        ocr_confidence: ocrData.ocr_result?.confidence,
        parse_confidence: ocrData.parsed_data?.confidence,
        classifier: ocrData.parsed_data?.classifier,
        fallback_used: fallbackUsed
      };
    }

    // Сохраняем чек
    const newCheck = await Check.create(checkData);

    await logQueueEvent(
      newCheck.check_id,
      'saved',
      normalizeQueueSource(detectedSourceKey),
      {
        status: 'ok',
        message: fallbackUsed ? 'Check saved from OCR fallback' : 'Check saved from OCR',
        metadata: {
          chat_id,
          message_id,
          user_id,
          ocr_confidence: ocrData.ocr_result?.confidence,
          parse_confidence: ocrData.parsed_data?.confidence,
          fallback_used: fallbackUsed
        }
      }
    );

    // patch-017 §5: отправить push-уведомление о новом чеке
    eventBus.emitCheckAdded(newCheck, detectedSource);

    res.status(201).json({
      success: true,
      status: 'saved',
      check_id: newCheck.check_id,
      message: 'Чек успешно распознан и добавлен',
      data: {
        id: newCheck.id,
        datetime: newCheck.datetime,
        amount: newCheck.amount,
        currency: newCheck.currency,
        operator: newCheck.operator,
        card_last4: newCheck.card_last4,
        date_display: newCheck.date_display,
        time_display: newCheck.time_display
      },
      ocr_info: {
        confidence: ocrData.ocr_result?.confidence,
        classifier: ocrData.parsed_data?.classifier,
        fallback_used: fallbackUsed
      }
    });

  } catch (error) {
    console.error('Ошибка при инжесте изображения:', error);

    res.status(500).json({
      success: false,
      status: 'error',
      error: 'Внутренняя ошибка сервера',
      message: error.message
    });
  }
});

/**
 * POST /api/ingest/sms
 * Android SMS Parser endpoint
 *
 * Body: {
 *   sender: string,
 *   message: string,
 *   timestamp: number (milliseconds),
 *   deviceId: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   checkId?: string,
 *   message: string,
 *   parsedData?: {
 *     datetime, operator, amount, balance, currency, cardLast4
 *   }
 * }
 */
router.post('/sms', async (req, res) => {
  try {
    const {
      sender,
      message,
      timestamp,
      deviceId
    } = req.body;

    // Валидация обязательных полей
    if (!sender || typeof sender !== 'string' || sender.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Sender is required and must be a non-empty string'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a non-empty string'
      });
    }

    if (!timestamp || typeof timestamp !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Timestamp is required and must be a number (milliseconds)'
      });
    }

    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'DeviceId is required and must be a non-empty string'
      });
    }

    // Парсинг SMS через существующий сервис
    const parseResult = await parserService.parseReceipt(message, {
      explicit: 'SMS',
      addedVia: 'android',
    });

    if (!parseResult.success) {
      await logQueueEvent(
        null,
        'parse_failed',
        'sms_android',
        {
          status: 'error',
          message: parseResult.error || 'Failed to parse SMS',
          metadata: { sender, deviceId, timestamp }
        }
      );

      return res.status(422).json({
        success: false,
        error: parseResult.error || 'Failed to parse SMS',
        message: 'Check SMS format and try again'
      });
    }

    const parsedItems = Array.isArray(parseResult.data) ? parseResult.data : [parseResult.data];
    const createdChecks = [];
    const duplicateSummaries = [];

    for (const [index, rawItem] of parsedItems.entries()) {
      const payload = {
        ...rawItem,
        source: 'SMS',
        addedVia: 'android',
        rawText: message,
        metadata: {
          ...(rawItem.metadata || {}),
          sender,
          deviceId,
          smsTimestamp: timestamp,
          index,
        }
      };

      // Проверка на дубликат
      const duplicate = await Check.checkDuplicate(
        payload.cardLast4 || payload.card_last4,
        payload.datetime,
        Math.abs(Number(payload.amount))
      );

      if (duplicate) {
        await logQueueEvent(
          duplicate.check_id,
          'duplicate_checked',
          'sms_android',
          {
            status: 'warning',
            message: 'Duplicate SMS detected',
            metadata: { sender, deviceId, timestamp, index }
          }
        );

        duplicateSummaries.push({
          checkId: duplicate.check_id,
          datetime: duplicate.datetime,
          amount: duplicate.amount,
          currency: duplicate.currency,
          operator: duplicate.operator,
          cardLast4: duplicate.card_last4
        });
        continue;
      }

      // Создание нового чека
      const newCheck = await Check.create(payload);

      await logQueueEvent(
        newCheck.check_id,
        'saved',
        'sms_android',
        {
          status: 'ok',
          message: 'SMS check saved from Android device',
          metadata: { sender, deviceId, timestamp, index }
        }
      );

      eventBus.emitCheckAdded(newCheck, 'SMS');

      createdChecks.push({
        checkId: newCheck.check_id,
        datetime: newCheck.datetime,
        operator: newCheck.operator,
        amount: newCheck.amount,
        balance: newCheck.balance,
        currency: newCheck.currency,
        cardLast4: newCheck.card_last4,
        transactionType: newCheck.transaction_type,
        dateDisplay: newCheck.date_display,
        timeDisplay: newCheck.time_display
      });
    }

    // Формируем ответ
    if (createdChecks.length === 0) {
      return res.status(200).json({
        success: true,
        status: 'duplicate',
        message: 'All SMS transactions already exist',
        duplicates: duplicateSummaries
      });
    }

    const responseStatus = duplicateSummaries.length > 0 ? 'partial' : 'success';
    const responseMessage = duplicateSummaries.length > 0
      ? `Created ${createdChecks.length}, duplicates: ${duplicateSummaries.length}`
      : 'SMS processed successfully';

    // Возвращаем первый созданный чек как основной (или единственный)
    const mainCheck = createdChecks[0];

    res.status(201).json({
      success: true,
      status: responseStatus,
      checkId: mainCheck.checkId,
      message: responseMessage,
      parsedData: {
        datetime: mainCheck.datetime,
        operator: mainCheck.operator,
        amount: mainCheck.amount,
        balance: mainCheck.balance,
        currency: mainCheck.currency,
        cardLast4: mainCheck.cardLast4,
        transactionType: mainCheck.transactionType,
        dateDisplay: mainCheck.dateDisplay,
        timeDisplay: mainCheck.timeDisplay
      },
      allCreated: createdChecks.length > 1 ? createdChecks : undefined,
      duplicates: duplicateSummaries.length > 0 ? duplicateSummaries : undefined
    });

  } catch (error) {
    console.error('Error processing SMS from Android:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
