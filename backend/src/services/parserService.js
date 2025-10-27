const { randomUUID } = require('crypto');
const OpenAI = require('openai');
const Check = require('../models/Check');
const Operator = require('../models/Operator');
const { detectSource } = require('../utils/detectSource');
const { resolveDateParts } = require('../utils/datetime');
const { normalizeCardLast4 } = require('../utils/card');
const eventBus = require('../utils/eventBus');
const notificationRoutes = require('../routes/notificationRoutes');
const emitTxEvent = notificationRoutes.emitTxEvent || (() => {});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-4o';
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 400;

const JSON_SCHEMA = {
  name: 'transaction_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount: { type: 'number' },
      currency: { type: 'string' },
      datetime_iso: { type: 'string' },
      operator: { type: 'string' },
      card_last4: { type: 'string' },
      transaction_type: { type: 'string', enum: ['debit', 'credit', 'p2p', 'fee', 'refund'] },
      balance: { type: ['number', 'null'] },
      meta: { type: 'object', additionalProperties: true }
    },
    required: ['amount', 'currency', 'datetime_iso', 'transaction_type', 'operator', 'card_last4', 'balance', 'meta']
  },
  strict: true
};

const TRANSACTION_TYPE_MAP = {
  debit: { type: 'Списание', income: false },
  credit: { type: 'Пополнение', income: true },
  p2p: { type: 'Перевод', income: false, isP2p: true },
  fee: { type: 'Комиссия', income: false },
  refund: { type: 'Возврат', income: true }
};

const UZUM_SMS_OTP_PREFIX = /^<#>\s*Uzum\s*bank\s+Podtverdite/i;
const UZUM_DEBIT_REGEX = /Spisanie,\s*karta\s*\*{0,4}(\d{4})\s*:\s*([\d.,]+)\s*UZS,\s*(.+?)\.\s*Dostupno:\s*([\d.,]+)\s*UZS/i;
const UZUM_CREDIT_REGEX = /Popolnenie\s+ot\s+(.+?)\s+na\s*([\d.,]+)\s*UZS.*karta\s*\*{0,4}(\d{4}).*Dostupno:\s*([\d.,]+)\s*UZS/i;
const UZUM_P2P_REGEX = /\bto\s+(HUMO|UZCARD|VISAUZUM)\b/i;
const UZUM_APP_NAME = 'Uzum Bank';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ParserError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

class ParserService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  buildContext(rawText, options = {}, requestId) {
    const source = detectSource({
      explicit: options.explicit,
      tgMeta: options.tgMeta,
      text: rawText
    });

