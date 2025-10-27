"""
patch-017 §4: Userbot Service Flask App

API для управления Telethon userbot:
- POST /login - логин по номеру телефона
- POST /start - запуск мониторинга
- POST /stop - остановка
- GET /status - текущий статус
- GET /health - healthcheck
"""

import asyncio
import threading
from flask import Flask, request, jsonify
from flask_cors import CORS
import config
from userbot import userbot_manager


app = Flask(__name__)
CORS(app)


# Глобальный event loop для asyncio
loop = None
userbot_thread = None


def run_userbot_loop():
    """
    Запуск event loop в отдельном потоке
    """
    global loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_forever()


# Запускаем event loop в фоновом потоке при старте приложения
userbot_thread = threading.Thread(target=run_userbot_loop, daemon=True)
userbot_thread.start()


def run_async(coro):
    """
    Хелпер для запуска async функций из sync контекста Flask
    """
    # Ждем пока loop создастся (до 5 секунд)
    import time
    timeout = 5
    start = time.time()
    while loop is None and (time.time() - start) < timeout:
        time.sleep(0.1)

    if loop is None:
        raise RuntimeError("Event loop not initialized")

    return asyncio.run_coroutine_threadsafe(coro, loop).result()


@app.route('/health', methods=['GET'])
def health():
    """
    Healthcheck endpoint
    """
    return jsonify({
        'status': 'healthy',
        'service': 'userbot',
        'version': '1.0.0'
    })


@app.route('/status', methods=['GET'])
def get_status():
    """
    Получить текущий статус userbot

    Response:
    {
        "running": true/false,
        "authorized": true/false,
        "user": {
            "id": 123456789,
            "first_name": "Иван",
            "username": "ivan",
            "phone": "+998901234567"
        }
    }
    """
    try:
        status = run_async(userbot_manager.get_status())
        return jsonify(status)

    except Exception as e:
        return jsonify({
            'running': False,
            'authorized': False,
            'error': str(e)
        }), 500


@app.route('/login', methods=['POST'])
def login():
    """
    Логин userbot через номер телефона

    Request body:
    {
        "phone_number": "+998901234567",
        "code": "12345" (optional),
        "password": "2fa_password" (optional)
    }

    Response:
    {
        "success": true,
        "status": "code_sent" | "authorized" | "password_required",
        "user": {...} (если authorized)
    }
    """
    try:
        data = request.json

        phone_number = data.get('phone_number')
        code = data.get('code')
        password = data.get('password')

        if not phone_number:
            return jsonify({
                'success': False,
                'error': 'Требуется phone_number'
            }), 400

        result = run_async(userbot_manager.login(phone_number, code, password))

        if result.get('success'):
            return jsonify(result), 200
        else:
            status_code = 200 if result.get('status') in ['code_sent', 'password_required'] else 400
            return jsonify(result), status_code

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/start', methods=['POST'])
def start_userbot():
    """
    Запуск userbot мониторинга

    Response:
    {
        "success": true,
        "message": "Userbot запущен как Иван",
        "user": {...}
    }
    """
    try:
        result = run_async(userbot_manager.start())

        if result.get('success'):
            # Запускаем userbot в фоновом режиме
            asyncio.run_coroutine_threadsafe(
                userbot_manager.run_until_disconnected(),
                loop
            )

            return jsonify(result), 200
        else:
            return jsonify(result), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/stop', methods=['POST'])
def stop_userbot():
    """
    Остановка userbot

    Response:
    {
        "success": true,
        "message": "Userbot остановлен"
    }
    """
    try:
        result = run_async(userbot_manager.stop())
        return jsonify(result), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/logout', methods=['POST'])
