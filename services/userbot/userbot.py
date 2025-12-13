"""
patch-017 §4: Telethon Userbot

Мониторит сообщения от банковских ботов и пересылает их в наш бот для обработки
"""

import os
import json
import time
import asyncio
import logging
from typing import Optional, Tuple
import aiohttp
import asyncpg
from datetime import datetime, timezone
from telethon import TelegramClient, events
from telethon.tl.types import User, PeerChannel, PeerChat, PeerUser, Channel, Chat
from telethon.tl.types import InputPeerUser, InputPeerChannel, InputPeerChat
import services.userbot.config as config

BACKEND_BASE = os.getenv('BACKEND_BASE', config.BACKEND_URL if hasattr(config, 'BACKEND_URL') else 'http://backend:3001')

# region agent log helper
DEBUG_LOG_PATH = r'c:\Users\Дмитрий\Desktop\parcer\parcer\.cursor\debug.log'
DEBUG_SESSION_ID = 'debug-session'
DEBUG_RUN_ID = 'pre-fix'


def _agent_log(hypothesis_id: str, location: str, message: str, data=None):
    """Lightweight NDJSON logger for debug-mode instrumentation."""
    payload = {
        'sessionId': DEBUG_SESSION_ID,
        'runId': DEBUG_RUN_ID,
        'hypothesisId': hypothesis_id,
        'location': location,
        'message': message,
        'data': data or {},
        'timestamp': int(time.time() * 1000),
    }
    try:
        with open(DEBUG_LOG_PATH, 'a', encoding='utf-8') as fp:
            fp.write(json.dumps(payload, ensure_ascii=False) + '\n')
    except Exception:
        # Логирование не должно ломать основной поток
        pass

# endregion

LOG_LEVEL = os.getenv('USERBOT_LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format='[%(asctime)s] %(levelname)s %(name)s - %(message)s'
)
logger = logging.getLogger('userbot')


