"""
JSON Schema для Structured Outputs OpenAI Responses API
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class ReceiptSchema(BaseModel):
    """
    Схема нормализованного чека для OpenAI Structured Outputs
    """
    event_type: Literal["payment", "purchase", "p2p", "topup", "conversion", "fee", "penalty", "other"] = Field(
        ...,
        description="Тип события"
    )
    amount: float = Field(
        ...,
        description="Сумма транзакции",
        gt=0
    )
    currency: str = Field(
        ...,
        description="Валюта (ISO 4217 код, 3 символа)",
        min_length=3,
        max_length=3
    )
    sign: Literal[-1, 1] = Field(
        ...,
        description="Знак операции: 1 для пополнения (topup), -1 для списания (payment/fee)"
    )
    card_brand: Optional[str] = Field(
        None,
        description="Бренд карты: HUMO, UZCARD, VISA и т.д."
    )
    card_mask: Optional[str] = Field(
        None,
        description="Маска карты, например: ***6714 или *6714"
    )
    operator_raw: Optional[str] = Field(
        None,
        description="Сырое название оператора из чека, например: 'OQ P2P>TASHKENT'"
    )
    operator_canonical: Optional[str] = Field(
        None,
        description="Каноническое название оператора после нормализации"
    )
    operator_app: Optional[str] = Field(
        None,
        description="Название приложения, например: 'OQ', 'Milliy 2.0', 'MyUztelecom'"
    )
    merchant_name: Optional[str] = Field(
        None,
        description="Название мерчанта/продавца"
    )
    merchant_address: Optional[str] = Field(
        None,
        description="Адрес мерчанта"
    )
    balance_after: Optional[float] = Field(
        None,
        description="Баланс после операции"
    )
    balance_currency: Optional[str] = Field(
        None,
        description="Валюта баланса (ISO 4217, 3 символа)",
        min_length=3,
        max_length=3
    )
    ts_event: str = Field(
        ...,
        description="Время события в формате ISO 8601 (UTC)",
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$"
    )
    tz_hint: Optional[str] = Field(
        None,
        description="Подсказка по часовому поясу, например: '+05:00'"
    )
    lang: Optional[Literal["ru", "uz", "en"]] = Field(
        None,
        description="Язык исходного текста чека"
    )
    confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Уровень уверенности в извлечении (0.0-1.0)"
    )


# JSON Schema для OpenAI Responses API
RECEIPT_JSON_SCHEMA = {
    "type": "object",
    "required": ["event_type", "amount", "currency", "ts_event", "sign"],
    "properties": {
        "event_type": {
            "type": "string",
            "enum": ["payment", "purchase", "p2p", "topup", "conversion", "fee", "penalty", "other"]
        },
        "amount": {"type": "number"},
        "currency": {"type": "string", "minLength": 3, "maxLength": 3},
        "sign": {"type": "integer", "enum": [-1, 1]},
        "card_brand": {"type": "string"},
        "card_mask": {"type": "string"},
        "operator_raw": {"type": "string"},
        "operator_canonical": {"type": "string"},
        "operator_app": {"type": "string"},
        "merchant_name": {"type": "string"},
        "merchant_address": {"type": "string"},
        "balance_after": {"type": "number"},
        "balance_currency": {"type": "string", "minLength": 3, "maxLength": 3},
        "ts_event": {"type": "string", "format": "date-time"},
        "tz_hint": {"type": "string"},
        "lang": {"type": "string", "enum": ["ru", "uz", "en"]},
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0}
    }
}

