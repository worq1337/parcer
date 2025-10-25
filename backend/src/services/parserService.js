const OpenAI = require('openai');
const Operator = require('../models/Operator');
const { detectSource } = require('../utils/detectSource');
const { resolveDateParts } = require('../utils/datetime');
const { normalizeCardLast4 } = require('../utils/card');

const UZUM_SMS_OTP_PREFIX = /^<#>\s*Uzum\s*bank\s+Podtverdite/i;
const UZUM_DEBIT_REGEX = /Spisanie,\s*karta\s*\*{0,4}(\d{4})\s*:\s*([\d.,]+)\s*UZS,\s*(.+?)\.\s*Dostupno:\s*([\d.,]+)\s*UZS/i;
const UZUM_CREDIT_REGEX = /Popolnenie\s+ot\s+(.+?)\s+na\s*([\d.,]+)\s*UZS.*karta\s*\*{0,4}(\d{4}).*Dostupno:\s*([\d.,]+)\s*UZS/i;
const UZUM_P2P_REGEX = /\bto\s+(HUMO|UZCARD|VISAUZUM)\b/i;
const UZUM_APP_NAME = 'Uzum Bank';

function parseMoney(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  const normalized = String(raw).replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function sanitizeOperatorName(raw) {
  if (!raw) {
    return null;
  }
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '')
    .trim();
}

