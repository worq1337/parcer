# Quick Start - Интеграция канала и отладка

## 🚀 Быстрый старт

### Шаг 1: Отладка (ПЕРВЫМ ДЕЛОМ!)

```bash
# 1. Проверить статус userbot
curl http://localhost:5001/status

# 2. Проверить последние чеки в БД
psql -h localhost -p 5433 -U postgres -d receipt_parser -c "SELECT id, date, time, amount, source, created_at FROM checks ORDER BY created_at DESC LIMIT 5;"

# 3. Посмотреть логи
docker logs -f userbot_container
docker logs -f backend_container
```

**Если userbot не работает:**
```bash
cd services/userbot
python app.py
```

**Если нужна авторизация userbot:**
```bash
curl -X POST http://localhost:5001/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+998901234567"}'
```

### Шаг 2: Настройка канала

1. **Создать канал** в Telegram
2. **Добавить бота** (@ВашБот) как администратора с правом отправки
3. **Получить ID канала:**
   - Переслать сообщение из канала в @userinfobot
   - Скопировать ID (начинается с -100...)

4. **Добавить в `.env`:**
```env
TELEGRAM_CHANNEL_ID=-1001234567890
TELEGRAM_CHANNEL_ENABLED=true
```

### Шаг 3: Добавить код в telegramBot.js

**В конструктор добавить:**
```javascript
this.channelId = null;
this.channelEnabled = false;
this.heartbeatInterval = null;
```

**В init() добавить:**
```javascript
if (process.env.TELEGRAM_CHANNEL_ID) {
  this.channelId = process.env.TELEGRAM_CHANNEL_ID;
  this.channelEnabled = process.env.TELEGRAM_CHANNEL_ENABLED === 'true';
  if (this.channelEnabled) {
    console.log(`✓ Отправка в канал: ${this.channelId}`);
    this.startHeartbeat();
  }
}
```

**Добавить методы:** (см. полный план в PLAN-RABOTY.md)
- `sendToChannel(check)`
- `startHeartbeat()`
- `sendHeartbeat()`
- `stopHeartbeat()`

**В handleTextMessage/handlePhotoMessage/handleDocumentMessage после успеха:**
```javascript
if (!isDuplicate) {
  await this.sendToChannel(check);
}
```

**В stop():**
```javascript
this.stopHeartbeat();
```

### Шаг 4: Тест

```bash
# Перезапустить бота
npm restart

# Отправить тест в бота:
# Karta: *1234
# Summa: 100.00 UZS
# Sana: 26.10.2025 15:30
# Merchant: Test

# Проверить:
# 1. Логи показывают отправку в канал?
# 2. Сообщение появилось в канале?
# 3. Heartbeat запущен?
```

## 📋 Чек-лист

- [ ] Userbot работает и авторизован
- [ ] Основной бот получает сообщения
- [ ] База данных доступна
- [ ] OCR сервис работает
- [ ] Канал создан и настроен
- [ ] Бот добавлен в канал как админ
- [ ] ID канала в .env
- [ ] Код добавлен в telegramBot.js
- [ ] Тест отправки прошел успешно
- [ ] Heartbeat работает

## 🔧 Если что-то не работает

### Userbot не пересылает сообщения
- Проверить авторизацию: `curl http://localhost:5001/status`
- Проверить TELEGRAM_MONITOR_IDS в .env
- Посмотреть логи: `docker logs userbot_container`

### Бот не отправляет в канал
- Проверить что бот добавлен в канал как админ
- Проверить TELEGRAM_CHANNEL_ID в .env (должен начинаться с -100)
- Проверить TELEGRAM_CHANNEL_ENABLED=true

### Heartbeat не работает
- Проверить что startHeartbeat() вызывается в init()
- Временно изменить интервал на 60000 (1 мин) для теста
- Посмотреть логи - должно быть "Heartbeat запущен"

## 📞 Важные ID

Из вашего .env:
- Основной бот: `8482297276`
- Банковские боты: `915326936`, `856264490`, `7028509569`
- API ID: `18508404`

## 🔗 Полезные ссылки

- Полный план: `/outputs/PLAN-RABOTY.md`
- Код бота: `/backend/src/services/telegramBot.js`
- Userbot: `/services/userbot/userbot.py`
- Конфиг: `/backend/.env`
