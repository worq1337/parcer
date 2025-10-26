/**
 * API Routes для Userbot Chat
 * Эндпоинты для работы с чатом ботов в UI
 */

const express = require('express');
const router = express.Router();
const BotMessage = require('../models/BotMessage');
const parserService = require('../services/parserService');

// Конфигурация мониторимых ботов
const MONITORED_BOTS = [
  { id: 915326936, name: 'CardXabar', username: '@CardXabarBot', icon: '💳' },
  { id: 856264490, name: 'ID:856264490', username: '(недоступен)', icon: '🏦' },
  { id: 7028509569, name: 'NBU Card', username: '@NBUCard_bot', icon: '🏦' }
];

/**
 * GET /api/userbot-chat/bots
 * Получить список всех ботов со статистикой
 */
router.get('/bots', async (req, res) => {
  try {
    // Получить статистику для каждого бота
    const botsWithStats = await Promise.all(
      MONITORED_BOTS.map(async (bot) => {
        const stats = await BotMessage.getStatsByBotId(bot.id);
        return {
          ...bot,
          isActive: true,
          stats,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      })
    );

    res.json({
      success: true,
      data: botsWithStats
    });
  } catch (error) {
    console.error('Error getting bots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/userbot-chat/messages/:botId
 * Получить сообщения от конкретного бота
 *
 * Query params:
 * - status: unprocessed | processed | pending | error | all
 * - limit: количество сообщений (по умолчанию 50)
 * - offset: смещение для пагинации (по умолчанию 0)
 */
router.get('/messages/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { status = 'all', limit = 50, offset = 0 } = req.query;

    // Проверить что бот существует
    const bot = MONITORED_BOTS.find(b => b.id === parseInt(botId));
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Получить сообщения
    const result = await BotMessage.getByBotId(parseInt(botId), {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/userbot-chat/history/:botId
 * Получить ВСЮ историю сообщений от бота (без лимита)
 */
router.get('/history/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { status = 'all' } = req.query;

    const bot = MONITORED_BOTS.find(b => b.id === parseInt(botId));
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    // Получить все сообщения без лимита
    const result = await BotMessage.getByBotId(parseInt(botId), {
      status,
      limit: 10000, // Большой лимит для полной истории
      offset: 0
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/userbot-chat/process
 * Обработать одно сообщение вручную
 *
 * Body:
 * {
 *   "messageId": "uuid"
 * }
 */
router.post('/process', async (req, res) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: 'messageId is required'
      });
    }

    // Получить сообщение
    const message = await BotMessage.getById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Обновить статус на pending
    await BotMessage.updateStatus(messageId, 'pending');

    // Попытка парсинга через парсер сервис
    try {
      const parsedData = await parserService.parseReceipt(message.text);

      if (parsedData && parsedData.datetime) {
        // Успешно распарсено - обновить data и статус
        await BotMessage.updateData(messageId, parsedData);
        await BotMessage.updateStatus(messageId, 'processed', {
          sheet_url: null // TODO: добавить ссылку на Google Sheets когда будет интеграция
        });

        res.json({
          success: true,
          message: 'Message processed successfully',
          data: parsedData
        });
      } else {
        // Не удалось распарсить
        await BotMessage.updateStatus(messageId, 'error', {
          error: 'Failed to parse receipt data'
        });

        res.status(400).json({
          success: false,
          error: 'Failed to parse receipt data'
        });
      }
    } catch (parseError) {
      // Ошибка парсинга
      await BotMessage.updateStatus(messageId, 'error', {
        error: parseError.message
      });

      res.status(500).json({
        success: false,
        error: parseError.message
      });
    }
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/userbot-chat/process-multiple
 * Массовая обработка нескольких сообщений
 *
 * Body:
 * {
 *   "messageIds": ["uuid1", "uuid2", ...]
 * }
 */
router.post('/process-multiple', async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'messageIds array is required'
      });
    }

    // Обновить все сообщения в статус pending
    await BotMessage.updateMultipleStatuses(messageIds, 'pending');

    // Обработать каждое сообщение
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const messageId of messageIds) {
      try {
        const message = await BotMessage.getById(messageId);
        if (!message) {
          results.failed++;
          results.errors.push({ messageId, error: 'Message not found' });
          continue;
        }

        // Парсинг
        const parsedData = await parserService.parseReceipt(message.text);

        if (parsedData && parsedData.datetime) {
          await BotMessage.updateData(messageId, parsedData);
          await BotMessage.updateStatus(messageId, 'processed');
          results.success++;
        } else {
          await BotMessage.updateStatus(messageId, 'error', {
            error: 'Failed to parse'
          });
          results.failed++;
          results.errors.push({ messageId, error: 'Failed to parse' });
        }
      } catch (parseError) {
        await BotMessage.updateStatus(messageId, 'error', {
          error: parseError.message
        });
        results.failed++;
        results.errors.push({ messageId, error: parseError.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.success}/${messageIds.length} messages`,
      data: results
    });
  } catch (error) {
    console.error('Error processing multiple messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/userbot-chat/retry
 * Повторить обработку сообщения с ошибкой
 *
 * Body:
 * {
 *   "messageId": "uuid"
 * }
 */
router.post('/retry', async (req, res) => {
  try {
    const { messageId } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: 'messageId is required'
      });
    }

    const message = await BotMessage.getById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    // Сбросить статус на unprocessed и очистить ошибку
    await BotMessage.updateStatus(messageId, 'unprocessed', { error: null });

    res.json({
      success: true,
      message: 'Message reset to unprocessed, ready for retry'
    });
  } catch (error) {
    console.error('Error retrying message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