class UserbotManager:
    """
    Управление Telethon userbot

    Функции:
    - Логин по номеру телефона
    - Мониторинг сообщений от указанных ботов
    - Пересылка сообщений в наш бот
    - Управление статусом (start/stop)
    """

    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self.is_running = False
        self.session_path = os.path.join(config.SESSION_DIR, config.SESSION_NAME)

        # Обработчик для новых сообщений
        self.new_message_handler = None
        self._handler_registered = False
        self._lifecycle_lock = asyncio.Lock()

        # Пулы/ресурсы
        self.db_pool: Optional[asyncpg.Pool] = None
        self.db_timeout = float(os.getenv('USERBOT_DB_TIMEOUT_SECONDS', '5'))
        self.db_retries = int(os.getenv('USERBOT_DB_RETRIES', '3'))
        self.db_retry_delay = float(os.getenv('USERBOT_DB_RETRY_DELAY', '0.2'))
        self.db_pool_min_size = int(os.getenv('USERBOT_DB_POOL_MIN_SIZE', '1'))
        self.db_pool_max_size = int(os.getenv('USERBOT_DB_POOL_MAX_SIZE', '5'))

        self.http_session: Optional[aiohttp.ClientSession] = None
        self.http_timeout = float(os.getenv('USERBOT_HTTP_TIMEOUT_SECONDS', '5'))
        self.http_retries = int(os.getenv('USERBOT_HTTP_RETRIES', '3'))
        self.http_retry_delay = float(os.getenv('USERBOT_HTTP_RETRY_DELAY', '0.3'))
        self.http_semaphore = asyncio.Semaphore(int(os.getenv('USERBOT_BACKEND_CONCURRENCY', '3')))

        # Максимальный возраст сообщения, которое мы считаем «новым» (в минутах)
        self.max_message_age = int(os.getenv('USERBOT_MAX_MESSAGE_AGE_MINUTES', '30'))

    def _validate_config(self):
        errors = []
        if not config.API_ID or config.API_ID == 0:
            errors.append("TELEGRAM_API_ID пуст")
        if not getattr(config, 'API_HASH', ''):
            errors.append("TELEGRAM_API_HASH пуст")
        if not getattr(config, 'MONITOR_BOT_IDS', None):
            errors.append("MONITOR_BOT_IDS пуст")
        if not getattr(config, 'OUR_BOT_ID', None):
            errors.append("OUR_BOT_ID пуст")
        if errors:
            raise ValueError("; ".join(errors))

    async def _ensure_client(self):
        if self.client:
            return
        self._validate_config()
        self.client = TelegramClient(
            self.session_path,
            config.API_ID,
            config.API_HASH,
            system_version='4.16.30-vxCUSTOM'
        )

    async def _register_handler_once(self):
        if self._handler_registered or not self.client:
            return
        self.client.add_event_handler(self.handle_new_message, events.NewMessage(incoming=True))
        self._handler_registered = True
        logger.info("Обработчик сообщений зарегистрирован (incoming=True)")

    async def initialize(self):
        """
        Инициализация Telethon клиента и ресурсов
        """
        await self._ensure_client()
        await self._register_handler_once()
        logger.info("Telethon клиент инициализирован")

    async def login(self, phone_number, code=None, password=None):
        """
        Логин через номер телефона
        """
        try:
            await self._ensure_client()
            await self._register_handler_once()
            await self.client.connect()

            if await self.client.is_user_authorized():
                me = await self.client.get_me()
                logger.info("Уже авторизован как %s", me.username)
                return {
                    'success': True,
                    'status': 'already_authorized',
                    'user': {
                        'id': me.id,
                        'first_name': me.first_name,
                        'last_name': me.last_name,
                        'username': me.username,
                        'phone': me.phone
                    }
                }

            if not code:
                await self.client.send_code_request(phone_number)
                logger.info("Код отправлен на %s", phone_number)
                return {
                    'success': True,
                    'status': 'code_sent',
                    'message': f'Код отправлен на {phone_number}'
                }

            try:
                await self.client.sign_in(phone_number, code)
                me = await self.client.get_me()
                logger.info("Авторизован как %s", me.username)
                return {
                    'success': True,
                    'status': 'authorized',
                    'user': {
                        'id': me.id,
                        'first_name': me.first_name,
                        'last_name': me.last_name,
                        'username': me.username,
                        'phone': me.phone
                    }
                }

            except Exception as code_error:
                if 'Two-step verification' in str(code_error) or 'SessionPasswordNeededError' in str(type(code_error)):
                    if not password:
                        return {
                            'success': False,
                            'status': 'password_required',
                            'message': 'Требуется 2FA пароль'
                        }

                    await self.client.sign_in(password=password)
                    me = await self.client.get_me()
                    logger.info("Авторизован по 2FA как %s", me.username)
                    return {
                        'success': True,
                        'status': 'authorized',
                        'user': {
                            'id': me.id,
                            'first_name': me.first_name,
                            'last_name': me.last_name,
                            'username': me.username,
                            'phone': me.phone
                        }
                    }
                raise code_error

        except Exception as e:
            logger.error("Ошибка логина: %s", e)
            return {
                'success': False,
                'status': 'error',
                'error': str(e)
            }

    async def _ensure_db_pool(self):
        if self.db_pool and not getattr(self.db_pool, 'closed', False):
            return
        self.db_pool = None
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
        logger.info("DB pool создан (%s-%s)", self.db_pool_min_size, self.db_pool_max_size)

    async def _close_db_pool(self):
        if self.db_pool:
            await self.db_pool.close()
            self.db_pool = None
            logger.info("DB pool закрыт")

    async def _ensure_http_session(self):
        if self.http_session and not self.http_session.closed:
            return
        self.http_session = None
        timeout = aiohttp.ClientTimeout(total=self.http_timeout)
        self.http_session = aiohttp.ClientSession(timeout=timeout)
        logger.info("HTTP сессия создана (timeout=%s)", self.http_timeout)

    async def _close_http_session(self):
        if self.http_session and not self.http_session.closed:
            await self.http_session.close()
        self.http_session = None

    async def start(self):
        """
        Запуск userbot мониторинга
        """
        async with self._lifecycle_lock:
            await self.initialize()
            await self.client.connect()

            if not await self.client.is_user_authorized():
                return {
                    'success': False,
                    'error': 'Userbot не авторизован. Выполните логин сначала.'
                }

            await self._ensure_db_pool()
            await self._ensure_http_session()

            if self.is_running:
                me = await self.client.get_me()
                return {
                    'success': True,
                    'status': 'already_running',
                    'user': {
                        'id': me.id,
                        'first_name': me.first_name,
                        'last_name': me.last_name,
                        'username': me.username,
                        'phone': me.phone
                    }
                }

            await self.client.start()
            self.is_running = True

            me = await self.client.get_me()

            # Получаем реальные названия ботов из Telegram
            bot_names_list = []
            for bot_id in config.MONITOR_BOT_IDS:
                try:
                    bot_entity = await self.resolve_entity(bot_id)
                    bot_name = bot_entity.first_name or f"ID:{bot_id}"
                    bot_names_list.append(f"{bot_name} (@{bot_entity.username})")
                except Exception:
                    bot_names_list.append(f"ID:{bot_id}")

            bot_names = ', '.join(bot_names_list)
            logger.info("Userbot запущен %s (@%s), мониторим: %s", me.first_name, me.username, bot_names)

            return {
                'success': True,
                'message': f'Userbot запущен как {me.first_name}',
                'user': {
                    'id': me.id,
                    'first_name': me.first_name,
                    'last_name': me.last_name,
                    'username': me.username,
                    'phone': me.phone
                }
            }

    async def stop(self):
        """
        Остановка userbot
        """
        async with self._lifecycle_lock:
            if self.client and self.client.is_connected():
                await self.client.disconnect()

            await self._close_http_session()
            await self._close_db_pool()

            self.is_running = False

            return {
                'success': True,
                'message': 'Userbot остановлен'
            }

    async def get_status(self):
        """
        Получить текущий статус userbot
        """
        if not self.client:
            return {
                'running': False,
                'authorized': False
            }

        try:
            if not self.client.is_connected():
                await self.client.connect()

            is_authorized = await self.client.is_user_authorized()

            if is_authorized:
                me = await self.client.get_me()
                return {
                    'running': self.is_running,
                    'authorized': True,
                    'user': {
                        'id': me.id,
                        'first_name': me.first_name,
                        'last_name': me.last_name,
                        'username': me.username,
                        'phone': me.phone
                    }
                }

            return {
                'running': self.is_running,
                'authorized': False
            }

        except Exception as e:
            logger.error("Ошибка получения статуса: %s", e)
            return {
                'running': False,
                'authorized': False,
                'error': str(e)
            }

    async def save_message_to_db(self, bot_id, telegram_message_id, text, message_date=None) -> bool:
        """
        Сохранить сообщение в БД (asyncpg + retry)
        Возвращает True если была вставка, False если запись уже существовала
        """
        await self._ensure_db_pool()
        attempt = 1
        sql = """INSERT INTO bot_messages
                 (bot_id, telegram_message_id, chat_id, message_id, timestamp, text, status, process_attempts)
                 VALUES ($1, $2, $3, $4, $5, $6, 'new', 0)
                 ON CONFLICT (chat_id, message_id) DO NOTHING
                 RETURNING 1"""

        while attempt <= self.db_retries:
            try:
                async with self.db_pool.acquire() as conn:
                    res = await asyncio.wait_for(
                        conn.fetchrow(
                            sql,
                            str(bot_id),
                            str(telegram_message_id),
                            str(bot_id),
                            str(telegram_message_id),
                            message_date or datetime.now(timezone.utc),
                            text
                        ),
                        timeout=self.db_timeout
                    )
                    inserted = res is not None
                    if inserted:
                        logger.debug("Сообщение сохранено в БД (bot_id=%s)", bot_id)
                    else:
                        logger.debug("Сообщение уже в БД (bot_id=%s)", bot_id)
                    _agent_log(
                        'H3',
                        'userbot.py:save_message_to_db',
                        'db_upsert',
                        {
                            'bot_id': str(bot_id),
                            'telegram_message_id': str(telegram_message_id),
                            'inserted': inserted,
                        },
                    )
                    return inserted
            except Exception as db_error:
                _agent_log(
                    'H3',
                    'userbot.py:save_message_to_db',
                    'db_error',
                    {
                        'bot_id': str(bot_id),
                        'telegram_message_id': str(telegram_message_id),
                        'error': str(db_error),
                        'attempt': attempt,
                    },
                )
                logger.warning("Ошибка сохранения в БД (попытка %s/%s): %s", attempt, self.db_retries, db_error)
                if attempt >= self.db_retries:
                    return False
                await asyncio.sleep(self.db_retry_delay * attempt)
                attempt += 1
        return False

    def _normalize_dt(self, value) -> datetime:
        dt = value if isinstance(value, datetime) else datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    def _is_old_message(self, msg_dt: datetime) -> Tuple[bool, int]:
        msg_dt = self._normalize_dt(msg_dt)
        now_ts = datetime.now(timezone.utc)
        age_seconds = int((now_ts - msg_dt).total_seconds())
        return age_seconds > self.max_message_age * 60, age_seconds

    async def _push_to_backend(self, payload: dict):
        await self._ensure_http_session()
        attempt = 1
        while attempt <= self.http_retries:
            try:
                async with self.http_semaphore:
                    start_ts = time.perf_counter()
                    async with self.http_session.post(
                        f"{BACKEND_BASE}/api/userbot-chat/process",
                        json=payload
                    ) as response:
                        _ = await response.text()
                        duration_ms = int((time.perf_counter() - start_ts) * 1000)
                        _agent_log(
                            'H4',
                            'userbot.py:_push_to_backend',
                            'push_backend',
                            {
                                'status_code': response.status,
                                'duration_ms': duration_ms,
                                'chat_id': payload.get('chat_id'),
                                'message_id': payload.get('message_id'),
                                'attempt': attempt,
                            },
                        )
                        if 200 <= response.status < 500:
                            return
                        logger.warning("Backend ответ %s, повтор", response.status)
            except Exception as push_error:
                _agent_log(
                    'H4',
                    'userbot.py:_push_to_backend',
                    'push_backend_failed',
                    {
                        'error': str(push_error),
                        'chat_id': payload.get('chat_id'),
                        'message_id': payload.get('message_id'),
                        'attempt': attempt,
                    },
                )
                logger.warning("[userbot] автообработка ошибка (attempt %s/%s): %s", attempt, self.http_retries, push_error)
            if attempt >= self.http_retries:
                return
            await asyncio.sleep(self.http_retry_delay * attempt)
            attempt += 1

    async def handle_new_message(self, event):
        """
        Обработчик новых сообщений
        """
        try:
            sender = await event.get_sender()
        except Exception as err:
            logger.warning("Не удалось получить отправителя: %s", err)
            return

        sender_id = getattr(sender, 'id', None)
        sender_name = getattr(sender, 'first_name', '') or 'Unknown'
        logger.debug("Входящее сообщение от %s (ID: %s)", sender_name, sender_id)

        if not (isinstance(sender, User) and sender_id in config.MONITOR_BOT_IDS):
            return

        message_text = getattr(event.message, 'message', None) or getattr(event.message, 'raw_text', None) or ''
        if not message_text:
            logger.info("Сообщение без текста, пропускаем (ID: %s)", sender_id)
            return

        msg_dt = self._normalize_dt(getattr(event.message, 'date', None))
        is_old, age_seconds = self._is_old_message(msg_dt)
        if is_old:
            _agent_log(
                'H2',
                'userbot.py:handle_new_message',
                'skip_old_message',
                {
                    'sender_id': str(sender_id),
                    'message_id': str(getattr(event.message, 'id', '')),
                    'age_seconds': age_seconds,
                    'max_age_minutes': self.max_message_age,
                    'has_text': bool(message_text),
                    'text_len': len(message_text or ''),
                },
            )
            logger.info("Сообщение слишком старое (%s сек), пропускаем", age_seconds)
            return

        inserted = await self.save_message_to_db(sender_id, event.message.id, message_text, msg_dt)
        _agent_log(
            'H2',
            'userbot.py:handle_new_message',
            'process_monitored_message',
            {
                'sender_id': str(sender_id),
                'message_id': str(getattr(event.message, 'id', '')),
                'age_seconds': age_seconds,
                'inserted': inserted,
                'has_text': bool(message_text),
                'text_len': len(message_text or ''),
            },
        )

        payload = {
            'chat_id': str(sender_id),
            'message_id': str(getattr(event.message, 'id', '')),
            'raw_text': message_text
        }

        if inserted:
            asyncio.create_task(self._push_to_backend(payload))
        else:
            logger.debug("Автообработка не запущена: запись уже существовала")

        try:
            await self.client.send_message(
                config.OUR_BOT_ID,
                message_text
            )
            logger.debug("Сообщение переслано в бот %s", config.OUR_BOT_ID)
        except Exception as forward_error:
            logger.error("Ошибка пересылки: %s", forward_error)

    async def run_until_disconnected(self):
        """
        Запуск userbot в режиме постоянной работы
        """
        await self.initialize()
        start_result = await self.start()
        if not start_result.get('success'):
            logger.error("Не удалось запустить userbot: %s", start_result)
            return

        bot_names_list = []
        for bot_id in config.MONITOR_BOT_IDS:
            try:
                bot_entity = await self.resolve_entity(bot_id)
                bot_name = bot_entity.first_name or f"ID:{bot_id}"
                bot_names_list.append(f"{bot_name} (@{bot_entity.username})")
            except Exception:
                bot_names_list.append(f"ID:{bot_id}")

        bot_names = ', '.join(bot_names_list)

        logger.info("Userbot работает в фоновом режиме, мониторим: %s", bot_names)
        await self.client.run_until_disconnected()

    async def load_bot_history(self, bot_id: int, bot_username: str, days: int = None):
        """
        Загрузить историю сообщений от бота

        Args:
            bot_id: ID бота в БД
            bot_username: Username бота (например, "@CardXabarBot")
            days: Загрузить за последние N дней (None = вся история)

        Returns:
            {loaded: int, saved: int, skipped: int, errors: int}
        """
        from services.userbot.history_loader import HistoryLoader

        if not self.client or not self.client.is_connected():
            return {
                'loaded': 0,
                'saved': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': 'Userbot не подключен'
            }

        try:
            await self._ensure_db_pool()
            loader = HistoryLoader(self.client, db_pool=self.db_pool)
            result = await loader.load_bot_history(
                bot_id=bot_id,
                bot_username=bot_username,
                days=days
            )
            await loader.close()
            return result

        except Exception as e:
            logger.error("Ошибка при загрузке истории: %s", e)
            return {
                'loaded': 0,
                'saved': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': str(e)
            }

    async def resolve_entity(self, identifier):
        """Вернуть InputPeer для переданного идентификатора"""
        if identifier is None:
            raise ValueError("identifier is required")

        if isinstance(identifier, (int,)):
            entity = await self.client.get_entity(identifier)
            return self._to_input_peer(entity)

        value = str(identifier)
        if value.startswith('@'):
            return await self.client.get_input_entity(value)

        try:
            numeric = int(value)
        except Exception:
            entity = await self.client.get_entity(value)
            return self._to_input_peer(entity)

        if value.startswith('-100'):
            entity = await self.client.get_entity(PeerChannel(numeric))
            return InputPeerChannel(entity.id, entity.access_hash)

        try:
            entity = await self.client.get_entity(numeric)
            return self._to_input_peer(entity)
        except Exception:
            entity = await self.client.get_entity(PeerChat(numeric))
            return InputPeerChat(entity.id)

    def _to_input_peer(self, entity):
        if isinstance(entity, (Channel, PeerChannel)):
            return InputPeerChannel(entity.id, entity.access_hash)
        if isinstance(entity, (Chat, PeerChat)):
            return InputPeerChat(entity.id)
        if isinstance(entity, (User, PeerUser)) or getattr(entity, 'bot', False) or hasattr(entity, 'first_name'):
            return InputPeerUser(entity.id, getattr(entity, 'access_hash', None))
        # fallback для сущностей Telethon (Channel / User и т.п.)
        if getattr(entity, 'access_hash', None) is not None:
            # определим по типу
            if getattr(entity, 'megagroup', False) or getattr(entity, 'broadcast', False):
                return InputPeerChannel(entity.id, entity.access_hash)
            return InputPeerUser(entity.id, entity.access_hash)
        return InputPeerChat(entity.id)

    async def fetch_message_text(self, chat_id, message_id):
        """Извлечь текст сообщения по chat/message id"""
        if not self.client:
            await self.initialize()

        if not self.client.is_connected():
            await self.client.connect()

        entity = await self.resolve_entity(chat_id)

        try:
            target_id = int(str(message_id))
        except ValueError:
            target_id = message_id

        message = await self.client.get_messages(entity, ids=target_id)
        if not message:
            raise ValueError('Message not found in Telegram history')

        text = getattr(message, 'message', None) or getattr(message, 'raw_text', None) or ''
        if not text:
            raise ValueError('Message has no text content')

        return text

    async def get_messages(self, chat_id, limit=50, before_message_id=None):
        if not self.client:
            await self.initialize()

        if not self.client.is_connected():
            await self.client.connect()

        peer = await self.resolve_entity(chat_id)
        kwargs = {
            'limit': max(1, min(int(limit or 50), 200))
        }

        if before_message_id:
            try:
                kwargs['offset_id'] = int(str(before_message_id))
            except (TypeError, ValueError):
                kwargs['offset_id'] = int(before_message_id)

        messages = await self.client.get_messages(peer, **kwargs)

        dedup = set()
        out = []
        for message in messages:
            message_id = getattr(message, 'id', None)
            if message_id is None:
                continue
            message_id = str(message_id)
            if message_id in dedup:
                continue
            dedup.add(message_id)

            text = getattr(message, 'message', None) or getattr(message, 'raw_text', None) or ''
            out.append({
                'message_id': message_id,
                'chat_id': str(chat_id),
                'sender_id': str(getattr(message, 'sender_id', '') or ''),
                'date': message.date.isoformat() if getattr(message, 'date', None) else None,
                'text': text
            })

        return out

    async def get_chat_meta(self, chat_id):
        if not self.client:
            await self.initialize()

        if not self.client.is_connected():
            await self.client.connect()

        peer = await self.resolve_entity(chat_id)
        entity = await self.client.get_entity(peer)

        title = getattr(entity, 'title', None) or getattr(entity, 'first_name', None) or getattr(entity, 'last_name', None)

        return {
            'id': getattr(entity, 'id', None),
            'username': getattr(entity, 'username', None),
            'title': title,
            'bot': getattr(entity, 'bot', False)
        }


# Глобальный экземпляр userbot manager
userbot_manager = UserbotManager()
