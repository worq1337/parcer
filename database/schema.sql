-- Создание базы данных
-- CREATE DATABASE receipt_parser;


-- Необходимые расширения
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Таблица операторов/приложений (справочник)
CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  canonical_name VARCHAR(255),
  pattern VARCHAR(255) NOT NULL UNIQUE,
  app_name VARCHAR(100) NOT NULL,
  is_p2p BOOLEAN DEFAULT true,
  synonyms TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица чеков (транзакций)
CREATE TABLE IF NOT EXISTS checks (
  id SERIAL PRIMARY KEY,
  check_id UUID DEFAULT gen_random_uuid() UNIQUE,

  -- Дата и время
  datetime TIMESTAMP NOT NULL,
  weekday VARCHAR(2) NOT NULL, -- Пн, Вт, Ср, Чт, Пт, Сб, Вс
  date_display VARCHAR(10) NOT NULL, -- Например: "6 апр"
  time_display VARCHAR(5) NOT NULL, -- Например: "13:18"

  -- Оператор и приложение
  operator VARCHAR(255) NOT NULL,
  app VARCHAR(100),

  -- Финансовые данные
  amount DECIMAL(15, 2) NOT NULL,
  balance DECIMAL(15, 2),
  card_last4 VARCHAR(4) NOT NULL,

  -- Тип транзакции
  is_p2p BOOLEAN DEFAULT false,
  transaction_type VARCHAR(50) NOT NULL, -- Оплата, Пополнение, Списание, Платеж, Конверсия, Возврат
  currency VARCHAR(10) NOT NULL DEFAULT 'UZS',

  -- Метаданные
  source VARCHAR(20) NOT NULL, -- SMS, Telegram, Manual, Import
  raw_text TEXT, -- Исходный текст сообщения
  added_via VARCHAR(20) DEFAULT 'manual', -- bot, manual, import
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_of_id INTEGER REFERENCES checks(id),

  -- Временные метки
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_checks_datetime ON checks(datetime DESC);
CREATE INDEX IF NOT EXISTS idx_checks_card ON checks(card_last4);
CREATE INDEX IF NOT EXISTS idx_checks_operator ON checks(operator);
CREATE INDEX IF NOT EXISTS idx_checks_type ON checks(transaction_type);
CREATE INDEX IF NOT EXISTS idx_checks_source ON checks(source);
CREATE INDEX IF NOT EXISTS idx_checks_check_id ON checks(check_id);
CREATE INDEX IF NOT EXISTS idx_checks_duplicate ON checks(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_operators_pattern ON operators(pattern);

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_checks_updated_at BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Комментарии к таблицам
COMMENT ON TABLE checks IS 'Таблица банковских транзакций (чеков)';
COMMENT ON TABLE operators IS 'Справочник операторов и соответствующих приложений';
COMMENT ON COLUMN checks.check_id IS 'Уникальный идентификатор чека (UUID) для трассировки';
COMMENT ON COLUMN checks.is_duplicate IS 'Флаг дубликата транзакции';
COMMENT ON COLUMN checks.duplicate_of_id IS 'Ссылка на оригинальную транзакцию, если это дубль';

-- Таблица логов ETL процесса
CREATE TABLE IF NOT EXISTS etl_log (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  check_id UUID,
  stage VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT,
  payload_hash VARCHAR(64),
  error_details JSONB,
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_etl_log_task_id ON etl_log(task_id);
CREATE INDEX IF NOT EXISTS idx_etl_log_check_id ON etl_log(check_id);
CREATE INDEX IF NOT EXISTS idx_etl_log_stage ON etl_log(stage);
CREATE INDEX IF NOT EXISTS idx_etl_log_status ON etl_log(status);
CREATE INDEX IF NOT EXISTS idx_etl_log_created_at ON etl_log(created_at DESC);

COMMENT ON TABLE etl_log IS 'Логи ETL процесса парсинга чеков';
COMMENT ON COLUMN etl_log.task_id IS 'Идентификатор задачи обработки';
COMMENT ON COLUMN etl_log.check_id IS 'Ссылка на чек (если создан)';
COMMENT ON COLUMN etl_log.stage IS 'Стадия обработки: received, normalized, matched, recorded';
COMMENT ON COLUMN etl_log.status IS 'Статус: success, error, warning';
COMMENT ON COLUMN etl_log.payload_hash IS 'SHA256 хеш исходных данных для дедупликации';

-- Таблица резервных копий
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  format VARCHAR(20) DEFAULT 'sql.gz',
  created_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

COMMENT ON TABLE backups IS 'Реестр резервных копий базы данных';
COMMENT ON COLUMN backups.file_size IS 'Размер файла в байтах';
COMMENT ON COLUMN backups.restored_at IS 'Дата и время восстановления из этого бэкапа';

-- Статистика по чекам
CREATE OR REPLACE VIEW checks_stats AS
SELECT
  COUNT(*) as total_checks,
  COUNT(DISTINCT card_last4) as total_cards,
  COUNT(DISTINCT operator) as total_operators,
  SUM(CASE WHEN is_p2p THEN 1 ELSE 0 END) as p2p_count,
  SUM(CASE WHEN is_duplicate THEN 1 ELSE 0 END) as duplicates_count,
  SUM(CASE WHEN source = 'Telegram' THEN 1 ELSE 0 END) as telegram_count,
  SUM(CASE WHEN source = 'SMS' THEN 1 ELSE 0 END) as sms_count,
  SUM(CASE WHEN source = 'Manual' THEN 1 ELSE 0 END) as manual_count,
  MIN(datetime) as earliest_check,
  MAX(datetime) as latest_check,
  SUM(amount) as total_amount
FROM checks;

COMMENT ON VIEW checks_stats IS 'Статистика по чекам для экрана администрирования';

-- Последние задачи ETL
CREATE OR REPLACE VIEW recent_etl_tasks AS
SELECT
  etl.task_id,
  etl.check_id,
  etl.stage,
  etl.status,
  etl.message,
  etl.processing_time_ms,
  etl.created_at,
  c.operator,
  c.amount,
  c.source
FROM etl_log etl
LEFT JOIN checks c ON c.check_id = etl.check_id
ORDER BY etl.created_at DESC
LIMIT 1000;

COMMENT ON VIEW recent_etl_tasks IS 'Последние 1000 задач ETL для мониторинга';

-- Тип стадий обработки и события очереди
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_stage') THEN
    CREATE TYPE event_stage AS ENUM (
      'received',
      'recorded',
      'normalized',
      'dictionary_matched',
      'p2p_flagged',
      'duplicate_checked',
      'saved',
      'failed_parse',
      'failed_validation',
      'failed_db',
      'requeued'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS queue_events (
  id BIGSERIAL PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES checks(check_id) ON DELETE CASCADE,
  stage event_stage NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  source TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_events_created_at ON queue_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_events_check_id ON queue_events (check_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_stage ON queue_events (stage);
CREATE INDEX IF NOT EXISTS idx_queue_events_status ON queue_events (status);
CREATE INDEX IF NOT EXISTS idx_queue_events_source ON queue_events (source);
CREATE INDEX IF NOT EXISTS idx_queue_events_is_duplicate ON queue_events ((payload->>'is_duplicate'));

CREATE OR REPLACE VIEW queue_last AS
SELECT DISTINCT ON (check_id)
  check_id,
  stage,
  status,
  source,
  message,
  created_at
FROM queue_events
ORDER BY check_id, created_at DESC;

CREATE OR REPLACE FUNCTION notify_queue_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'admin_queue',
    json_build_object(
      'event_id', NEW.id,
      'check_id', NEW.check_id,
      'stage', NEW.stage,
      'status', NEW.status,
      'source', NEW.source,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS queue_events_notify ON queue_events;
CREATE TRIGGER queue_events_notify
AFTER INSERT ON queue_events
FOR EACH ROW
EXECUTE FUNCTION notify_queue_event();

COMMENT ON TABLE queue_events IS 'patch-009: События обработки чеков (event sourcing)';
COMMENT ON COLUMN queue_events.check_id IS 'UUID чека из таблицы checks';
COMMENT ON COLUMN queue_events.stage IS 'Стадия обработки';
COMMENT ON COLUMN queue_events.status IS 'Статус: ok, error, info';
COMMENT ON COLUMN queue_events.source IS 'Источник чека: telegram, sms, manual, import';
COMMENT ON COLUMN queue_events.message IS 'Сообщение об ошибке или дополнительная информация';
COMMENT ON COLUMN queue_events.payload IS 'JSON с деталями: нормализованные поля, параметры ошибки и т.д.';
COMMENT ON VIEW queue_last IS 'Последнее событие по каждому чеку для быстрого доступа';
