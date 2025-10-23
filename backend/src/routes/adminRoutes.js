const express = require('express');
const router = express.Router();
const QueueEvent = require('../models/QueueEvent');
const Backup = require('../models/Backup');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const execPromise = util.promisify(exec);

// patch-016 §7: EventEmitter для SSE уведомлений о событиях очереди
const queueEventEmitter = new EventEmitter();
queueEventEmitter.setMaxListeners(100); // Увеличиваем лимит для нескольких клиентов

// Экспортируем emitter для использования в других модулях
router.queueEventEmitter = queueEventEmitter;

/**
 * Admin Routes
 * patch-009: API для администрирования очереди обработки чеков
 */

/**
 * GET /admin/queue
 * Получить список чеков с последними событиями
 */
router.get('/queue', async (req, res) => {
  try {
    const filters = {
      only_errors: req.query.only_errors === 'true',
      source: req.query.source || 'all',
      from: req.query.from || null,
      to: req.query.to || null,
      q: req.query.q || null,
      limit: parseInt(req.query.limit) || 200,
      offset: parseInt(req.query.offset) || 0
    };

    const result = await QueueEvent.getQueueList(filters);

    res.json({
      success: true,
      rows: result.rows,
      total: result.total,
      filters
    });
  } catch (error) {
    console.error('Error getting queue list:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/queue/:check_id/events
 * Получить все события для конкретного чека
 */
router.get('/queue/:check_id/events', async (req, res) => {
  try {
    const { check_id } = req.params;
    const events = await QueueEvent.getByCheckId(check_id);

    res.json({
      success: true,
      check_id,
      events
    });
  } catch (error) {
    console.error('Error getting check events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/queue/:check_id/requeue
 * Повторная обработка чека
 */
router.post('/queue/:check_id/requeue', async (req, res) => {
  try {
    const { check_id } = req.params;

    // Создаём событие requeued
    const event = await QueueEvent.requeue(check_id, 'manual');

    // TODO: Здесь должна быть логика отправки чека в очередь обработки
    // Например, отправка в RabbitMQ/Redis или вызов обработчика

    res.json({
      success: true,
      check_id,
      event,
      message: 'Check requeued for processing'
    });
  } catch (error) {
    console.error('Error requeuing check:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/queue/stats
 * Получить статистику по очереди
 */
router.get('/queue/stats', async (req, res) => {
  try {
    const filters = {
      from: req.query.from || null,
      to: req.query.to || null
    };

    const [stats, queueLength, errorCount] = await Promise.all([
      QueueEvent.getStats(filters),
      QueueEvent.getQueueLength(),
      QueueEvent.getErrorCount()
    ]);

    res.json({
      success: true,
      stats,
      queue_length: queueLength,
      error_count: errorCount
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/queue/cleanup
 * Очистка старых событий
 */
router.delete('/queue/cleanup', async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 30;
    const deletedCount = await QueueEvent.cleanup(daysToKeep);

    res.json({
      success: true,
      deleted: deletedCount,
      message: `Deleted ${deletedCount} events older than ${daysToKeep} days`
    });
  } catch (error) {
    console.error('Error cleaning up queue events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/backup
 * Создать резервную копию базы данных
 */
router.post('/backup', async (req, res) => {
  try {
    const { notes } = req.body || {};
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql.gz`;
    const backupDir = process.env.BACKUP_DIR || '/app/backups';
    const filePath = path.join(backupDir, filename);

    // Создаём директорию для бэкапов, если её нет
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (err) {
      console.error('Error creating backup directory:', err);
    }

    // Получаем параметры подключения к БД
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || 5432;
    const dbName = process.env.DB_NAME || 'receipt_parser';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';

    // Создаём команду для pg_dump
    const dumpCommand = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --clean --if-exists | gzip > ${filePath}`;

    console.log(`Creating backup: ${filename}`);

    // Выполняем дамп
    await execPromise(dumpCommand);

    // Получаем размер файла
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Сохраняем информацию в БД
    const backup = await Backup.create({
      filename,
      filePath,
      fileSize,
      format: 'sql.gz',
      createdBy: req.body.createdBy || 'admin',
      notes
    });

    res.json({
      success: true,
      backup,
      message: 'Backup created successfully'
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/backup
 * Получить список всех резервных копий
 */
router.get('/backup', async (req, res) => {
  try {
    const backups = await Backup.getAll();

    res.json({
      success: true,
      backups
    });
  } catch (error) {
    console.error('Error getting backups:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /admin/backup/:id
 * Удалить резервную копию
 */
router.delete('/backup/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const backup = await Backup.getById(id);

    if (!backup) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found'
      });
    }

    // Удаляем файл
    try {
      await fs.unlink(backup.file_path);
    } catch (err) {
      console.error('Error deleting backup file:', err);
    }

    // Удаляем запись из БД
    await Backup.delete(id);

    res.json({
      success: true,
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/clear-checks
 * patch-016 §8: Очистить всю таблицу checks с автоматическим бэкапом
 * Критическая операция - требует подтверждения на клиенте
 */
router.post('/clear-checks', async (req, res) => {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'receipt_parser',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // 1. Создаём резервную копию перед удалением
    console.log('Creating automatic backup before clearing checks...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-before-clear-${timestamp}.sql.gz`;
    const backupDir = process.env.BACKUP_DIR || '/app/backups';
    const filePath = path.join(backupDir, filename);

    // Создаём директорию для бэкапов
    await fs.mkdir(backupDir, { recursive: true });

    // Параметры БД
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || 5432;
    const dbName = process.env.DB_NAME || 'receipt_parser';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'postgres';

    // Создаём бэкап
    const dumpCommand = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --clean --if-exists | gzip > ${filePath}`;
    await execPromise(dumpCommand);

    // Получаем размер файла
    const stats = await fs.stat(filePath);
    const fileSize = stats.size;

    // Сохраняем информацию о бэкапе в БД
    const backup = await Backup.create({
      filename,
      filePath,
      fileSize,
      format: 'sql.gz',
      createdBy: req.body.createdBy || 'admin',
      notes: 'Automatic backup before clearing all checks'
    });

    console.log(`Backup created: ${filename} (${fileSize} bytes)`);

    // 2. Подсчитываем количество записей перед удалением
    const countResult = await pool.query('SELECT COUNT(*) as total FROM checks');
    const totalChecks = parseInt(countResult.rows[0].total);

    console.log(`Clearing ${totalChecks} checks from database...`);

    // 3. Очищаем таблицу checks (TRUNCATE для быстрой очистки)
    await pool.query('TRUNCATE TABLE checks CASCADE');

    // 4. Сбрасываем счётчик ID
    await pool.query('ALTER SEQUENCE checks_id_seq RESTART WITH 1');

    await pool.end();

    res.json({
      success: true,
      backup,
      deleted: totalChecks,
      message: `Successfully cleared ${totalChecks} checks. Backup created: ${filename}`
    });
  } catch (error) {
    console.error('Error clearing checks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/queue/stream
 * SSE endpoint для real-time обновлений очереди
 * patch-016 §7: Server-Sent Events для мониторинга очереди обработки чеков
 */
router.get('/queue/stream', (req, res) => {
  // Настраиваем SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Для nginx

  // Отправляем начальное подключение
  res.write('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n');

  // Функция для отправки события клиенту
  const sendEvent = (event) => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error('Error sending SSE event:', error);
    }
  };

  // Подписываемся на события очереди
  queueEventEmitter.on('queue_event', sendEvent);

  // Keep-alive ping каждые 30 секунд
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (error) {
      clearInterval(keepAliveInterval);
    }
  }, 30000);

  // Обработка отключения клиента
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    queueEventEmitter.off('queue_event', sendEvent);
    console.log('SSE client disconnected');
  });

  req.on('error', (error) => {
    clearInterval(keepAliveInterval);
    queueEventEmitter.off('queue_event', sendEvent);
    console.error('SSE connection error:', error);
  });
});

/**
 * POST /admin/queue/emit
 * Эмитировать событие в очередь (для тестирования и интеграции с ботом)
 * patch-016 §7
 */
router.post('/queue/emit', async (req, res) => {
  try {
    const event = req.body;

    // Валидация события
    if (!event.type || !event.timestamp) {
      return res.status(400).json({
        success: false,
        error: 'Event must have type and timestamp fields'
      });
    }

    // Эмитируем событие всем подписчикам SSE
    queueEventEmitter.emit('queue_event', event);

    res.json({
      success: true,
      message: 'Event emitted successfully',
      event
    });
  } catch (error) {
    console.error('Error emitting queue event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
