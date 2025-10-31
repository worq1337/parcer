"""
Сервис нормализации операторов и валют
"""
import re
import yaml
from pathlib import Path
from typing import Optional, Dict, List
import structlog

logger = structlog.get_logger()

# Загружаем словарь операторов
_operators_dict: Optional[List[Dict]] = None


def load_operators_dict() -> List[Dict]:
    """Загрузка словаря операторов из YAML"""
    global _operators_dict
    
    if _operators_dict is None:
        operators_file = Path(__file__).parent.parent.parent / "data" / "operators.yml"
        try:
            with open(operators_file, "r", encoding="utf-8") as f:
                _operators_dict = yaml.safe_load(f)
            logger.info("Словарь операторов загружен", count=len(_operators_dict))
        except Exception as e:
            logger.error("Ошибка загрузки словаря операторов", error=str(e))
            _operators_dict = []
    
    return _operators_dict


def normalize_operator(raw_operator: Optional[str]) -> Dict[str, Optional[str]]:
    """
    Нормализация оператора по словарю
    
    Args:
        raw_operator: Сырое название оператора из чека
        
    Returns:
        Dict с полями: canonical, app, matched_pattern
    """
    if not raw_operator or not raw_operator.strip():
        return {
            "canonical": None,
            "app": None,
            "matched_pattern": None
        }
    
    operators = load_operators_dict()
    raw_normalized = raw_operator.strip().upper()
    
    # Сортируем по весу (сначала более специфичные)
    sorted_operators = sorted(operators, key=lambda x: x.get("weight", 1), reverse=True)
    
    for operator_def in sorted_operators:
        pattern = operator_def.get("pattern", "")
        if not pattern:
            continue
        
        try:
            # Компилируем регулярное выражение
            regex = re.compile(pattern, re.IGNORECASE)
            if regex.search(raw_normalized):
                canonical = operator_def.get("canonical", "")
                app = operator_def.get("app", "")
                
                logger.debug(
                    "Оператор нормализован",
                    raw=raw_operator,
                    canonical=canonical,
                    app=app
                )
                
                return {
                    "canonical": canonical,
                    "app": app,
                    "matched_pattern": pattern
                }
        except re.error as e:
            logger.warning(
                "Ошибка компиляции паттерна оператора",
                pattern=pattern,
                error=str(e)
            )
            continue
    
    # Если ничего не найдено, возвращаем сырое значение как canonical
    logger.debug("Оператор не найден в словаре", raw=raw_operator)
    return {
        "canonical": raw_operator.strip(),
        "app": None,
        "matched_pattern": None
    }


def normalize_currency(currency_raw: Optional[str]) -> str:
    """
    Нормализация валюты до ISO 4217 кода (3 символа)
    
    Args:
        currency_raw: Сырая валюта (может быть "UZS", "USD", "сум" и т.д.)
        
    Returns:
        Нормализованный код валюты (UZS, USD, EUR и т.д.)
    """
    if not currency_raw:
        return "UZS"  # По умолчанию
    
    currency_upper = currency_raw.strip().upper()
    
    # Маппинг распространённых вариантов
    currency_map = {
        "SUM": "UZS",
        "СУМ": "UZS",
        "СОМ": "UZS",
        "USDT": "USD",  # Для конверсий
    }
    
    normalized = currency_map.get(currency_upper, currency_upper)
    
    # Проверяем, что это валидный 3-символьный код
    if len(normalized) == 3 and normalized.isalpha():
        return normalized
    
    return "UZS"  # Fallback


def normalize_amount(amount_raw: str) -> float:
    """
    Нормализация суммы (удаление пробелов, замена запятых на точки)
    
    Args:
        amount_raw: Сырая сумма (может быть "10.035.000,00" или "10035.00")
        
    Returns:
        Нормализованное число
    """
    if isinstance(amount_raw, (int, float)):
        return float(amount_raw)
    
    # Убираем пробелы и заменяем запятые на точки
    normalized = str(amount_raw).replace(" ", "").replace(",", ".")
    
    # Удаляем все точки, кроме последней (для формата "10.035.000,00")
    parts = normalized.split(".")
    if len(parts) > 2:
        # Много точек - это разделители тысяч, оставляем только последнюю как десятичную
        normalized = "".join(parts[:-1]) + "." + parts[-1]
    
    try:
        return float(normalized)
    except ValueError:
        logger.warning("Не удалось нормализовать сумму", raw=amount_raw)
        return 0.0


def normalize_card_mask(card_mask_raw: Optional[str]) -> Optional[str]:
    """
    Нормализация маски карты
    
    Args:
        card_mask_raw: Сырая маска (может быть "*6714", "***6714", "6714")
        
    Returns:
        Нормализованная маска (***XXXX или *XXXX)
    """
    if not card_mask_raw:
        return None
    
    # Извлекаем только цифры
    digits = re.sub(r"[^\d]", "", card_mask_raw)
    
    if len(digits) >= 4:
        # Берём последние 4 цифры
        last4 = digits[-4:]
        return f"***{last4}"
    
    # Если есть звёздочки, сохраняем формат
    if "*" in card_mask_raw:
        return card_mask_raw.strip()
    
    return None

