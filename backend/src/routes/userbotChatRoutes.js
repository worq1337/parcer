/**
 * API Routes для Userbot Chat
 * Эндпоинты для работы с чатом ботов в UI
 */

const express = require('express');
const router = express.Router();
const BotMessage = require('../models/BotMessage');
const parserService = require('../services/parserService');
const notifier = require('../services/telegramNotifier');
const userbotService = require('../services/userbotService');
const USERBOT_SERVICE_URL = process.env.USERBOT_SERVICE_URL || 'http://userbot:5001';

// Конфигурация мониторимых ботов
const MONITORED_BOTS = [
  { id: 915326936, name: 'CardXabar', username: '@CardXabarBot', icon: '💳' },
  { id: 856254490, name: 'ID:856254490', username: '(недоступен)', icon: '🏦' },
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
    console.log(`📬 Loading messages for bot_id=${botId}, status=${status}, limit=${limit}, offset=${offset}`);

    const result = await BotMessage.getByBotId(botId, {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    console.log(`📊 Loaded ${result.messages?.length || 0} messages, total=${result.total || 0}`);

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
    const result = await BotMessage.getByBotId(botId, {
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
async function resolveMessageRecord({ recordId, chatId, messageId }) {
  let record = null;
  if (recordId) {
    record = await BotMessage.getById(recordId);
  }
  if (!record && chatId && messageId) {
    record = await BotMessage.findByChatAndMessage(chatId, messageId);
  }
  return record;
}

function buildUiPayloadFromCheck(check) {
  if (!check) {
    return null;
  }
  return {
    amount: check.amount,
    currency: check.currency,
    merchant: check.operator,
    card: check.card_last4,
    date: check.date_display,
    time: check.time_display,
    check_id: check.check_id,
    source_bot_username: check.source_bot_username,
    source_bot_title: check.source_bot_title,
    source_chat_id: check.source_chat_id,
    source_message_id: check.source_message_id,
  };
}

async function processSingleMessage({ record, chatId, messageId, rawText }) {
  let text = (rawText ?? record?.text ?? '').trim();

  if (!text) {
    try {
      const fetched = await userbotService.getMessageText(chatId, messageId);
      if (fetched) {
        text = fetched.trim();
      }
    } catch (error) {
      console.warn('getMessageText failed:', error.message);
    }
  }

  if (!text) {
    throw Object.assign(new Error('Message has no text'), { code: 'NO_TEXT', status: 422 });
  }

  const notifyMessageId = await notifier.notifyReceived({
    txId: record?.id || 'pending',
    source: 'telegram_userbot',
    raw: text,
    operator: record?.data?.operator,
    last4: record?.data?.card,
    amount: record?.data?.amount || '—',
    currency: record?.data?.currency || '',
    datetime: record?.timestamp || new Date().toISOString()
  }).catch((error) => {
    console.warn('notifyReceived(userbot) failed:', error.message);
    return null;
  });

  let result;
  let chatMeta = {};
  try {
    chatMeta = await userbotService.getChatMeta(chatId);
  } catch (error) {
    console.warn('getChatMeta failed:', error.message);
  }

  try {
    result = await parserService.parseAndInsert(text, {
      explicit: 'telegram_userbot',
      addedVia: 'bot',
      metadata: {
        chat_id: chatId,
        message_id: messageId,
        record_id: record?.id,
        bot_id: record?.bot_id,
        bot_username: chatMeta?.username || record?.bot_username,
        bot_title: chatMeta?.title || record?.bot_title,
      },
      sourceChatId: chatId,
      sourceMessageId: messageId,
      sourceBotUsername: chatMeta?.username || record?.bot_username,
      sourceBotTitle: chatMeta?.title || record?.bot_title,
      sourceApp: 'telegram_userbot',
      notifyMessageId,
    });
  } catch (error) {
    if (!error.notifyMessageId && notifyMessageId) {
      error.notifyMessageId = notifyMessageId;
    }
    throw error;
  }

  const primaryCheck = result.primary || result.created?.[0] || null;

  if (notifyMessageId && primaryCheck) {
    await notifier.notifyProcessed({
      notifyMessageId,
      tx: primaryCheck
    }).catch((error) => {
      console.warn('notifyProcessed(userbot) failed:', error.message);
    });
  }

  return { result, primaryCheck, notifyMessageId };
}

router.post('/process', async (req, res) => {
  try {
    const body = req.body || {};

    const recordId = body.record_id || body.message_uuid || body.messageId || body.recordId || null;
    const rawChatId = body.chat_id ?? body.chatId ?? body.bot_id ?? body.botId;
    const rawMessageId = body.message_id ?? body.messageId ?? body.telegram_message_id ?? body.telegramMessageId;
    const rawText = body.raw_text ?? body.rawText ?? body.text ?? '';

    const chatId = rawChatId != null ? String(rawChatId).trim() : null;
    const messageId = rawMessageId != null ? String(rawMessageId).trim() : null;

    if (!chatId || !messageId) {
      console.log(`❌ Missing data: chatId=${chatId}, messageId=${messageId}`);
      return res.status(400).json({
        success: false,
        error: 'messageId is required',
        code: 'BAD_REQUEST',
        detail: `chat_id (${chatId}) and message_id (${messageId}) are required. Received: ${JSON.stringify(body)}`
      });
    }

    const record = await resolveMessageRecord({ recordId, chatId, messageId });
    if (!record) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        detail: 'Message not found'
      });
    }

    await BotMessage.updateStatus(record.id, 'pending');

    try {
      console.log(`📥 Processing userbot message id=${record.id}, chat=${chatId}, message=${messageId}`);
      const startedAt = Date.now();

      const { result, primaryCheck } = await processSingleMessage({
        record,
        chatId,
        messageId,
        rawText
      });

      const duration = Date.now() - startedAt;
      console.log(`⏱ userbot message ${record.id} processed in ${duration}ms`);

      if (primaryCheck) {
        const uiData = buildUiPayloadFromCheck(primaryCheck);
        if (uiData) {
          await BotMessage.updateData(record.id, uiData);
        }
      }

      await BotMessage.updateStatus(record.id, 'processed', {
        sheet_url: null
      });

      return res.json({
        success: true,
        data: result.created,
        duplicates: result.duplicates,
        requestId: result.requestId,
        message: 'Message processed successfully'
      });
    } catch (error) {
      const code = error.code || error.meta?.code || 'PROCESS_FAILED';
      const status = error.status || (code === 'DUPLICATE' ? 200 : code === 'NO_TEXT' ? 422 : 500);
      const detail = error.message || 'Failed to process message';

      console.error(`💥 userbot process failed for record ${record.id}:`, detail);

      await BotMessage.updateStatus(record.id, 'error', {
        error: `${code}: ${detail}`
      });

      if (error.notifyMessageId) {
        await notifier.notifyError({
          notifyMessageId: error.notifyMessageId,
          txId: record.id,
          code,
          detail
        }).catch((notifyErr) => {
          console.warn('notifyError(userbot) failed:', notifyErr.message);
        });
      }

      if (code === 'DUPLICATE') {
        return res.status(200).json({
          success: true,
          status: 'duplicate',
          code,
          detail,
          duplicates: error.meta?.duplicates || []
        });
      }

      return res.status(status).json({
        success: false,
        code,
        detail,
        requestId: error.meta?.requestId
      });
    }
  } catch (error) {
    console.error('Error processing userbot message:', error);
    res.status(500).json({
      success: false,
      code: 'UNEXPECTED',
      detail: error.message
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
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        detail: 'messages array is required'
      });
    }

    const summary = {
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    for (const item of messages) {
      const recordId = item.record_id || item.id || item.message_uuid;
      const chatId = item.chat_id || item.chatId;
      const messageId = item.message_id || item.messageId || item.telegram_message_id;
      const rawText = item.raw_text || item.text;

      try {
        const record = await resolveMessageRecord({
          recordId,
          chatId: chatId ? String(chatId) : null,
          messageId: messageId ? String(messageId) : null
        });

        if (!record) {
          summary.failed += 1;
          summary.errors.push({ recordId, code: 'NOT_FOUND', detail: 'Message not found' });
          continue;
        }

        await BotMessage.updateStatus(record.id, 'pending');

        try {
          await processSingleMessage({
            record,
            chatId: String(chatId ?? record.chat_id),
            messageId: String(messageId ?? record.message_id),
            rawText
          });

          await BotMessage.updateStatus(record.id, 'processed');
          summary.success += 1;
        } catch (processError) {
          const code = processError.code || 'PROCESS_FAILED';
          if (code === 'DUPLICATE') {
            summary.duplicates += 1;
          } else {
            summary.failed += 1;
          }
          summary.errors.push({ recordId: record.id, code, detail: processError.message });
          await BotMessage.updateStatus(record.id, 'error', {
            error: `${code}: ${processError.message}`
          });
          if (processError.notifyMessageId) {
            await notifier.notifyError({
              notifyMessageId: processError.notifyMessageId,
              txId: record.id,
              code,
              detail: processError.message
            }).catch((notifyErr) => {
              console.warn('notifyError(userbot multi) failed:', notifyErr.message);
            });
          }
        }
      } catch (loopError) {
        summary.failed += 1;
        summary.errors.push({ recordId, code: 'UNEXPECTED', detail: loopError.message });
      }
    }

    res.json({
      success: true,
      data: summary,
      message: `Processed ${summary.success}/${messages.length} messages`
    });
  } catch (error) {
    console.error('Error processing multiple messages:', error);
    res.status(500).json({
      success: false,
      code: 'UNEXPECTED',
      detail: error.message
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

/**
 * POST /api/userbot-chat/load-history/:botId
 * Загрузить историю сообщений от бота через userbot
 *
 * Body: {days: number (optional)}
 * days = null означает загрузить всю историю
 * days = 30 означает загрузить за последние 30 дней
 */
router.post('/load-history/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { days } = req.body;

    // Получить информацию о боте
    const bot = MONITORED_BOTS.find(b => b.id === parseInt(botId));

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    console.log(`📥 Loading history for bot ${bot.name} (${bot.username}), days: ${days || 'all'}`);

    // Вызвать userbot service для загрузки истории
    const response = await fetch(`${USERBOT_SERVICE_URL}/load-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bot_id: bot.id,
        bot_username: bot.username,
        days: days
      })
    });

    const result = await response.json();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to load history from userbot'
      });
    }

    console.log(`✅ History loaded: ${result.loaded} messages, ${result.saved} saved`);

    res.json({
      success: true,
      loaded: result.loaded,
      saved: result.saved,
      skipped: result.skipped,
      errors: result.errors
    });

  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
