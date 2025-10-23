/**
 * patch-017 §5: SSE endpoint для OS уведомлений
 */

const express = require('express');
const router = express.Router();
const eventBus = require('../utils/eventBus');

// Хранилище активных SSE соединений
const clients = new Set();

/**
 * SSE endpoint для получения push-уведомлений
 * GET /api/notifications/stream
 */
router.get('/stream', (req, res) => {
  // Настройка SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Отправить initial connection event
  res.write('data: ' + JSON.stringify({ type: 'connected', message: 'SSE connection established' }) + '\n\n');

  // Создать listener для этого клиента
  const sendEvent = (event) => {
    try {
      res.write('data: ' + JSON.stringify(event) + '\n\n');
    } catch (error) {
      console.error('Error sending SSE event:', error);
    }
  };

  // Подписаться на все события
  eventBus.on('check:added', sendEvent);
  eventBus.on('minute:summary', sendEvent);
  eventBus.on('error:occurred', sendEvent);

  // Добавить клиента в список
  clients.add({ res, sendEvent });

  console.log(`SSE client connected (total: ${clients.size})`);

  // Heartbeat каждые 30 секунд
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Обработка отключения клиента
  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('check:added', sendEvent);
    eventBus.off('minute:summary', sendEvent);
    eventBus.off('error:occurred', sendEvent);
    clients.delete({ res, sendEvent });
    console.log(`SSE client disconnected (total: ${clients.size})`);
  });
});

/**
 * Получить статистику активных подключений
 * GET /api/notifications/stats
 */
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      activeConnections: clients.size,
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
