"""
Event Processor - обработка событий из Event Bus
"""
from typing import Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from src.database.models import Receipt
from src.services.parser import parser_service
from src.services.normalizer import normalize_operator, normalize_currency
from src.services.deduper import compute_duplicate_key, check_duplicate
from src.utils.event_bus import publish_event

logger = structlog.get_logger()


async def process_telegram_message(message_data: Dict[str, Any], db: AsyncSession):
    """
    Обработка сырого сообщения от Telegram
    
    Args:
        message_data: Данные сообщения из события telegram.message.raw
        db: Сессия БД
    """
    message_id = message_data.get("message_id")
    chat_id = str(message_data.get("chat_id", ""))
    text = message_data.get("text")
    photo = message_data.get("photo")
    document = message_data.get("document")
    
    if not text and not photo:
        logger.debug("Сообщение не содержит текста или фото", message_id=message_id)
        return
    
    # Формируем кандидата для парсинга
    candidate = {
        "source": "telegram",
        "raw_text": text or "",
        "media_refs": [],
        "user_id": None,  # TODO: извлечь из контекста сессии
        "received_at": datetime.utcnow(),
        "source_chat_id": chat_id,
        "message_id": str(message_id),
    }
    
    # Если есть фото - добавляем ссылку
    # TODO: Получить реальный URL файла через Telegram Bot API
    if photo:
        # Берём самое большое фото
        largest_photo = max(photo, key=lambda p: p.get("file_size", 0))
        file_id = largest_photo.get("file_id")
        # Пока сохраняем file_id, потом получим URL через bot.getFile()
        candidate["media_refs"].append(f"telegram:{file_id}")
    
    # Публикуем событие receipt.candidate
    await publish_event("receipt.candidate", candidate)
    
    # Парсим
    try:
        await parse_and_save(candidate, db)
    except Exception as e:
        logger.error("Ошибка обработки сообщения", message_id=message_id, error=str(e))
        # Публикуем событие об ошибке
        await publish_event("receipt.parse_failed", {
            "candidate": candidate,
            "error": str(e)
        })


async def parse_and_save(candidate: Dict[str, Any], db: AsyncSession):
    """
    Парсинг кандидата и сохранение в БД
    
    Args:
        candidate: Кандидат для парсинга (из receipt.candidate)
        db: Сессия БД
    """
    raw_text = candidate.get("raw_text", "")
    media_refs = candidate.get("media_refs", [])
    
    if not raw_text and not media_refs:
        logger.warning("Кандидат не содержит данных для парсинга")
        return
    
    # Парсим текст или изображение
    try:
        if media_refs and not raw_text:
            # Парсим изображение
            # TODO: Получить реальный URL из Telegram Bot API по file_id
            media_ref = media_refs[0]
            if media_ref.startswith("telegram:"):
                file_id = media_ref.replace("telegram:", "")
                # Временное решение: нужно получить URL через bot.getFile()
                # Для MVP можно пропустить парсинг изображений или использовать OCR fallback
                raise ValueError("Парсинг изображений из Telegram требует получения URL файла")
            else:
                image_url = media_ref
            parsed = await parser_service.parse_image(image_url)
        else:
            # Парсим текст
            parsed = await parser_service.parse_text(raw_text, raw_lang=None)
    except Exception as e:
        logger.error("Ошибка парсинга", error=str(e))
        raise
    
    # Публикуем событие receipt.parsed
    await publish_event("receipt.parsed", parsed)
    
    # Подготавливаем данные для сохранения
    ts_event = datetime.fromisoformat(parsed["ts_event"].replace("Z", "+00:00"))
    
    # Вычисляем duplicate_key
    duplicate_key = compute_duplicate_key(
        amount=parsed["amount"],
        currency=parsed["currency"],
        ts_event=ts_event,
        card_mask=parsed.get("card_mask"),
        operator_canonical=parsed.get("operator_canonical"),
        sign=parsed["sign"],
        raw_text=raw_text
    )
    
    # Проверяем на дубликат
    existing = await check_duplicate(
        db,
        duplicate_key,
        message_id=candidate.get("message_id"),
        source_chat_id=candidate.get("source_chat_id")
    )
    
    if existing:
        logger.info("Дубликат найден, пропускаем", duplicate_key=duplicate_key)
        return existing
    
    # Создаём запись в БД
    receipt = Receipt(
        user_id=candidate.get("user_id"),
        source_platform="telegram",
        source_chat_id=candidate.get("source_chat_id"),
        message_id=candidate.get("message_id"),
        raw_text=raw_text,
        raw_lang=parsed.get("lang"),
        
        event_type=parsed["event_type"],
        amount=parsed["amount"],
        currency=parsed["currency"],
        sign=parsed["sign"],
        
        card_brand=parsed.get("card_brand"),
        card_mask=parsed.get("card_mask"),
        
        operator_raw=parsed.get("operator_raw"),
        operator_canonical=parsed.get("operator_canonical"),
        
        merchant_name=parsed.get("merchant_name"),
        merchant_address=parsed.get("merchant_address"),
        
        balance_after=parsed.get("balance_after"),
        balance_currency=parsed.get("balance_currency"),
        
        ts_event=ts_event,
        ts_local=parsed.get("tz_hint"),
        
        confidence=parsed.get("confidence"),
        duplicate_key=duplicate_key,
        parse_status="ok"
    )
    
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)
    
    # Публикуем событие receipt.persisted
    await publish_event("receipt.persisted", {
        "receipt_id": receipt.id,
        "status": "ok"
    })
    
    logger.info("Чек сохранён", receipt_id=receipt.id, event_type=parsed["event_type"])
    
    return receipt

