/**
 * ПОЛНЫЙ КОД ДЛЯ telegramBot.js (С ОТСЛЕЖИВАНИЕМ СТАТУСОВ)
 * Этот файл заменяет предыдущий TELEGRAM-BOT-CODE.js
 * Включает отправку в канал статусов: успех, дубликат, ошибка
 */

// ==========================================
// 1. ИЗМЕНЕНИЯ В КОНСТРУКТОРЕ
// ==========================================
// В constructor() после строки this.allowedUsers = []; добавить:

this.channelId = null;
this.channelEnabled = false;
this.heartbeatInterval = null;


// ==========================================
// 2. ИЗМЕНЕНИЯ В МЕТОДЕ init()
// ==========================================
// В init() после this.setupHandlers(); добавить:

// Инициализация канала
if (process.env.TELEGRAM_CHANNEL_ID) {
  this.channelId = process.env.TELEGRAM_CHANNEL_ID;
  this.channelEnabled = process.env.TELEGRAM_CHANNEL_ENABLED === 'true';
  
  if (this.channelEnabled) {
    console.log(`✓ Отправка в канал включена: ${this.channelId}`);
    this.startHeartbeat();
  } else {
    console.log(`⚠️ Отправка в канал выключена`);
  }
}


// ==========================================
// 3. НОВЫЙ МЕТОД: sendProcessingStatus
// ==========================================
// Добавить перед методом stop()

/**
 * Отправка статуса обработки транзакции в канал
 * @param {Object} params - параметры статуса
 * @param {string} params.status - статус: 'success', 'duplicate', 'error'
 * @param {Object} params.check - объект чека (если есть)
 * @param {string} params.error - текст ошибки (если есть)
 * @param {string} params.source - источник сообщения
 * @param {Object} params.rawData - сырые данные для отладки (опционально)
 */
async sendProcessingStatus({ status, check, error, source, rawData }) {
  if (!this.channelEnabled || !this.channelId || !this.bot) {
    return;
  }

  try {
    let message = '';
    let emoji = '';

    switch (status) {
      case 'success':
        emoji = '✅';
        const amountFormatted = this.formatAmount(Math.abs(check.amount));
        const sign = check.amount >= 0 ? '+' : '-';
        const transactionEmoji = check.amount >= 0 ? '💚' : '💸';
        
        message = `${emoji} **Транзакция добавлена**\n\n` +
          `${transactionEmoji} **Детали:**\n` +
          `📅 Дата: ${check.date_display} ${check.time_display}\n` +
          `💰 Сумма: ${sign} ${amountFormatted} ${check.currency}\n` +
          `🏦 Банк: ${check.operator || 'Н/Д'}\n` +
          `💳 Карта: \\*${check.card_last4}\n` +
          `🏪 Продавец: ${check.merchant || 'Н/Д'}\n` +
          `📝 Тип: ${check.transaction_type || 'Н/Д'}\n` +
          `🆔 ID: \`${check.id}\`\n\n` +
          `📥 Источник: _${source || check.source || 'unknown'}_`;
        break;

      case 'duplicate':
        emoji = 'ℹ️';
        const dupAmountFormatted = this.formatAmount(Math.abs(check.amount));
        const dupSign = check.amount >= 0 ? '+' : '-';
        
        message = `${emoji} **Дубликат транзакции**\n\n` +
          `⚠️ Эта транзакция уже есть в базе\n\n` +
          `📅 Дата: ${check.date_display} ${check.time_display}\n` +
          `💰 Сумма: ${dupSign} ${dupAmountFormatted} ${check.currency}\n` +
          `🏦 Банк: ${check.operator || 'Н/Д'}\n` +
          `💳 Карта: \\*${check.card_last4}\n` +
          `🆔 ID существующей записи: \`${check.id}\`\n\n` +
          `📥 Источник: _${source || check.source || 'unknown'}_`;
        break;

      case 'error':
        emoji = '❌';
        message = `${emoji} **Ошибка обработки**\n\n` +
          `⚠️ Не удалось добавить транзакцию\n\n` +
          `🔴 **Причина:**\n${this.escapeMarkdown(error || 'Неизвестная ошибка')}\n\n` +
          `📥 Источник: _${source || 'unknown'}_`;
        
        // Если есть сырые данные, добавляем их для отладки (только в development)
        if (rawData && process.env.NODE_ENV === 'development') {
          const rawText = typeof rawData === 'string' 
            ? rawData.substring(0, 200) 
            : JSON.stringify(rawData).substring(0, 200);
          message += `\n\n🔍 **Debug info:**\n\`${this.escapeMarkdown(rawText)}...\``;
        }
        break;

      default:
        console.warn(`Неизвестный статус: ${status}`);
        return;
    }

    // Отправляем в канал
    await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_notification: status === 'duplicate' // Без звука для дубликатов
    });

    console.log(`✓ Статус "${status}" отправлен в канал`);
  } catch (error) {
    console.error('❌ Ошибка отправки статуса в канал:', error.message);
  }
}


