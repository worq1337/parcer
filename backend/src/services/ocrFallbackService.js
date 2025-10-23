const OpenAI = require('openai');
const parserService = require('./parserService');

const DEFAULT_MODEL = process.env.OCR_FALLBACK_MODEL || process.env.OPENAI_MODEL || 'gpt-4o';

const JSON_SCHEMA = {
  name: 'ocr_result',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'confidence', 'fields'],
    properties: {
      text: { type: 'string' },
      confidence: { type: 'number' },
      fields: {
        type: 'object',
        additionalProperties: false,
        required: [
          'datetime',
          'transactionType',
          'amount',
          'isIncome',
          'currency',
          'cardLast4'
        ],
        properties: {
          datetime: { type: 'string' },
          transactionType: { type: 'string' },
          amount: { type: ['number', 'string'] },
          isIncome: { type: 'boolean' },
          currency: { type: 'string' },
          cardLast4: { type: 'string' },
          operator: { type: 'string' },
          balance: { type: ['number', 'string', 'null'] },
          confidence: { type: ['number', 'null'] }
        }
      }
    }
  },
  strict: true
};

class OcrFallbackService {
  constructor() {
    this.enabled = process.env.OCR_FALLBACK_ENABLED !== 'false';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      this.enabled = false;
      return;
    }

