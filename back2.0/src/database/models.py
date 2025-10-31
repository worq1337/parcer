"""
SQLAlchemy модели для базы данных
"""
from sqlalchemy import Column, BigInteger, Integer, String, Text, Numeric, SmallInteger, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from src.database.connection import Base


class Receipt(Base):
    """Модель чека (receipts таблица)"""
    __tablename__ = "receipts"
    
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), index=True)
    source_platform = Column(String(50), nullable=False, default="telegram")
    source_chat_id = Column(Text, index=True)
    message_id = Column(Text, index=True)
    raw_text = Column(Text, nullable=False)
    raw_html = Column(Text, nullable=True)
    raw_lang = Column(String(2), nullable=True)  # ru, uz, en
    
    # Тип события и финансы
    event_type = Column(String(20), nullable=False)  # payment, purchase, p2p, topup, etc.
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="UZS")
    sign = Column(SmallInteger, nullable=False)  # +1 или -1
    
    # Карта
    card_brand = Column(String(20), nullable=True)  # HUMO, UZCARD, VISA
    card_mask = Column(String(20), nullable=True)  # ***6714
    
    # Оператор
    operator_raw = Column(Text, nullable=True)
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=True)
    operator_canonical = Column(String(255), nullable=True, index=True)
    
    # Мерчант
    merchant_name = Column(Text, nullable=True)
    merchant_address = Column(Text, nullable=True)
    
    # Баланс
    balance_after = Column(Numeric(18, 2), nullable=True)
    balance_currency = Column(String(3), nullable=True)
    
    # Время
    ts_event = Column(TIMESTAMP(timezone=True), nullable=False, index=True)
    ts_local = Column(Text, nullable=True)  # Строка как в СМС
    
    # Метаданные парсинга
    confidence = Column(Numeric(3, 2), nullable=True)  # 0.00-1.00
    duplicate_key = Column(Text, nullable=True, unique=True, index=True)
    ingest_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), index=True)
    parse_status = Column(String(20), nullable=False, default="ok")  # ok, needs_review, failed
    error = Column(Text, nullable=True)
    
    # Relationships
    operator = relationship("Operator", back_populates="receipts")
    attachments = relationship("Attachment", back_populates="receipt", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index("idx_receipts_user_ts", "user_id", "ts_event"),
        Index("idx_receipts_raw_text_gin", "raw_text", postgresql_using="gin", postgresql_ops={"raw_text": "gin_trgm_ops"}),
    )


class Operator(Base):
    """Модель оператора (operators таблица)"""
    __tablename__ = "operators"
    
    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(Text, nullable=False, unique=True)  # Регэксп или LIKE паттерн
    canonical = Column(String(255), nullable=False, index=True)  # Каноническое название
    app = Column(String(100), nullable=False)  # Название приложения
    weight = Column(Integer, nullable=False, default=1)  # Вес для приоритета
    notes = Column(Text, nullable=True)
    
    # Relationships
    receipts = relationship("Receipt", back_populates="operator")


class Attachment(Base):
    """Модель вложения (attachments таблица)"""
    __tablename__ = "attachments"
    
    id = Column(BigInteger, primary_key=True, index=True)
    receipt_id = Column(BigInteger, ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(20), nullable=False)  # photo, pdf, video, voice, file
    file_bucket = Column(String(255), nullable=False)
    file_key = Column(String(512), nullable=False)
    sha256 = Column(String(64), nullable=False, unique=True, index=True)
    ocr_text = Column(Text, nullable=True)
    
    # Relationships
    receipt = relationship("Receipt", back_populates="attachments")


class Card(Base):
    """Модель карты (cards таблица)"""
    __tablename__ = "cards"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    mask = Column(String(20), nullable=False)  # ***6714
    brand = Column(String(20), nullable=False)  # HUMO, UZCARD, VISA
    issuer = Column(String(100), nullable=True)  # Название банка
    
    __table_args__ = (
        Index("idx_cards_user_mask", "user_id", "mask"),
    )

