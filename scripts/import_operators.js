#!/usr/bin/env node

/**
 * Импорт операторов из файла операторыпродавцыиприложения-2.txt в БД
 * Формат файла: "ОПЕРАТОР — Приложение"
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'receipt_parser',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function importOperators() {
  const filePath = path.join(__dirname, '..', 'операторыпродавцыиприложения-2.txt');

  console.log('📖 Чтение файла:', filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('оператор'));

  const operatorsMap = new Map(); // appName -> { canonicalName, synonyms[], isP2P }

  console.log(`📝 Обработка ${lines.length} строк...`);

  for (const line of lines) {
    // Формат: "ОПЕРАТОР — Приложение"
    const match = line.match(/^(.+?)\s*—\s*(.+?)$/);
    if (!match) {
      console.warn('⚠️  Пропущена строка (неверный формат):', line);
      continue;
    }

    const synonym = match[1].trim();
    const appName = match[2].trim();

    // Определяем isP2P
    const isP2P = /\bP2P\b/i.test(synonym);

    // Нормализуем имя оператора (убираем P2P, спецсимволы, лишние пробелы)
    const canonicalName = synonym
      .replace(/\bP2P\b/gi, '')
      .replace(/[>,.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')[0]; // Берем первое слово как каноническое имя

    if (!operatorsMap.has(appName)) {
      operatorsMap.set(appName, {
        canonicalName,
        synonyms: [],
        isP2P,
      });
    }

    const operator = operatorsMap.get(appName);

    // Добавляем синоним, если его еще нет
    if (!operator.synonyms.includes(synonym)) {
      operator.synonyms.push(synonym);
    }

    // Обновляем P2P флаг (если хоть один синоним P2P, то весь оператор P2P)
    if (isP2P) {
      operator.isP2P = true;
    }
  }

  console.log(`✅ Обработано уникальных приложений: ${operatorsMap.size}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const [appName, data] of operatorsMap.entries()) {
      // Проверяем, существует ли оператор
      const existing = await client.query(
        'SELECT id, synonyms FROM operators WHERE app_name = $1 LIMIT 1',
        [appName]
      );

      if (existing.rows.length > 0) {
        // Обновляем существующего - добавляем новые синонимы
        const existingRow = existing.rows[0];
        const existingSynonyms = existingRow.synonyms || [];
        const newSynonyms = [...new Set([...existingSynonyms, ...data.synonyms])];

        await client.query(
          `UPDATE operators
           SET synonyms = $1,
               is_p2p = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newSynonyms, data.isP2P, existingRow.id]
        );
        updated++;
        console.log(`🔄 Обновлен: ${appName} (${newSynonyms.length} синонимов)`);
      } else {
        // Вставляем нового оператора
        await client.query(
          `INSERT INTO operators (canonical_name, app_name, synonyms, is_p2p)
           VALUES ($1, $2, $3, $4)`,
          [data.canonicalName, appName, data.synonyms, data.isP2P]
        );
        inserted++;
        console.log(`➕ Добавлен: ${appName} -> ${data.canonicalName} (${data.synonyms.length} синонимов)`);
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Импорт завершен!');
    console.log(`   Добавлено: ${inserted}`);
    console.log(`   Обновлено: ${updated}`);
    console.log(`   Пропущено: ${skipped}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка импорта:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importOperators().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
