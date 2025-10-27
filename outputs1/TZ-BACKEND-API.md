# 🔌 BACKEND API: Endpoints для Userbot Chat

**Версия:** 1.0  
**Дата:** 26 октября 2025  
**Для Backend разработчика**

---

## 🎯 Обзор

Нужно добавить новые API endpoints для работы с чатом ботов в Telegram Userbot.

**Базовый URL:** `/api/userbot` (или ваш)

**Технологии:** Node.js + Express (или ваш стек)

**База данных:** PostgreSQL / MongoDB (или ваша)

---

## 📊 Структура данных

### Bot (Бот)

```typescript
interface Bot {
  id: number;
  name: string;           // "CardXabar"
  username: string;       // "@CardXabarBot"
  telegramId: string;     // "5153269396"
  icon?: string;          // "💳" (emoji)
  isActive: boolean;
  stats: {
    processed: number;    // Количество обработанных
    pending: number;      // В очереди
    errors: number;       // С ошибками
    unprocessed: number;  // Не обработано
  };
  createdAt: Date;
  updatedAt: Date;
}
```

---

### Message (Сообщение)

```typescript
interface Message {
  id: string;             // UUID
  botId: number;          // ID бота
  telegramMessageId: string; // ID сообщения в Telegram
  timestamp: Date;        // Время получения
  status: MessageStatus;  // processed | pending | error | unprocessed
  
  // Оригинальный текст от бота
  text: string;
  
  // Извлеченные данные
  data?: {
    amount?: string;      // "150 000,00 UZS"
    merchant?: string;    // "Uzum Market"
    card?: string;        // "*1234"
    date?: string;        // "26.10.2025"
    time?: string;        // "15:30"
    type?: string;        // "Покупка"
    [key: string]: any;   // Другие поля
  };
  
  // Если ошибка
  error?: string;
  
  // Ссылка на строку в Google Sheets (если обработано)
  sheetUrl?: string;
  
  // Попытки обработки
  processAttempts: number;
  
  createdAt: Date;
  updatedAt: Date;
}

type MessageStatus = 'unprocessed' | 'pending' | 'processed' | 'error';
```

---

## 📋 API Endpoints

### 1. GET `/api/userbot/bots`

**Описание:** Получить список всех ботов со статистикой

**Авторизация:** Требуется

