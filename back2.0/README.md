# Backend 2.0 - Receipt Parser на OpenAI Responses API

Единый конвейер обработки чеков из Telegram с использованием OpenAI Responses API и Structured Outputs.

## Архитектура

```
[Telegram] -> Ingest Gateway (Webhook) -> Event Bus (NATS)
                                         -> Parser Agent Service (OpenAI Responses)
                                         -> Normalizer
                                         -> Deduper
                                         -> Storage (Postgres + S3)
                                         -> REST API -> Web UI
```

## Особенности

- ✅ OpenAI Responses API с Structured Outputs (JSON Schema)
- ✅ Автоматическая нормализация операторов через словарь
- ✅ Дедупликация через SHA1 сигнатуры
- ✅ Event Bus на NATS для обработки событий
- ✅ Поддержка изображений через Vision API
- ✅ Асинхронная обработка через FastAPI

## Установка

### Требования

- Python 3.11+
- PostgreSQL 15+
- NATS Server
- MinIO/S3 (опционально, для вложений)

### Шаги установки

1. **Клонирование и подготовка окружения**

```bash
cd back2.0

# Создать виртуальное окружение
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# или
venv\Scripts\activate  # Windows

# Установить зависимости
pip install -r requirements.txt
```

2. **Настройка переменных окружения**

```bash
cp .env.example .env
# Отредактировать .env с вашими ключами
```

3. **Запуск инфраструктуры (Postgres, NATS, MinIO)**

```bash
docker-compose up -d
```

4. **Применение миграций БД**

```bash
# Подключиться к PostgreSQL
psql -U postgres -d receipt_parser

# Выполнить миграцию
\i database/migrations/001_create_receipts_schema.sql

# Или через Python:
python -c "
import asyncio
from src.database.connection import init_db
asyncio.run(init_db())
"
```

5. **Загрузка словаря операторов**

Словарь операторов находится в `data/operators.yml` и загружается автоматически при нормализации.

Для заполнения БД можно использовать:

```sql
-- Вставить операторов из seed_operators.sql (из старой БД) или через API
```

6. **Запуск приложения**

```bash
# Development
uvicorn src.main:app --reload --port 8000

# Production
gunicorn src.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

7. **Запуск Event Processor Worker (опционально)**

Для обработки событий из Event Bus запустите воркер:

```bash
python -m src.services.event_processor
```

## Структура проекта

```
back2.0/
├── src/
│   ├── main.py                 # FastAPI приложение
│   ├── config.py              # Конфигурация
│   ├── database/
│   │   ├── models.py          # SQLAlchemy модели
│   │   ├── connection.py      # Подключение к БД
│   │   └── migrations/        # SQL миграции
│   ├── services/
│   │   ├── ingest.py          # Ingest Gateway (Telegram webhook)
│   │   ├── parser.py           # Parser Agent Service (OpenAI)
│   │   ├── normalizer.py      # Нормализация операторов/валют
│   │   ├── deduper.py          # Дедупликация
│   │   ├── storage.py          # Работа с БД
│   │   ├── processor.py        # Обработка событий
│   │   └── event_processor.py  # Event Processor Worker
│   ├── schemas/
│   │   ├── receipt.py          # JSON Schema для structured outputs
│   │   └── api.py              # Pydantic схемы для API
│   ├── api/
│   │   └── routes.py            # REST API endpoints
│   └── utils/
│       └── event_bus.py         # NATS клиент
├── data/
│   └── operators.yml           # Словарь операторов
├── database/
│   └── migrations/
│       └── 001_create_receipts_schema.sql
├── docker-compose.yml
├── requirements.txt
└── README.md
```

## API Endpoints

### Чекы

- `POST /api/receipts` - Создание чека
- `GET /api/receipts` - Список чеков с фильтрацией
- `GET /api/receipts/{id}` - Получение чека по ID
- `POST /api/receipts/{id}/reparse` - Переобработка чека

### Операторы

- `GET /api/operators` - Список операторов

### Telegram

- `POST /api/telegram/webhook` - Webhook для Telegram Bot API

### Health

- `GET /health` - Проверка здоровья API
- `GET /api/health` - То же самое

## Переменные окружения

См. `.env.example` для полного списка переменных.

Основные:
- `DATABASE_URL` - URL подключения к PostgreSQL
- `OPENAI_API_KEY` - Ключ OpenAI API
- `NATS_URL` - URL NATS сервера
- `TELEGRAM_BOT_TOKEN` - Токен Telegram бота

## Миграция с Backend 1.0

Для миграции данных из старой схемы `checks` в новую `receipts`:

1. Экспортировать данные из `checks`
2. Преобразовать в новый формат (маппинг полей)
3. Импортировать в `receipts`

Пример маппинга:

```sql
-- Старая схема -> Новая схема
-- datetime -> ts_event
-- transaction_type -> event_type (с преобразованием значений)
-- amount -> amount
-- currency -> currency
-- operator -> operator_raw, operator_canonical
-- card_last4 -> card_mask
-- balance -> balance_after
-- и т.д.
```

## Разработка

### Запуск тестов

```bash
pytest
```

### Форматирование кода

```bash
black src/
isort src/
```

### Проверка типов

```bash
mypy src/
```

## Production

Для продакшн окружения:

1. Используйте переменные окружения из секретного хранилища
2. Настройте reverse proxy (nginx/traefik)
3. Включите HTTPS
4. Настройте мониторинг (Prometheus, Grafana)
5. Настройте логирование (ELK/Splunk)

## Troubleshooting

### Event Bus не подключается

В режиме разработки (`DEBUG=true`) приложение продолжит работу без NATS, но события не будут обрабатываться.

### OpenAI API ошибки

- Проверьте ключ API в `.env`
- Проверьте лимиты rate limit
- Убедитесь, что используете правильные названия моделей

### Проблемы с БД

- Проверьте подключение: `psql -U postgres -d receipt_parser`
- Проверьте миграции: `\dt` в psql
- Проверьте логи PostgreSQL

## Лицензия

ISC
