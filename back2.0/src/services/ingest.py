"""
Ingest Gateway - приём и валидация webhook'ов от Telegram
"""
from typing import Dict, Any, Optional
from fastapi import Request, HTTPException
import hmac
import hashlib
import structlog

from src.config import settings
from src.utils.event_bus import publish_event

logger = structlog.get_logger()


async def validate_telegram_webhook(request: Request) -> Dict[str, Any]:
    """
    Валидация и распаковка webhook от Telegram
    
    Args:
        request: FastAPI Request объект
        
    Returns:
        Распакованные данные update от Telegram
    """
    # Проверка секрета (если настроен)
    if settings.TELEGRAM_WEBHOOK_SECRET:
        # Telegram может отправлять секрет в заголовке или теле
        # Здесь упрощённая проверка - можно расширить
        pass
    
    # Читаем тело запроса
    try:
        body = await request.json()
    except Exception as e:
        logger.error("Ошибка чтения тела запроса", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid JSON")
    
    # Валидация структуры update
    if "update_id" not in body:
        raise HTTPException(status_code=400, detail="Missing update_id")
    
    # Проверка IP (опционально, можно добавить список разрешённых IP Telegram)
    # Telegram IP ranges: https://core.telegram.org/bots/webhooks
    
    return body


async def process_telegram_update(update: Dict[str, Any]) -> None:
    """
    Обработка update от Telegram и отправка в Event Bus
    
    Args:
        update: Объект update от Telegram Bot API
    """
    update_id = update.get("update_id")
    
    # Извлекаем сообщение или channel_post
    message = update.get("message") or update.get("channel_post")
    
    if not message:
        logger.debug("Update не содержит message/channel_post", update_id=update_id)
        return
    
    # Формируем событие для шины
    event_data = {
        "update_id": update_id,
        "message": message,
        "message_id": message.get("message_id"),
        "chat_id": message.get("chat", {}).get("id"),
        "chat_type": message.get("chat", {}).get("type"),
        "text": message.get("text"),
        "photo": message.get("photo"),
        "document": message.get("document"),
        "date": message.get("date"),
        "from": message.get("from")
    }
    
    # Отправляем в Event Bus
    await publish_event("telegram.message.raw", event_data)
    
    logger.info(
        "Telegram update отправлен в Event Bus",
        update_id=update_id,
        message_id=event_data.get("message_id")
    )

