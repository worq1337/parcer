-- Migration: userbot identifiers stored as TEXT + transaction fingerprint
-- Date: 2025-10-27
-- Purpose:
--   * avoid overflow when handling Telegram chat/message identifiers by storing them as TEXT
--   * add metadata columns for linking checks with their source messages
--   * prepare unique fingerprint for soft deduplication

BEGIN;

-- 1) Normalize bot_messages identifiers to TEXT and backfill helper columns
ALTER TABLE IF EXISTS bot_messages
  ALTER COLUMN bot_id TYPE TEXT USING bot_id::text,
  ALTER COLUMN telegram_message_id TYPE TEXT USING telegram_message_id::text,
  ADD COLUMN IF NOT EXISTS chat_id TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT;

UPDATE bot_messages
SET chat_id = bot_id
WHERE chat_id IS NULL;

UPDATE bot_messages
SET message_id = telegram_message_id
WHERE message_id IS NULL;

-- Useful indexes for lookups by chat/message
CREATE INDEX IF NOT EXISTS idx_bot_messages_chat_created
  ON bot_messages (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_messages_status_chat
  ON bot_messages (status, chat_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_messages_chat_message_unique
  ON bot_messages (chat_id, message_id);

-- 2) Extend checks with source identifiers, notifier reference and fingerprint
ALTER TABLE IF EXISTS checks
  ADD COLUMN IF NOT EXISTS source_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_bot_username TEXT,
  ADD COLUMN IF NOT EXISTS source_bot_title TEXT,
  ADD COLUMN IF NOT EXISTS source_app TEXT,
  ADD COLUMN IF NOT EXISTS notify_message_id TEXT,
  ADD COLUMN IF NOT EXISTS fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_checks_source_chat_msg
  ON checks (source_chat_id, source_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checks_fingerprint_unique
  ON checks (fingerprint)
  WHERE fingerprint IS NOT NULL;

COMMIT;
