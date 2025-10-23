const pool = require('../config/database');

class Operator {
  /**
   * Получить все операторы
   * patch-008: возвращает canonical_name и synonyms
   */
  static async getAll() {
    const result = await pool.query('SELECT * FROM operators ORDER BY app_name, canonical_name');
    return result.rows;
  }

  /**
   * Получить оператора по ID
   */
  static async getById(id) {
    const result = await pool.query('SELECT * FROM operators WHERE id = $1', [id]);
    return result.rows[0];
  }

  /**
   * Найти оператора по паттерну (для парсинга)
   * patch-008: также проверяет synonyms и canonical_name
   */
  static async findByPattern(pattern) {
    // Сначала проверяем точное совпадение с каноническим именем
    let result = await pool.query(
      'SELECT * FROM operators WHERE LOWER(canonical_name) = LOWER($1) LIMIT 1',
      [pattern]
    );
    if (result.rows.length > 0) return result.rows[0];

    // Затем проверяем совпадение в массиве синонимов
    result = await pool.query(
      `SELECT * FROM operators WHERE $1 = ANY(
        SELECT LOWER(unnest(synonyms))
      ) LIMIT 1`,
      [pattern.toLowerCase()]
    );
    if (result.rows.length > 0) return result.rows[0];

    // Для обратной совместимости проверяем старое поле pattern
    result = await pool.query(
      'SELECT * FROM operators WHERE LOWER(pattern) = LOWER($1) LIMIT 1',
      [pattern]
    );
    return result.rows[0];
  }

  /**
   * Поиск оператора по частичному совпадению (для парсинга из текста)
   * patch-008: также проверяет canonical_name и все synonyms
   */
  static async findByPartialMatch(text) {
    const operators = await this.getAll();
    const normalize = (value) => value.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedText = normalize(text);

    // Пытаемся найти совпадение canonical_name или синонимов в тексте
    for (const operator of operators) {
      // Проверяем каноническое имя
      if (operator.canonical_name) {
        const normalizedCanonical = normalize(operator.canonical_name);
        if (normalizedText.includes(normalizedCanonical)) {
          return operator;
        }
      }

      // Проверяем все синонимы
      if (operator.synonyms && Array.isArray(operator.synonyms)) {
        for (const synonym of operator.synonyms) {
          const normalizedSynonym = normalize(synonym);
          if (normalizedText.includes(normalizedSynonym)) {
            return operator;
          }
        }
      }

      // Для обратной совместимости проверяем старое поле pattern
      if (operator.pattern) {
        const normalizedPattern = normalize(operator.pattern);
        if (normalizedText.includes(normalizedPattern)) {
          return operator;
        }
      }
    }

    return null;
  }

  /**
   * Поиск операторов по запросу
   * patch-017 §1: для команды /dict в Telegram боте
   */
  static async search(query) {
    const searchPattern = `%${query.toLowerCase()}%`;

    const result = await pool.query(
      `SELECT * FROM operators
       WHERE LOWER(canonical_name) LIKE $1
       OR LOWER(app_name) LIKE $1
       OR EXISTS (
         SELECT 1 FROM unnest(synonyms) AS synonym
         WHERE LOWER(synonym) LIKE $1
       )
       ORDER BY canonical_name
       LIMIT 50`,
      [searchPattern]
    );

    return result.rows.map(row => ({
      id: row.id,
      operator: row.canonical_name,
      app: row.app_name,
      is_p2p: row.is_p2p,
      transaction_type: row.is_p2p ? 'P2P' : 'Оплата'
    }));
  }

  /**
   * Получить топ операторов
   * patch-017 §1: для команды /dict в Telegram боте
   */
  static async getTop(limit = 10) {
    const result = await pool.query(
      `SELECT * FROM operators
       ORDER BY canonical_name
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      operator: row.canonical_name,
      app: row.app_name,
      is_p2p: row.is_p2p
    }));
  }

  /**
   * Создать нового оператора
   * patch-008: добавлены canonical_name и synonyms
   */
  static async create(operatorData) {
    const query = `
      INSERT INTO operators (canonical_name, app_name, is_p2p, synonyms, pattern)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      operatorData.canonicalName || operatorData.pattern,
      operatorData.appName,
      operatorData.isP2p !== undefined ? operatorData.isP2p : true,
      operatorData.synonyms || [],
      operatorData.pattern || operatorData.canonicalName // для обратной совместимости
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Обновить оператора
   * patch-008: обновление canonical_name и synonyms
   */
  static async update(id, operatorData) {
    const query = `
      UPDATE operators SET
        canonical_name = $1,
        app_name = $2,
        is_p2p = $3,
        synonyms = $4,
        pattern = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;

    const values = [
      operatorData.canonicalName || operatorData.pattern,
      operatorData.appName,
      operatorData.isP2p !== undefined ? operatorData.isP2p : true,
      operatorData.synonyms || [],
      operatorData.pattern || operatorData.canonicalName, // для обратной совместимости
      id
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Удалить оператора
   */
  static async delete(id) {
    const result = await pool.query('DELETE FROM operators WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }

  /**
   * Проверить существование паттерна
   * patch-008: проверяет canonical_name и synonyms
   */
  static async patternExists(pattern, excludeId = null) {
    let query = `
      SELECT * FROM operators
      WHERE (LOWER(canonical_name) = LOWER($1)
      OR LOWER(pattern) = LOWER($1)
      OR $1 = ANY(SELECT LOWER(unnest(synonyms))))
    `;
    const params = [pattern];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return result.rows.length > 0;
  }

  /**
   * Добавить синоним к оператору
   * patch-008: новый метод для добавления синонима
   */
  static async addSynonym(id, synonym) {
    const query = `
      UPDATE operators SET
        synonyms = array_append(synonyms, $2),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id, synonym]);
    return result.rows[0];
  }

  /**
   * Удалить синоним из оператора
   * patch-008: новый метод для удаления синонима
   */
  static async removeSynonym(id, synonym) {
    const query = `
      UPDATE operators SET
        synonyms = array_remove(synonyms, $2),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id, synonym]);
    return result.rows[0];
  }
}

module.exports = Operator;
