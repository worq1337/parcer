# План работ: Интеграция бота с Telegram каналом и отладка

## Дата: 26 октября 2025
## Версия: 1.0

---

## Цели

1. **Добавить функционал отправки транзакций в Telegram канал** - бот должен автоматически пересылать все обработанные транзакции в указанный канал
2. **Реализовать heartbeat сообщения** - каждый час бот должен отправлять в канал сообщение о том, что он работает и все оформлено
3. **Проверить и восстановить коннект** - разобраться почему нет новых транзакций и убедиться что все работает корректно

---

## Текущая архитектура

### Компоненты системы:
1. **Backend (Node.js)** - `/backend/src/services/telegramBot.js`
   - Основной бот для парсинга чеков
   - Принимает текст, фото, PDF
   - Сохраняет в PostgreSQL
   
2. **Userbot (Python/Telethon)** - `/services/userbot/userbot.py`
   - Мониторит банковские боты
   - Пересылает сообщения в основной бот
   
3. **OCR сервис** - `/services/ocr/app.py`
   - Распознавание текста на изображениях

---

## Задача 1: Интеграция с Telegram каналом

### 1.1. Создать или подключить канал

**Файл:** Настройка в админке Telegram

**Действия:**
- [ ] Создать приватный/публичный Telegram канал для транзакций
- [ ] Добавить основного бота как администратора канала с правами на отправку сообщений
- [ ] Записать ID канала (можно получить через @userinfobot или через API)

### 1.2. Добавить конфигурацию канала

**Файл:** `/backend/.env`

```env
# Добавить в конец файла:

# Telegram Channel Configuration
TELEGRAM_CHANNEL_ID=-1001234567890  # ID вашего канала (начинается с -100)
TELEGRAM_CHANNEL_ENABLED=true       # Включить/выключить отправку в канал
```

### 1.3. Модифицировать telegramBot.js

**Файл:** `/backend/src/services/telegramBot.js`

**Изменения:**

1. В конструкторе класса добавить:
```javascript
constructor() {
  this.bot = null;
  this.allowedUsers = [];
  this.channelId = null;          // Добавить
  this.channelEnabled = false;    // Добавить
  this.heartbeatInterval = null;  // Добавить для таймера
}
```

2. В методе `init()` после инициализации бота добавить:
```javascript
init() {
  // ... существующий код ...
  
  // Инициализация канала
  if (process.env.TELEGRAM_CHANNEL_ID) {
    this.channelId = process.env.TELEGRAM_CHANNEL_ID;
    this.channelEnabled = process.env.TELEGRAM_CHANNEL_ENABLED === 'true';
    
    if (this.channelEnabled) {
      console.log(`✓ Отправка в канал включена: ${this.channelId}`);
      this.startHeartbeat(); // Запуск heartbeat
    }
  }
  
  // ... остальной код ...
}
```

3. Создать новый метод для отправки в канал:
```javascript
/**
 * Отправка транзакции в канал
 */
async sendToChannel(check) {
  if (!this.channelEnabled || !this.channelId || !this.bot) {
    return;
  }

  try {
    // Форматируем сообщение для канала
    const amountFormatted = this.formatAmount(Math.abs(check.amount));
    const sign = check.amount >= 0 ? '+' : '-';
    const emoji = check.amount >= 0 ? '💚' : '💸';
    
    const message = `${emoji} **Новая транзакция**\n\n` +
      `📅 Дата: ${check.date_display} ${check.time_display}\n` +
      `💰 Сумма: ${sign} ${amountFormatted} ${check.currency}\n` +
      `🏦 Банк: ${check.operator || 'Н/Д'}\n` +
      `💳 Карта: \\*${check.card_last4}\n` +
      `🏪 Продавец: ${check.merchant || 'Н/Д'}\n` +
      `📝 Тип: ${check.transaction_type || 'Н/Д'}\n` +
      `🆔 ID чека: \`${check.id}\`\n\n` +
      `_Источник: ${check.source || 'telegram\\_bot'}_`;

    await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_notification: false
    });

    console.log(`✓ Транзакция ${check.id} отправлена в канал`);
  } catch (error) {
    console.error('❌ Ошибка отправки в канал:', error);
  }
}
```

4. Создать метод для heartbeat:
```javascript
/**
 * Запуск heartbeat - сообщения каждый час
 */
startHeartbeat() {
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
  }

  // Отправляем первое сообщение сразу
  this.sendHeartbeat();

  // Затем каждый час (3600000 мс = 1 час)
  this.heartbeatInterval = setInterval(() => {
    this.sendHeartbeat();
  }, 3600000);

  console.log('✓ Heartbeat запущен (каждый час)');
}

