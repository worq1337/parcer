"""
Event Processor Worker - обработчик событий из Event Bus
"""
import asyncio
import structlog
from src.utils.event_bus import subscribe_event
from src.services.processor import process_telegram_message
from src.database.connection import AsyncSessionLocal

logger = structlog.get_logger()


async def start_event_processor():
    """Запуск обработчика событий"""
    logger.info("Запуск Event Processor Worker")
    
    # Подписываемся на события telegram.message.raw
    await subscribe_event("telegram.message.raw", handle_telegram_message)
    
    # Подписываемся на события receipt.candidate
    await subscribe_event("receipt.candidate", handle_receipt_candidate)
    
    logger.info("Event Processor Worker запущен")


async def handle_telegram_message(data: dict):
    """Обработчик события telegram.message.raw"""
    try:
        message_data = data.get("message") or {}
        
        async with AsyncSessionLocal() as db:
            await process_telegram_message(message_data, db)
    except Exception as e:
        logger.error("Ошибка обработки telegram.message.raw", error=str(e))


async def handle_receipt_candidate(data: dict):
    """Обработчик события receipt.candidate"""
    try:
        async with AsyncSessionLocal() as db:
            from src.services.processor import parse_and_save
            await parse_and_save(data, db)
    except Exception as e:
        logger.error("Ошибка обработки receipt.candidate", error=str(e))


if __name__ == "__main__":
    # Запуск как отдельный воркер
    async def main():
        await start_event_processor()
        # Держим воркер активным
        await asyncio.Event().wait()
    
    asyncio.run(main())

