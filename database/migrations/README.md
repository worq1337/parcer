# Database Migrations

## Обзор

Этот каталог содержит миграции базы данных PostgreSQL для проекта Receipt Parser.

## Применённые миграции

### 001_add_check_id_and_etl_log.sql

**Дата применения:** 2025-10-19
**Статус:** ✅ Применена
**Версия PostgreSQL:** 15-alpine

**Описание:**
Расширение схемы базы данных для поддержки patch-008 требований.

**Изменения:**

1. **Таблица `checks`** - расширена:
   - `check_id UUID` - уникальный идентификатор чека (UUID v4)
   - `is_duplicate BOOLEAN` - флаг дубликата транзакции
   - `duplicate_of_id INTEGER` - ссылка на оригинальную транзакцию
   - Индекс `idx_checks_check_id` для быстрого поиска по UUID
   - Индекс `idx_checks_duplicate` для фильтрации дубликатов

2. **Таблица `etl_log`** - создана:
   - Логирование всех этапов ETL процесса
   - Стадии: received, normalized, matched, recorded
   - Статусы: success, error, warning
   - Поля: task_id, check_id, stage, status, message, payload_hash, error_details, processing_time_ms
   - 5 индексов для быстрого поиска и фильтрации

3. **Таблица `operators`** - расширена:
   - `canonical_name VARCHAR(255)` - каноническое название оператора
   - `synonyms TEXT[]` - массив синонимов для поиска
   - Миграция данных: pattern → canonical_name

4. **Таблица `backups`** - создана:
   - Реестр резервных копий базы данных
   - Поля: filename, file_path, file_size, format, created_by, created_at, restored_at, notes
   - Индекс по дате создания для сортировки

5. **Представление `checks_stats`** - создано:
   - Статистика по чекам для экрана администрирования
   - Агрегаты: total_checks, total_cards, total_operators, p2p_count, duplicates_count
   - Распределение по источникам (Telegram/SMS/Manual)
   - Диапазон дат и общая сумма

6. **Представление `recent_etl_tasks`** - создано:
   - Последние 1000 задач ETL для мониторинга
   - JOIN с таблицей checks для дополнительной информации
   - Сортировка по дате создания (DESC)

## Как применить миграцию

### Метод 1: Через Docker (рекомендуется)

```bash
# Из корня проекта
docker exec -i receipt_parser_db psql -U postgres -d receipt_parser < database/migrations/001_add_check_id_and_etl_log.sql
```

### Метод 2: Через psql напрямую

```bash
psql -U postgres -d receipt_parser -f database/migrations/001_add_check_id_and_etl_log.sql
```

## Проверка применения миграции

```bash
# Проверить список таблиц
docker exec receipt_parser_db psql -U postgres -d receipt_parser -c "\dt"

# Проверить структуру таблицы checks
docker exec receipt_parser_db psql -U postgres -d receipt_parser -c "\d checks"

# Проверить представления
docker exec receipt_parser_db psql -U postgres -d receipt_parser -c "\dv"

# Проверить индексы
docker exec receipt_parser_db psql -U postgres -d receipt_parser -c "\di"
```

Ожидаемый результат:
- 4 таблицы: backups, checks, etl_log, operators
- 2 представления: checks_stats, recent_etl_tasks
- Множество индексов для оптимизации запросов

## Откат миграции

⚠️ **ВНИМАНИЕ:** Откат миграции приведет к потере данных в новых колонках и таблицах!

```sql
-- Откат миграции 001
-- ИСПОЛЬЗУЙТЕ С ОСТОРОЖНОСТЬЮ!

-- Удаляем представления
DROP VIEW IF EXISTS recent_etl_tasks;
DROP VIEW IF EXISTS checks_stats;

-- Удаляем новые таблицы
DROP TABLE IF EXISTS backups;
DROP TABLE IF EXISTS etl_log;

-- Удаляем новые колонки из checks
ALTER TABLE checks DROP COLUMN IF EXISTS duplicate_of_id;
ALTER TABLE checks DROP COLUMN IF EXISTS is_duplicate;
ALTER TABLE checks DROP COLUMN IF EXISTS check_id;

-- Удаляем новые колонки из operators
ALTER TABLE operators DROP COLUMN IF EXISTS synonyms;
ALTER TABLE operators DROP COLUMN IF EXISTS canonical_name;
```

## Backend Integration

После применения миграции необходимо:

1. ✅ Обновить модель `Check.js`:
   - Добавить метод `getByCheckId(checkId)`
   - Добавить метод `markAsDuplicate(checkId, originalCheckId)`
   - Обновить `checkDuplicate()` для учета is_duplicate

2. ✅ Обновить модель `Operator.js`:
   - Обновить `findByPattern()` для поиска по canonical_name и synonyms
   - Обновить `create()` и `update()` для работы с новыми полями
   - Добавить `addSynonym()` и `removeSynonym()`

3. ✅ Создать новую модель `ETLLog.js`:
   - Методы для логирования ETL процессов
   - Утилиты для хеширования и измерения времени

4. ✅ Создать новую модель `Backup.js`:
   - Методы для управления резервными копиями

## Версионирование

| Миграция | Версия | Дата | Статус |
|----------|--------|------|--------|
| 001_add_check_id_and_etl_log.sql | 1.0.0 | 2025-10-19 | ✅ Применена |

## Связанные документы

- [patch-008-CHANGELOG.md](../../docks/patch-008-CHANGELOG.md) - полный список изменений
- [patch-008-ux-bugs-admin.md](../../docks/patch-008-ux-bugs-admin.md) - требования