// ==========================================
// 4. НОВЫЙ МЕТОД: startHeartbeat
// ==========================================
// Добавить перед методом stop()

/**
 * Запуск heartbeat - сообщения каждый час о работе бота
 */
startHeartbeat() {
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
  }

  // Отправляем первое сообщение сразу после запуска
  this.sendHeartbeat();

  // Затем каждый час (3600000 мс = 1 час)
  this.heartbeatInterval = setInterval(() => {
    this.sendHeartbeat();
  }, 3600000);

  console.log('✓ Heartbeat запущен (сообщения каждый час)');
}


// ==========================================
// 5. НОВЫЙ МЕТОД: sendHeartbeat
// ==========================================
// Добавить перед методом stop()

/**
 * Отправка heartbeat сообщения в канал
 */
async sendHeartbeat() {
  if (!this.channelEnabled || !this.channelId || !this.bot) {
    return;
  }

  try {
    const now = new Date().toLocaleString('ru-RU', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const message = `✅ **Бот работает**\n\n` +
      `🕐 Время: ${now} (Ташкент)\n` +
      `📊 Статус: Все системы работают нормально\n` +
      `🔄 Мониторинг активен\n` +
      `✨ Все транзакции обрабатываются автоматически\n\n` +
      `_Следующая проверка через 1 час_`;

    await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_notification: true // Без звука чтобы не беспокоить
    });

    console.log(`✓ Heartbeat отправлен в ${now}`);
  } catch (error) {
    console.error('❌ Ошибка отправки heartbeat:', error.message);
  }
}


// ==========================================
// 6. НОВЫЙ МЕТОД: stopHeartbeat
// ==========================================
// Добавить перед методом stop()

/**
 * Остановка heartbeat при завершении работы бота
 */
stopHeartbeat() {
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    console.log('✓ Heartbeat остановлен');
  }
}


// ==========================================
// 7. ИЗМЕНЕНИЯ В МЕТОДЕ stop()
// ==========================================
// В начале метода stop() добавить:

this.stopHeartbeat(); // Остановить heartbeat перед остановкой бота


// ==========================================
// 8. ПОЛНАЯ ЗАМЕНА handleTextMessage()
// ==========================================
// ЗАМЕНИТЬ ВЕСЬ МЕТОД handleTextMessage на этот код:

/**
 * patch-017 §3: Обработка текстовых сообщений
 */
async handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Проверка разрешенных пользователей
  if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(userId)) {
    this.bot.sendMessage(chatId, '⚠️ У вас нет доступа к этому боту.');
    return;
  }

  // Игнорируем команды
  if (text.startsWith('/')) {
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📨 Новое текстовое сообщение:');
  console.log(`   User ID: ${userId}`);
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Text length: ${text.length}`);
  console.log(`   First 100 chars: ${text.substring(0, 100)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Отправляем сообщение о начале обработки
    const processingMsg = await this.bot.sendMessage(
      chatId,
      '⏳ Обрабатываю сообщение...',
      { reply_to_message_id: msg.message_id }
    );

    // Вызываем ingest API
    const ingestResponse = await axios.post(`${API_BASE_URL}/ingest/text`, {
      text: text,
      source: 'telegram_bot',
      chat_id: chatId,
      message_id: msg.message_id,
      user_id: userId
    });

    // Удаляем сообщение об обработке
    await this.bot.deleteMessage(chatId, processingMsg.message_id);

    if (ingestResponse.data.success) {
      const check = ingestResponse.data.data;
      const isDuplicate = ingestResponse.data.duplicate;

      if (isDuplicate) {
        // Дубликат - отправляем в канал статус
        await this.sendProcessingStatus({
          status: 'duplicate',
          check: check,
          source: 'telegram_bot'
        });

        // Отвечаем пользователю
        const amountFormatted = this.formatAmount(Math.abs(check.amount));
        this.bot.sendMessage(
          chatId,
          `ℹ️ **Дубликат** - чек уже добавлен ранее\n\n` +
          `📅 ${check.date_display} ${check.time_display}\n` +
          `💰 ${amountFormatted} ${check.currency}\n` +
          `🏦 ${check.operator || 'Н/Д'}\n` +
          `💳 Карта: \\*${check.card_last4}`,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      } else {
        // Успешно добавлен - отправляем в канал статус
        await this.sendProcessingStatus({
          status: 'success',
          check: check,
          source: 'telegram_bot'
        });

        // Отвечаем пользователю
        const response = this.formatCheckResponseCompact(check);
        this.bot.sendMessage(
          chatId,
          response,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      }
    } else {
      // Ошибка при обработке - отправляем в канал статус
      await this.sendProcessingStatus({
        status: 'error',
        error: ingestResponse.data.error || 'Неизвестная ошибка',
        source: 'telegram_bot',
        rawData: text
      });

      // Отвечаем пользователю
      this.bot.sendMessage(
        chatId,
        `⚠️ Не удалось распознать чек.\n\n` +
        `Ошибка: ${ingestResponse.data.error}\n\n` +
        (ingestResponse.data.suggestions ? `Совет: ${ingestResponse.data.suggestions.join(', ')}` : ''),
        { reply_to_message_id: msg.message_id }
      );
    }

  } catch (error) {
    console.error('Ошибка при обработке текста:', error);

    // Отправляем в канал статус ошибки
    await this.sendProcessingStatus({
      status: 'error',
      error: error.message || 'Ошибка сервера',
      source: 'telegram_bot',
      rawData: text
    });

    // Отвечаем пользователю
    this.bot.sendMessage(
      chatId,
      `❌ Произошла ошибка при обработке сообщения.\n\n` +
      `Попробуйте отправить сообщение позже или в другом формате.`,
      { reply_to_message_id: msg.message_id }
    );
  }
}


// ==========================================
// 9. ИЗМЕНЕНИЯ В handlePhotoMessage()
// ==========================================
// ЗАМЕНИТЬ блок после удаления processingMsg до конца try:

    // Удаляем сообщение об обработке
    await this.bot.deleteMessage(chatId, processingMsg.message_id);

    if (ingestResponse.data.success) {
      const check = ingestResponse.data.data;
      const isDuplicate = ingestResponse.data.duplicate;

      if (isDuplicate) {
        // Дубликат - отправляем в канал
        await this.sendProcessingStatus({
          status: 'duplicate',
          check: check,
          source: 'telegram_bot_photo'
        });

        // Отвечаем пользователю
        const amountFormatted = this.formatAmount(Math.abs(check.amount));
        this.bot.sendMessage(
          chatId,
          `ℹ️ **Дубликат** - чек уже добавлен ранее\n\n` +
          `📅 ${check.date_display} ${check.time_display}\n` +
          `💰 ${amountFormatted} ${check.currency}\n` +
          `🏦 ${check.operator || 'Н/Д'}\n` +
          `💳 Карта: \\*${check.card_last4}`,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      } else {
        // Успешно добавлен - отправляем в канал
        await this.sendProcessingStatus({
          status: 'success',
          check: check,
          source: 'telegram_bot_photo'
        });

        // Отвечаем пользователю
        const response = this.formatCheckResponseCompact(check);
        this.bot.sendMessage(
          chatId,
          response,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      }
    } else {
      // Ошибка при обработке - отправляем в канал
      await this.sendProcessingStatus({
        status: 'error',
        error: ingestResponse.data.error || 'Не удалось распознать изображение',
        source: 'telegram_bot_photo'
      });

      // Отвечаем пользователю
      this.bot.sendMessage(
        chatId,
        `⚠️ Не удалось распознать чек.\n\n` +
        `Ошибка: ${ingestResponse.data.error}\n\n` +
        (ingestResponse.data.suggestions ? `Совет: ${ingestResponse.data.suggestions.join(', ')}` : ''),
        { reply_to_message_id: msg.message_id }
      );
    }

  } catch (error) {
    console.error('Ошибка при обработке фото:', error);

    // Отправляем в канал статус ошибки
    await this.sendProcessingStatus({
      status: 'error',
      error: error.message || 'Ошибка обработки изображения',
      source: 'telegram_bot_photo'
    });

    // Отвечаем пользователю
    this.bot.sendMessage(
      chatId,
      `❌ Произошла ошибка при обработке изображения.\n\n` +
      `Попробуйте отправить более чёткое фото или текст чека.`,
      { reply_to_message_id: msg.message_id }
    );
  }


// ==========================================
// 10. ИЗМЕНЕНИЯ В handleDocumentMessage()
// ==========================================
// ЗАМЕНИТЬ блок после удаления processingMsg до конца try (аналогично handlePhotoMessage):

    // Удаляем сообщение об обработке
    await this.bot.deleteMessage(chatId, processingMsg.message_id);

    if (ingestResponse.data.success) {
      const check = ingestResponse.data.data;
      const isDuplicate = ingestResponse.data.duplicate;

      if (isDuplicate) {
        // Дубликат - отправляем в канал
        await this.sendProcessingStatus({
          status: 'duplicate',
          check: check,
          source: 'telegram_bot_document'
        });

        // Отвечаем пользователю
        const amountFormatted = this.formatAmount(Math.abs(check.amount));
        this.bot.sendMessage(
          chatId,
          `ℹ️ **Дубликат** - чек уже добавлен ранее\n\n` +
          `📅 ${check.date_display} ${check.time_display}\n` +
          `💰 ${amountFormatted} ${check.currency}\n` +
          `🏦 ${check.operator || 'Н/Д'}\n` +
          `💳 Карта: \\*${check.card_last4}`,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      } else {
        // Успешно добавлен - отправляем в канал
        await this.sendProcessingStatus({
          status: 'success',
          check: check,
          source: 'telegram_bot_document'
        });

        // Отвечаем пользователю
        const response = this.formatCheckResponseCompact(check);
        this.bot.sendMessage(
          chatId,
          response,
          {
            reply_to_message_id: msg.message_id,
            parse_mode: 'Markdown'
          }
        );
      }
    } else {
      // Ошибка при обработке - отправляем в канал
      await this.sendProcessingStatus({
        status: 'error',
        error: ingestResponse.data.error || 'Не удалось распознать документ',
        source: 'telegram_bot_document'
      });

      // Отвечаем пользователю
      this.bot.sendMessage(
        chatId,
        `⚠️ Не удалось распознать чек.\n\n` +
        `Ошибка: ${ingestResponse.data.error}\n\n` +
        (ingestResponse.data.suggestions ? `Совет: ${ingestResponse.data.suggestions.join(', ')}` : ''),
        { reply_to_message_id: msg.message_id }
      );
    }

  } catch (error) {
    console.error('Ошибка при обработке документа:', error);

    // Отправляем в канал статус ошибки
    await this.sendProcessingStatus({
      status: 'error',
      error: error.message || 'Ошибка обработки документа',
      source: 'telegram_bot_document'
    });

    // Отвечаем пользователю
    this.bot.sendMessage(
      chatId,
      `❌ Произошла ошибка при обработке документа.\n\n` +
      `Попробуйте отправить более чёткое изображение или текст чека.`,
      { reply_to_message_id: msg.message_id }
    );
  }


// ==========================================
// ГОТОВО!
// ==========================================

/**
 * ПРИМЕЧАНИЯ:
 * 
 * 1. Добавьте в /backend/.env:
 *    TELEGRAM_CHANNEL_ID=-1001234567890
 *    TELEGRAM_CHANNEL_ENABLED=true
 * 
 * 2. Для включения debug информации в ошибках:
 *    NODE_ENV=development
 * 
 * 3. Для отключения debug информации:
 *    NODE_ENV=production
 * 
 * 4. После внесения изменений перезапустите бота:
 *    npm restart или docker restart backend_container
 * 
 * 5. В канале будут появляться:
 *    ✅ Успешные транзакции
 *    ℹ️ Дубликаты (без звука)
 *    ❌ Ошибки (с причиной и debug info если включен)
 *    ✅ Heartbeat каждый час
 */
