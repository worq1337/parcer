"""
patch-017 §4: Userbot Configuration

Настройки для Telethon userbot
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Telegram API credentials (получить на https://my.telegram.org/apps)
API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')

# Боты для мониторинга (ID ботов, от которых нужно пересылать сообщения)
# Названия будут автоматически получены из Telegram API
MONITOR_BOT_IDS = [
    915326936,   # @CardXabarBot / uzumbank_bot
    856254490,   # резервный/старый бот из UI списка
    7028509569   # @NBUCard_bot / click_store_bot
]

# Наш бот, в который пересылаем сообщения
OUR_BOT_ID = int(os.getenv('OUR_BOT_ID', '8482297276'))

# Backend URL для отправки чеков
BACKEND_URL = os.getenv('BACKEND_URL', 'http://backend:3001')

# Путь к session файлу
SESSION_DIR = '/app/sessions'
SESSION_NAME = 'userbot_session'

# Flask settings
FLASK_HOST = '0.0.0.0'
FLASK_PORT = 5001
FLASK_DEBUG = os.getenv('FLASK_ENV', 'production') == 'development'

# Секретный ключ для шифрования session (из backend)
ENCRYPTION_SECRET = os.getenv('ENCRYPTION_SECRET', '')
