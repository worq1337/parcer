-- Миграция 001: Добавление check_id и таблицы ETL логов
-- Для требований patch-008 §12

-- 1. Добавляем check_id (UUID) в таблицу checks
ALTER TABLE checks ADD COLUMN IF NOT EXISTS check_id UUID DEFAULT gen_random_uuid() UNIQUE;

-- Создаём индекс для быстрого поиска по check_id
CREATE INDEX IF NOT EXISTS idx_checks_check_id ON checks(check_id);

-- Добавляем комментарий
COMMENT ON COLUMN checks.check_id IS 'Уникальный идентификатор чека (UUID) для трассировки';

-- 2. Создаём таблицу логов ETL процесса
CREATE TABLE IF NOT EXISTS etl_log (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  check_id UUID,
  stage VARCHAR(50) NOT NULL, -- received, normalized, matched, recorded
  status VARCHAR(20) NOT NULL, -- success, error, warning
  message TEXT,
  payload_hash VARCHAR(64), -- SHA256 хеш сырых данных
  error_details JSONB, -- Детали ошибки в JSON формате
  processing_time_ms INTEGER, -- Время обработки в миллисекундах
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска логов
CREATE INDEX IF NOT EXISTS idx_etl_log_task_id ON etl_log(task_id);
CREATE INDEX IF NOT EXISTS idx_etl_log_check_id ON etl_log(check_id);
CREATE INDEX IF NOT EXISTS idx_etl_log_stage ON etl_log(stage);
CREATE INDEX IF NOT EXISTS idx_etl_log_status ON etl_log(status);
CREATE INDEX IF NOT EXISTS idx_etl_log_created_at ON etl_log(created_at DESC);

-- Комментарий к таблице
COMMENT ON TABLE etl_log IS 'Логи ETL процесса парсинга чеков';
COMMENT ON COLUMN etl_log.task_id IS 'Идентификатор задачи обработки';
COMMENT ON COLUMN etl_log.check_id IS 'Ссылка на чек (если создан)';
COMMENT ON COLUMN etl_log.stage IS 'Стадия обработки: received, normalized, matched, recorded';
COMMENT ON COLUMN etl_log.status IS 'Статус: success, error, warning';
COMMENT ON COLUMN etl_log.payload_hash IS 'SHA256 хеш исходных данных для дедупликации';

-- 3. Расширяем таблицу operators для синонимов
-- Добавляем canonical_name и преобразуем структуру
ALTER TABLE operators ADD COLUMN IF NOT EXISTS canonical_name VARCHAR(255);
ALTER TABLE operators ADD COLUMN IF NOT EXISTS synonyms TEXT[]; -- Массив синонимов

-- Обновляем существующие записи (pattern -> canonical_name)
UPDATE operators SET canonical_name = pattern WHERE canonical_name IS NULL;

-- Добавляем комментарии
COMMENT ON COLUMN operators.canonical_name IS 'Каноническое (основное) название оператора';
COMMENT ON COLUMN operators.synonyms IS 'Массив синонимов для поиска';
COMMENT ON COLUMN operators.pattern IS 'Устаревшее поле, используйте synonyms';

-- 4. Создаём таблицу резервных копий (для экрана администрирования)
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL, -- Размер в байтах
  format VARCHAR(20) DEFAULT 'sql.gz', -- sql.gz, sql, custom
  created_by VARCHAR(100) DEFAULT 'system',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP, -- Когда была восстановлена (если была)
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);

COMMENT ON TABLE backups IS 'Реестр резервных копий базы данных';
COMMENT ON COLUMN backups.file_size IS 'Размер файла в байтах';
COMMENT ON COLUMN backups.restored_at IS 'Дата и время восстановления из этого бэкапа';

-- 5. Добавляем поля для отслеживания дублей
ALTER TABLE checks ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
ALTER TABLE checks ADD COLUMN IF NOT EXISTS duplicate_of_id INTEGER REFERENCES checks(id);

CREATE INDEX IF NOT EXISTS idx_checks_duplicate ON checks(is_duplicate) WHERE is_duplicate = true;

COMMENT ON COLUMN checks.is_duplicate IS 'Флаг дубликата транзакции';
COMMENT ON COLUMN checks.duplicate_of_id IS 'Ссылка на оригинальную транзакцию если это дубль';

-- 6. Создаём view для быстрого доступа к статистике
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

-- 7. Создаём view для последних задач ETL
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

-- Готово!
SELECT 'Migration 001 applied successfully!' as status;
