const pool = require('../config/database');

/**
 * Backup Model
 * patch-008: модель для управления резервными копиями
 */
class Backup {
  /**
   * Получить все резервные копии
   */
  static async getAll() {
    const result = await pool.query(
      'SELECT * FROM backups ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Получить резервную копию по ID
   */
  static async getById(id) {
    const result = await pool.query('SELECT * FROM backups WHERE id = $1', [id]);
    return result.rows[0];
  }

  /**
   * Получить резервную копию по имени файла
   */
  static async getByFilename(filename) {
    const result = await pool.query(
      'SELECT * FROM backups WHERE filename = $1',
      [filename]
    );
    return result.rows[0];
  }

  /**
   * Создать запись о резервной копии
   */
  static async create(backupData) {
    const query = `
      INSERT INTO backups (
        filename, file_path, file_size, format, created_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      backupData.filename,
      backupData.filePath,
      backupData.fileSize,
      backupData.format || 'sql.gz',
      backupData.createdBy || 'system',
      backupData.notes || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Пометить резервную копию как восстановленную
   */
  static async markAsRestored(id) {
    const query = `
      UPDATE backups SET
        restored_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  /**
   * Удалить запись о резервной копии
   */
  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM backups WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Получить статистику по резервным копиям
   */
  static async getStats() {
    const query = `
      SELECT
        COUNT(*) as total_backups,
        SUM(file_size) as total_size,
        COUNT(CASE WHEN restored_at IS NOT NULL THEN 1 END) as restored_count,
        MIN(created_at) as earliest_backup,
        MAX(created_at) as latest_backup
      FROM backups
    `;
    const result = await pool.query(query);
    return result.rows[0];
  }

  /**
   * Получить последние N резервных копий
   */
  static async getRecent(limit = 10) {
    const result = await pool.query(
      'SELECT * FROM backups ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * Проверить существование файла резервной копии
   */
  static async exists(filename) {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM backups WHERE filename = $1',
      [filename]
    );
    return result.rows[0].count > 0;
  }
}

module.exports = Backup;
