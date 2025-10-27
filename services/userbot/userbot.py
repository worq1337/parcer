"""
patch-017 §4: Telethon Userbot

Мониторит сообщения от банковских ботов и пересылает их в наш бот для обработки
"""

import os
import asyncio
import requests
import psycopg2
from datetime import datetime
from telethon import TelegramClient, events
from telethon.tl.types import User, PeerChannel, PeerChat, PeerUser, Channel, Chat
from telethon.tl.types import InputPeerUser, InputPeerChannel, InputPeerChat
import config


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
        self.client = None
        self.is_running = False
        self.session_path = os.path.join(config.SESSION_DIR, config.SESSION_NAME)

        # Обработчик для новых сообщений
        self.new_message_handler = None

        # Подключение к БД
        self.db_conn = None

    async def initialize(self):
        """
        Инициализация Telethon клиента
        """
        if not config.API_ID or not config.API_HASH:
            raise ValueError("TELEGRAM_API_ID и TELEGRAM_API_HASH должны быть установлены")

        self.client = TelegramClient(
            self.session_path,
            config.API_ID,
            config.API_HASH,
            system_version='4.16.30-vxCUSTOM'
        )

        # Регистрируем обработчик сообщений с фильтром incoming=True
        @self.client.on(events.NewMessage(incoming=True))
        async def message_handler(event):
            await self.handle_new_message(event)

        self.new_message_handler = message_handler

        print("✅ Telethon клиент инициализирован")
        print(f"🔍 Обработчик сообщений зарегистрирован (incoming=True)")

    async def login(self, phone_number, code=None, password=None):
        """
        Логин через номер телефона

        Args:
            phone_number: str - номер телефона в формате +998901234567
            code: str - код из SMS (если уже получен)
            password: str - 2FA пароль (если включена двухфакторная аутентификация)

        Returns:
            dict - статус логина
        """
        try:
            await self.client.connect()

            if await self.client.is_user_authorized():
                me = await self.client.get_me()
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

            # Отправляем код
            if not code:
                await self.client.send_code_request(phone_number)
                return {
                    'success': True,
                    'status': 'code_sent',
                    'message': f'Код отправлен на {phone_number}'
                }

            # Вводим код
            try:
                await self.client.sign_in(phone_number, code)

                me = await self.client.get_me()
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
                # Требуется 2FA пароль
                if 'Two-step verification' in str(code_error) or 'SessionPasswordNeededError' in str(type(code_error)):
                    if not password:
                        return {
                            'success': False,
                            'status': 'password_required',
                            'message': 'Требуется 2FA пароль'
                        }

                    await self.client.sign_in(password=password)

                    me = await self.client.get_me()
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
                else:
                    raise code_error

        except Exception as e:
            return {
                'success': False,
                'status': 'error',
                'error': str(e)
            }

    async def start(self):
        """
        Запуск userbot мониторинга
        """
        if not self.client:
            await self.initialize()

        await self.client.connect()

        if not await self.client.is_user_authorized():
            return {
                'success': False,
                'error': 'Userbot не авторизован. Выполните логин сначала.'
            }

        # Запускаем клиент
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

        print(f"🤖 Userbot запущен: {me.first_name} (@{me.username})")
        print(f"📡 Мониторим боты: {bot_names}")
        print(f"🎯 Пересылаем в бот: {config.OUR_BOT_ID}")

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
        if self.client and self.client.is_connected():
            await self.client.disconnect()

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
            else:
                return {
                    'running': self.is_running,
                    'authorized': False
                }

        except Exception as e:
            return {
                'running': False,
                'authorized': False,
                'error': str(e)
            }

    def save_message_to_db(self, bot_id, telegram_message_id, text):
        """
        Сохранить сообщение в БД
        """
        try:
            # Подключение к БД (получаем из переменных окружения)
            if not self.db_conn or self.db_conn.closed:
                self.db_conn = psycopg2.connect(
                    host=os.getenv('DB_HOST', 'postgres'),
                    port=os.getenv('DB_PORT', '5432'),
                    database=os.getenv('DB_NAME', 'receipt_parser'),
                    user=os.getenv('DB_USER', 'postgres'),
                    password=os.getenv('DB_PASSWORD', 'postgres')
                )

            cursor = self.db_conn.cursor()

            # Вставить сообщение со статусом 'unprocessed'
            cursor.execute(
                """INSERT INTO bot_messages
                   (bot_id, telegram_message_id, chat_id, message_id, timestamp, text, status, process_attempts)
                   VALUES (%s, %s, %s, %s, %s, %s, 'unprocessed', 0)
                   ON CONFLICT (chat_id, message_id) DO NOTHING""",
                (
                    str(bot_id),
                    str(telegram_message_id),
                    str(bot_id),
                    str(telegram_message_id),
                    datetime.now(),
                    text
                )
            )

            self.db_conn.commit()
            cursor.close()
            print(f"💾 Сообщение сохранено в БД (bot_id={bot_id})")

        except Exception as db_error:
            print(f"❌ Ошибка сохранения в БД: {db_error}")
            if self.db_conn:
                self.db_conn.rollback()

    async def handle_new_message(self, event):
        """
        Обработчик новых сообщений

        Проверяет, пришло ли сообщение от одного из мониторимых ботов,
        и пересылает его в наш бот для обработки
        """
        try:
            # Получаем отправителя
            sender = await event.get_sender()

            # Логируем ВСЕ входящие сообщения для отладки
            sender_info = f"{sender.first_name if hasattr(sender, 'first_name') else 'Unknown'} (ID: {sender.id})"
            print(f"🔔 Входящее сообщение от: {sender_info}")

            # Проверяем, является ли отправитель одним из мониторимых ботов
            if isinstance(sender, User) and sender.id in config.MONITOR_BOT_IDS:
                bot_name = sender.first_name or f"ID:{sender.id}"
                username = f"@{sender.username}" if sender.username else ""
                print(f"📨 Получено сообщение от бота {bot_name} {username} (ID: {sender.id})")

                # Получаем текст сообщения
                message_text = event.message.text

                if not message_text:
                    print("⚠️ Сообщение без текста, пропускаем")
                    return

                print(f"📝 Текст сообщения (первые 100 символов): {message_text[:100]}")

                # Сохраняем сообщение в БД для чата
                self.save_message_to_db(sender.id, event.message.id, message_text)

                # Пересылаем сообщение в наш бот
                try:
                    await self.client.send_message(
                        config.OUR_BOT_ID,
                        message_text
                    )

                    print(f"✅ Сообщение переслано в бот {config.OUR_BOT_ID}")

                except Exception as forward_error:
                    print(f"❌ Ошибка пересылки: {forward_error}")

        except Exception as e:
            print(f"❌ Ошибка обработки сообщения: {e}")

    async def run_until_disconnected(self):
        """
        Запуск userbot в режиме постоянной работы
        """
        if not self.client:
            await self.initialize()

        await self.start()

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

        print("🔄 Userbot работает в фоновом режиме...")
        print(f"📡 Мониторим боты: {bot_names}")
        print(f"🎯 Пересылаем в бот ID: {config.OUR_BOT_ID}")
        print("✅ Ожидание сообщений от банковских ботов...")

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
        from history_loader import HistoryLoader

        if not self.client or not self.client.is_connected():
            return {
                'loaded': 0,
                'saved': 0,
                'skipped': 0,
                'errors': 1,
                'error_message': 'Userbot не подключен'
            }

        try:
            loader = HistoryLoader(self.client)
            result = await loader.load_bot_history(
                bot_id=bot_id,
                bot_username=bot_username,
                days=days
            )
            loader.close()
            return result

        except Exception as e:
            print(f"❌ Ошибка при загрузке истории: {e}")
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
