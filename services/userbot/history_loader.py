"""
History Loader for Telegram Userbot
Загружает старые сообщения от ботов используя Telethon API
"""

from telethon import TelegramClient
from telethon.tl.types import PeerChannel, PeerChat, PeerUser
from datetime import datetime, timedelta, timezone
import asyncio
import asyncpg
import os
import logging
from typing import List, Dict, Optional

LOG_LEVEL = os.getenv('USERBOT_LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format='[%(asctime)s] %(levelname)s %(name)s - %(message)s'
)
logger = logging.getLogger('userbot.history_loader')


class HistoryLoader:
    """Загрузчик истории сообщений от ботов"""

    def __init__(self, client: TelegramClient, db_pool: Optional[asyncpg.Pool] = None):
        self.client = client
        self.db_pool = db_pool
        self._own_pool = db_pool is None
        self.db_timeout = float(os.getenv('USERBOT_DB_TIMEOUT_SECONDS', '5'))
        self.db_pool_min_size = int(os.getenv('USERBOT_DB_POOL_MIN_SIZE', '1'))
        self.db_pool_max_size = int(os.getenv('USERBOT_DB_POOL_MAX_SIZE', '5'))

    async def _ensure_db_pool(self):
        if self.db_pool:
            return
        self.db_pool = await asyncpg.create_pool(
            host=os.getenv('DB_HOST', 'postgres'),
            port=os.getenv('DB_PORT', '5432'),
            database=os.getenv('DB_NAME', 'receipt_parser'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'postgres'),
            min_size=self.db_pool_min_size,
            max_size=self.db_pool_max_size,
            timeout=self.db_timeout,
        )
        logger.info("HistoryLoader DB pool создан (%s-%s)", self.db_pool_min_size, self.db_pool_max_size)

    async def load_bot_history(
        self,
        bot_id: int,
        bot_username: str,
        limit: Optional[int] = None,
        days: Optional[int] = None
    ) -> Dict:
        """
        Загрузить историю сообщений от бота
        """
        messages_data = []
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days) if days else None

        try:
            logger.info("Загрузка истории от %s (bot_id=%s)...", bot_username, bot_id)
            bot_entity = await self._resolve_entity(bot_id, bot_username)

            message_count = 0
            async for message in self.client.iter_messages(
                bot_entity,
                limit=limit,
                reverse=False
            ):
                if cutoff_date and message.date < cutoff_date:
                    logger.info("Достигнута граница %s дней, остановка загрузки", days)
                    break

                if message.text:
                    messages_data.append({
                        'bot_id': bot_id,
                        'telegram_message_id': str(message.id),
                        'text': message.text,
                        'timestamp': message.date or datetime.now(timezone.utc)
                    })
                    message_count += 1
                    if message_count % 50 == 0:
                        logger.info("Загружено %s сообщений", message_count)

            logger.info("Загружено %s сообщений от %s", len(messages_data), bot_username)
            result = await self._save_messages_to_db(messages_data)

            return {
                'loaded': len(messages_data),
                'saved': result['saved'],
                'skipped': result['skipped'],
                'errors': result['errors']
            }

        except Exception as e:
            logger.error("Ошибка загрузки истории от %s: %s", bot_username, e)
            return {
                'loaded': 0,
                'saved': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': str(e)
            }

    async def _save_messages_to_db(self, messages: List[Dict]) -> Dict:
        """
        Сохранить сообщения в БД батчами (asyncpg)
        """
        await self._ensure_db_pool()

        saved = 0
        skipped = 0
        errors = 0
        BATCH_SIZE = 100
        sql = """INSERT INTO bot_messages
                 (bot_id, telegram_message_id, chat_id, message_id, timestamp, text, status, process_attempts)
                 VALUES ($1, $2, $3, $4, $5, $6, 'new', 0)
                 ON CONFLICT (chat_id, message_id) DO NOTHING
                 RETURNING 1"""

        try:
            for i in range(0, len(messages), BATCH_SIZE):
                batch = messages[i:i + BATCH_SIZE]
                async with self.db_pool.acquire() as conn:
                    for msg in batch:
                        try:
                            row = await conn.fetchrow(
                                sql,
                                str(msg['bot_id']),
                                str(msg['telegram_message_id']),
                                str(msg['bot_id']),
                                str(msg['telegram_message_id']),
                                msg['timestamp'],
                                msg['text']
                            )
                            if row:
                                saved += 1
                            else:
                                skipped += 1
                        except Exception as e:
                            logger.warning("Ошибка сохранения сообщения: %s", e)
                            errors += 1
                if i + BATCH_SIZE < len(messages):
                    await asyncio.sleep(0.05)

            logger.info("Сохранено: %s новых, %s пропущено, %s ошибок", saved, skipped, errors)

        except Exception as e:
            logger.error("Ошибка при сохранении батча: %s", e)
            errors += len(messages) - saved - skipped

        return {
            'saved': saved,
            'skipped': skipped,
            'errors': errors
        }

    async def _resolve_entity(self, bot_id, bot_username):
        """
        Универсальное получение сущности Telegram для истории
        """
        candidates = [bot_username, bot_id]
        for candidate in candidates:
            if candidate in (None, '', 0):
                continue

            value = str(candidate)

            try:
                if value.startswith('-100'):
                    return await self.client.get_entity(PeerChannel(int(value)))

                if value.startswith('-') or value.isdigit():
                    try:
                        return await self.client.get_entity(int(value))
                    except Exception:
                        return await self.client.get_entity(PeerChat(int(value)))

                if value.startswith('@'):
                    return await self.client.get_entity(value)

                try:
                    return await self.client.get_entity(PeerUser(int(value)))
                except Exception:
                    return await self.client.get_entity(value)
            except Exception:
                continue

        raise ValueError(f"Не удалось определить сущность Telegram для {bot_id} / {bot_username}")

    async def load_all_bots_history(
        self,
        bots: List[Dict],
        days: Optional[int] = 30
    ) -> Dict:
        """
        Загрузить историю от всех ботов
        """
        results = {}
        total_loaded = 0
        total_saved = 0

        for bot in bots:
            logger.info("Обработка бота: %s (%s)", bot.get('name'), bot.get('username'))

            result = await self.load_bot_history(
                bot_id=bot['id'],
                bot_username=bot['username'],
                days=days
            )

            results[bot['username']] = result
            total_loaded += result['loaded']
            total_saved += result['saved']

            await asyncio.sleep(2)

        return {
            'total_loaded': total_loaded,
            'total_saved': total_saved,
            'bots': results
        }

    async def close(self):
        """Закрыть подключение к БД если создавался внутри"""
        if self._own_pool and self.db_pool and not self.db_pool.closed:
            await self.db_pool.close()
