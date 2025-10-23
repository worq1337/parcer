const pool = require('../config/database');
const crypto = require('crypto');

/**
 * ETL Log Model
 * patch-008: модель для логирования ETL процессов
 */
class ETLLog {
  /**
   * Создать запись лога
   * @param {string} taskId - ID задачи
   * @param {string} stage - Стадия: received, normalized, matched, recorded
   * @param {string} status - Статус: success, error, warning
   * @param {object} options - Дополнительные параметры
   */
  static async create(taskId, stage, status, options = {}) {
    const query = `
      INSERT INTO etl_log (
        task_id, check_id, stage, status, message,
        payload_hash, error_details, processing_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      taskId,
      options.checkId || null,
      stage,
      status,
      options.message || null,
      options.payloadHash || null,
      options.errorDetails ? JSON.stringify(options.errorDetails) : null,
      options.processingTimeMs || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Получить логи по task_id
   */
  static async getByTaskId(taskId) {
    const result = await pool.query(
      'SELECT * FROM etl_log WHERE task_id = $1 ORDER BY created_at DESC',
      [taskId]
    );
    return result.rows;
  }

  /**
   * Получить логи по check_id
   */
  static async getByCheckId(checkId) {
    const result = await pool.query(
      'SELECT * FROM etl_log WHERE check_id = $1 ORDER BY created_at DESC',
      [checkId]
    );
    return result.rows;
  }

  /**
   * Получить последние логи
   */
  static async getRecent(limit = 100, filters = {}) {
    let query = 'SELECT * FROM etl_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.stage) {
      query += ` AND stage = $${paramIndex}`;
      params.push(filters.stage);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Получить статистику по логам
   */
  static async getStats(filters = {}) {
    let query = `
      SELECT
        stage,
        status,
        COUNT(*) as count,
        AVG(processing_time_ms) as avg_processing_time,
        MIN(created_at) as earliest,
        MAX(created_at) as latest
      FROM etl_log
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.dateFrom) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.dateTo);
      paramIndex++;
    }

    query += ' GROUP BY stage, status ORDER BY stage, status';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Проверить существование payload по хешу (для дедупликации)
   */
  static async checkDuplicateByHash(payloadHash) {
    const result = await pool.query(
      'SELECT * FROM etl_log WHERE payload_hash = $1 LIMIT 1',
      [payloadHash]
    );
    return result.rows[0];
  }

  /**
   * Вычислить SHA256 хеш для payload
   */
  static computeHash(payload) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Логирование с автоматическим измерением времени
   * Использование:
   *   const timer = ETLLog.startTimer(taskId);
   *   // ... выполнение операции
   *   await timer.log('stage_name', 'success', { message: 'Done' });
   */
  static startTimer(taskId) {
    const startTime = Date.now();
    return {
      log: async (stage, status, options = {}) => {
        const processingTimeMs = Date.now() - startTime;
        return await ETLLog.create(taskId, stage, status, {
          ...options,
          processingTimeMs
        });
      }
    };
  }
}

module.exports = ETLLog;
