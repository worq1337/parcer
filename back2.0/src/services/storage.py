"""
Storage Service - работа с БД и объектным хранилищем
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from src.database.models import Receipt, Operator, Attachment
from src.schemas.api import ReceiptFilters
import structlog

logger = structlog.get_logger()


async def get_receipts(
    db: AsyncSession,
    filters: ReceiptFilters,
    user_id: Optional[str] = None
) -> tuple[List[Receipt], int]:
    """
    Получение списка чеков с фильтрацией и пагинацией
    
    Args:
        db: Сессия БД
        filters: Фильтры запроса
        user_id: ID пользователя (для фильтрации)
        
    Returns:
        Кортеж (список чеков, общее количество)
    """
    # Базовый запрос
    stmt = select(Receipt)
    
    # Фильтр по пользователю
    if user_id:
        stmt = stmt.where(Receipt.user_id == user_id)
    
    # Применяем фильтры
    conditions = []
    
    if filters.date_from:
        conditions.append(Receipt.ts_event >= filters.date_from)
    if filters.date_to:
        conditions.append(Receipt.ts_event <= filters.date_to)
    if filters.event_type:
        conditions.append(Receipt.event_type == filters.event_type)
    if filters.currency:
        conditions.append(Receipt.currency == filters.currency)
    if filters.operator_canonical:
        conditions.append(Receipt.operator_canonical == filters.operator_canonical)
    if filters.card_mask:
        conditions.append(Receipt.card_mask.ilike(f"%{filters.card_mask}%"))
    
    if conditions:
        stmt = stmt.where(and_(*conditions))
    
    # Подсчёт общего количества
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar()
    
    # Сортировка и пагинация
    stmt = stmt.order_by(Receipt.ts_event.desc())
    stmt = stmt.offset((filters.page - 1) * filters.page_size)
    stmt = stmt.limit(filters.page_size)
    
    # Загружаем связанные данные
    stmt = stmt.options(
        selectinload(Receipt.operator),
        selectinload(Receipt.attachments)
    )
    
    result = await db.execute(stmt)
    receipts = result.scalars().all()
    
    return receipts, total


async def get_receipt_by_id(
    db: AsyncSession,
    receipt_id: int,
    user_id: Optional[str] = None
) -> Optional[Receipt]:
    """
    Получение чека по ID
    
    Args:
        db: Сессия БД
        receipt_id: ID чека
        user_id: ID пользователя (для проверки доступа)
        
    Returns:
        Чек или None
    """
    stmt = select(Receipt).where(Receipt.id == receipt_id)
    
    if user_id:
        stmt = stmt.where(Receipt.user_id == user_id)
    
    stmt = stmt.options(
        selectinload(Receipt.operator),
        selectinload(Receipt.attachments)
    )
    
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_operators(db: AsyncSession) -> List[Operator]:
    """
    Получение списка операторов
    
    Args:
        db: Сессия БД
        
    Returns:
        Список операторов
    """
    stmt = select(Operator).order_by(Operator.weight.desc(), Operator.canonical)
    result = await db.execute(stmt)
    return result.scalars().all()


async def reparse_receipt(
    db: AsyncSession,
    receipt_id: int,
    user_id: Optional[str] = None
) -> Optional[Receipt]:
    """
    Переобработка чека
    
    Args:
        db: Сессия БД
        receipt_id: ID чека
        user_id: ID пользователя
        
    Returns:
        Обновлённый чек
    """
    receipt = await get_receipt_by_id(db, receipt_id, user_id)
    
    if not receipt:
        return None
    
    # Парсим заново
    from src.services.parser import parser_service
    from src.services.deduper import compute_duplicate_key
    
    parsed = await parser_service.parse_text(receipt.raw_text, raw_lang=receipt.raw_lang)
    
    # Обновляем поля
    ts_event = datetime.fromisoformat(parsed["ts_event"].replace("Z", "+00:00"))
    
    receipt.event_type = parsed["event_type"]
    receipt.amount = parsed["amount"]
    receipt.currency = parsed["currency"]
    receipt.sign = parsed["sign"]
    receipt.card_brand = parsed.get("card_brand")
    receipt.card_mask = parsed.get("card_mask")
    receipt.operator_raw = parsed.get("operator_raw")
    receipt.operator_canonical = parsed.get("operator_canonical")
    receipt.merchant_name = parsed.get("merchant_name")
    receipt.merchant_address = parsed.get("merchant_address")
    receipt.balance_after = parsed.get("balance_after")
    receipt.balance_currency = parsed.get("balance_currency")
    receipt.ts_event = ts_event
    receipt.confidence = parsed.get("confidence")
    receipt.parse_status = "ok"
    receipt.error = None
    
    # Пересчитываем duplicate_key
    receipt.duplicate_key = compute_duplicate_key(
        amount=parsed["amount"],
        currency=parsed["currency"],
        ts_event=ts_event,
        card_mask=parsed.get("card_mask"),
        operator_canonical=parsed.get("operator_canonical"),
        sign=parsed["sign"],
        raw_text=receipt.raw_text
    )
    
    await db.commit()
    await db.refresh(receipt)
    
    logger.info("Чек переобработан", receipt_id=receipt_id)
    
    return receipt

