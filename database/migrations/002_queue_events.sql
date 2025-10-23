-- ============================================================================
-- Migration 002: Queue Events System
-- patch-009: Система событий для отслеживания обработки чеков
-- Дата: 2025-10-19
-- ============================================================================

BEGIN;

-- 1. Создаём ENUM для стадий обработки
CREATE TYPE event_stage AS ENUM (
  'received',            -- получен от бота/из UI/импорта
  'recorded',            -- записан сырец (raw_text)
  'normalized',          -- нормализован (даты/суммы)
  'dictionary_matched',  -- найден оператор/приложение по словарю
  'p2p_flagged',         -- выставлен флаг P2P
  'duplicate_checked',   -- проверен на дубль
  'saved',               -- запись создана в таблице checks
  'failed_parse',        -- ошибка парсинга LLM/регулярок
  'failed_validation',   -- валидация (дата/сумма/ПК и т.п.)
  'failed_db',           -- ошибка БД/транзакции
  'requeued'             -- админ перекинул в повтор
);

-- 2. Создаём таблицу событий обработки
CREATE TABLE IF NOT EXISTS queue_events (
  id BIGSERIAL PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES checks(check_id) ON DELETE CASCADE,
  stage event_stage NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',   -- ok|error|info
  source TEXT NOT NULL,                -- telegram|sms|manual|import
  message TEXT NULL,                   -- Сообщение об ошибке или информация
  payload JSONB NULL,                  -- Произвольные детали (нормализованные поля, ошибки)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Создаём индексы для быстрого доступа
CREATE INDEX idx_queue_events_created_at ON queue_events (created_at DESC);
CREATE INDEX idx_queue_events_check_id ON queue_events (check_id);
CREATE INDEX idx_queue_events_stage ON queue_events (stage);
CREATE INDEX idx_queue_events_status ON queue_events (status);
CREATE INDEX idx_queue_events_source ON queue_events (source);
CREATE INDEX idx_queue_events_is_duplicate ON queue_events ((payload->>'is_duplicate'));

-- 4. Создаём VIEW для быстрого доступа к последнему событию по чеку
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

-- 5. Создаём функцию для NOTIFY при вставке нового события
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

-- 6. Создаём триггер для автоматической отправки уведомлений
CREATE TRIGGER queue_events_notify
AFTER INSERT ON queue_events
FOR EACH ROW
EXECUTE FUNCTION notify_queue_event();

-- 7. Комментарии к таблицам и полям
COMMENT ON TABLE queue_events IS 'patch-009: События обработки чеков (event sourcing)';
COMMENT ON COLUMN queue_events.check_id IS 'UUID чека из таблицы checks';
COMMENT ON COLUMN queue_events.stage IS 'Стадия обработки';
COMMENT ON COLUMN queue_events.status IS 'Статус: ok, error, info';
COMMENT ON COLUMN queue_events.source IS 'Источник чека: telegram, sms, manual, import';
COMMENT ON COLUMN queue_events.message IS 'Сообщение об ошибке или дополнительная информация';
COMMENT ON COLUMN queue_events.payload IS 'JSON с деталями: нормализованные поля, параметры ошибки и т.д.';

COMMENT ON VIEW queue_last IS 'Последнее событие по каждому чеку для быстрого доступа';

COMMIT;

-- Вывод успешного выполнения
SELECT 'Migration 002: Queue Events System applied successfully!' AS status;
