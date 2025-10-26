-- Migration 004: Добавление таблицы bot_messages для чата с ботами
-- Дата: 2025-10-26
-- Описание: Таблица для хранения сообщений от банковских ботов с возможностью ручной обработки

-- Создание таблицы bot_messages
CREATE TABLE IF NOT EXISTS bot_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id INTEGER NOT NULL, -- ID бота (915326936, 856264490, 7028509569)
    telegram_message_id VARCHAR(255), -- ID сообщения в Telegram
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(), -- Время получения сообщения
    status VARCHAR(50) NOT NULL DEFAULT 'unprocessed', -- unprocessed, pending, processed, error
    text TEXT NOT NULL, -- Оригинальный текст сообщения от бота
    data JSONB, -- Извлеченные данные (amount, merchant, card, date, time, type)
    error TEXT, -- Текст ошибки если status = error
    sheet_url TEXT, -- Ссылка на строку в Google Sheets если обработано
    process_attempts INTEGER DEFAULT 0, -- Количество попыток обработки
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_bot_messages_bot_id ON bot_messages(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_messages_status ON bot_messages(status);
CREATE INDEX IF NOT EXISTS idx_bot_messages_timestamp ON bot_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bot_messages_bot_status ON bot_messages(bot_id, status);

-- Комментарии
COMMENT ON TABLE bot_messages IS 'Сообщения от банковских ботов для ручной обработки';
COMMENT ON COLUMN bot_messages.status IS 'unprocessed - не обработано, pending - в очереди, processed - обработано, error - ошибка';
COMMENT ON COLUMN bot_messages.data IS 'JSON с извлеченными данными: amount, merchant, card, date, time, type';
COMMENT ON COLUMN bot_messages.sheet_url IS 'Ссылка на строку в Google Sheets после успешной обработки';