    this.openai = new OpenAI({ apiKey });
  }

  isEnabled() {
    return this.enabled && Boolean(this.openai);
  }

  /**
   * Выполнить распознавание чека через GPT-визион
   * @param {Object} options
   * @param {string} options.imageBase64 - изображение в base64
   * @param {string} options.source - источник (telegram/manual)
   * @param {string} [options.mimeType] - MIME тип изображения
   * @param {Object} [options.meta] - доп. данные для логирования
   */
  async processImage({ imageBase64, source = 'manual', mimeType = 'image/png', meta = {} }) {
    if (!this.isEnabled()) {
      return {
        success: false,
        status: 'error',
        error: 'OCR fallback отключён: отсутствует OPENAI_API_KEY или установлен OCR_FALLBACK_ENABLED=false'
      };
    }

    try {
      const prompt = this.buildPrompt(meta);
      const response = await this.callModel({
        model: DEFAULT_MODEL,
        temperature: 0.1,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content: 'Ты OCR-ассистент. Извлекай текст чеков и возвращай только корректный JSON.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: 'auto'
                }
              }
            ]
          }
        ]
      });

      const rawMessage = this.extractText(response);
      const cleaned = this.cleanJsonString(rawMessage);
      const parsed = JSON.parse(cleaned);

      if (!parsed?.fields) {
        throw new Error('Модель не вернула необходимые поля');
      }

      const ocrText = (parsed.text || '').trim();
      const fields = this.normalizeFields(parsed.fields);
      const processedData = await parserService.postProcessData(fields, ocrText, source);

      return {
        success: true,
        status: 'parsed',
        ocr_result: {
          text: ocrText,
          confidence: this.normalizeConfidence(parsed.confidence)
        },
        parsed_data: {
          classifier: 'GPTVisionFallback',
          confidence: this.normalizeConfidence(parsed.fields?.confidence ?? parsed.confidence),
          data: processedData
        },
        preprocessing: {
          steps_applied: ['gpt-vision'],
          note: 'Primary OCR fallback'
        }
      };
    } catch (error) {
      const message = error?.message || 'Неизвестная ошибка GPT OCR fallback';
      console.error('GPT OCR fallback failed:', message);
      return {
        success: false,
        status: 'error',
        error: `OCR fallback ошибка: ${message}`
      };
    }
  }

  async callModel(options, { useSchema = true } = {}) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialised');
    }

    const payload = {
      ...options,
      response_format: useSchema ? { type: 'json_object' } : undefined
    };

    if (!useSchema) {
      delete payload.response_format;
    }

    try {
      return await this.openai.chat.completions.create(payload);
    } catch (error) {
      if (useSchema && this.isResponseFormatUnsupported(error)) {
        console.warn(`Model ${DEFAULT_MODEL} does not support json_object response. Retrying without schema.`);
        return this.callModel(options, { useSchema: false });
      }

      if (this.isRateLimitError(error)) {
        throw new Error('OpenAI rate limit exceeded for OCR fallback.');
      }

      throw error;
    }
  }

  extractText(response) {
    if (!response) return '';

    // Standard chat.completions API response format
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return content;
    }

    return '';
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

  buildPrompt(meta) {
    const hints = [];
    if (meta?.bank) {
      hints.push(`Банк: ${meta.bank}`);
    }
    if (meta?.locale) {
      hints.push(`Локаль: ${meta.locale}`);
    }

    return [
      'Проанализируй изображение банковского чека и верни JSON строго такого вида:',
      '',
      '{',
      '  "text": "полный распознанный текст без форматирования",',
      '  "confidence": 0-100,',
      '  "fields": {',
      '    "datetime": "YYYY-MM-DD HH:MM:SS",',
      '    "transactionType": "Оплата|Пополнение|Списание|Платеж|Перевод|Конверсия|Возврат|Операция",',
      '    "amount": число без форматирования (только цифры и точка),',
      '    "isIncome": true|false,',
      '    "currency": "UZS|USD|RUB|..."',
      '    "cardLast4": "1234",',
      '    "operator": "название продавца/банка/отправителя",',
      '    "balance": число или null',
      '  }',
      '}',
      '',
      '⚠️ КРИТИЧЕСКИ ВАЖНО ДЛЯ РАСПОЗНАВАНИЯ СУММ:',
      '- amount должен быть ЧИСЛОМ БЕЗ ФОРМАТИРОВАНИЯ: 1650000.00 (НЕ "1,650,000.00")',
      '- Запятые, пробелы, апострофы в суммах - это разделители тысяч, НЕ десятичные!',
      '- Примеры правильного распознавания:',
      '  • "1,650,000.00 UZS" -> amount: 1650000',
      '  • "1 650 000.00" -> amount: 1650000',
      '  • "150\'000.50" -> amount: 150000.50',
      '  • "250,00" -> amount: 250',
      '',
      '📝 P2P ПЕРЕВОДЫ (если в чеке есть Sender и Receiver):',
      '- Если видишь "Sender"/"Receiver" или "Отправитель"/"Получатель" - это P2P перевод',
      '- transactionType должен быть "Перевод"',
      '- amount берём из "Receiver amount" (сумма получателя)',
      '- cardLast4 - последние 4 цифры карты Receiver (получателя)',
      '- operator - имя Sender (отправителя) если isIncome=true, иначе имя Receiver',
      '',
      'Общие требования:',
      '- Дай дату и время полностью (год 4 цифры, часы/минуты/секунды 2 цифры).',
      '- Если дата не указана, оцени её по контексту и укажи в формате YYYY-MM-DD HH:MM:SS.',
      '- amount всегда положительное число, isIncome определяет знак (false -> расход).',
      '- cardLast4 только цифры без пробелов, если нет, поставь "0000".',
      '- Если уверенность низкая, все равно заполни поля, но поставь confidence <= 40.',
      '- Возвращай только JSON без комментариев.',
      '',
      hints.length ? `Подсказки: ${hints.join(', ')}` : ''
    ].join('\n');
  }

  cleanJsonString(value) {
    return value
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  normalizeFields(fields) {
    const safeAmount = Number.parseFloat(fields.amount);
    const amount = Number.isFinite(safeAmount) ? Math.abs(safeAmount) : 0;

    return {
      datetime: fields.datetime,
      transactionType: fields.transactionType || 'Операция',
      amount,
      isIncome: Boolean(fields.isIncome),
      currency: fields.currency || 'UZS',
      cardLast4: this.normalizeCard(fields.cardLast4),
      operator: fields.operator || 'Неизвестно',
      balance: this.normalizeOptionalNumber(fields.balance)
    };
  }

  normalizeCard(value) {
    if (!value) {
      return '0000';
    }
    const digits = String(value).replace(/\D/g, '');
    if (digits.length >= 4) {
      return digits.slice(-4);
    }
    return digits.padStart(4, '0');
  }

  normalizeOptionalNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }

  normalizeConfidence(value) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
      return 55;
    }
    return Math.max(1, Math.min(100, Math.round(num)));
  }
}

module.exports = new OcrFallbackService();
