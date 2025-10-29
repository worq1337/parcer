/**
 * Модель BotMessage - сообщения от банковских ботов
 * Для чата с ботами в Telegram Userbot UI
 */

const pool = require('../config/database');

const STATUS_ALIASES = {
  unprocessed: 'new',
  pending: 'processing'
};

const normalizeStatus = (status) => STATUS_ALIASES[status] || status;

const statusFilterValues = (status) => {
  if (!status || status === 'all') {
    return null;
  }
  if (status === 'new') {
    return ['new', 'unprocessed'];
  }
  if (status === 'processing') {
    return ['processing', 'pending'];
  }
  return [status];
};

class BotMessage {
  /**
   * Получить все сообщения от конкретного бота
   * @param {number} botId - ID бота
   * @param {object} options - Опции фильтрации
   * @param {string} options.status - Фильтр по статусу (new, processed, processing, error)
   * @param {number} options.limit - Количество сообщений
   * @param {number} options.offset - Смещение для пагинации
   * @returns {Promise<{messages: Array, total: number, hasMore: boolean}>}
   */
  static async getByBotId(botId, options = {}) {
    const {
      status,
      limit = 50,
      offset = 0,
      beforeMessageId
    } = options;
    const chatId = String(botId);

    let beforeTimestamp = null;
    if (beforeMessageId) {
      const anchor = await pool.query(
        'SELECT timestamp FROM bot_messages WHERE chat_id = $1 AND message_id = $2 LIMIT 1',
        [chatId, String(beforeMessageId)]
      );
      if (anchor.rows[0]?.timestamp) {
        beforeTimestamp = anchor.rows[0].timestamp;
      }
    }

    const params = [chatId];
    const statusValues = statusFilterValues(status);
    let query = `
      SELECT
        id,
        bot_id,
        telegram_message_id,
        chat_id,
        message_id,
        timestamp,
        status,
        text,
        data,
        error,
        sheet_url,
        process_attempts,
        created_at,
        updated_at
      FROM bot_messages
      WHERE chat_id = $1
    `;

    if (statusValues) {
      query += ` AND status = ANY($${params.length + 1}::text[])`;
      params.push(statusValues);
    }

    if (beforeTimestamp) {
      query += ` AND timestamp < $${params.length + 1}`;
      params.push(beforeTimestamp);
    }

    query += ' ORDER BY timestamp DESC';

    if (beforeTimestamp) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(limit, 10));
    } else {
      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit, 10), parseInt(offset, 10));
    }

    const result = await pool.query(query, params);
    const rows = result.rows.map((row) => ({
      ...row,
      status: normalizeStatus(row.status)
    }));

    let total = null;
    let hasMore = false;
    if (!beforeTimestamp) {
      let countQuery = 'SELECT COUNT(*) as total FROM bot_messages WHERE chat_id = $1';
      const countParams = [chatId];
      if (statusValues) {
        countQuery += ' AND status = ANY($2::text[])';
        countParams.push(statusValues);
      }
      const countResult = await pool.query(countQuery, countParams);
      total = parseInt(countResult.rows[0].total, 10);
      hasMore = offset + rows.length < total;
    } else {
      hasMore = rows.length === parseInt(limit, 10);
    }

    const nextCursor = rows.length ? rows[rows.length - 1].message_id : null;

    return {
      messages: rows,
      total,
      hasMore,
      nextCursor
    };
  }

  /**
   * Получить сообщение по ID
   */
  static async getById(id) {
    const result = await pool.query(
      'SELECT * FROM bot_messages WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByChatAndMessage(chatId, messageId) {
    if (!chatId || !messageId) {
      return null;
    }
    const result = await pool.query(
      'SELECT * FROM bot_messages WHERE chat_id = $1 AND message_id = $2 LIMIT 1',
      [String(chatId), String(messageId)]
    );
    return result.rows[0] || null;
  }

  static async updateStatusByChatMessage(chatId, messageId, status, data = {}) {
    const record = await this.findByChatAndMessage(chatId, messageId);
    if (!record) {
      return null;
    }
    return this.updateStatus(record.id, status, data);
  }

  static async linkToTransaction(chatId, messageId, transactionId) {
    const record = await this.findByChatAndMessage(chatId, messageId);
    if (!record) {
      return null;
    }

    let payload = {};
    if (record.data) {
      try {
        payload = typeof record.data === 'object' ? record.data : JSON.parse(record.data);
      } catch (error) {
        payload = {};
      }
    }

    payload.tx_id = transactionId;
    return this.updateData(record.id, payload);
  }

  /**
   * Создать новое сообщение
   */
  static async create(messageData) {
    const {
      bot_id,
      telegram_message_id,
      chat_id,
      message_id,
      timestamp,
      text,
      status = 'new',
      data = null,
      error = null
    } = messageData;

    const resolvedChatId = chat_id ?? bot_id ?? messageData.chatId ?? messageData.botId;
    const resolvedMessageId = message_id ?? telegram_message_id ?? messageData.messageId;

    if (resolvedChatId == null) {
      throw new Error('chat_id is required to create bot message');
    }

    const result = await pool.query(
      `INSERT INTO bot_messages
        (bot_id, telegram_message_id, chat_id, message_id, timestamp, text, status, data, error, process_attempts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
      RETURNING *`,
      [
        resolvedChatId != null ? String(resolvedChatId) : null,
        resolvedMessageId != null ? String(resolvedMessageId) : null,
        String(resolvedChatId),
        resolvedMessageId != null ? String(resolvedMessageId) : null,
        timestamp,
        text,
        status,
        data ? JSON.stringify(data) : null,
        error
      ]
    );

    return result.rows[0];
  }

  /**
   * Обновить статус сообщения
   */
  static async updateStatus(id, status, data = {}) {
    const { error = null, sheet_url = null } = data;
    const attemptDelta = status === 'new' ? 0 : 1;

    const result = await pool.query(
      `UPDATE bot_messages
      SET status = $1,
          error = $2,
          sheet_url = $3,
          process_attempts = process_attempts + $5,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [status, error, sheet_url, id, attemptDelta]
    );

    return result.rows[0];
  }

  /**
   * Обновить извлеченные данные (data)
   */
  static async updateData(id, data) {
    const result = await pool.query(
      `UPDATE bot_messages
      SET data = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
      [JSON.stringify(data), id]
    );

    return result.rows[0];
  }

  /**
   * Получить статистику по боту
   */
  static async getStatsByBotId(botId) {
    const chatId = String(botId);
    const result = await pool.query(
      `SELECT
        status,
        COUNT(*) as count
      FROM bot_messages
      WHERE chat_id = $1
      GROUP BY status`,
      [chatId]
    );

    const stats = {
      processed: 0,
      processing: 0,
      error: 0,
      new: 0
    };

    result.rows.forEach((row) => {
      const key = normalizeStatus(row.status);
      if (stats[key] !== undefined) {
        stats[key] = parseInt(row.count, 10);
      }
    });

    return stats;
  }

  /**
   * Массовое обновление статусов
   */
  static async updateMultipleStatuses(messageIds, status) {
    const result = await pool.query(
      `UPDATE bot_messages
      SET status = $1,
          process_attempts = CASE WHEN $1 = 'new' THEN process_attempts ELSE process_attempts + 1 END,
          updated_at = NOW()
      WHERE id = ANY($2::uuid[])
      RETURNING id`,
      [status, messageIds]
    );

    return result.rows.length;
  }

  /**
   * Удалить сообщение
   */
  static async delete(id) {
    await pool.query('DELETE FROM bot_messages WHERE id = $1', [id]);
  }

  /**
   * Получить последние N сообщений (для реал-тайм обновлений)
   */
  static async getRecent(botId, limit = 10) {
    const chatId = String(botId);
    const result = await pool.query(
      `SELECT * FROM bot_messages
      WHERE chat_id = $1
      ORDER BY timestamp DESC
      LIMIT $2`,
      [chatId, limit]
    );

    return result.rows;
  }
}

module.exports = BotMessage;
