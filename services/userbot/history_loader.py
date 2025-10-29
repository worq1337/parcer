"""
History Loader for Telegram Userbot
Загружает старые сообщения от ботов используя Telethon API
"""

from telethon import TelegramClient
from telethon.tl.types import PeerChannel, PeerChat, PeerUser
from datetime import datetime, timedelta, timezone
import asyncio
import psycopg2
import os
from typing import List, Dict, Optional


class HistoryLoader:
    """Загрузчик истории сообщений от ботов"""

    def __init__(self, client: TelegramClient):
        self.client = client
        self.db_conn = None

    def _get_db_connection(self):
        """Получить подключение к PostgreSQL"""
        if not self.db_conn or self.db_conn.closed:
            self.db_conn = psycopg2.connect(
                host=os.getenv('DB_HOST', 'postgres'),
                port=os.getenv('DB_PORT', '5432'),
                database=os.getenv('DB_NAME', 'receipt_parser'),
                user=os.getenv('DB_USER', 'postgres'),
                password=os.getenv('DB_PASSWORD', 'postgres')
            )
        return self.db_conn

    async def load_bot_history(
        self,
        bot_id: int,
        bot_username: str,
        limit: Optional[int] = None,
        days: Optional[int] = None
    ) -> Dict:
        """
        Загрузить историю сообщений от бота

        Args:
            bot_id: ID бота в БД
            bot_username: Username бота (например, "@CardXabarBot")
            limit: Максимум сообщений (None = все)
            days: Загрузить только за последние N дней (None = все)

        Returns:
            {
                'loaded': int,  # Всего загружено из Telegram
                'saved': int,   # Сохранено в БД (новых)
                'skipped': int, # Пропущено (дубликаты)
                'errors': int   # Ошибок при сохранении
            }
        """
        messages_data = []
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days) if days else None

        try:
            # Получить entity бота
            print(f"📥 Загрузка истории от {bot_username} (bot_id={bot_id})...")
            bot_entity = await self._resolve_entity(bot_id, bot_username)

            # Получить все сообщения от бота
            message_count = 0
            async for message in self.client.iter_messages(
                bot_entity,
                limit=limit,  # None = все сообщения
                reverse=False  # От новых к старым
            ):
                # Проверить дату если указано ограничение
                if cutoff_date and message.date < cutoff_date:
                    print(f"⏹ Достигнута граница {days} дней, остановка загрузки")
                    break

                # Только текстовые сообщения
                if message.text:
                    messages_data.append({
                        'bot_id': bot_id,
                        'telegram_message_id': str(message.id),
                        'text': message.text,
                        'timestamp': message.date
                    })
                    message_count += 1

                    # Показывать прогресс каждые 50 сообщений
                    if message_count % 50 == 0:
                        print(f"  ... загружено {message_count} сообщений")

            print(f"✅ Загружено {len(messages_data)} сообщений от {bot_username}")

            # Сохранить в БД батчами
            result = await self._save_messages_to_db(messages_data)

            return {
                'loaded': len(messages_data),
                'saved': result['saved'],
                'skipped': result['skipped'],
                'errors': result['errors']
            }

        except Exception as e:
            print(f"❌ Ошибка загрузки истории от {bot_username}: {e}")
            return {
                'loaded': 0,
                'saved': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': str(e)
            }

    async def _save_messages_to_db(self, messages: List[Dict]) -> Dict:
        """
        Сохранить сообщения в БД батчами

        Args:
            messages: Список сообщений для сохранения

        Returns:
            {saved: int, skipped: int, errors: int}
        """
        saved = 0
        skipped = 0
        errors = 0

        BATCH_SIZE = 100

        conn = self._get_db_connection()
        cursor = conn.cursor()

        try:
            for i in range(0, len(messages), BATCH_SIZE):
                batch = messages[i:i + BATCH_SIZE]

                for msg in batch:
                    try:
                        # Проверить существование (по bot_id + telegram_message_id)
                        cursor.execute(
                            """
                            SELECT id FROM bot_messages
                            WHERE chat_id = %s AND message_id = %s
                            """,
                            (str(msg['bot_id']), str(msg['telegram_message_id']))
                        )

                        exists = cursor.fetchone()

                        if exists:
                            skipped += 1
                            continue

                        # Создать новое сообщение
                        cursor.execute(
                            """
                            INSERT INTO bot_messages
                            (bot_id, telegram_message_id, chat_id, message_id, timestamp, text, status, process_attempts)
                            VALUES (%s, %s, %s, %s, %s, %s, 'new', 0)
                            ON CONFLICT (chat_id, message_id) DO NOTHING
                            """,
                            (
                                str(msg['bot_id']),
                                str(msg['telegram_message_id']),
                                str(msg['bot_id']),
                                str(msg['telegram_message_id']),
                                msg['timestamp'],
                                msg['text']
                            )
                        )
                        saved += 1

                    except Exception as e:
                        print(f"  ⚠️ Ошибка сохранения сообщения: {e}")
                        errors += 1

                # Коммит после каждого батча
                conn.commit()

                # Небольшая задержка между батчами
                if i + BATCH_SIZE < len(messages):
                    await asyncio.sleep(0.1)

            print(f"💾 Сохранено в БД: {saved} новых, {skipped} пропущено, {errors} ошибок")

        except Exception as e:
            print(f"❌ Ошибка при сохранении в БД: {e}")
            conn.rollback()
            errors += len(messages) - saved - skipped

        finally:
            cursor.close()

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

        Args:
            bots: Список ботов [{id, username, name}]
            days: Загрузить за последние N дней

        Returns:
            {
                'total_loaded': int,
                'total_saved': int,
                'bots': {bot_username: {loaded, saved, skipped}}
            }
        """
        results = {}
        total_loaded = 0
        total_saved = 0

        for bot in bots:
            print(f"\n{'='*60}")
            print(f"🤖 Обработка бота: {bot['name']} ({bot['username']})")
            print(f"{'='*60}")

            result = await self.load_bot_history(
                bot_id=bot['id'],
                bot_username=bot['username'],
                days=days
            )

            results[bot['username']] = result
            total_loaded += result['loaded']
            total_saved += result['saved']

            # Задержка между ботами (Rate Limiting)
            await asyncio.sleep(2)

        return {
            'total_loaded': total_loaded,
            'total_saved': total_saved,
            'bots': results
        }

    def close(self):
        """Закрыть подключение к БД"""
        if self.db_conn and not self.db_conn.closed:
            self.db_conn.close()
