# Дополнение: Отправка статусов обработки в канал

## 📊 Что добавляем

Бот будет отправлять в канал **ВСЕ** попытки обработки транзакций:
- ✅ Успешно добавлено в таблицу
- ℹ️ Дубликат (уже есть в базе)
- ❌ Ошибка обработки (с причиной)

---

## 🔧 Изменения в коде

### 1. Новый метод: sendProcessingStatus

**Добавить в telegramBot.js перед методом stop():**

```javascript
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
        
        // Если есть сырые данные, добавляем их для отладки (опционально)
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
```

---

### 2. Удалить старый метод sendToChannel

**Удалите метод `sendToChannel` который мы добавили ранее** - теперь вместо него будет использоваться `sendProcessingStatus`.

---

### 3. Обновить handleTextMessage

**Заменить весь блок обработки результата после вызова API:**

```javascript
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
```

---

### 4. Обновить handlePhotoMessage

**Заменить блок обработки результата:**

```javascript
// После: await this.bot.deleteMessage(chatId, processingMsg.message_id);

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
```

**И в блоке catch:**

```javascript
catch (error) {
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
```

---

### 5. Обновить handleDocumentMessage

**Аналогично handlePhotoMessage** - заменить блоки обработки успеха и ошибок, изменив source на `'telegram_bot_document'`.

---

## 📊 Примеры сообщений в канале

### ✅ Успешное добавление:
```
✅ Транзакция добавлена

💸 Детали:
📅 Дата: 26.10.2025 15:30
💰 Сумма: - 150 000.00 UZS
🏦 Банк: Uzum Bank
💳 Карта: *1234
🏪 Продавец: Uzum Market
📝 Тип: Покупка
🆔 ID: 12345

📥 Источник: telegram_bot
```

### ℹ️ Дубликат:
```
ℹ️ Дубликат транзакции

⚠️ Эта транзакция уже есть в базе

📅 Дата: 26.10.2025 15:30
💰 Сумма: - 150 000.00 UZS
🏦 Банк: Uzum Bank
💳 Карта: *1234
🆔 ID существующей записи: 12345

📥 Источник: telegram_bot
```

### ❌ Ошибка:
```
❌ Ошибка обработки

⚠️ Не удалось добавить транзакцию

🔴 Причина:
Не найдена дата в сообщении

📥 Источник: telegram_bot

🔍 Debug info:
Karta: *1234
Summa: 150000 UZS
Merchant: Test...
```

---

## 🎛️ Настройки

### Включить/выключить debug информацию

В `.env` установите:
```env
# Для production (без debug info в ошибках)
NODE_ENV=production

# Для development (с debug info)
NODE_ENV=development
```

### Отключить уведомления для дубликатов

По умолчанию дубликаты отправляются без звука (`disable_notification: true`).

Если хотите чтобы были уведомления, измените в методе `sendProcessingStatus`:
```javascript
await this.bot.sendMessage(this.channelId, message, {
  parse_mode: 'Markdown',
  disable_notification: false  // Изменить на false
});
```

---

## 🔍 Что отслеживается

| Событие | Статус | Отправляется в канал | Детали |
|---------|--------|----------------------|--------|
| Успешное добавление | `success` | ✅ Да | Полная информация о транзакции |
| Дубликат | `duplicate` | ✅ Да (без звука) | Информация о существующей записи |
| Ошибка парсинга | `error` | ✅ Да | Причина ошибки + debug info |
| Ошибка OCR | `error` | ✅ Да | Причина ошибки |
| Ошибка сервера | `error` | ✅ Да | Текст ошибки |
| Ошибка БД | `error` | ✅ Да | Текст ошибки |

---

## 📈 Преимущества

1. **Полная прозрачность** - вы видите ВСЕ что происходит с транзакциями
2. **Легкая отладка** - ошибки сразу видны в канале
3. **Мониторинг качества** - можно отследить процент успешных обработок
4. **Контроль дубликатов** - видно какие транзакции приходят повторно

---

## 📊 Статистика (опционально)

Если хотите собирать статистику, можно добавить периодическое сообщение:

```javascript
/**
 * Отправка ежедневной статистики
 */
async sendDailyStats() {
  if (!this.channelEnabled || !this.channelId || !this.bot) {
    return;
  }

  try {
    const Check = require('../models/Check');
    
    // Получаем статистику за сегодня
    const today = new Date().toISOString().split('T')[0];
    const stats = await Check.getStatsForDate(today);
    
    const message = `📊 **Статистика за сегодня**\n\n` +
      `✅ Успешно: ${stats.success}\n` +
      `ℹ️ Дубликатов: ${stats.duplicates}\n` +
      `❌ Ошибок: ${stats.errors}\n` +
      `📈 Всего попыток: ${stats.total}\n\n` +
      `💰 Общая сумма: ${this.formatAmount(stats.totalAmount)} UZS\n` +
      `📅 Дата: ${new Date().toLocaleDateString('ru-RU')}`;

    await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_notification: true
    });

    console.log('✓ Ежедневная статистика отправлена');
  } catch (error) {
    console.error('❌ Ошибка отправки статистики:', error);
  }
}

// Вызывать раз в день, например в 23:00
// Добавить в init():
const now = new Date();
const night = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate(),
  23, 0, 0, 0
);

if (now > night) {
  night.setDate(night.getDate() + 1);
}

const msToMidnight = night.getTime() - now.getTime();

setTimeout(() => {
  this.sendDailyStats();
  // Затем каждые 24 часа
  setInterval(() => this.sendDailyStats(), 86400000);
}, msToMidnight);
```

---

## ✅ Чек-лист внедрения

- [ ] Добавлен метод `sendProcessingStatus`
- [ ] Удален старый метод `sendToChannel`
- [ ] Обновлен `handleTextMessage`
- [ ] Обновлен `handlePhotoMessage`
- [ ] Обновлен `handleDocumentMessage`
- [ ] Протестирована успешная транзакция
- [ ] Протестирован дубликат
- [ ] Протестирована ошибка обработки
- [ ] Проверены сообщения в канале
- [ ] Проверено форматирование

---

## 🎯 Итоговый результат

После внедрения в канале будут появляться **все** события:
- ✅ Успешные транзакции с полными деталями
- ℹ️ Дубликаты с информацией о существующей записи
- ❌ Ошибки с причинами и debug информацией

Это даст вам полный контроль над процессом обработки транзакций!