/**
 * Отправка heartbeat сообщения
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
      minute: '2-digit'
    });

    const message = `✅ **Бот работает**\n\n` +
      `🕐 Время: ${now} (Ташкент)\n` +
      `📊 Статус: Все системы работают\n` +
      `🔄 Мониторинг активен\n` +
      `✨ Все транзакции обрабатываются автоматически\n\n` +
      `_Следующая проверка через 1 час_`;

    await this.bot.sendMessage(this.channelId, message, {
      parse_mode: 'Markdown',
      disable_notification: true // Без звука чтобы не беспокоить
    });

    console.log(`✓ Heartbeat отправлен в ${now}`);
  } catch (error) {
    console.error('❌ Ошибка отправки heartbeat:', error);
  }
}

/**
 * Остановка heartbeat при завершении работы
 */
stopHeartbeat() {
  if (this.heartbeatInterval) {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
    console.log('✓ Heartbeat остановлен');
  }
}
```

5. Добавить вызов `sendToChannel` после успешной обработки:

В методах `handleTextMessage`, `handlePhotoMessage`, `handleDocumentMessage` после успешного добавления чека добавить:
```javascript
// После if (ingestResponse.data.success) {
  const check = ingestResponse.data.data;
  const isDuplicate = ingestResponse.data.duplicate;

  if (!isDuplicate) {
    // Отправляем в канал
    await this.sendToChannel(check);  // ДОБАВИТЬ ЭТУ СТРОКУ
  }
  
  // ... остальной код ...
}
```

6. Обновить метод `stop()`:
```javascript
stop() {
  this.stopHeartbeat();  // ДОБАВИТЬ ЭТУ СТРОКУ
  
  if (this.bot) {
    this.bot.stopPolling();
    console.log('Telegram бот остановлен');
  }
}
```

---

## Задача 2: Проверка и восстановление коннекта

### 2.1. Проверить состояние userbot

**Файл:** `/services/userbot/userbot.py`

**Действия:**
- [ ] Убедиться что userbot авторизован
- [ ] Проверить что указаны правильные ID банковских ботов в `TELEGRAM_MONITOR_IDS`
- [ ] Проверить что `OUR_BOT_ID` указан правильно

**Команды для проверки:**
```bash
# Зайти в контейнер userbot (если используется Docker)
docker exec -it userbot_container bash

# Или локально проверить статус через API
curl http://localhost:5001/status
```

### 2.2. Проверить переменные окружения

**Файл:** `/backend/.env`

Убедиться что установлены:
```env
TELEGRAM_BOT_TOKEN=8482297276:AAFVpe08Qua3xYUobf0CHpSERK7TdZRaSiE
TELEGRAM_MONITOR_IDS=915326936,856264490,7028509569
OUR_BOT_ID=8482297276
USERBOT_SERVICE_URL=http://localhost:5001
```

### 2.3. Добавить расширенное логирование

**Файл:** `/backend/src/services/telegramBot.js`

В метод `handleTextMessage` (строка ~260) добавить логи:
```javascript
async handleTextMessage(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // ДОБАВИТЬ ЛОИГРОВАНИЕ
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📨 Новое сообщение получено:');
  console.log(`   User ID: ${userId}`);
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Text length: ${text.length}`);
  console.log(`   First 100 chars: ${text.substring(0, 100)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ... существующий код ...
}
```

**Файл:** `/services/userbot/userbot.py`

В метод `handle_new_message` (строка ~251) улучшить логирование:
```python
async def handle_new_message(self, event):
    try:
        sender = await event.get_sender()
        
        # Логируем ВСЕ сообщения для отладки
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"📨 Получено сообщение:")
        print(f"   От: {sender.first_name if hasattr(sender, 'first_name') else 'Unknown'}")
        print(f"   ID отправителя: {sender.id if hasattr(sender, 'id') else 'Unknown'}")
        print(f"   Тип: {type(sender).__name__}")
        
        # Проверяем, является ли отправитель одним из мониторимых ботов
        if isinstance(sender, User) and sender.id in config.MONITOR_BOT_IDS:
            print(f"✅ Это мониторимый бот!")
            # ... существующий код пересылки ...
        else:
            print(f"❌ Это НЕ мониторимый бот (ID: {sender.id if hasattr(sender, 'id') else 'Unknown'})")
            print(f"   Ожидаемые ID: {config.MONITOR_BOT_IDS}")
        
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    except Exception as e:
        print(f"❌ Ошибка обработки сообщения: {e}")
```

### 2.4. Проверка работы через тестовое сообщение

**Действия:**
1. Отправить тестовое сообщение напрямую в бота:
```
Karta: *1234
Summa: 100.00 UZS
Sana: 26.10.2025 15:30
Merchant: Test Shop
```

2. Проверить логи backend:
```bash
# Если Docker
docker logs -f backend_container

# Если локально
npm run dev
```

3. Проверить логи userbot:
```bash
# Если Docker  
docker logs -f userbot_container

# Если локально
cd services/userbot && python app.py
```

### 2.5. Проверка базы данных

**SQL запросы для проверки:**

```sql
-- Проверить последние добавленные чеки
SELECT id, date, time, amount, currency, operator, source, created_at
FROM checks
ORDER BY created_at DESC
LIMIT 10;