    return {
      source,
      explicit: options.explicit,
      tgMeta: options.tgMeta,
      addedVia: options.addedVia || 'bot',
    metadata: options.metadata || {},
    sourceChatId: options.sourceChatId || options.chat_id || null,
    sourceMessageId: options.sourceMessageId || options.message_id || null,
    notifyMessageId: options.notifyMessageId || options.notify_message_id || null,
    sourceBotUsername: options.sourceBotUsername || options.source_bot_username || null,
    sourceBotTitle: options.sourceBotTitle || options.source_bot_title || null,
    sourceApp: options.sourceApp || options.source_app || null,
    requestId
  };
}

  toErrorResponse(error, context) {
    if (error instanceof ParserError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        requestId: context.requestId,
        meta: error.meta || {}
      };
    }

    console.error('[ParserService] Unexpected error', error);
    return {
      success: false,
      error: error?.message || 'Unknown parser error',
      code: 'UNEXPECTED_ERROR',
      requestId: context.requestId
    };
  }

  async parseReceipt(input, options = {}) {
    const isImageInput = typeof input === 'object' && input?.imageUrl;
    const baseText = isImageInput ? (input.text || '') : String(input || '');
    const trimmedText = baseText.trim();
    const requestId = randomUUID();
    const context = this.buildContext(trimmedText, options, requestId);

    try {
      if (isImageInput) {
        const parsed = await this.parseImageReceipt(
          {
            imageUrl: input.imageUrl,
            text: trimmedText
          },
          context
        );

        return {
          success: true,
          data: parsed,
          source: context.source,
          requestId,
          meta: { strategy: parsed?.strategy || 'image' }
        };
      }

      const transactions = await this.parseTransactionsFromText(trimmedText, context);
      const payload = transactions.length === 1 ? transactions[0] : transactions;

      return {
        success: true,
        data: payload,
        source: context.source,
        requestId,
        meta: { strategy: transactions.length > 1 ? 'fast-multi' : 'fast-or-llm' }
      };
    } catch (error) {
      return this.toErrorResponse(error, context);
    }
  }

  async parseTransactionsFromText(rawText, context) {
    if (!rawText || rawText.trim().length === 0) {
      throw new ParserError('NO_TEXT', 'Сообщение пустое', { requestId: context.requestId });
    }

    const fastResult = await this.tryFastPath(rawText, context);
    if (fastResult && fastResult.length > 0) {
      return fastResult;
    }

    const llm = await this.parseWithLLM(rawText, context);
    const normalized = await this.postProcessData(llm, rawText, context.source, {
      ...context,
      strategy: 'llm'
    });
    return [normalized];
  }

  async tryFastPath(rawText, context) {
    const uzumOperations = this.tryParseUzumBankSms(rawText);
    if (uzumOperations.length === 0) {
      return null;
    }

    const resolvedSource = context.source || 'SMS';
    const normalized = [];
    for (const operation of uzumOperations) {
      const opSource = operation.source || resolvedSource;
      const payload = await this.postProcessData(operation, operation.rawText || rawText, opSource, {
        ...context,
        strategy: 'fast-uzum'
      });
      normalized.push(payload);
    }
    return normalized;
  }

  async parseWithLLM(rawText, context) {
    const messages = [
      {
        role: 'system',
        content: 'Извлеки поля из банковского уведомления и верни строго JSON по схеме.'
      },
      {
        role: 'user',
        content: rawText
      }
    ];

    const requestBody = {
      model: DEFAULT_MODEL,
      messages,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: JSON_SCHEMA
      }
    };

    let completion;
    try {
      completion = await this.createCompletion(requestBody);
    } catch (error) {
      if (this.isResponseFormatUnsupported(error)) {
        console.warn(`[ParserService] Model ${DEFAULT_MODEL} does not support json_schema. Retrying with json_object.`);
        const fallbackBody = {
          ...requestBody,
          response_format: { type: 'json_object' }
        };
        completion = await this.createCompletion(fallbackBody, { allowFallback: false });
      } else if (this.isRateLimitError(error)) {
        const retryAfter = this.extractRetryAfterSeconds(error);
        throw new ParserError(
          'LLM_RATE_LIMIT',
          retryAfter
            ? `Лимит OpenAI превышен. Повторите попытку через ~${retryAfter} секунд.`
            : 'Лимит OpenAI временно превышен. Попробуйте позже.',
          { requestId: context.requestId }
        );
      } else {
        throw new ParserError('LLM_REQUEST_FAILED', error.message || 'Не удалось получить ответ от LLM', {
          requestId: context.requestId
        });
      }
    }

    const rawResponse = completion?.choices?.[0]?.message?.content;
    const trimmed = rawResponse ? rawResponse.trim() : '';
    if (!trimmed) {
      throw new ParserError('LLM_EMPTY', 'Модель вернула пустой ответ', {
        requestId: context.requestId
      });
    }

    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      throw new ParserError('LLM_JSON_PARSE_ERROR', 'Модель вернула некорректный JSON', {
        requestId: context.requestId,
        raw: trimmed
      });
    }

    if (typeof data.amount !== 'number' || !data.currency || !data.datetime_iso) {
      throw new ParserError('LLM_JSON_INVALID', 'Некорректные данные в JSON от модели', {
        requestId: context.requestId,
        raw: data
      });
    }

    return this.normalizeLlmPayload(data);
  }

  normalizeLlmPayload(data) {
    const transactionInfo = TRANSACTION_TYPE_MAP[String(data.transaction_type || '').toLowerCase()] || {
      type: 'Операция',
      income: data.amount >= 0
    };

    return {
      datetime: data.datetime_iso,
      transactionType: transactionInfo.type,
      amount: Math.abs(Number(data.amount)),
      currency: data.currency || 'UZS',
      operator: data.operator || '',
      cardLast4: data.card_last4 || data.cardLast4 || '',
      isIncome: Boolean(transactionInfo.income),
      balance: data.balance ?? null,
      isP2p: Boolean(transactionInfo.isP2p),
      metadata: data.meta || {}
    };
  }

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
    const balance =
      balanceCandidate === null || Number.isNaN(balanceCandidate) ? null : balanceCandidate;

    const cardLast4 = normalizeCardLast4(parsedData.cardLast4 || parsedData.card_last4);
    const operatorName = parsedData.operator || '';

    // Ищем оператора в справочнике
    const operatorInfo = operatorName ? await Operator.findByPartialMatch(operatorName) : null;
    const app = operatorInfo ? operatorInfo.app_name : null;
    const isP2pResolved =
      parsedData.isP2p !== undefined
        ? parsedData.isP2p
        : operatorInfo
        ? operatorInfo.is_p2p
        : operatorName.toUpperCase().includes('P2P');

    const metadata = {
      ...(parsedData.metadata || {}),
      ...(options.metadata || {}),
      request_id: options.requestId
    };

    return {
      datetime: dateParts.datetimeForDb,
      weekday: dateParts.weekday,
      dateDisplay: dateParts.dateDisplay,
      timeDisplay: dateParts.timeDisplay,
      operator: operatorName,
      app,
      amount,
      balance,
      cardLast4: cardLast4 || parsedData.cardLast4 || parsedData.card_last4,
      isP2p: Boolean(isP2pResolved),
      transactionType: parsedData.transactionType,
      currency: parsedData.currency || 'UZS',
      source,
      rawText,
      addedVia: options.addedVia || 'bot',
      metadata
    };
  }

  async parseAndInsert(rawText, options = {}) {
    const requestId = randomUUID();
    const context = this.buildContext(rawText, options, requestId);
    const transactions = await this.parseTransactionsFromText(rawText, context);

    const created = [];
    const duplicates = [];

    for (const tx of transactions) {
      const payload = {
        ...tx,
        metadata: {
          ...(tx.metadata || {}),
          ...(context.metadata || {}),
          request_id: context.requestId
        },
        source_chat_id: context.sourceChatId,
        source_message_id: context.sourceMessageId,
        notify_message_id: context.notifyMessageId,
        source_bot_username: tx.source_bot_username || context.sourceBotUsername,
        source_bot_title: tx.source_bot_title || context.sourceBotTitle,
        source_app: tx.source_app || context.sourceApp || context.source
      };

      const duplicate = await Check.checkDuplicate({
        cardLast4: payload.cardLast4 || payload.card_last4,
        datetime: payload.datetime,
        amount: payload.amount,
        operator: payload.operator,
        transactionType: payload.transactionType
      });

      if (duplicate) {
        duplicates.push(duplicate);
        continue;
      }

      const payloadWithSource = {
        ...payload,
        sourceBotUsername: payload.source_bot_username || payload.sourceBotUsername,
        sourceBotTitle: payload.source_bot_title || payload.sourceBotTitle,
        sourceApp: payload.source_app || payload.sourceApp || context.source || null
      };

      const newCheck = await Check.create(payloadWithSource);
      created.push(newCheck);
      eventBus.emitCheckAdded(newCheck, payload.source || context.source);
      emitTxEvent({
        id: newCheck.id,
        check_id: newCheck.check_id,
        amount: newCheck.amount,
        currency: newCheck.currency,
        datetime: newCheck.datetime,
        operator: newCheck.operator,
        source: newCheck.source,
        card_last4: newCheck.card_last4,
        source_bot_username: newCheck.source_bot_username,
        source_chat_id: newCheck.source_chat_id
      });
    }

    if (created.length === 0) {
      throw new ParserError('DUPLICATE', 'Такие транзакции уже существуют', {
        requestId: context.requestId,
        duplicates
      });
    }

    return {
      created,
      duplicates,
      primary: created[0],
      requestId: context.requestId,
      source: context.source
    };
  }

  async parseMultipleReceipts(text, options = {}) {
    const context = this.buildContext(text, options, randomUUID());
    return this.parseTransactionsFromText(text, context);
  }

  async parseImageReceipt(input, context) {
    if (!input?.imageUrl) {
      throw new ParserError('NO_IMAGE', 'Не передана ссылка на изображение', {
        requestId: context.requestId
      });
    }

    const prompt = [
      {
        type: 'text',
        text: `Ты - эксперт по парсингу банковских уведомлений узбекских банков.
Твоя задача - извлечь структурированные данные из изображения транзакции.
Ответь валидным JSON со следующими ключами:
datetime, transactionType, amount, isIncome, currency, cardLast4, operator, balance.`
      },
      {
        type: 'image_url',
        image_url: {
          url: input.imageUrl,
          detail: 'high'
        }
      }
    ];

    const messages = [
      {
        role: 'system',
        content: 'Извлеки данные из банковского чека и верни JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const requestBody = {
      model: IMAGE_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0
    };

    const completion = await this.createCompletion(requestBody);
    const rawResponse = completion?.choices?.[0]?.message?.content || '';
    if (!rawResponse) {
      throw new ParserError('LLM_EMPTY', 'Модель не вернула результат', {
        requestId: context.requestId
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(
        rawResponse
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim()
      );
    } catch (error) {
      throw new ParserError('LLM_JSON_PARSE_ERROR', 'Некорректный JSON от модели', {
        requestId: context.requestId,
        raw: rawResponse
      });
    }

    const normalized = await this.postProcessData(
      {
        datetime: parsed.datetime,
        transactionType: parsed.transactionType || parsed.transaction_type,
        amount: parsed.amount,
        currency: parsed.currency,
        isIncome: parsed.isIncome,
        cardLast4: parsed.cardLast4 || parsed.card_last4,
        balance: parsed.balance,
        operator: parsed.operator,
        metadata: parsed.meta || {}
      },
      input.text || '',
      context.source,
      {
        ...context,
        strategy: 'image'
      }
    );

    return {
      ...normalized,
      strategy: 'image'
    };
  }

  async createCompletion(body, options = { allowFallback: true }) {
    try {
      return await this.runWithRetry(() => this.openai.chat.completions.create(body));
    } catch (error) {
      if (options.allowFallback && this.isResponseFormatUnsupported(error) && body.response_format) {
        const fallbackBody = { ...body };
        delete fallbackBody.response_format;
        console.warn('[ParserService] response_format unsupported, retrying without it');
        return this.createCompletion(fallbackBody, { allowFallback: false });
      }
      throw error;
    }
  }

  async runWithRetry(fn) {
    let attempt = 0;
    let lastError;
    while (attempt < MAX_ATTEMPTS) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt >= MAX_ATTEMPTS) {
          break;
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        console.warn(`[ParserService] attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
    throw lastError;
  }

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

    const parseMoney = (raw) => {
      if (raw === null || raw === undefined) {
        return null;
      }
      const normalized = String(raw).replace(/\s/g, '').replace(',', '.');
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    };

    const sanitizeOperatorName = (raw) => {
      if (!raw) {
        return null;
      }
      return String(raw).replace(/\s+/g, ' ').replace(/[.,]+$/, '').trim();
    };

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
            index
          },
          addedVia: 'bot',
          isIncome: false
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
            index
          },
          addedVia: 'bot',
          isIncome: true
        });
      }
    });

    return operations;
  }
}

module.exports = new ParserService();