def logout():
    """
    Выход из аккаунта (удаление session)

    Response:
    {
        "success": true,
        "message": "Session удалена"
    }
    """
    try:
        # Останавливаем userbot
        run_async(userbot_manager.stop())

        # Удаляем session файл
        import os
        session_file = f"{userbot_manager.session_path}.session"
        if os.path.exists(session_file):
            os.remove(session_file)

        return jsonify({
            'success': True,
            'message': 'Session удалена. Требуется новый логин.'
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
        'error': str(e)
    }), 500


@app.route('/message-text', methods=['POST'])
def message_text():
    """Получить текст сообщения по chat_id/message_id"""
    try:
        data = request.json or {}
        chat_id = data.get('chat_id') or data.get('chatId')
        message_id = data.get('message_id') or data.get('messageId')

        if not chat_id or not message_id:
            return jsonify({
                'success': False,
                'error': 'chat_id и message_id обязательны'
            }), 400

        text = run_async(userbot_manager.fetch_message_text(chat_id, message_id))

        return jsonify({
            'success': True,
            'text': text
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/chat-meta', methods=['POST'])
def chat_meta():
    try:
        data = request.json or {}
        chat_id = data.get('chat_id') or data.get('chatId')

        if not chat_id:
            return jsonify({
                'success': False,
                'error': 'chat_id обязателен'
            }), 400

        meta = run_async(userbot_manager.get_chat_meta(chat_id))

        return jsonify({
            'success': True,
            'meta': meta
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/load-history', methods=['POST'])
def load_history():
    """
    Загрузить историю сообщений от бота

    Request body:
    {
        "bot_id": 915326936,
        "bot_username": "@CardXabarBot",
        "days": 30  (optional, None = вся история)
    }

    Response:
    {
        "success": true,
        "loaded": 150,  # Всего загружено из Telegram
        "saved": 120,   # Сохранено в БД (новых)
        "skipped": 30,  # Пропущено (дубликаты)
        "errors": 0     # Ошибок
    }
    """
    try:
        data = request.json

        bot_id = data.get('bot_id')
        bot_username = data.get('bot_username')
        days = data.get('days')  # None = вся история

        if not bot_id or not bot_username:
            return jsonify({
                'success': False,
                'error': 'Требуется bot_id и bot_username'
            }), 400

        # Вызвать загрузку истории через userbot_manager
        result = run_async(
            userbot_manager.load_bot_history(
                bot_id=bot_id,
                bot_username=bot_username,
                days=days
            )
        )

        if 'error_message' in result:
            return jsonify({
                'success': False,
                'error': result['error_message'],
                **result
            }), 500

        return jsonify({
            'success': True,
            **result
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("🚀 Userbot Service starting...")
    print(f"📡 Будет мониторить ботов с ID: {config.MONITOR_BOT_IDS}")
    print(f"🎯 Будет пересылать в бот: {config.OUR_BOT_ID}")
    print(f"🌐 API доступен на http://{config.FLASK_HOST}:{config.FLASK_PORT}")

    # Инициализируем userbot
    run_async(userbot_manager.initialize())

    # Пытаемся автоматически запустить userbot если уже авторизован
    try:
        print("🔍 Проверка авторизации для автозапуска...")
        status = run_async(userbot_manager.get_status())
        print(f"📊 Статус: {status}")

        if status.get('authorized'):
            print("✅ Userbot уже авторизован, запускаем мониторинг...")
            run_async(userbot_manager.start())

            # Запускаем в фоновом режиме
            print("🚀 Запуск run_until_disconnected в фоне...")
            asyncio.run_coroutine_threadsafe(
                userbot_manager.run_until_disconnected(),
                loop
            )
            print("✅ Userbot запущен и мониторит каналы!")
        else:
            print("⚠️ Userbot не авторизован. Требуется вызвать POST /login и POST /start")
    except Exception as e:
        import traceback
        print(f"❌ Автозапуск не удался: {e}")
        print(f"🔍 Traceback:\n{traceback.format_exc()}")

    # Запускаем Flask
    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=config.FLASK_DEBUG
    )
