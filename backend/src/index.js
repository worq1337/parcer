require('dotenv').config();
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');
const pool = require('./config/database');
const telegramBot = require('./services/telegramBot');
const pkg = require('../package.json');
const userbotService = require('./services/userbotService');

const checkRoutes = require('./routes/checkRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const ingestRoutes = require('./routes/ingestRoutes'); // patch-017 §7
const notificationRoutes = require('./routes/notificationRoutes'); // patch-017 §5
const licenseRoutes = require('./routes/licenseRoutes'); // patch-022: license key validation
const userbotChatRoutes = require('./routes/userbotChatRoutes'); // Userbot chat with bots

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
// Увеличиваем лимит для обработки изображений в base64 (до 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;

  const startedAt = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (payload && typeof payload === 'object' && payload.requestId === undefined) {
      payload.requestId = requestId;
    }
    return originalJson(payload);
  };

  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(`[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });

  next();
});

// Маршруты API
app.use('/api/checks', checkRoutes);
app.use('/api/operators', operatorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ingest', ingestRoutes); // patch-017 §7
app.use('/api/notifications', notificationRoutes); // patch-017 §5
app.use('/api/license', licenseRoutes); // patch-022: license key validation
app.use('/api/userbot-chat', userbotChatRoutes); // Userbot chat with bots

async function getHealthSnapshot() {
  const snapshot = {
    success: true,
    status: 'ok',
    version: pkg.version,
    build: process.env.BUILD_SHA || 'dev',
    timestamp: new Date().toISOString(),
    services: {}
  };

  try {
    await pool.query('SELECT 1');
    snapshot.services.database = 'connected';
  } catch (error) {
    snapshot.services.database = 'error';
    snapshot.services.databaseError = error.message;
    snapshot.success = false;
    snapshot.status = 'error';
  }

  const queueConnections = typeof notificationRoutes.getActiveConnections === 'function'
    ? notificationRoutes.getActiveConnections()
    : null;
  snapshot.services.queue = {
    activeConnections: queueConnections
  };

  try {
    const userbotStatus = await userbotService.getStatus();
    snapshot.services.userbot = userbotStatus;
    if (userbotStatus && userbotStatus.success === false) {
      snapshot.success = false;
      snapshot.status = 'error';
    }
  } catch (error) {
    snapshot.services.userbot = {
      success: false,
      error: error.message
    };
    snapshot.success = false;
    snapshot.status = 'error';
  }

  return snapshot;
}

// Корневой маршрут
app.get('/', (req, res) => {
  res.json({
    message: 'Receipt Parser API',
    version: pkg.version,
    build: process.env.BUILD_SHA || 'dev',
    endpoints: {
      checks: '/api/checks',
      operators: '/api/operators',
      admin: '/api/admin',
      ingest: '/api/ingest' // patch-017 §7
    }
  });
});

// Проверка здоровья API
app.get('/health', async (req, res) => {
  try {
    const snapshot = await getHealthSnapshot();
    res.status(snapshot.success ? 200 : 503).json(snapshot);
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const snapshot = await getHealthSnapshot();
    res.status(snapshot.success ? 200 : 503).json(snapshot);
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Проверка совместимости версии клиента
app.get('/api/compat', (req, res) => {
  const clientVersion = req.query.version;
  const minSupportedVersion = '1.0.5';

  res.json({
    success: true,
    compatible: true,
    clientVersion,
    serverVersion: '1.0.5',
    minSupportedVersion,
    message: 'Версия клиента совместима с сервером'
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Маршрут не найден'
  });
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err);
  res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера'
  });
});

// Запуск сервера
async function startServer() {
  try {
    // Проверка подключения к базе данных
    await pool.query('SELECT NOW()');
    console.log('✓ Подключение к базе данных установлено');

    // Запуск HTTP сервера
    app.listen(PORT, () => {
      console.log(`✓ Сервер запущен на порту ${PORT}`);
      console.log(`✓ API доступно по адресу: http://localhost:${PORT}`);
      console.log(`✓ Окружение: ${process.env.NODE_ENV || 'development'}`);
    });

    // Запуск Telegram бота
    telegramBot.init();

    // patch-017 §5: Минутная сводка для OS уведомлений
    startMinuteSummary();

  } catch (error) {
    console.error('Ошибка при запуске сервера:', error);
    process.exit(1);
  }
}

// patch-017 §5: Минутная сводка о новых чеках
function startMinuteSummary() {
  const eventBus = require('./utils/eventBus');
  let checksAddedThisMinute = [];
  let lastMinuteStart = Date.now();

  // Слушаем события добавления чеков
  eventBus.on('check:added', (event) => {
    checksAddedThisMinute.push(event.data);
  });

  // Каждую минуту отправляем сводку
  setInterval(() => {
    if (checksAddedThisMinute.length > 0) {
      const totalAmount = checksAddedThisMinute.reduce((sum, check) => sum + parseFloat(check.amount), 0);

      eventBus.emitMinuteSummary({
        count: checksAddedThisMinute.length,
        totalAmount: Math.abs(totalAmount).toFixed(2),
        currency: checksAddedThisMinute[0]?.currency || 'UZS',
        period: {
          start: new Date(lastMinuteStart).toISOString(),
          end: new Date().toISOString()
        },
        checks: checksAddedThisMinute.slice(-5) // Последние 5 чеков
      });

      console.log(`📊 Минутная сводка: ${checksAddedThisMinute.length} чек(ов), ${Math.abs(totalAmount).toFixed(2)} UZS`);

      // Сброс счетчика
      checksAddedThisMinute = [];
    }
    lastMinuteStart = Date.now();
  }, 60000); // 60 секунд

  console.log('✓ Минутная сводка активирована');
}

// Обработка сигналов завершения
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал SIGINT. Завершение работы...');
  telegramBot.stop();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Получен сигнал SIGTERM. Завершение работы...');
  telegramBot.stop();
  await pool.end();
  process.exit(0);
});

// Обработка необработанных исключений
process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  process.exit(1);
});

// Запуск
startServer();

module.exports = app;
