"""
Event Bus - интеграция с NATS для обработки событий
"""
from typing import Dict, Any, Optional
import json
import nats
from nats.aio.client import Client as NATS
from nats.js import JetStreamContext
import structlog

from src.config import settings

logger = structlog.get_logger()

# Глобальные переменные для подключений
_nc: Optional[NATS] = None
_js: Optional[JetStreamContext] = None


async def init_event_bus():
    """Инициализация подключения к NATS"""
    global _nc, _js
    
    try:
        _nc = await nats.connect(settings.NATS_URL)
        _js = _nc.jetstream()
        
        # Создаём потоки (streams) для событий
        try:
            await _js.add_stream(
                name="telegram_events",
                subjects=["telegram.message.raw"],
                max_age=86400 * 7  # 7 дней хранения
            )
        except Exception:
            # Stream уже существует
            pass
        
        try:
            await _js.add_stream(
                name="receipt_events",
                subjects=[
                    "receipt.candidate",
                    "receipt.parsed",
                    "receipt.persisted"
                ],
                max_age=86400 * 7
            )
        except Exception:
            pass
        
        logger.info("Event Bus (NATS) инициализирован", url=settings.NATS_URL)
    except Exception as e:
        logger.error("Ошибка инициализации Event Bus", error=str(e))
        # В режиме разработки можно работать без NATS
        if settings.DEBUG:
            logger.warning("Продолжаем без Event Bus (режим разработки)")
        else:
            raise


async def close_event_bus():
    """Закрытие подключения к NATS"""
    global _nc
    
    if _nc:
        await _nc.close()
        logger.info("Event Bus закрыт")


async def check_event_bus_health() -> bool:
    """Проверка здоровья Event Bus"""
    global _nc
    
    if not _nc:
        return False
    
    try:
        # Простая проверка: смотрим статус подключения
        return _nc.is_connected
    except Exception:
        return False


async def publish_event(subject: str, data: Dict[str, Any]) -> None:
    """
    Публикация события в Event Bus
    
    Args:
        subject: Тема события (например: "telegram.message.raw")
        data: Данные события
    """
    global _js, _nc
    
    if not _js and not _nc:
        # Если Event Bus не инициализирован, логируем и пропускаем
        logger.debug("Event Bus не доступен, пропускаем событие", subject=subject)
        return
    
    try:
        payload = json.dumps(data).encode("utf-8")
        
        if _js:
            # Используем JetStream для персистентности
            await _js.publish(subject, payload)
        elif _nc:
            # Fallback на обычный NATS
            await _nc.publish(subject, payload)
        
        logger.debug("Событие опубликовано", subject=subject)
    except Exception as e:
        logger.error("Ошибка публикации события", subject=subject, error=str(e))


async def subscribe_event(
    subject: str,
    callback: callable,
    queue: Optional[str] = None
) -> None:
    """
    Подписка на события
    
    Args:
        subject: Тема события
        callback: Функция обработки (async def callback(msg))
        queue: Имя очереди для балансировки нагрузки
    """
    global _js, _nc
    
    if not _js and not _nc:
        logger.warning("Event Bus не доступен для подписки", subject=subject)
        return
    
    try:
        async def handler(msg):
            try:
                data = json.loads(msg.data.decode("utf-8"))
                await callback(data)
            except Exception as e:
                logger.error("Ошибка обработки события", subject=subject, error=str(e))
        
        if _js:
            sub = await _js.subscribe(subject, queue=queue, cb=handler)
        elif _nc:
            sub = await _nc.subscribe(subject, queue=queue, cb=handler)
        
        logger.info("Подписка создана", subject=subject, queue=queue)
        return sub
    except Exception as e:
        logger.error("Ошибка создания подписки", subject=subject, error=str(e))
        raise

