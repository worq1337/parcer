"""
Pydantic схемы для API запросов и ответов
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class ReceiptCreate(BaseModel):
    """Схема для создания чека через API"""
    raw_text: str = Field(..., description="Исходный текст чека")
    source_chat_id: Optional[str] = None
    message_id: Optional[str] = None
    raw_html: Optional[str] = None
    media_refs: Optional[List[str]] = Field(default_factory=list, description="Ссылки на вложения")


class ReceiptResponse(BaseModel):
    """Схема ответа API для чека"""
    id: int
    user_id: Optional[str]
    source_platform: str
    source_chat_id: Optional[str]
    message_id: Optional[str]
    raw_text: str
    raw_html: Optional[str]
    raw_lang: Optional[str]
    event_type: str
    amount: float
    currency: str
    sign: int
    card_brand: Optional[str]
    card_mask: Optional[str]
    operator_raw: Optional[str]
    operator_id: Optional[int]
    operator_canonical: Optional[str]
    merchant_name: Optional[str]
    merchant_address: Optional[str]
    balance_after: Optional[float]
    balance_currency: Optional[str]
    ts_event: datetime
    ts_local: Optional[str]
    confidence: Optional[float]
    duplicate_key: Optional[str]
    ingest_at: datetime
    parse_status: str
    error: Optional[str]
    
    class Config:
        from_attributes = True


class ReceiptListResponse(BaseModel):
    """Схема ответа для списка чеков"""
    receipts: List[ReceiptResponse]
    total: int
    page: int
    page_size: int


class OperatorResponse(BaseModel):
    """Схема ответа для оператора"""
    id: int
    pattern: str
    canonical: str
    app: str
    weight: int
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class ReceiptFilters(BaseModel):
    """Фильтры для запроса чеков"""
    user_id: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    event_type: Optional[str] = None
    currency: Optional[str] = None
    operator_canonical: Optional[str] = None
    card_mask: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)

