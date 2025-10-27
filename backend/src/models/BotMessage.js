/**
 * Модель BotMessage - сообщения от банковских ботов
 * Для чата с ботами в Telegram Userbot UI
 */

const pool = require('../config/database');

class BotMessage {
  /**
   * Получить все сообщения от конкретного бота
   * @param {number} botId - ID бота
   * @param {object} options - Опции фильтрации
   * @param {string} options.status - Фильтр по статусу (unprocessed, processed, pending, error)
   * @param {number} options.limit - Количество сообщений
   * @param {number} options.offset - Смещение для пагинации
   * @returns {Promise<{messages: Array, total: number, hasMore: boolean}>}
   */
  static async getByBotId(botId, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const chatId = String(botId);

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

    const params = [chatId];

    // Добавляем фильтр по статусу если указан
    if (status && status !== 'all') {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    // Сортировка: новые сверху
    query += ` ORDER BY timestamp DESC`;

    // Пагинация
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Подсчитать общее количество (для hasMore)
    let countQuery = 'SELECT COUNT(*) as total FROM bot_messages WHERE chat_id = $1';
    const countParams = [chatId];
    if (status && status !== 'all') {
      countQuery += ' AND status = $2';
      countParams.push(status);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return {
      messages: result.rows,
      total,
      hasMore: offset + result.rows.length < total
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
      status = 'unprocessed',
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

    const result = await pool.query(
      `UPDATE bot_messages
      SET status = $1,
          error = $2,
          sheet_url = $3,
          process_attempts = process_attempts + 1,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [status, error, sheet_url, id]
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
      pending: 0,
      error: 0,
      unprocessed: 0
    };

    result.rows.forEach(row => {
      if (row.status in stats) {
        stats[row.status] = parseInt(row.count);
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
          process_attempts = process_attempts + 1,
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
