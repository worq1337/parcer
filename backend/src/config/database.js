const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'receipt_parser',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✓ Подключение к базе данных PostgreSQL установлено');
});

pool.on('error', (err) => {
  console.error('Неожиданная ошибка подключения к БД:', err);
  process.exit(-1);
});

module.exports = pool;
