const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

/**
 * Выполняет SQL скрипт в рамках одной транзакции
 * @param {import('pg').PoolClient} client
 * @param {string} filePath
 */
async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  if (!sql.trim()) {
    console.warn(`⚠️  Файл ${filePath} пуст – пропускаем`);
    return;
  }

  console.log(`→ Выполняем ${path.basename(filePath)}...`);
  await client.query(sql);
  console.log(`✓ ${path.basename(filePath)} выполнен`);
}

async function migrate() {
  const client = await pool.connect();
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const seedPath = path.resolve(__dirname, '../../database/seed_operators.sql');

  try {
    console.log('🚀 Запуск миграций базы данных');
    await client.query('BEGIN');

    await runSqlFile(client, schemaPath);
    await runSqlFile(client, seedPath);

    await client.query('COMMIT');
    console.log('✅ Миграции успешно выполнены');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка при выполнении миграций:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
