"""
REST API endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.connection import get_db
from src.schemas.api import (
    ReceiptCreate,
    ReceiptResponse,
    ReceiptListResponse,
    ReceiptFilters,
    OperatorResponse
)
from src.services.storage import (
    get_receipts,
    get_receipt_by_id,
    get_operators,
    reparse_receipt
)
from src.services.processor import parse_and_save
import structlog

logger = structlog.get_logger()

router = APIRouter()


@router.post("/receipts", response_model=ReceiptResponse, status_code=status.HTTP_201_CREATED)
async def create_receipt(
    receipt_data: ReceiptCreate,
    db: AsyncSession = Depends(get_db)
):
    """Создание нового чека через API"""
    try:
        candidate = {
            "source": "api",
            "raw_text": receipt_data.raw_text,
            "media_refs": receipt_data.media_refs or [],
            "user_id": None,  # TODO: извлечь из auth контекста
            "received_at": None,
            "source_chat_id": receipt_data.source_chat_id,
            "message_id": receipt_data.message_id,
        }
        
        receipt = await parse_and_save(candidate, db)
        
        if not receipt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Не удалось распарсить чек"
            )
        
        return receipt
    except Exception as e:
        logger.error("Ошибка создания чека", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/receipts", response_model=ReceiptListResponse)
async def list_receipts(
    filters: ReceiptFilters = Depends(),
    user_id: Optional[str] = None,  # TODO: извлечь из auth
    db: AsyncSession = Depends(get_db)
):
    """Получение списка чеков с фильтрацией"""
    receipts, total = await get_receipts(db, filters, user_id)
    
    return ReceiptListResponse(
        receipts=receipts,
        total=total,
        page=filters.page,
        page_size=filters.page_size
    )


@router.get("/receipts/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: int,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Получение чека по ID"""
    receipt = await get_receipt_by_id(db, receipt_id, user_id)
    
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Чек не найден"
        )
    
    return receipt


@router.post("/receipts/{receipt_id}/reparse", response_model=ReceiptResponse)
async def reparse_receipt_endpoint(
    receipt_id: int,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Переобработка чека"""
    receipt = await reparse_receipt(db, receipt_id, user_id)
    
    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Чек не найден"
        )
    
    return receipt


@router.get("/operators", response_model=List[OperatorResponse])
async def list_operators(db: AsyncSession = Depends(get_db)):
    """Получение списка операторов"""
    operators = await get_operators(db)
    return operators


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Webhook для Telegram Bot API"""
    from src.services.ingest import validate_telegram_webhook, process_telegram_update
    
    try:
        update = await validate_telegram_webhook(request)
        await process_telegram_update(update)
        
        # Обрабатываем сообщение
        from src.services.processor import process_telegram_message
        message_data = update.get("message") or update.get("channel_post")
        if message_data:
            await process_telegram_message(message_data, db)
        
        return {"ok": True}
    except Exception as e:
        logger.error("Ошибка обработки webhook", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

