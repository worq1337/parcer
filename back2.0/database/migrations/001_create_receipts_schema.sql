-- Миграция 001: Создание схемы для receipts (новая архитектура Backend 2.0)

-- Расширения PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Для GIN индексов по тексту

-- Таблица операторов (обновлённая схема)
CREATE TABLE IF NOT EXISTS operators (
  id SERIAL PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,  -- Регэксп или LIKE паттерн
  canonical TEXT NOT NULL,  -- Каноническое название
  app TEXT NOT NULL,  -- Название приложения
  weight INTEGER NOT NULL DEFAULT 1,  -- Вес для приоритета
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operators_canonical ON operators(canonical);
CREATE INDEX IF NOT EXISTS idx_operators_pattern ON operators(pattern);

-- Таблица receipts (новая схема)
CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  source_platform TEXT NOT NULL DEFAULT 'telegram',
  source_chat_id TEXT,
  message_id TEXT,
  raw_text TEXT NOT NULL,
  raw_html TEXT,
  raw_lang CHAR(2),  -- ru, uz, en
  
  -- Тип события и финансы
  event_type TEXT NOT NULL,  -- payment, purchase, p2p, topup, conversion, fee, penalty, other
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'UZS',
  sign SMALLINT NOT NULL,  -- +1 или -1
  
  -- Карта
  card_brand TEXT,
  card_mask TEXT,
  
  -- Оператор
  operator_raw TEXT,
  operator_id INTEGER REFERENCES operators(id),
  operator_canonical TEXT,
  
  -- Мерчант
  merchant_name TEXT,
  merchant_address TEXT,
  
  -- Баланс
  balance_after NUMERIC(18,2),
  balance_currency CHAR(3),
  
  -- Время
  ts_event TIMESTAMPTZ NOT NULL,
  ts_local TEXT,  -- Строка как в СМС
  
  -- Метаданные парсинга
  confidence NUMERIC(3,2),  -- 0.00-1.00
  duplicate_key TEXT,
  ingest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parse_status TEXT NOT NULL DEFAULT 'ok',  -- ok, needs_review, failed, duplicate
  error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для receipts
CREATE INDEX IF NOT EXISTS idx_receipts_user_ts ON receipts(user_id, ts_event DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_duplicate_key ON receipts(duplicate_key) WHERE duplicate_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_duplicate_key_unique ON receipts(duplicate_key) WHERE duplicate_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_parse_status ON receipts(parse_status);
CREATE INDEX IF NOT EXISTS idx_receipts_event_type ON receipts(event_type);
CREATE INDEX IF NOT EXISTS idx_receipts_operator_canonical ON receipts(operator_canonical);
CREATE INDEX IF NOT EXISTS idx_receipts_ingest_at ON receipts(ingest_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_source_chat_message ON receipts(source_chat_id, message_id);

-- GIN индекс для полнотекстового поиска по raw_text
CREATE INDEX IF NOT EXISTS idx_receipts_raw_text_gin ON receipts USING gin(raw_text gin_trgm_ops);

-- Таблица вложений (attachments)
CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  receipt_id BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- photo, pdf, video, voice, file
  file_bucket TEXT NOT NULL,
  file_key TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  ocr_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_receipt_id ON attachments(receipt_id);
CREATE INDEX IF NOT EXISTS idx_attachments_sha256 ON attachments(sha256);

-- Таблица карт (cards)
CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  mask TEXT NOT NULL,  -- ***6714
  brand TEXT NOT NULL,  -- HUMO, UZCARD, VISA
  issuer TEXT,  -- Название банка
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cards_user_mask ON cards(user_id, mask);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггеры для updated_at
CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON receipts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operators_updated_at
    BEFORE UPDATE ON operators
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Комментарии
COMMENT ON TABLE receipts IS 'Таблица чеков (новая архитектура Backend 2.0)';
COMMENT ON TABLE operators IS 'Справочник операторов для нормализации';
COMMENT ON TABLE attachments IS 'Вложения к чекам (изображения, PDF и т.д.)';
COMMENT ON TABLE cards IS 'Справочник карт пользователей';

COMMENT ON COLUMN receipts.duplicate_key IS 'SHA1 хеш для дедупликации';
COMMENT ON COLUMN receipts.parse_status IS 'Статус парсинга: ok, needs_review, failed, duplicate';
COMMENT ON COLUMN receipts.sign IS 'Знак операции: 1 для пополнения, -1 для списания';