**Query параметры:** Нет

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "CardXabar",
      "username": "@CardXabarBot",
      "telegramId": "5153269396",
      "icon": "💳",
      "isActive": true,
      "stats": {
        "processed": 38,
        "pending": 5,
        "errors": 2,
        "unprocessed": 12
      },
      "createdAt": "2025-10-01T00:00:00Z",
      "updatedAt": "2025-10-26T12:30:00Z"
    },
    {
      "id": 2,
      "name": "ID:856264490",
      "username": "(недоступен)",
      "telegramId": "856264490",
      "icon": "🏦",
      "isActive": true,
      "stats": {
        "processed": 15,
        "pending": 2,
        "errors": 1,
        "unprocessed": 5
      },
      "createdAt": "2025-10-01T00:00:00Z",
      "updatedAt": "2025-10-26T12:30:00Z"
    }
  ]
}
```

**Response 401:**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**Реализация (псевдокод):**

```javascript
app.get('/api/userbot/bots', async (req, res) => {
  try {
    // Проверка авторизации
    const userId = await checkAuth(req);
    
    // Получить ботов из БД
    const bots = await db.bots.findAll({
      where: { userId }
    });
    
    // Для каждого бота подсчитать статистику
    const botsWithStats = await Promise.all(
      bots.map(async (bot) => {
        const stats = await db.messages.aggregate({
          where: { botId: bot.id },
          groupBy: 'status',
          count: true
        });
        
        return {
          ...bot,
          stats: {
            processed: stats.processed || 0,
            pending: stats.pending || 0,
            errors: stats.error || 0,
            unprocessed: stats.unprocessed || 0
          }
        };
      })
    );
    
    res.json({
      success: true,
      data: botsWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### 2. GET `/api/userbot/messages/:botId`

**Описание:** Получить сообщения от конкретного бота

**Авторизация:** Требуется

**URL параметры:**
- `botId` (number) - ID бота

**Query параметры:**
- `status` (string, optional) - Фильтр по статусу: `unprocessed` | `processed` | `pending` | `error`
- `limit` (number, optional, default: 50) - Количество сообщений
- `offset` (number, optional, default: 0) - Смещение для пагинации

**Response 200:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "msg-uuid-1",
        "botId": 1,
        "telegramMessageId": "12345",
        "timestamp": "2025-10-26T15:30:00Z",
        "status": "processed",
        "text": "Покупка\nSumma: 150 000,00 UZS\nMerchant: Uzum Market\nKarta: *1234\nSana: 26.10.2025 15:30",
        "data": {
          "amount": "150 000,00 UZS",
          "merchant": "Uzum Market",
          "card": "*1234",
          "date": "26.10.2025",
          "time": "15:30",
          "type": "Покупка"
        },
        "sheetUrl": "https://docs.google.com/spreadsheets/d/.../edit#gid=0&range=A123",
        "processAttempts": 1,
        "createdAt": "2025-10-26T15:30:00Z",
        "updatedAt": "2025-10-26T15:30:15Z"
      },
      {
        "id": "msg-uuid-2",
        "botId": 1,
        "telegramMessageId": "12346",
        "timestamp": "2025-10-26T14:45:00Z",
        "status": "unprocessed",
        "text": "Перевод\nSumma: 50 000,00 UZS\nОт: Иван И.\nKarta: *5678",
        "data": {
          "amount": "50 000,00 UZS",
          "from": "Иван И.",
          "card": "*5678"
        },
        "processAttempts": 0,
        "createdAt": "2025-10-26T14:45:00Z",
        "updatedAt": "2025-10-26T14:45:00Z"
      }
    ],
    "hasMore": true,
    "total": 150
  }
}
```

**Response 404:**
```json
{
  "success": false,
  "error": "Bot not found"
}
```

**Реализация (псевдокод):**

```javascript
app.get('/api/userbot/messages/:botId', async (req, res) => {
  try {
    const userId = await checkAuth(req);
    const { botId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;
    
    // Проверить что бот принадлежит пользователю
    const bot = await db.bots.findOne({
      where: { id: botId, userId }
    });
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    // Получить сообщения
    const where = { botId };
    if (status) {
      where.status = status;
    }
    
    const messages = await db.messages.findAll({
      where,
      order: [['timestamp', 'DESC']], // Новые сверху
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    // Подсчитать общее количество
    const total = await db.messages.count({ where });
    
    res.json({
      success: true,
      data: {
        messages,
        hasMore: offset + messages.length < total,
        total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### 3. GET `/api/userbot/history/:botId`

**Описание:** Загрузить ВСЮ историю сообщений от бота (все сообщения)

**Авторизация:** Требуется

**URL параметры:**
- `botId` (number) - ID бота

**Query параметры:** Нет

**Response 200:**
```json
{
  "success": true,
  "data": {
    "messages": [...], // Все сообщения
    "total": 500
  }
}
```

**ВАЖНО:** Этот endpoint может возвращать МНОГО данных. Рекомендуется:
1. Добавить лимит (например, максимум 1000 сообщений)
2. Кэшировать результаты
3. Добавить rate limiting

**Реализация:**

```javascript
app.get('/api/userbot/history/:botId', async (req, res) => {
  try {
    const userId = await checkAuth(req);
    const { botId } = req.params;
    
    // Проверить что бот принадлежит пользователю
    const bot = await db.bots.findOne({
      where: { id: botId, userId }
    });
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }
    
    // Получить ВСЕ сообщения (с лимитом для безопасности)
    const messages = await db.messages.findAll({
      where: { botId },
      order: [['timestamp', 'DESC']],
      limit: 1000 // Максимум 1000 сообщений
    });
    
    res.json({
      success: true,
      data: {
        messages,
        total: messages.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### 4. POST `/api/userbot/process`

**Описание:** Обработать одно сообщение вручную

**Авторизация:** Требуется

**Request Body:**
```json
{
  "messageId": "msg-uuid-1"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg-uuid-1",
      "status": "processed",
      "data": {
        "amount": "150 000,00 UZS",
        "merchant": "Uzum Market",
        "card": "*1234",
        "date": "26.10.2025",
        "time": "15:30",
        "type": "Покупка"
      },
      "sheetUrl": "https://docs.google.com/spreadsheets/d/.../edit#gid=0&range=A123",
      "processAttempts": 1,
      "updatedAt": "2025-10-26T15:30:15Z"
    }
  }
}
```

**Response 400:**
```json
{
  "success": false,
  "error": "Failed to process message",
  "details": "Could not extract amount from text"
}
```

**Реализация:**

```javascript
app.post('/api/userbot/process', async (req, res) => {
  try {
    const userId = await checkAuth(req);
    const { messageId } = req.body;
    
    // Получить сообщение
    const message = await db.messages.findOne({
      where: { id: messageId },
      include: ['bot']
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    // Проверить что бот принадлежит пользователю
    if (message.bot.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }
    
    // Обработать сообщение
    try {
      // 1. Извлечь данные из текста
      const extractedData = await extractDataFromText(message.text);
      
      // 2. Добавить в Google Sheets
      const sheetUrl = await addToGoogleSheets(extractedData);
      
      // 3. Обновить сообщение
      await message.update({
        status: 'processed',
        data: extractedData,
        sheetUrl,
        processAttempts: message.processAttempts + 1,
        error: null
      });
      
      res.json({
        success: true,
        data: {
          message: message.toJSON()
        }
      });
    } catch (processingError) {
      // Если не удалось обработать - статус error
      await message.update({
        status: 'error',
        error: processingError.message,
        processAttempts: message.processAttempts + 1
      });
      
      res.status(400).json({
        success: false,
        error: 'Failed to process message',
        details: processingError.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### 5. POST `/api/userbot/process-multiple`

**Описание:** Обработать несколько сообщений одновременно (массовая обработка)

**Авторизация:** Требуется

**Request Body:**
```json
{
  "messageIds": ["msg-uuid-1", "msg-uuid-2", "msg-uuid-3"]
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "processed": 2,
    "failed": 1,
    "messages": [
      {
        "id": "msg-uuid-1",
        "status": "processed",
        "data": {...},
        "sheetUrl": "..."
      },
      {
        "id": "msg-uuid-2",
        "status": "processed",
        "data": {...},
        "sheetUrl": "..."
      },
      {
        "id": "msg-uuid-3",
        "status": "error",
        "error": "Could not extract amount"
      }
    ]
  }
}
```

**Реализация:**

```javascript
app.post('/api/userbot/process-multiple', async (req, res) => {
  try {
    const userId = await checkAuth(req);
    const { messageIds } = req.body;
    
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'messageIds must be a non-empty array'
      });
    }
    
    // Получить все сообщения
    const messages = await db.messages.findAll({
      where: {
        id: { $in: messageIds }
      },
      include: ['bot']
    });
    
    // Проверить доступ
    const unauthorizedMessage = messages.find(m => m.bot.userId !== userId);
    if (unauthorizedMessage) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }
    
    // Обработать все сообщения
    const results = await Promise.all(
      messages.map(async (message) => {
        try {
          const extractedData = await extractDataFromText(message.text);
          const sheetUrl = await addToGoogleSheets(extractedData);
          
          await message.update({
            status: 'processed',
            data: extractedData,
            sheetUrl,
            processAttempts: message.processAttempts + 1,
            error: null
          });
          
          return message.toJSON();
        } catch (error) {
          await message.update({
            status: 'error',
            error: error.message,
            processAttempts: message.processAttempts + 1
          });
          
          return message.toJSON();
        }
      })
    );
    
    const processed = results.filter(r => r.status === 'processed').length;
    const failed = results.filter(r => r.status === 'error').length;
    
    res.json({
      success: true,
      data: {
        processed,
        failed,
        messages: results
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### 6. POST `/api/userbot/retry`

**Описание:** Повторить обработку сообщения (для pending или error)

**Авторизация:** Требуется

**Request Body:**
```json
{
  "messageId": "msg-uuid-1"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "message": {
      "id": "msg-uuid-1",
      "status": "pending",
      "processAttempts": 2,
      "updatedAt": "2025-10-26T15:35:00Z"
    }
  }
}
```

**Реализация:**

```javascript
app.post('/api/userbot/retry', async (req, res) => {
  try {
    const userId = await checkAuth(req);
    const { messageId } = req.body;
    
    const message = await db.messages.findOne({
      where: { id: messageId },
      include: ['bot']
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }
    
    if (message.bot.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }
    
    // Поставить в очередь на повторную обработку
    await message.update({
      status: 'pending',
      error: null
    });
    
    // Запустить обработку в фоне
    processMessageInBackground(message.id);
    
    res.json({
      success: true,
      data: {
        message: message.toJSON()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

## 🔌 WebSocket для реал-тайм обновлений

### WebSocket: `ws://your-domain/api/userbot/chat/:botId`

**Описание:** Подключение для получения новых сообщений от бота в реальном времени

**Авторизация:** Через query параметр `?token=JWT_TOKEN`

**События от сервера:**

#### 1. Новое сообщение
```json
{
  "type": "new_message",
  "data": {
    "id": "msg-uuid-123",
    "botId": 1,
    "timestamp": "2025-10-26T16:00:00Z",
    "status": "unprocessed",
    "text": "Покупка\n...",
    "data": null,
    "processAttempts": 0
  }
}
```

#### 2. Обновление статуса
```json
{
  "type": "message_updated",
  "data": {
    "id": "msg-uuid-123",
    "status": "processed",
    "data": {...},
    "sheetUrl": "..."
  }
}
```

#### 3. Ошибка обработки
```json
{
  "type": "processing_error",
  "data": {
    "id": "msg-uuid-123",
    "status": "error",
    "error": "Could not extract amount"
  }
}
```

**Реализация (псевдокод):**

```javascript
const WebSocket = require('ws');

const wss = new WebSocket.Server({ noServer: true });

// Хранилище подключений по botId
const connections = new Map();

wss.on('connection', async (ws, req) => {
  // Извлечь botId из URL
  const botId = req.url.split('/').pop();
  
  // Проверить авторизацию
  const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
  const userId = await verifyToken(token);
  
  if (!userId) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  
  // Проверить доступ к боту
  const bot = await db.bots.findOne({
    where: { id: botId, userId }
  });
  
  if (!bot) {
    ws.close(1008, 'Bot not found');
    return;
  }
  
  // Добавить подключение
  if (!connections.has(botId)) {
    connections.set(botId, new Set());
  }
  connections.get(botId).add(ws);
  
  ws.on('close', () => {
    connections.get(botId).delete(ws);
  });
});

// Функция для отправки события всем подписчикам бота
function broadcastToBot(botId, event) {
  const botConnections = connections.get(botId);
  if (!botConnections) return;
  
  const message = JSON.stringify(event);
  
  botConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

// Пример использования при получении нового сообщения
async function onNewTelegramMessage(botId, telegramMessage) {
  // Сохранить в БД
  const message = await db.messages.create({
    botId,
    telegramMessageId: telegramMessage.id,
    timestamp: new Date(),
    status: 'unprocessed',
    text: telegramMessage.text,
    processAttempts: 0
  });
  
  // Отправить всем подписчикам
  broadcastToBot(botId, {
    type: 'new_message',
    data: message.toJSON()
  });
  
  // Автоматически попытаться обработать
  tryAutoProcess(message.id);
}
```

---

## 🔐 Авторизация

Все endpoints требуют авторизации. Используйте ваш существующий метод:

```javascript
async function checkAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw new Error('No token provided');
  }
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return decoded.userId;
}
```

---

## 🔄 Автоматическая обработка

**Логика автообработки новых сообщений:**

```javascript
async function tryAutoProcess(messageId) {
  const message = await db.messages.findOne({
    where: { id: messageId }
  });
  
  if (!message) return;
  
  try {
    // Попытаться извлечь данные
    const extractedData = await extractDataFromText(message.text);
    
    // Если удалось - добавить в Google Sheets
    const sheetUrl = await addToGoogleSheets(extractedData);
    
    // Обновить статус
    await message.update({
      status: 'processed',
      data: extractedData,
      sheetUrl,
      processAttempts: 1
    });
    
    // Уведомить через WebSocket
    broadcastToBot(message.botId, {
      type: 'message_updated',
      data: message.toJSON()
    });
  } catch (error) {
    // Если не удалось - пометить как unprocessed (не ошибка)
    // Пользователь сможет обработать вручную
    await message.update({
      status: 'unprocessed',
      processAttempts: 1
    });
    
    console.log(`Auto-process failed for ${messageId}:`, error.message);
  }
}
```

---

## 📦 Вспомогательные функции

### Извлечение данных из текста

```javascript
async function extractDataFromText(text) {
  // Ваша существующая логика парсинга
  // Можно использовать регулярные выражения или AI
  
  const data = {};
  
  // Пример: извлечь сумму
  const amountMatch = text.match(/Summa:\s*(.+)/);
  if (amountMatch) {
    data.amount = amountMatch[1].trim();
  }
  
  // Пример: извлечь мерчанта
  const merchantMatch = text.match(/Merchant:\s*(.+)/);
  if (merchantMatch) {
    data.merchant = merchantMatch[1].trim();
  }
  
  // ... остальные поля
  
  // Если не удалось извлечь обязательные поля - ошибка
  if (!data.amount) {
    throw new Error('Could not extract amount from text');
  }
  
  return data;
}
```

### Добавление в Google Sheets

```javascript
async function addToGoogleSheets(data) {
  // Ваша существующая интеграция с Google Sheets
  const { GoogleSpreadsheet } = require('google-spreadsheet');
  
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY
  });
  
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  
  const row = await sheet.addRow({
    'Дата': data.date,
    'Время': data.time,
    'Сумма': data.amount,
    'Мерчант': data.merchant,
    'Карта': data.card,
    'Тип': data.type
  });
  
  // Вернуть ссылку на строку
  return `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit#gid=${sheet.sheetId}&range=A${row.rowNumber}`;
}
```

---

## ✅ Чек-лист для Backend разработчика

- [ ] **Endpoints:**
  - [ ] GET `/api/userbot/bots` - список ботов
  - [ ] GET `/api/userbot/messages/:botId` - сообщения от бота
  - [ ] GET `/api/userbot/history/:botId` - вся история
  - [ ] POST `/api/userbot/process` - обработать сообщение
  - [ ] POST `/api/userbot/process-multiple` - массовая обработка
  - [ ] POST `/api/userbot/retry` - повторить обработку

- [ ] **WebSocket:**
  - [ ] Настроить WebSocket сервер
  - [ ] Реализовать авторизацию через token
  - [ ] Отправлять события при новых сообщениях
  - [ ] Отправлять события при обновлении статуса

- [ ] **База данных:**
  - [ ] Создать таблицы/коллекции для Bot и Message
  - [ ] Добавить индексы (botId, status, timestamp)

- [ ] **Интеграция:**
  - [ ] Подключить к существующему userbot
  - [ ] Настроить автообработку новых сообщений
  - [ ] Протестировать с реальными ботами

---

## 🧪 Тестирование

### Тестовые данные

```javascript
// Создать тестового бота
POST /api/userbot/bots/test
{
  "name": "Test Bot",
  "username": "@TestBot",
  "telegramId": "123456789"
}

// Создать тестовое сообщение
POST /api/userbot/messages/test
{
  "botId": 1,
  "text": "Покупка\nSumma: 100,00 UZS\nMerchant: Test Shop\nKarta: *1111"
}
```

### Тестовые сценарии

1. **Получить список ботов** → должны вернуться боты с статистикой
2. **Получить сообщения** → должны вернуться 50 сообщений
3. **Фильтрация** → `/messages/1?status=unprocessed` → только необработанные
4. **Обработать сообщение** → статус должен измениться на `processed`
5. **Массовая обработка** → обработать 10 сообщений → все должны стать `processed` или `error`
6. **WebSocket** → подключиться → отправить тестовое сообщение → должно прийти через WS

---

**Готово!** Backend API endpoints 🎉

Следующий файл: Инструкция по интеграции
