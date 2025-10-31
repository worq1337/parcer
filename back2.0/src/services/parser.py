"""
Parser Agent Service - извлечение структурированных данных через OpenAI Responses API
"""
from typing import Optional, Dict, List, Any
from datetime import datetime
from openai import AsyncOpenAI
import json
import structlog

from src.config import settings
from src.schemas.receipt import RECEIPT_JSON_SCHEMA
from src.services.normalizer import normalize_operator, normalize_currency, normalize_amount, normalize_card_mask
import asyncio

logger = structlog.get_logger()


class ParserService:
    """Сервис парсинга чеков через OpenAI"""
    
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    
    async def parse_text(
        self,
        raw_text: str,
        raw_lang: Optional[str] = None,
        use_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Парсинг текста чека через OpenAI с Structured Outputs
        
        Args:
            raw_text: Исходный текст чека
            raw_lang: Язык текста (ru, uz, en)
            use_model: Модель для использования (если None, выбирается автоматически)
            
        Returns:
            Нормализованный словарь с полями чека
        """
        # Выбираем модель: для сложных случаев - gpt-5-pro, для простых - gpt-4o-mini
        model = use_model or self._select_model(raw_text)
        
        messages = [
            {
                "role": "system",
                "content": """Ты - эксперт по парсингу банковских уведомлений узбекских банков.
Твоя задача - извлечь структурированные данные из текста транзакции.

Внимание:
- Поле event_type должно быть одним из: payment, purchase, p2p, topup, conversion, fee, penalty, other
- Поле sign: 1 для пополнения (topup), -1 для списания (payment/fee/purchase)
- Поле ts_event должно быть в формате ISO 8601 UTC (например: 2025-04-04T18:46:00Z)
- Поле currency должно быть ISO 4217 кодом (3 символа): UZS, USD, EUR и т.д.
- Извлекай operator_raw точно как в тексте, operator_canonical будет нормализован позже
- Если уверенность низкая, укажи confidence < 0.8

Верни строго JSON по схеме, без дополнительного текста."""
            },
            {
                "role": "user",
                "content": raw_text
            }
        ]
        
        # Подготовка запроса с Structured Outputs
        request_body = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "receipt_schema",
                    "schema": RECEIPT_JSON_SCHEMA,
                    "strict": True
                }
            }
        }
        
        try:
            # Выполняем запрос с retry
            completion = await self._create_completion_with_retry(request_body)
            
            # Извлекаем содержимое ответа
            raw_response = completion.choices[0].message.content
            
            if not raw_response:
                raise ValueError("Модель вернула пустой ответ")
            
            # Парсим JSON
            parsed = json.loads(raw_response)
            
            # Дополнительная нормализация
            parsed = self._post_process_parsed(parsed, raw_text, raw_lang)
            
            logger.info(
                "Чек успешно распарсен",
                model=model,
                event_type=parsed.get("event_type"),
                confidence=parsed.get("confidence")
            )
            
            return parsed
            
        except json.JSONDecodeError as e:
            logger.error("Ошибка парсинга JSON от модели", error=str(e), raw=raw_response[:200])
            raise ValueError(f"Некорректный JSON от модели: {str(e)}")
        except Exception as e:
            logger.error("Ошибка парсинга чека", error=str(e))
            raise
    
    async def parse_image(
        self,
        image_url: str,
        text_hint: Optional[str] = None,
        use_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Парсинг изображения чека через Vision API
        
        Args:
            image_url: URL изображения или base64 data URL
            text_hint: Опциональная подсказка (OCR текст)
            use_model: Модель для использования
            
        Returns:
            Нормализованный словарь с полями чека
        """
        model = use_model or settings.OPENAI_MODEL_GPT4O
        
        messages = [
            {
                "role": "system",
                "content": """Ты - эксперт по парсингу банковских чеков и уведомлений.
Извлеки структурированные данные из изображения чека/уведомления.

Верни строго JSON по схеме."""
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Извлеки данные из этого изображения банковского чека. {'Текст с изображения: ' + text_hint if text_hint else ''}"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                            "detail": "high"
                        }
                    }
                ]
            }
        ]
        
        request_body = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "receipt_schema",
                    "schema": RECEIPT_JSON_SCHEMA,
                    "strict": True
                }
            }
        }
        
        try:
            completion = await self._create_completion_with_retry(request_body)
            raw_response = completion.choices[0].message.content
            
            if not raw_response:
                raise ValueError("Модель вернула пустой ответ")
            
            parsed = json.loads(raw_response)
            parsed = self._post_process_parsed(parsed, text_hint or "", None)
            
            logger.info("Изображение успешно распарсено", model=model)
            return parsed
            
        except Exception as e:
            logger.error("Ошибка парсинга изображения", error=str(e))
            raise
    
    def _select_model(self, raw_text: str) -> str:
        """
        Выбор модели в зависимости от сложности текста
        
        Для сложных, многоязычных текстов - gpt-5-pro
        Для простых классификаций - gpt-4o-mini
        """
        # Простая эвристика: если текст длинный или содержит несколько языков - используем мощную модель
        text_len = len(raw_text)
        
        # Подсчитываем разнообразие символов (признак сложности)
        has_cyrillic = any('\u0400' <= c <= '\u04FF' for c in raw_text)
        has_latin = any(c.isalpha() and ord(c) < 128 for c in raw_text)
        has_digits = any(c.isdigit() for c in raw_text)
        
        complexity_score = 0
        if text_len > 500:
            complexity_score += 2
        if has_cyrillic and has_latin:
            complexity_score += 1
        if text_len > 200:
            complexity_score += 1
        
        # Если сложность высокая - используем мощную модель
        if complexity_score >= 3:
            return settings.OPENAI_MODEL_GPT5_PRO
        else:
            return settings.OPENAI_MODEL_GPT4O_MINI
    
    def _post_process_parsed(
        self,
        parsed: Dict[str, Any],
        raw_text: str,
        raw_lang: Optional[str]
    ) -> Dict[str, Any]:
        """
        Постобработка распарсенных данных: нормализация операторов, валют и т.д.
        """
        # Нормализация оператора
        operator_raw = parsed.get("operator_raw")
        if operator_raw:
            normalized = normalize_operator(operator_raw)
            parsed["operator_canonical"] = normalized["canonical"]
            parsed["operator_app"] = normalized["app"]
        else:
            parsed["operator_canonical"] = None
            parsed["operator_app"] = None
        
        # Нормализация валюты
        if "currency" in parsed:
            parsed["currency"] = normalize_currency(parsed["currency"])
        if "balance_currency" in parsed and parsed["balance_currency"]:
            parsed["balance_currency"] = normalize_currency(parsed["balance_currency"])
        
        # Нормализация суммы
        if "amount" in parsed:
            parsed["amount"] = normalize_amount(str(parsed["amount"]))
        if "balance_after" in parsed and parsed["balance_after"] is not None:
            parsed["balance_after"] = normalize_amount(str(parsed["balance_after"]))
        
        # Нормализация маски карты
        if "card_mask" in parsed:
            parsed["card_mask"] = normalize_card_mask(parsed["card_mask"])
        
        # Устанавливаем язык, если не указан
        if not parsed.get("lang") and raw_lang:
            parsed["lang"] = raw_lang
        
        return parsed
    
    async def _create_completion_with_retry(
        self,
        request_body: Dict[str, Any],
        max_retries: int = None
    ) -> Any:
        """
        Создание запроса к OpenAI с retry логикой
        """
        max_retries = max_retries or settings.MAX_RETRIES
        backoff_base = settings.BACKOFF_BASE_MS / 1000  # В секундах
        
        last_error = None
        for attempt in range(max_retries):
            try:
                return await self.client.chat.completions.create(**request_body)
            except Exception as e:
                last_error = e
                
                # Проверяем rate limit
                if self._is_rate_limit_error(e):
                    retry_after = self._extract_retry_after(e)
                    if retry_after:
                        logger.warning(
                            "Rate limit, ожидание",
                            retry_after=retry_after,
                            attempt=attempt + 1
                        )
                        await asyncio.sleep(retry_after)
                        continue
                
                # Проверяем unsupported response_format
                if self._is_response_format_unsupported(e):
                    logger.warning("Модель не поддерживает json_schema, переключаемся на json_object")
                    request_body["response_format"] = {"type": "json_object"}
                    continue
                
                if attempt < max_retries - 1:
                    delay = backoff_base * (2 ** attempt)
                    logger.warning(
                        "Ошибка запроса, повтор",
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(e)
                    )
                    await asyncio.sleep(delay)
                else:
                    raise
        
        raise last_error
    
    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Проверка на rate limit ошибку"""
        error_str = str(error).lower()
        return "rate limit" in error_str or "429" in error_str
    
    def _extract_retry_after(self, error: Exception) -> Optional[float]:
        """Извлечение времени ожидания из ошибки"""
        error_str = str(error)
        # Пытаемся найти "retry after X seconds" или подобное
        import re
        match = re.search(r"retry[_\s]?after[_\s]?(\d+)", error_str, re.IGNORECASE)
        if match:
            return float(match.group(1))
        return None
    
    def _is_response_format_unsupported(self, error: Exception) -> bool:
        """Проверка на неподдерживаемый response_format"""
        error_str = str(error).lower()
        return "response_format" in error_str and "unsupported" in error_str


# Глобальный экземпляр сервиса
parser_service = ParserService()

