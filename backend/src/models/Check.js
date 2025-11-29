const pool = require('../config/database');
const { detectSource, normalizeExplicitSource } = require('../utils/detectSource');
const { resolveDateParts } = require('../utils/datetime');
const { normalizeCardLast4 } = require('../utils/card');
const { computeFingerprint } = require('../utils/fingerprint');

const DEDUP_WINDOW_SECONDS = (() => {
  const raw = parseInt(process.env.DEDUP_WINDOW_SECONDS || '300', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
})();

class Check {
  /**
   * Получить все чеки с возможностью фильтрации
   * patch-008: возвращает check_id, is_duplicate, duplicate_of_id
   * patch-017 §3: сортировка от старой даты к новой + динамическая нумерация
   */
  static async getAll(filters = {}) {
    // patch-017 §3: используем подзапрос с ROW_NUMBER() для динамической нумерации
    let subQuery = 'SELECT *, ROW_NUMBER() OVER (ORDER BY datetime ASC) as row_num FROM checks WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Фильтр по дате
    if (filters.dateFrom) {
      subQuery += ` AND datetime >= $${paramIndex}`;
      params.push(filters.dateFrom);
      paramIndex++;
    }
    if (filters.dateTo) {
      subQuery += ` AND datetime <= $${paramIndex}`;
      params.push(filters.dateTo);
      paramIndex++;
    }

    // Фильтр по карте
    if (filters.cardLast4) {
      subQuery += ` AND card_last4 = $${paramIndex}`;
      params.push(filters.cardLast4);
      paramIndex++;
    }

    // Фильтр по типу транзакции
    if (filters.transactionType) {
      subQuery += ` AND transaction_type = $${paramIndex}`;
      params.push(filters.transactionType);
      paramIndex++;
    }

    // Фильтр по оператору
    if (filters.operator) {
      subQuery += ` AND operator ILIKE $${paramIndex}`;
      params.push(`%${filters.operator}%`);
      paramIndex++;
    }

    // Фильтр по приложению
    if (filters.app) {
      subQuery += ` AND app = $${paramIndex}`;
      params.push(filters.app);
      paramIndex++;
    }

    // Фильтр по P2P
    if (filters.isP2p !== undefined) {
      subQuery += ` AND is_p2p = $${paramIndex}`;
      params.push(filters.isP2p);
      paramIndex++;
    }

    if (filters.updatedAfter) {
      subQuery += ` AND updated_at >= $${paramIndex}`;
      params.push(filters.updatedAfter);
      paramIndex++;
    }

    // patch-017 §3: сортировка от старой даты к новой (ASC вместо DESC)
    const query = `SELECT * FROM (${subQuery}) AS numbered_checks ORDER BY datetime ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Получить чек по ID
   */
  static async getById(id) {
    const result = await pool.query('SELECT * FROM checks WHERE id = $1', [id]);
    return result.rows[0];
  }

  /**
   * Получить чек по check_id (UUID)
   * patch-008: новый метод для получения по UUID
   */
  static async getByCheckId(checkId) {
    const result = await pool.query('SELECT * FROM checks WHERE check_id = $1', [checkId]);
    return result.rows[0];
  }

  /**
   * Найти чек по отпечатку (fingerprint)
   */
  static async findByFingerprint(fingerprint) {
    if (!fingerprint) {
      return null;
    }
    const result = await pool.query(
      'SELECT * FROM checks WHERE fingerprint = $1 LIMIT 1',
      [fingerprint]
    );
    return result.rows[0] || null;
  }

  /**
   * Получить последние N чеков
   * patch-017 §1: для команды /last в Telegram боте
   */
  static async getRecent(limit = 5) {
    const query = `
      SELECT * FROM checks
      ORDER BY datetime DESC
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Создать новый чек
   * patch-008: check_id генерируется автоматически как UUID
   */
  static async create(checkData) {
    const cardLast4 = normalizeCardLast4(checkData.cardLast4 || checkData.card_last4);
    if (!cardLast4) {
      throw new Error('Card last 4 digits are required');
    }

    const dateInput =
      checkData.datetime ||
      checkData.datetimeUtc ||
      checkData.datetime_local ||
      checkData.datetime_localized ||
      new Date();
    const dateParts = resolveDateParts(dateInput);

    const weekday = checkData.weekday || dateParts.weekday;
    const dateDisplay = checkData.dateDisplay || checkData.date_display || dateParts.dateDisplay;
    const timeDisplay = checkData.timeDisplay || checkData.time_display || dateParts.timeDisplay;

    const explicitNormalized = normalizeExplicitSource(
      checkData.explicit ||
      checkData.source ||
      checkData.addedVia
    );
    const resolvedSource = detectSource({
      explicit: explicitNormalized,
      text: checkData.rawText || checkData.raw_text,
    });

    const amountValue = Number(checkData.amount);
    if (!Number.isFinite(amountValue)) {
      throw new Error('Amount is required');
    }

    const balanceValue =
      checkData.balance !== null && checkData.balance !== undefined
        ? Number(checkData.balance)
        : null;

    const rawTextValue = checkData.rawText ?? checkData.raw_text ?? null;
    let metadataValue = null;
    let metadataObject = null;
    if (checkData.metadata) {
      if (typeof checkData.metadata === 'string') {
        metadataValue = checkData.metadata;
        try {
          metadataObject = JSON.parse(checkData.metadata);
        } catch (error) {
          metadataObject = null;
        }
      } else {
        metadataObject = checkData.metadata;
        metadataValue = JSON.stringify(checkData.metadata);
      }
    }

    const sourceChatId =
      checkData.sourceChatId ||
      checkData.source_chat_id ||
      metadataObject?.chat_id ||
      null;
    const sourceMessageId =
      checkData.sourceMessageId ||
      checkData.source_message_id ||
      metadataObject?.message_id ||
      metadataObject?.telegram_message_id ||
      null;
    const notifyMessageId =
      checkData.notifyMessageId ||
      checkData.notify_message_id ||
      null;
    const sourceBotUsername =
      checkData.sourceBotUsername ||
      checkData.source_bot_username ||
      metadataObject?.bot_username ||
      null;
    const sourceBotTitle =
      checkData.sourceBotTitle ||
      checkData.source_bot_title ||
      metadataObject?.bot_title ||
      null;
    const sourceApp =
      checkData.sourceApp ||
      checkData.source_app ||
      explicitNormalized ||
      null;

    const fingerprint = computeFingerprint({
      datetime: dateParts.datetimeForDb,
      amount: amountValue,
      cardLast4,
      operator: checkData.operator,
      transactionType: checkData.transactionType,
    });

    const query = `
      INSERT INTO checks (
        datetime, weekday, date_display, time_display,
        operator, app, amount, balance, card_last4,
        is_p2p, transaction_type, currency,
        source, raw_text, metadata, added_via,
        source_chat_id, source_message_id, source_bot_username, source_bot_title,
        source_app, notify_message_id, fingerprint
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING *
    `;

    const values = [
      dateParts.datetimeForDb,
      weekday,
      dateDisplay,
      timeDisplay,
      checkData.operator,
      checkData.app || null,
      amountValue,
      balanceValue,
      cardLast4,
      checkData.isP2p || false,
      checkData.transactionType,
      checkData.currency || 'UZS',
      resolvedSource,
      rawTextValue,
      metadataValue,
      checkData.addedVia || 'manual',
      sourceChatId,
      sourceMessageId,
      sourceBotUsername,
      sourceBotTitle,
      sourceApp,
      notifyMessageId,
      fingerprint,
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'idx_checks_fingerprint_unique' && fingerprint) {
        const existing = await this.findByFingerprint(fingerprint);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Обновить чек
   */
  static async update(idOrCheckId, checkData) {
    const maybeId = Number(idOrCheckId);
    const isNumericId = Number.isFinite(maybeId) && !Number.isNaN(maybeId);
    const currentCheck = isNumericId
      ? await this.getById(maybeId)
      : await this.getByCheckId(idOrCheckId);
    if (!currentCheck) {
      throw new Error('Check not found');
    }

    // Объединяем текущие данные с обновлениями
    const pick = (value, fallback) => (value !== undefined ? value : fallback);

    const nextDatetimeInput = pick(checkData.datetime, currentCheck.datetime);
    const nextDateParts = resolveDateParts(nextDatetimeInput);

    const nextWeekday = pick(
      checkData.weekday,
      currentCheck.weekday || nextDateParts.weekday
    );
    const nextDateDisplay = pick(
      checkData.dateDisplay,
      currentCheck.date_display || nextDateParts.dateDisplay
    );
    const nextTimeDisplay = pick(
      checkData.timeDisplay,
      currentCheck.time_display || nextDateParts.timeDisplay
    );

    const nextCardLast4 = normalizeCardLast4(
      pick(
        checkData.cardLast4,
        pick(checkData.card_last4, currentCheck.card_last4)
      )
    );
    if (!nextCardLast4) {
      throw new Error('Card last 4 digits are required');
    }

    const requestedAmount =
      checkData.amount !== undefined ? Number(checkData.amount) : undefined;
    if (requestedAmount !== undefined && Number.isNaN(requestedAmount)) {
      throw new Error('Amount must be a number');
    }
    const currentAmount =
      currentCheck.amount !== undefined && currentCheck.amount !== null
        ? Number(currentCheck.amount)
        : 0;
    const nextAmount =
      requestedAmount !== undefined ? requestedAmount : currentAmount;

    const balanceCandidate = pick(checkData.balance, currentCheck.balance);
    const nextBalance =
      balanceCandidate === null || balanceCandidate === undefined
        ? null
        : Number(balanceCandidate);

    if (nextBalance !== null && Number.isNaN(nextBalance)) {
      throw new Error('Balance must be a number');
    }

    const nextRawText = pick(
      checkData.rawText,
      pick(checkData.raw_text, currentCheck.raw_text)
    );

    const nextMetadataRaw = pick(checkData.metadata, currentCheck.metadata);
    let metadataValue = null;
    let metadataObject = null;
    if (nextMetadataRaw) {
      if (typeof nextMetadataRaw === 'string') {
        metadataValue = nextMetadataRaw;
        try {
          metadataObject = JSON.parse(nextMetadataRaw);
        } catch (error) {
          metadataObject = null;
        }
      } else {
        metadataObject = nextMetadataRaw;
        metadataValue = JSON.stringify(nextMetadataRaw);
      }
    }

    const nextOperator = pick(checkData.operator, currentCheck.operator);
    const nextTransactionType = pick(checkData.transactionType, currentCheck.transaction_type);

    const nextSourceChatId = pick(
      checkData.sourceChatId,
      pick(checkData.source_chat_id, currentCheck.source_chat_id || metadataObject?.chat_id || null)
    );
    const nextSourceMessageId = pick(
      checkData.sourceMessageId,
      pick(
        checkData.source_message_id,
        currentCheck.source_message_id ||
          metadataObject?.message_id ||
          metadataObject?.telegram_message_id ||
          null
      )
    );
    const nextNotifyMessageId = pick(
      checkData.notifyMessageId,
      pick(checkData.notify_message_id, currentCheck.notify_message_id || null)
    );
    const nextSourceBotUsername = pick(
      checkData.sourceBotUsername,
      pick(checkData.source_bot_username, currentCheck.source_bot_username || metadataObject?.bot_username || null)
    );
    const nextSourceBotTitle = pick(
      checkData.sourceBotTitle,
      pick(checkData.source_bot_title, currentCheck.source_bot_title || metadataObject?.bot_title || null)
    );

    // CRITICAL FIX: Normalize source BEFORE using it in nextSourceApp
    const updatedSourceExplicit = normalizeExplicitSource(
      pick(checkData.source, currentCheck.source)
    );
    const resolvedSource = detectSource({
      explicit: updatedSourceExplicit,
      text: nextRawText || currentCheck.raw_text,
    });

    const nextSourceApp = pick(
      checkData.sourceApp,
      pick(checkData.source_app, currentCheck.source_app || updatedSourceExplicit || null)
    );

    const nextFingerprint = computeFingerprint({
      datetime: nextDateParts.datetimeForDb,
      amount: nextAmount,
      cardLast4: nextCardLast4,
      operator: nextOperator,
      transactionType: nextTransactionType,
    }) || currentCheck.fingerprint;

    const updatedData = {
      datetime: nextDateParts.datetimeForDb,
      weekday: nextWeekday,
      dateDisplay: nextDateDisplay,
      timeDisplay: nextTimeDisplay,
      operator: pick(checkData.operator, currentCheck.operator),
      app: pick(checkData.app, currentCheck.app),
      amount: nextAmount,
      balance: nextBalance,
      cardLast4: nextCardLast4,
      isP2p: pick(checkData.isP2p, currentCheck.is_p2p),
      transactionType: pick(checkData.transactionType, currentCheck.transaction_type),
      currency: pick(checkData.currency, currentCheck.currency),
      source: resolvedSource,
      rawText: nextRawText,
      metadata: metadataValue,
      sourceChatId: nextSourceChatId,
      sourceMessageId: nextSourceMessageId,
      sourceBotUsername: nextSourceBotUsername,
      sourceBotTitle: nextSourceBotTitle,
      sourceApp: nextSourceApp,
      notifyMessageId: nextNotifyMessageId,
      fingerprint: nextFingerprint,
    };

    const query = `
      UPDATE checks SET
        datetime = $1, weekday = $2, date_display = $3, time_display = $4,
        operator = $5, app = $6, amount = $7, balance = $8, card_last4 = $9,
        is_p2p = $10, transaction_type = $11, currency = $12,
        source = $13, raw_text = $14, metadata = $15,
        source_chat_id = $16, source_message_id = $17,
        source_bot_username = $18, source_bot_title = $19,
        source_app = $20, notify_message_id = $21, fingerprint = $22
      WHERE id = $23
      RETURNING *
    `;

    const targetId = currentCheck.id;

    const values = [
      updatedData.datetime,
      updatedData.weekday,
      updatedData.dateDisplay,
      updatedData.timeDisplay,
      updatedData.operator,
      updatedData.app,
      updatedData.amount,
      updatedData.balance,
      updatedData.cardLast4,
      updatedData.isP2p,
      updatedData.transactionType,
      updatedData.currency,
      updatedData.source,
      updatedData.rawText,
      updatedData.metadata,
      updatedData.sourceChatId,
      updatedData.sourceMessageId,
      updatedData.sourceBotUsername,
      updatedData.sourceBotTitle,
      updatedData.sourceApp,
      updatedData.notifyMessageId,
      updatedData.fingerprint,
      targetId
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      if (error?.code === '23505' && error?.constraint === 'idx_checks_fingerprint_unique' && updatedData.fingerprint) {
        const existing = await this.findByFingerprint(updatedData.fingerprint);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Удалить чек
   */
  static async delete(id) {
    const result = await pool.query('DELETE FROM checks WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  /**
   * Проверить существование дубликата
   * patch-008: также проверяет поле is_duplicate
   */
  static async checkDuplicate(payload = {}) {
    const normalizedCard = normalizeCardLast4(payload.cardLast4 || payload.card_last4);
    if (!normalizedCard) {
      return null;
    }

    const fingerprint = computeFingerprint({
      datetime: payload.datetime,
      amount: payload.amount,
      cardLast4: normalizedCard,
      operator: payload.operator,
      transactionType: payload.transactionType,
    });

    if (fingerprint) {
      const existingByFingerprint = await this.findByFingerprint(fingerprint);
      if (existingByFingerprint) {
        return existingByFingerprint;
      }
    }

    const normalizedDate = resolveDateParts(payload.datetime).datetimeForDb;
    const normalizedAmount = Number(payload.amount);
    if (!Number.isFinite(normalizedAmount)) {
      return null;
    }
    const dedupWindow = DEDUP_WINDOW_SECONDS;

    const query = `
      SELECT * FROM checks
      WHERE card_last4 = $1
      AND datetime BETWEEN ($2::timestamp - ($4 * INTERVAL '1 second')) AND ($2::timestamp + ($4 * INTERVAL '1 second'))
      AND ABS(amount) = ABS($3)
      AND is_duplicate = false
      LIMIT 1
    `;
    const result = await pool.query(
      query,
      [normalizedCard, normalizedDate, normalizedAmount, dedupWindow]
    );
    return result.rows[0];
  }

  /**
   * Пометить чек как дубликат
   * patch-008: новый метод для отметки дубликатов
   */
  static async markAsDuplicate(checkId, originalCheckId) {
    const query = `
      UPDATE checks SET
        is_duplicate = true,
        duplicate_of_id = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [checkId, originalCheckId]);
    return result.rows[0];
  }

  /**
   * Массовое создание чеков (для импорта)
   */
  static async bulkCreate(checksData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const createdChecks = [];
      const duplicates = [];

      for (const checkData of checksData) {
        // Проверка на дубликат
        const duplicate = await this.checkDuplicate({
          cardLast4: checkData.cardLast4 || checkData.card_last4,
          datetime: checkData.datetime,
          amount: checkData.amount,
          operator: checkData.operator,
          transactionType: checkData.transactionType,
        });

        if (duplicate) {
          duplicates.push(checkData);
          continue;
        }

        const result = await this.create(checkData);
        createdChecks.push(result);
      }

      await client.query('COMMIT');
      return { createdChecks, duplicates };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = Check;
