"""
Сервис дедупликации чеков
"""
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from src.database.models import Receipt
import structlog

logger = structlog.get_logger()


def compute_duplicate_key(
    amount: float,
    currency: str,
    ts_event: datetime,
    card_mask: Optional[str] = None,
    operator_canonical: Optional[str] = None,
    sign: int = 0,
    raw_text: Optional[str] = None
) -> str:
    """
    Вычисление ключа дедупликации
    
    Используется комбинация двух сигнатур:
    1. sig1 = sha1(lower(raw_text_clean))
    2. sig2 = sha1(amount|currency|card_mask|operator_canonical|sign|floor(ts_event/60s))
    
    Args:
        amount: Сумма
        currency: Валюта
        ts_event: Время события
        card_mask: Маска карты
        operator_canonical: Каноническое название оператора
        sign: Знак операции (+1 или -1)
        raw_text: Исходный текст чека
        
    Returns:
        Хеш для дедупликации
    """
    # Сигнатура 1: по исходному тексту
    if raw_text:
        text_clean = raw_text.lower().strip()
        text_clean = " ".join(text_clean.split())  # Нормализуем пробелы
        sig1 = hashlib.sha1(text_clean.encode("utf-8")).hexdigest()
    else:
        sig1 = ""
    
    # Сигнатура 2: по ключевым полям + округление времени до минуты
    ts_floor_minute = ts_event.replace(second=0, microsecond=0)
    ts_timestamp = int(ts_floor_minute.timestamp())
    
    sig2_parts = [
        str(amount),
        currency.upper(),
        card_mask or "",
        operator_canonical or "",
        str(sign),
        str(ts_timestamp)
    ]
    sig2_raw = "|".join(sig2_parts)
    sig2 = hashlib.sha1(sig2_raw.encode("utf-8")).hexdigest()
    
    # Объединяем обе сигнатуры
    combined = f"{sig1}:{sig2}"
    final_hash = hashlib.sha1(combined.encode("utf-8")).hexdigest()
    
    return final_hash


async def check_duplicate(
    db: AsyncSession,
    duplicate_key: str,
    message_id: Optional[str] = None,
    source_chat_id: Optional[str] = None
) -> Optional[Receipt]:
    """
    Проверка на дубликат
    
    Args:
        db: Сессия БД
        duplicate_key: Ключ дедупликации
        message_id: ID сообщения Telegram (для точной проверки)
        source_chat_id: ID чата
        
    Returns:
        Найденный дубликат или None
    """
    # Сначала проверяем по duplicate_key
    if duplicate_key:
        stmt = select(Receipt).where(Receipt.duplicate_key == duplicate_key)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            logger.debug("Дубликат найден по duplicate_key", duplicate_key=duplicate_key)
            return existing
    
    # Дополнительная проверка: если совпадает message_id и source_chat_id - точно дубликат
    if message_id and source_chat_id:
        stmt = select(Receipt).where(
            Receipt.message_id == message_id,
            Receipt.source_chat_id == source_chat_id
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            logger.debug(
                "Дубликат найден по message_id и source_chat_id",
                message_id=message_id,
                source_chat_id=source_chat_id
            )
            return existing
    
    return None


async def mark_as_duplicate(
    db: AsyncSession,
    receipt_id: int,
    original_receipt_id: int
) -> None:
    """
    Пометить чек как дубликат (через обновление parse_status)
    
    В новой схеме нет поля is_duplicate, используем parse_status="duplicate"
    или связываем через duplicate_key
    """
    stmt = select(Receipt).where(Receipt.id == receipt_id)
    result = await db.execute(stmt)
    receipt = result.scalar_one_or_none()
    
    if receipt:
        receipt.parse_status = "duplicate"
        # Можно добавить ссылку на оригинал через JSON в error или отдельное поле
        await db.commit()