class ParserService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Парсинг чека с использованием ChatGPT
   * @param {string|object} input - Текст сообщения или объект с imageUrl
   * @param {object} options - Дополнительные опции
   */
  async parseReceipt(input, options = {}) {
    try {
      // Определяем тип входных данных
      const isImageInput = typeof input === 'object' && input.imageUrl;
      const text = isImageInput ? (input.text || '') : input;

      const source = detectSource({
        explicit: options.explicit,
        tgMeta: options.tgMeta,
        text,
      });

      // Для текстовых SMS пробуем быстрый парсинг Uzum Bank
      if (!isImageInput) {
        const uzumOperations = this.tryParseUzumBankSms(text);
        if (uzumOperations.length > 0) {
          const resolvedSource = source || 'SMS';
          const operations = uzumOperations.map((operation) => ({
            ...operation,
            source: operation.source || resolvedSource,
          }));

          return {
            success: true,
            data: operations,
            source: resolvedSource,
          };
        }
      }

      // Выбираем модель в зависимости от типа данных
      const model = isImageInput ? 'gpt-4o' : 'gpt-4o-mini';

      const prompt = this.buildPrompt(text, source);

      // Формируем сообщения для GPT
      const messages = [
        {
          role: 'system',
          content: `Ты - эксперт по парсингу банковских уведомлений узбекских банков.
Твоя задача - извлечь структурированные данные из ${isImageInput ? 'изображения чека или' : ''} текста транзакции.
Отвечай ТОЛЬКО валидным JSON без дополнительных комментариев.`
        },
        {
          role: 'user',
          content: isImageInput ? [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: input.imageUrl,
                detail: 'high' // Высокое качество для лучшего распознавания
              }
            }
          ] : prompt
        }
      ];

      const completion = await this.createCompletion(messages, { model });

      const rawResponse = completion?.choices?.[0]?.message?.content;
      const responseText = rawResponse ? rawResponse.trim() : '';
      if (!responseText) {
        throw new Error('Пустой ответ от модели');
      }

      const cleanedResponse = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsedData;
      try {
        parsedData = JSON.parse(cleanedResponse);
      } catch (parseError) {
        throw new Error(`Модель вернула некорректный JSON: ${parseError.message}`);
      }

      // Пост-обработка данных
      const processedData = await this.postProcessData(parsedData, text, source, options);

      return {
        success: true,
        data: processedData,
        source,
        model // Возвращаем использованную модель для логирования
      };
    } catch (error) {
      console.error('Ошибка парсинга:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Выполняет запрос к OpenAI с поддержкой fallback, если модель не умеет response_format
   * @param {Array} messages
   * @param {{useResponseFormat?: boolean}} options
   */
  async createCompletion(messages, { useResponseFormat = true } = {}) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const requestBody = {
      model,
      messages,
      temperature: 0.1
    };

    if (useResponseFormat) {
      requestBody.response_format = { type: 'json_object' };
    }

    try {
      return await this.openai.chat.completions.create(requestBody);
    } catch (error) {
      if (useResponseFormat && this.isResponseFormatUnsupported(error)) {
        console.warn(`Модель ${model} не поддерживает response_format=json_object. Повторяем запрос без структурированного ответа.`);
        return this.createCompletion(messages, { useResponseFormat: false });
      }

      if (this.isRateLimitError(error)) {
        const retryAfter = this.extractRetryAfterSeconds(error);
        if (retryAfter) {
          throw new Error(`Лимит OpenAI временно превышен. Повторите попытку через ~${retryAfter} секунд.`);
        }
        throw new Error('Лимит OpenAI временно превышен. Повторите попытку немного позже.');
      }

      throw error;
    }
  }

  /**
   * Проверяет, что ошибка связана с неподдерживаемым response_format
   */
  isResponseFormatUnsupported(error) {
    const status = error?.status ?? error?.response?.status;
    const message = error?.error?.message || error?.response?.data?.error?.message || error?.message || '';

    if (status !== 400) {
      return false;
    }

    return message.toLowerCase().includes('response_format');
  }

  isRateLimitError(error) {
    const status = error?.status ?? error?.response?.status ?? error?.code;
    if (Number(status) === 429) {
      return true;
    }

    const message = error?.error?.message || error?.response?.data?.error?.message || error?.message || '';
    return message.toLowerCase().includes('rate limit');
  }

  extractRetryAfterSeconds(error) {
    const headerRetry = error?.response?.headers?.['retry-after'];
    if (headerRetry) {
      const parsedHeader = parseInt(headerRetry, 10);
      if (!Number.isNaN(parsedHeader)) {
        return parsedHeader;
      }
    }

    const message = error?.error?.message || error?.response?.data?.error?.message || error?.message || '';
    const match = message.match(/try again in\s+([0-9]+(?:\.[0-9]+)?)\s*s?/i);
    if (match) {
      const seconds = parseFloat(match[1]);
      if (!Number.isNaN(seconds)) {
        return Math.max(1, Math.round(seconds));
      }
    }

    return null;
  }

  /**
   * Построение промпта для GPT
   */
  buildPrompt(text, source) {
    return `
Распарси следующее банковское уведомление и верни данные в формате JSON.

Текст сообщения (источник: ${source}):
${text}

Верни JSON со следующими полями:
{
  "datetime": "YYYY-MM-DD HH:MM:SS", // Дата и время транзакции
  "transactionType": "string", // Тип: Оплата, Пополнение, Списание, Платеж, Конверсия, Возврат, Операция
  "amount": number, // Сумма (положительное число)
  "isIncome": boolean, // true если приход, false если расход
  "currency": "string", // Валюта (UZS, USD и т.д.)
  "cardLast4": "string", // Последние 4 цифры карты (только цифры)
  "operator": "string", // Название оператора/продавца (точно как в тексте)
  "balance": number, // Остаток после операции (если есть)
}

Важные правила:
1. Дату в формате "25-04-06" преобразуй в "2025-04-06"
2. Дату в формате "06.04.25" преобразуй в "2025-04-06"
3. Дату в формате "01-APR-2025" преобразуй в "2025-04-01"
4. Суммы извлекай как числа без пробелов и запятых тысяч
5. Последние 4 цифры карты извлекай из *XXXX или ***XXXX
6. Оператор - это то, что идет после 📍 в Telegram или после двоеточия в SMS
7. isIncome = true если есть ➕ или "Пополнение" или "popolnenie"
8. isIncome = false если есть ➖ или "Оплата" или "Покупка" или "Списание" или "oplata" или "pokupka" или "spisanie"
9. Для OTMENA (отмена) - это возврат средств, isIncome = true, transactionType = "Возврат"
10. transactionType нормализуй: "Pokupka" -> "Оплата", "Popolnenie" -> "Пополнение", "Spisanie" -> "Списание", "Platezh" -> "Платеж"
`;
  }

  /**
   * Детектор и парсер SMS Uzum Bank с множественными операциями.
   * Возвращает массив готовых объектов чеков или пустой массив.
   * @param {string} text
   * @returns {Array<object>}
   */
  tryParseUzumBankSms(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return [];
    }

    const operations = [];

    lines.forEach((line, index) => {
      if (!line || UZUM_SMS_OTP_PREFIX.test(line)) {
        return;
      }

      const debitMatch = UZUM_DEBIT_REGEX.exec(line);
      if (debitMatch) {
        const [, cardDigits, amountRaw, operatorRaw, balanceRaw] = debitMatch;
        const amount = parseMoney(amountRaw);
        if (!Number.isFinite(amount)) {
          return;
        }

        const balance = parseMoney(balanceRaw);
        operations.push({
          datetime: new Date().toISOString(),
          transactionType: 'Оплата',
          amount,
          currency: 'UZS',
          cardLast4: cardDigits,
          operator: sanitizeOperatorName(operatorRaw) || UZUM_APP_NAME,
          app: UZUM_APP_NAME,
          balance: balance ?? null,
          isP2p: UZUM_P2P_REGEX.test(line),
          source: 'SMS',
          rawText: line,
          metadata: {
            parser: 'uzumbank_sms',
            direction: 'debit',
            index,
          },
          addedVia: 'bot',
        });
        return;
      }

      const creditMatch = UZUM_CREDIT_REGEX.exec(line);
      if (creditMatch) {
        const [, operatorRaw, amountRaw, cardDigits, balanceRaw] = creditMatch;
        const amount = parseMoney(amountRaw);
        if (!Number.isFinite(amount)) {
          return;
        }

        const balance = parseMoney(balanceRaw);
        operations.push({
          datetime: new Date().toISOString(),
          transactionType: 'Пополнение',
          amount,
          currency: 'UZS',
          cardLast4: cardDigits,
          operator: sanitizeOperatorName(operatorRaw) || UZUM_APP_NAME,
          app: UZUM_APP_NAME,
          balance: balance ?? null,
          isP2p: UZUM_P2P_REGEX.test(line),
          source: 'SMS',
          rawText: line,
          metadata: {
            parser: 'uzumbank_sms',
            direction: 'credit',
            index,
          },
          addedVia: 'bot',
        });
      }
    });

    return operations;
  }

  /**
   * Пост-обработка распарсенных данных
   */
  async postProcessData(parsedData, rawText, source, options = {}) {
    const dateParts = resolveDateParts(parsedData.datetime);

    const amountAbsolute = Math.abs(Number(parsedData.amount) || 0);
    let amount = amountAbsolute;
    if (parsedData.isIncome === false) {
      amount = -amountAbsolute;
    }

    const balanceCandidate =
      parsedData.balance === undefined || parsedData.balance === null
        ? null
        : Number(parsedData.balance);
    const balance = balanceCandidate === null || Number.isNaN(balanceCandidate)
      ? null
      : balanceCandidate;

    const cardLast4 = normalizeCardLast4(parsedData.cardLast4 || parsedData.card_last4);

    // Ищем оператора в справочнике
    const operatorInfo = await Operator.findByPartialMatch(parsedData.operator);

    const app = operatorInfo ? operatorInfo.app_name : null;
    const isP2p = operatorInfo ? operatorInfo.is_p2p : parsedData.operator.toUpperCase().includes('P2P');

    return {
      datetime: dateParts.datetimeForDb,
      weekday: dateParts.weekday,
      dateDisplay: dateParts.dateDisplay,
      timeDisplay: dateParts.timeDisplay,
      operator: parsedData.operator,
      app,
      amount,
      balance,
      cardLast4: cardLast4 || parsedData.cardLast4 || parsedData.card_last4,
      isP2p,
      transactionType: parsedData.transactionType,
      currency: parsedData.currency,
      source,
      rawText,
      addedVia: options.addedVia || 'bot'
    };
  }

  /**
   * Парсинг нескольких чеков из одного сообщения
   */
  async parseMultipleReceipts(text, options = {}) {
    const source = detectSource({
      explicit: options.explicit,
      tgMeta: options.tgMeta,
      text,
    });

    // Простая эвристика: разделяем по строкам с эмодзи типа транзакции
    const transactionMarkers = ['💸 Оплата', '🎉 Пополнение', '💸 Операция', '💸 Конверсия', '🔴 Pokupka', '🟢 Popolnenie'];

    let hasSeparateTransactions = false;
    for (const marker of transactionMarkers) {
      if (text.split(marker).length > 2) {
        hasSeparateTransactions = true;
        break;
      }
    }

    if (!hasSeparateTransactions) {
      // Одна транзакция
      return [await this.parseReceipt(text, options)];
    }

    // Множественные транзакции - парсим каждую отдельно
    // Здесь можно реализовать более сложную логику разделения
    // Пока возвращаем как одну
    return [await this.parseReceipt(text, options)];
  }
}

module.exports = new ParserService();
