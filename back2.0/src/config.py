"""
Конфигурация приложения
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Настройки приложения"""
    
    # Общие
    VERSION: str = "2.0.0"
    DEBUG: bool = False
    
    # База данных
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/receipt_parser"
    
    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL_GPT5_PRO: str = "gpt-5-pro"  # Для сложных случаев
    OPENAI_MODEL_GPT4O_MINI: str = "gpt-4o-mini"  # Для быстрых классификаций
    OPENAI_MODEL_GPT4O: str = "gpt-4o"  # Для изображений
    OPENAI_MODEL_GPT41_NANO: str = "gpt-4.1-nano"  # Для экономичных операций
    
    # Event Bus (NATS)
    NATS_URL: str = "nats://localhost:4222"
    
    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""
    TELEGRAM_WEBHOOK_URL: str = ""
    
    # Object Storage (S3/MinIO)
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_BUCKET: str = "receipts-attachments"
    S3_REGION: str = "us-east-1"
    
    # Security
    ENCRYPTION_SECRET: str = ""
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"]
    
    # Retry settings
    MAX_RETRIES: int = 3
    BACKOFF_BASE_MS: int = 400
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

