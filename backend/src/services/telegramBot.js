const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // patch-017: для вызова ingest API
const { sanitizeForLogging } = require('../utils/security'); // patch-017 §8

// patch-017: URL локального API
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.allowedUsers = [];
  }

  /**
   * Инициализация бота
   */
  init() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN не установлен. Бот не будет запущен.');
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });

    // Получаем список разрешенных пользователей
    if (process.env.TELEGRAM_ALLOWED_USERS) {
      this.allowedUsers = process.env.TELEGRAM_ALLOWED_USERS.split(',').map(id => parseInt(id.trim()));
    }

    this.setupHandlers();
    console.log('✓ Telegram бот запущен');
  }

  /**
   * Настройка обработчиков сообщений
   */
  setupHandlers() {
    // patch-017 §1: Команда /start с инлайн-кнопками
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;

      const keyboard = {
        inline_keyboard: [
          [{ text: '➕ Добавить чек', callback_data: 'help_add' }],
          [{ text: '🧾 Мои последние', callback_data: 'last_5' }],
          [{ text: '⚙️ Настройки', callback_data: 'settings' }],
          [{ text: 'ℹ️ Помощь', callback_data: 'help' }],
        ],
      };

      this.bot.sendMessage(
        chatId,
        `👋 Привет! Я бот для парсинга банковских чеков.

📲 **Что я умею:**
• Распознавать чеки из SMS и Telegram
• Парсить фото чеков (скриншоты)
• Автоматически определять банк и тип операции

💡 **Как пользоваться:**
Скопируйте текст чека или пришлите фото/PDF одним сообщением.

🆔 Ваш ID: \`${userId}\`

Выберите действие ниже или отправьте чек сразу.`,
        {
          reply_markup: keyboard,
          parse_mode: 'Markdown'
        }
      );
    });

    // patch-017 §1: Команда /help
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;

      this.bot.sendMessage(
        chatId,
        `📖 **Справка по использованию**

**Поддерживаемые форматы:**
✅ Текст SMS от узбекских банков
✅ Telegram-каналы: HUMO Card, CardXabar, NBU Card
✅ Фото чеков (скриншоты из приложений)
✅ PDF-документы с чеками

**Примеры правильных сообщений:**

📝 *Текст SMS:*
\`\`\`
Karta: *1234
Summa: 150000.00 UZS
Sana: 15.10.2025 14:30
Merchant: Uzum Market
\`\`\`

📸 *Фото чека:*
Просто отправьте скриншот чека из приложения банка.

**Что делать при ошибке:**
• Проверьте, что сообщение содержит дату, сумму и номер карты
• Убедитесь, что фото чёткое и читаемое
• Попробуйте отправить текст вместо фото

**Команды:**
/last - Последние 5 чеков
/settings - Настройки отображения
/ping - Проверить статус бота
/id - Узнать свой ID
/dict - Справочник банков`,
        { parse_mode: 'Markdown' }
      );
    });

    // patch-017 §1: Команда /last - последние N чеков
    this.bot.onText(/\/last(?:\s+(\d+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const limit = match[1] ? parseInt(match[1], 10) : 5;

      try {
        const recentChecks = await Check.getRecent(Math.min(limit, 20));

        if (recentChecks.length === 0) {
          this.bot.sendMessage(chatId, '📭 У вас пока нет добавленных чеков.');
          return;
        }

        let message = `🧾 **Последние ${recentChecks.length} чек(ов):**\n\n`;

        recentChecks.forEach((check, index) => {
          const amountFormatted = this.formatAmount(Math.abs(check.amount));
          const sign = check.amount >= 0 ? '+' : '-';

          message += `${index + 1}. № ${check.id}\n`;
          message += `   📅 ${check.date_display} ${check.time_display}\n`;
          message += `   💰 ${sign} ${amountFormatted} ${check.currency}\n`;
          message += `   🏦 ${check.operator || 'Н/Д'}\n`;
          message += `   💳 \\*${check.card_last4}\n\n`;
        });

        this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error('Ошибка при получении последних чеков:', error);
        this.bot.sendMessage(chatId, '❌ Ошибка при загрузке чеков. Попробуйте позже.');
      }
    });

    // patch-017 §1: Команда /settings - настройки
    this.bot.onText(/\/settings/, (msg) => {
      const chatId = msg.chat.id;

      const keyboard = {
        inline_keyboard: [
          [
            { text: 'Разделитель тысяч: пробел', callback_data: 'setting_thousands_space' },
          ],
          [
            { text: 'Минус у списаний: вкл', callback_data: 'setting_minus_on' },
          ],
          [
            { text: 'P2P символ: ✓', callback_data: 'setting_p2p_check' },
          ],
          [
            { text: 'Уведомления: вкл', callback_data: 'setting_notifications_on' },
          ],
        ],
      };

      this.bot.sendMessage(
        chatId,
        `⚙️ **Настройки отображения**

Выберите параметр для изменения:

🔢 **Разделитель тысяч** - формат больших сумм
➖ **Минус у списаний** - показывать "-" перед расходами
🔄 **P2P символ** - метка P2P переводов
🔔 **Уведомления** - фоновые уведомления о новых чеках`,
        {
          reply_markup: keyboard,
          parse_mode: 'Markdown',
        }
      );
    });

    // patch-017 §1: Команда /ping - healthcheck
    this.bot.onText(/\/ping/, async (msg) => {
      const chatId = msg.chat.id;
      const version = process.env.npm_package_version || '1.0.0';

      this.bot.sendMessage(
        chatId,
        `✅ Бот онлайн\n🤖 Версия: ${version}\n⏱ ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`
      );
    });

    // patch-017 §1: Команда /id - показать user ID
    this.bot.onText(/\/id/, (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const username = msg.from.username || 'нет';

      this.bot.sendMessage(
        chatId,
        `🆔 **Ваши данные:**\n\nUser ID: \`${userId}\`\nChat ID: \`${chatId}\`\nUsername: @${username}`,
        { parse_mode: 'Markdown' }
      );
    });

    // patch-017 §1: Команда /dict - справочник операторов
    this.bot.onText(/\/dict(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const searchQuery = match[1]?.trim();

      try {
        const Operator = require('../models/Operator');

        if (searchQuery) {
          // Поиск по запросу
          const operators = await Operator.search(searchQuery);

          if (operators.length === 0) {
            this.bot.sendMessage(chatId, `🔍 Ничего не найдено по запросу: "${searchQuery}"`);
            return;
          }

          let message = `🔍 **Результаты поиска "${searchQuery}":**\n\n`;

          operators.slice(0, 10).forEach((op, index) => {
            message += `${index + 1}. **${op.operator}**\n`;
            message += `   📱 Приложение: ${op.app || 'Н/Д'}\n`;
            message += `   💳 Тип: ${op.transaction_type || 'Н/Д'}\n\n`;
          });

          if (operators.length > 10) {
            message += `\n_...и ещё ${operators.length - 10} результат(ов)_`;
          }

          this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } else {
          // Показать топ операторов
          const topOperators = await Operator.getTop(10);

          let message = `📖 **Справочник операторов**\n\n`;
          message += `Всего в базе: ${topOperators.length} оператор(ов)\n\n`;
          message += `Используйте \`/dict [запрос]\` для поиска.\n\n`;
          message += `**Популярные операторы:**\n\n`;

          topOperators.forEach((op, index) => {
            message += `${index + 1}. ${op.operator} (${op.app || 'N/A'})\n`;
          });

          this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error('Ошибка при получении операторов:', error);
        this.bot.sendMessage(chatId, '❌ Ошибка при загрузке справочника.');
      }
    });

    // patch-017 §1: Обработка callback_query (нажатия на инлайн-кнопки)
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      // Подтверждаем получение callback
      this.bot.answerCallbackQuery(query.id);

      if (data === 'help_add') {
        this.bot.sendMessage(
          chatId,
          `➕ **Как добавить чек:**\n\n1️⃣ Скопируйте текст SMS от банка\n2️⃣ Или сделайте скриншот чека в приложении\n3️⃣ Отправьте мне в этот чат\n\nЯ автоматически распарсю и сохраню данные!`
        );
      } else if (data === 'last_5') {
        // Вызываем /last
        this.bot.sendMessage(chatId, '/last');
      } else if (data === 'settings') {
        // Вызываем /settings
        this.bot.sendMessage(chatId, '/settings');
      } else if (data === 'help') {
        // Вызываем /help
        this.bot.sendMessage(chatId, '/help');
      } else if (data.startsWith('setting_')) {
        this.bot.sendMessage(chatId, '⚙️ Настройки пока не реализованы. Скоро будет доступно!');
      }
    });

    // patch-017 §2: Обработка фото
    this.bot.on('photo', async (msg) => {
      await this.handlePhotoMessage(msg);
    });

    // patch-017 §2: Обработка документов (PDF)
    this.bot.on('document', async (msg) => {
      await this.handleDocumentMessage(msg);
    });

    // patch-017 §7: Обработка текстовых сообщений через /api/ingest/text
    this.bot.on('message', async (msg) => {
      // Пропускаем команды
      if (msg.text && msg.text.startsWith('/')) {
        return;
      }

      // Пропускаем фото и документы (они обрабатываются отдельными handlers)
      if (msg.photo || msg.document) {
        return;
      }

      const chatId = msg.chat.id;
      const userId = msg.from.id;

      // Проверка разрешенных пользователей
      if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(userId)) {
        this.bot.sendMessage(chatId, '⚠️ У вас нет доступа к этому боту.');
        return;
      }

      // Проверяем, есть ли текст
      if (!msg.text) {
        return;
      }

      const text = msg.text;

      try {
        // patch-017 §7: Вызываем /api/ingest/text вместо прямого парсинга
        const ingestResponse = await axios.post(`${API_BASE_URL}/ingest/text`, {
          text,
          explicit: 'telegram',
          source: 'telegram_bot',
          chat_id: chatId,
          message_id: msg.message_id,
          user_id: userId
        });

        if (!ingestResponse.data.success) {
          // patch-017 §1: используем reply вместо нового сообщения
          this.bot.sendMessage(
            chatId,
            `⚠️ Не удалось распознать чек.\n\n` +
            `Ошибка: ${ingestResponse.data.error}\n\n` +
            `Пожалуйста, проверьте формат сообщения или отправьте /help для примеров.`,
            { reply_to_message_id: msg.message_id }
          );
          return;
        }

        const check = ingestResponse.data.data;
        const isDuplicate = ingestResponse.data.duplicate;

        if (isDuplicate) {
          // patch-017 §1: форматированный ответ с reply
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
          return;
        }

        // patch-017 §1: Новый формат ответа согласно спецификации
        // ✅ Добавлено: № 142 · SQB · Оплата · - 200 000,00 UZS · 06.04.2025 13:18
        // Источник: Telegram | Карта: *6714
        const response = this.formatCheckResponseCompact(check);

        this.bot.sendMessage(
          chatId,
          response,
          {
            reply_to_message_id: msg.message_id
          }
        );

      } catch (error) {
        // patch-017 §8: безопасное логирование без конфиденциальных данных
        const sanitizedError = sanitizeForLogging({
          message: error.message,
          chatId,
          userId,
          timestamp: new Date().toISOString()
        });
        console.error('Ошибка при обработке сообщения от бота:', sanitizedError);

        this.bot.sendMessage(
          chatId,
          `❌ Произошла ошибка при обработке чека.\n\n` +
          `Попробуйте ещё раз или обратитесь к администратору.`,
          { reply_to_message_id: msg.message_id }
        );
      }
    });

    // Обработка ошибок
    this.bot.on('polling_error', (error) => {
      console.error('Ошибка Telegram бота:', error);
    });
  }

  /**
   * Форматирование ответа с информацией о чеке (расширенный)
   */
  formatCheckResponse(check) {
    const amountSymbol = check.amount >= 0 ? '+' : '-';
    const amountAbs = Math.abs(check.amount);

    return `
№ ${check.id}
📅 ${check.date_display} (${check.weekday}) ${check.time_display}
💳 Карта: \\*${check.card_last4}
${amountSymbol} ${this.formatAmount(amountAbs)} ${check.currency}
📍 ${check.operator}
${check.app ? `📱 ${check.app}` : ''}
💰 Остаток: ${check.balance ? this.formatAmount(check.balance) + ' ' + check.currency : 'Н/Д'}
🏷 ${check.transaction_type}
${check.is_p2p ? '🔄 P2P перевод' : ''}
    `.trim();
  }

  /**
   * Компактное форматирование ответа для чека
   * patch-017 §1: формат согласно спецификации
   * Пример: ✅ Добавлено: № 142 · SQB · Оплата · - 200 000,00 UZS · 06.04.2025 13:18
   */
  formatCheckResponseCompact(check) {
    const amountAbs = Math.abs(check.amount);
    const amountFormatted = this.formatAmount(amountAbs);
    const sign = check.amount < 0 ? '- ' : '';

    // Первая строка: ✅ + № + Оператор + Тип + Сумма + Дата
    let line1 = `✅ Добавлено: № ${check.id} · ${check.operator || 'Н/Д'}`;

    if (check.is_p2p) {
      line1 += ' · P2P';
    } else if (check.transaction_type) {
      line1 += ` · ${check.transaction_type}`;
    }

    line1 += ` · ${sign}${amountFormatted} ${check.currency}`;
    line1 += ` · ${check.date_display} ${check.time_display}`;

    // Вторая строка: Источник + Карта
    const line2 = `Источник: ${check.source || 'Telegram'} | Карта: *${check.card_last4}`;

    return `${line1}\n${line2}`;
  }

  /**
   * Экранирование специальных символов Telegram Markdown
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return String(text)
      .replace(/\\/g, '\\\\')  // Backslash first
      .replace(/\*/g, '\\*')   // Asterisk
      .replace(/_/g, '\\_')    // Underscore
      .replace(/\[/g, '\\[')   // Square bracket [
      .replace(/\]/g, '\\]')   // Square bracket ]
      .replace(/\(/g, '\\(')   // Parenthesis (
      .replace(/\)/g, '\\)')   // Parenthesis )
      .replace(/~/g, '\\~')    // Tilde
      .replace(/`/g, '\\`')    // Backtick
      .replace(/>/g, '\\>')    // Greater than
      .replace(/#/g, '\\#')    // Hash
      .replace(/\+/g, '\\+')   // Plus
      .replace(/-/g, '\\-')    // Minus
      .replace(/=/g, '\\=')    // Equal
      .replace(/\|/g, '\\|')   // Pipe
      .replace(/\{/g, '\\{')   // Curly brace {
      .replace(/\}/g, '\\}')   // Curly brace }
      .replace(/\./g, '\\.')   // Dot
      .replace(/!/g, '\\!');   // Exclamation
  }

  /**
   * Форматирование суммы с разделителями
   * Экранируем специальные символы для Telegram Markdown
   */
  formatAmount(amount) {
    const formatted = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);

    // Заменяем неразрывные пробелы (\u00A0) на обычные
    // чтобы избежать проблем с Markdown
    return formatted.replace(/\u00A0/g, ' ');
  }

  /**
   * patch-017 §2: Обработка фото чеков
   */
  async handlePhotoMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Проверка разрешенных пользователей
    if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(userId)) {
      this.bot.sendMessage(chatId, '⚠️ У вас нет доступа к этому боту.');
      return;
    }

    try {
      // Отправляем сообщение о начале обработки
      const processingMsg = await this.bot.sendMessage(
        chatId,
        '⏳ Обрабатываю изображение через OCR...',
        { reply_to_message_id: msg.message_id }
      );

      // Получаем наибольшее фото (последнее в массиве)
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;

      // Скачиваем файл
      const file = await this.bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Загружаем файл и конвертируем в base64
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const fileBase64 = Buffer.from(response.data).toString('base64');

      // Вызываем ingest API
      const ingestResponse = await axios.post(`${API_BASE_URL}/ingest/image`, {
        file_base64: fileBase64,
        explicit: 'telegram',
        source: 'telegram_bot',
        chat_id: chatId,
        message_id: msg.message_id,
        user_id: userId,
        mime_type: 'image/jpeg'
      });

      // Удаляем сообщение об обработке
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      if (ingestResponse.data.success) {
        const check = ingestResponse.data.data;
        const isDuplicate = ingestResponse.data.duplicate;

        if (isDuplicate) {
          // Дубликат
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
          // Успешно добавлен
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
        // Ошибка при обработке
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
      this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при обработке изображения.\n\n` +
        `Попробуйте отправить более чёткое фото или текст чека.`,
        { reply_to_message_id: msg.message_id }
      );
    }
  }

  /**
   * patch-017 §2: Обработка документов (PDF)
   */
  async handleDocumentMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Проверка разрешенных пользователей
    if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(userId)) {
      this.bot.sendMessage(chatId, '⚠️ У вас нет доступа к этому боту.');
      return;
    }

    const document = msg.document;

    // Проверяем mime_type (только изображения и PDF)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(document.mime_type)) {
      this.bot.sendMessage(
        chatId,
        '⚠️ Поддерживаются только изображения (JPG, PNG) и PDF файлы.',
        { reply_to_message_id: msg.message_id }
      );
      return;
    }

    try {
      // Отправляем сообщение о начале обработки
      const processingMsg = await this.bot.sendMessage(
        chatId,
        '⏳ Обрабатываю документ через OCR...',
        { reply_to_message_id: msg.message_id }
      );

      const fileId = document.file_id;

      // Скачиваем файл
      const file = await this.bot.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Загружаем файл и конвертируем в base64
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const fileBase64 = Buffer.from(response.data).toString('base64');

      // Вызываем ingest API
      const ingestResponse = await axios.post(`${API_BASE_URL}/ingest/image`, {
        file_base64: fileBase64,
        explicit: 'telegram',
        source: 'telegram_bot',
        chat_id: chatId,
        message_id: msg.message_id,
        user_id: userId,
        mime_type: document.mime_type,
        file_size: document.file_size
      });

      // Удаляем сообщение об обработке
      await this.bot.deleteMessage(chatId, processingMsg.message_id);

      if (ingestResponse.data.success) {
        const check = ingestResponse.data.data;
        const isDuplicate = ingestResponse.data.duplicate;

        if (isDuplicate) {
          // Дубликат
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
          // Успешно добавлен
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
        // Ошибка при обработке
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
      this.bot.sendMessage(
        chatId,
        `❌ Произошла ошибка при обработке документа.\n\n` +
        `Попробуйте отправить более чёткое изображение или текст чека.`,
        { reply_to_message_id: msg.message_id }
      );
    }
  }

  /**
   * Отправка сообщения пользователю
   */
  async sendMessage(userId, message) {
    if (!this.bot) {
      console.warn('Бот не инициализирован');
      return;
    }

    try {
      await this.bot.sendMessage(userId, message);
    } catch (error) {
      console.error('Ошибка при отправке сообщения:', error);
    }
  }

  /**
   * Остановка бота
   */
  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('Telegram бот остановлен');
    }
  }
}

module.exports = new TelegramBotService();