-- Проверить количество чеков по источникам
SELECT source, COUNT(*) as count
FROM checks
GROUP BY source
ORDER BY count DESC;

-- Проверить чеки за последние 24 часа
SELECT COUNT(*) as checks_today
FROM checks
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

---

## Задача 3: Тестирование

### 3.1. Тестирование отправки в канал

**Чек-лист:**
- [ ] Создан Telegram канал
- [ ] Бот добавлен как администратор канала
- [ ] ID канала добавлен в `.env`
- [ ] Отправить тестовый чек в бота
- [ ] Убедиться что чек появился в канале
- [ ] Проверить форматирование сообщения

### 3.2. Тестирование heartbeat

**Чек-лист:**
- [ ] После запуска бота в канале появилось первое heartbeat сообщение
- [ ] Подождать 5-10 минут и проверить что в логах видно "Heartbeat запущен"
- [ ] Для быстрого теста временно изменить интервал с 3600000 на 60000 (1 минута)
- [ ] Убедиться что heartbeat приходит каждую минуту
- [ ] Вернуть интервал на 3600000

### 3.3. Тестирование userbot → бот → канал

**Сценарий:**
1. Убедиться что userbot запущен и авторизован
2. Отправить сообщение в один из банковских ботов (из `TELEGRAM_MONITOR_IDS`)
3. Проверить логи userbot - должна быть запись о получении и пересылке
4. Проверить логи основного бота - должна быть запись о получении и обработке
5. Проверить канал - должно появиться сообщение о новой транзакции

---

## Задача 4: Отладка "нет новых транзакций"

### 4.1. Чек-лист диагностики

**Проверить следующее:**

- [ ] **Userbot работает?**
  ```bash
  curl http://localhost:5001/status
  # Ожидаемый ответ: {"running": true, "authorized": true}
  ```

- [ ] **Userbot авторизован?**
  - Проверить наличие файла сессии в `/services/userbot/sessions/`
  - Если нет - выполнить логин через API

- [ ] **Правильные ID банковских ботов?**
  - Проверить `TELEGRAM_MONITOR_IDS` в `.env`
  - Отправить тестовое сообщение от реального банковского бота
  - Посмотреть логи - должен быть ID отправителя

- [ ] **Основной бот получает сообщения?**
  - Отправить тестовое сообщение напрямую в бота
  - Проверить логи - должна быть обработка

- [ ] **OCR сервис работает?**
  ```bash
  curl http://localhost:5000/health
  # Ожидаемый ответ: {"status": "ok"}
  ```

- [ ] **База данных доступна?**
  ```bash
  # Проверить подключение
  psql -h localhost -p 5433 -U postgres -d receipt_parser -c "SELECT COUNT(*) FROM checks;"
  ```

### 4.2. Возможные проблемы и решения

| Проблема | Решение |
|----------|---------|
| Userbot не запущен | `cd services/userbot && python app.py` |
| Userbot не авторизован | POST запрос на `/login` с номером телефона |
| Неправильные ID ботов | Получить правильные ID через @userinfobot |
| Основной бот не отвечает | Проверить TELEGRAM_BOT_TOKEN, перезапустить |
| OCR не работает | `cd services/ocr && python app.py` |
| База данных недоступна | Проверить Docker контейнер PostgreSQL |

---

## Задача 5: Документация для пользователя

### 5.1. Создать инструкцию по настройке канала

**Файл:** `/docs/CHANNEL-SETUP.md`

Содержание:
1. Как создать Telegram канал
2. Как получить ID канала
3. Как добавить бота в канал
4. Как настроить права бота
5. Как включить отправку в `.env`

### 5.2. Обновить README.md

Добавить раздел:
- Интеграция с каналом
- Heartbeat мониторинг
- Troubleshooting

---

## Приоритеты выполнения

### Высокий приоритет (сделать в первую очередь):
1. ✅ Задача 2.1-2.4: Проверка и восстановление коннекта userbot
2. ✅ Задача 2.5: Проверка базы данных
3. ✅ Задача 4: Полная диагностика "нет транзакций"

### Средний приоритет (после восстановления работы):
1. ✅ Задача 1.1-1.2: Настройка канала и конфигурации
2. ✅ Задача 1.3: Добавление функционала отправки в канал
3. ✅ Задача 3: Тестирование

### Низкий приоритет (когда все работает):
1. ✅ Задача 5: Документация

---

## Ожидаемый результат

После выполнения всех задач:

1. **Userbot** стабильно мониторит банковские боты и пересылает сообщения
2. **Основной бот** обрабатывает все входящие сообщения (текст, фото, PDF)
3. **Все успешные транзакции** автоматически попадают в указанный Telegram канал
4. **Каждый час** в канал приходит heartbeat сообщение о работе системы
5. **Логи** детально показывают весь процесс обработки
6. **База данных** содержит все обработанные транзакции

---

## Контакты для вопросов

Если возникнут вопросы по реализации - обращайтесь!

---

## История изменений

- **26.10.2025** - Первая версия плана работ
