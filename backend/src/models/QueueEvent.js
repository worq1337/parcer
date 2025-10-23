const pool = require('../config/database');

/**
 * QueueEvent Model
 * patch-009: Модель для работы с событиями обработки чеков
 */
class QueueEvent {
  /**
   * Создать событие обработки чека
   * @param {UUID} checkId - ID чека
   * @param {string} stage - Стадия обработки (event_stage ENUM)
   * @param {string} source - Источник (telegram|sms|manual|import)
   * @param {object} options - Дополнительные параметры
   */
  static async create(checkId, stage, source, options = {}) {
    const query = `
      INSERT INTO queue_events (
        check_id, stage, status, source, message, payload
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      checkId,
      stage,
      options.status || 'ok',
      source,
      options.message || null,
      options.payload ? JSON.stringify(options.payload) : null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Получить все события по check_id
   */
  static async getByCheckId(checkId) {
    const result = await pool.query(
      'SELECT * FROM queue_events WHERE check_id = $1 ORDER BY created_at ASC',
      [checkId]
    );
    return result.rows;
  }

  /**
   * Получить последнее событие по check_id
   */
  static async getLastByCheckId(checkId) {
    const result = await pool.query(
      'SELECT * FROM queue_events WHERE check_id = $1 ORDER BY created_at DESC LIMIT 1',
      [checkId]
    );
    return result.rows[0];
  }

  /**
   * Получить список чеков с последними событиями (для админки)
   * @param {object} filters - Фильтры
   */
  static async getQueueList(filters = {}) {
    let query = `
      SELECT
        ql.check_id,
        ql.stage AS last_stage,
        ql.status AS last_status,
        ql.source,
        ql.message AS last_message,
        ql.created_at AS last_time,
        c.datetime,
        c.operator,
        c.amount,
        c.currency,
        c.card_last4,
        c.transaction_type,
        c.is_duplicate
      FROM queue_last ql
      LEFT JOIN checks c ON c.check_id = ql.check_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Фильтр по ошибкам
    if (filters.only_errors) {
      query += ` AND ql.status = 'error'`;
    }

    // Фильтр по источнику
    if (filters.source && filters.source !== 'all') {
      query += ` AND ql.source = $${paramIndex}`;
      params.push(filters.source);
      paramIndex++;
    }

    // Фильтр по периоду (from/to)
    if (filters.from) {
      query += ` AND ql.created_at >= $${paramIndex}`;
      params.push(filters.from);
      paramIndex++;
    }

    if (filters.to) {
      query += ` AND ql.created_at <= $${paramIndex}`;
      params.push(filters.to);
      paramIndex++;
    }

    // Поиск по check_id, карте или оператору
    if (filters.q) {
      query += ` AND (
        ql.check_id::text ILIKE $${paramIndex}
        OR c.card_last4 ILIKE $${paramIndex}
        OR c.operator ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.q}%`);
      paramIndex++;
    }

    // Сортировка
    query += ` ORDER BY ql.created_at DESC`;

    // Пагинация
    const limit = filters.limit || 200;
    const offset = filters.offset || 0;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    let result = await pool.query(query, params);

    const hasActiveFilters = Boolean(
      filters.only_errors ||
      (filters.source && filters.source !== 'all') ||
      filters.from ||
      filters.to ||
      filters.q
    );

    if (result.rows.length === 0 && !hasActiveFilters) {
      const inserted = await this.backfillMissing();
      if (inserted > 0) {
        result = await pool.query(query, params);
      }
    }

    // Получаем общее количество (для пагинации)
    let countQuery = `
      SELECT COUNT(*)
      FROM queue_last ql
      LEFT JOIN checks c ON c.check_id = ql.check_id
      WHERE 1=1
    `;
    const countParams = [];
    let countParamIndex = 1;

    if (filters.only_errors) {
      countQuery += ` AND ql.status = 'error'`;
    }

    if (filters.source && filters.source !== 'all') {
      countQuery += ` AND ql.source = $${countParamIndex}`;
      countParams.push(filters.source);
      countParamIndex++;
    }

    if (filters.from) {
      countQuery += ` AND ql.created_at >= $${countParamIndex}`;
      countParams.push(filters.from);
      countParamIndex++;
    }

    if (filters.to) {
      countQuery += ` AND ql.created_at <= $${countParamIndex}`;
      countParams.push(filters.to);
      countParamIndex++;
    }

    if (filters.q) {
      countQuery += ` AND (
        ql.check_id::text ILIKE $${countParamIndex}
        OR c.card_last4 ILIKE $${countParamIndex}
        OR c.operator ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${filters.q}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
      rows: result.rows,
      total
    };
  }

  /**
   * Получить статистику по стадиям
   */
  static async getStats(filters = {}) {
    let query = `
      SELECT
        stage,
        status,
        COUNT(*) as count,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM queue_events
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (filters.from) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.from);
      paramIndex++;
    }

    if (filters.to) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.to);
      paramIndex++;
    }

    query += ` GROUP BY stage, status ORDER BY stage, status`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Получить количество событий в очереди (в обработке)
   */
  static async getQueueLength() {
    const query = `
      SELECT COUNT(DISTINCT check_id) as length
      FROM queue_last
      WHERE stage NOT IN ('saved', 'failed_parse', 'failed_validation', 'failed_db')
    `;
    const result = await pool.query(query);
    return parseInt(result.rows[0].length);
  }

  /**
   * Получить количество ошибок
   */
  static async getErrorCount() {
    const query = `
      SELECT COUNT(DISTINCT check_id) as error_count
      FROM queue_last
      WHERE status = 'error'
    `;
    const result = await pool.query(query);
    return parseInt(result.rows[0].error_count);
  }

  /**
   * Пометить чек для повторной обработки
   */
  static async requeue(checkId, source = 'manual') {
    // Добавляем событие requeued
    return await this.create(checkId, 'requeued', source, {
      status: 'info',
      message: 'Check requeued for processing by admin'
    });
  }

  /**
   * Создать события для чеков, у которых ещё нет записей в очереди (backfill)
   */
  static async backfillMissing() {
    const query = `
      INSERT INTO queue_events (check_id, stage, status, source, message)
      SELECT
        c.check_id,
        'saved'::event_stage,
        'ok',
        LOWER(COALESCE(NULLIF(c.source, ''), 'manual')),
        'Backfilled queue event for existing check'
      FROM checks c
      WHERE c.check_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM queue_events qe WHERE qe.check_id = c.check_id
        )
    `;

    const result = await pool.query(query);
    return result.rowCount || 0;
  }

  /**
   * Удалить старые события (очистка)
   * @param {number} daysToKeep - Сколько дней хранить
   */
  static async cleanup(daysToKeep = 30) {
    const query = `
      DELETE FROM queue_events
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      RETURNING id
    `;
    const result = await pool.query(query);
    return result.rowCount;
  }
}

module.exports = QueueEvent;
