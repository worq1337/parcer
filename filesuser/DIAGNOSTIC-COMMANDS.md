# Команды для диагностики системы

## 🔍 Проверка состояния сервисов

### 1. Проверить userbot
```bash
# Статус
curl http://localhost:5001/status

# Ожидаемый ответ при работающем userbot:
# {
#   "running": true,
#   "authorized": true,
#   "user": {
#     "id": 123456789,
#     "first_name": "Ваше имя",
#     "username": "username",
#     "phone": "+998..."
#   }
# }
```

### 2. Проверить OCR сервис
```bash
# Health check
curl http://localhost:5000/health

# Ожидаемый ответ:
# {"status": "ok"}
```

### 3. Проверить основной backend
```bash
# Health check
curl http://localhost:3001/api/health

# Или просто проверить что сервер отвечает
curl http://localhost:3001
```

### 4. Проверить Docker контейнеры (если используется)
```bash
# Список всех контейнеров
docker ps -a

# Логи userbot
docker logs -f userbot_container --tail 100

# Логи backend
docker logs -f backend_container --tail 100

# Логи OCR
docker logs -f ocr_container --tail 100

# Логи PostgreSQL
docker logs -f postgres_container --tail 100
```

---

## 🗄️ SQL запросы для проверки базы данных

### Подключение к базе
```bash
# Если Docker
docker exec -it postgres_container psql -U postgres -d receipt_parser

# Если локально
psql -h localhost -p 5433 -U postgres -d receipt_parser
```

### 1. Проверить последние чеки
```sql
-- Последние 10 чеков
SELECT 
    id,
    date,
    time,
    amount,
    currency,
    operator,
    merchant,
    source,
    created_at
FROM checks
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Статистика по источникам
```sql
-- Количество чеков по источникам
SELECT 
    source,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as this_week
FROM checks
GROUP BY source
ORDER BY total DESC;
```

### 3. Последние чеки за сегодня
```sql
-- Чеки за сегодня
SELECT 
    id,
    date,
    time,
    amount,
    currency,
    operator,
    source,
    created_at
FROM checks
WHERE created_at >= CURRENT_DATE
ORDER BY created_at DESC;
```

### 4. Проверить дубликаты
```sql
-- Найти возможные дубликаты
SELECT 
    date,
    time,
    amount,
    card_last4,
    COUNT(*) as count
FROM checks
GROUP BY date, time, amount, card_last4
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

### 5. Статистика по банкам
```sql
-- Топ-10 банков/операторов
SELECT 
    operator,
    COUNT(*) as transactions,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount
FROM checks
WHERE operator IS NOT NULL
GROUP BY operator
ORDER BY transactions DESC
LIMIT 10;
```

### 6. Активность по дням
```sql
-- Количество транзакций по дням за последний месяц
SELECT 
    DATE(created_at) as day,
    COUNT(*) as transactions,
    SUM(amount) as total_amount
FROM checks
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

### 7. Проверить ETL лог (если есть)
```sql
-- Последние записи лога
SELECT 
    id,
    source_type,
    status,
    error_message,
    created_at
FROM etl_log
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🧪 Тестовые запросы к API

### 1. Тест добавления чека через API
```bash
# Тестовый чек через text
curl -X POST http://localhost:3001/api/ingest/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Karta: *1234\nSumma: 150000.00 UZS\nSana: 26.10.2025 15:30\nMerchant: Test Shop\nOperator: Test Bank",
    "source": "test_api"
  }'
```

### 2. Получить последние чеки
```bash
curl http://localhost:3001/api/checks?limit=5
```

### 3. Получить список операторов
```bash
curl http://localhost:3001/api/operators
```

---

## 📝 Логи - что искать

### В логах userbot:
```
✅ ХОРОШО:
📨 Получено сообщение от бота HUMO Card (@humo_card_bot) (ID: 915326936)
✅ Сообщение переслано в бот 8482297276

❌ ПЛОХО:
❌ Ошибка пересылки: Chat not found
⚠️ Сообщение без текста, пропускаем
❌ Это НЕ мониторимый бот (ID: 123456)
```

### В логах backend:
```
✅ ХОРОШО:
📨 Новое сообщение получено:
   User ID: 8482297276
✓ Транзакция 123 отправлена в канал -1001234567890
✓ Heartbeat отправлен в 26.10.2025 15:30:00

❌ ПЛОХО:
❌ Ошибка отправки в канал: bot is not a member
⚠️ Не удалось распознать чек
❌ Ошибка подключения к БД
```

---

## 🔧 Команды для восстановления

### Перезапустить все сервисы (Docker)
```bash
# Остановить все
docker-compose down

# Запустить снова
docker-compose up -d

# Проверить логи
docker-compose logs -f
```

### Перезапустить локально
```bash
# Backend
cd backend
npm restart

# Userbot
cd services/userbot
pkill -f "python app.py"
python app.py &

# OCR
cd services/ocr
pkill -f "python app.py"
python app.py &
```

### Очистить логи (если переполнены)
```bash
# Очистить Docker логи
docker logs backend_container > /dev/null 2>&1

# Или для всех контейнеров
for container in $(docker ps -q); do
    echo "" > $(docker inspect --format='{{.LogPath}}' $container)
done
```

---

## 🚨 Emergency: Полная перезагрузка системы

Если ничего не помогает:

```bash
# 1. Остановить все
docker-compose down

# 2. Удалить все контейнеры (ВНИМАНИЕ!)
docker rm -f $(docker ps -a -q)

# 3. Очистить volumes (ВНИМАНИЕ: удалит данные!)
# docker volume prune -f

# 4. Пересоздать
docker-compose up -d --build

# 5. Проверить
docker-compose logs -f
```

⚠️ **ВНИМАНИЕ**: Перед выполнением команд с `volume prune` сделайте бэкап базы данных!

---

## 💾 Бэкап базы данных

### Создать бэкап
```bash
# Если Docker
docker exec postgres_container pg_dump -U postgres receipt_parser > backup_$(date +%Y%m%d_%H%M%S).sql

# Если локально
pg_dump -h localhost -p 5433 -U postgres receipt_parser > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановить из бэкапа
```bash
# Если Docker
docker exec -i postgres_container psql -U postgres receipt_parser < backup_20251026_153000.sql

# Если локально
psql -h localhost -p 5433 -U postgres receipt_parser < backup_20251026_153000.sql
```

---

## 📊 Мониторинг в реальном времени

### Следить за логами всех сервисов
```bash
# Если Docker
docker-compose logs -f --tail=50

# Или конкретный сервис
docker logs -f backend_container --tail=50
docker logs -f userbot_container --tail=50
```

### Следить за базой данных
```sql
-- В psql выполнить:
-- Автообновление каждые 2 секунды
\watch 2

-- Например, следить за последними чеками:
SELECT id, date, time, amount, operator, source, created_at 
FROM checks 
ORDER BY created_at DESC 
LIMIT 5;
\watch 2
```

---

## ✅ Чек-лист работоспособности

Выполните все команды по порядку и проверьте результаты:

- [ ] `docker ps` - все контейнеры работают (UP)
- [ ] `curl localhost:5001/status` - userbot авторизован
- [ ] `curl localhost:5000/health` - OCR отвечает {"status":"ok"}
- [ ] `curl localhost:3001` - backend отвечает
- [ ] `psql ... -c "SELECT COUNT(*) FROM checks;"` - база доступна
- [ ] Отправить тест в бота - получен ответ
- [ ] Проверить канал - есть сообщение о транзакции
- [ ] Подождать 5 мин - heartbeat появился в канале

Если все пункты ✅ - система работает корректно!
