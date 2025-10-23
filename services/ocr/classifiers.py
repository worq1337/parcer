"""
patch-017 §2: Классификаторы чеков для разных банков

Каждый банк/платёжная система имеет свой формат чека с уникальными маркерами
"""

import re
from datetime import datetime


class ReceiptClassifier:
    """
    Базовый класс для классификаторов чеков
    """

    @staticmethod
    def identify(text):
        """
        Определяет, относится ли текст к данному банку

        Args:
            text: str - OCR-текст чека

        Returns:
            bool - True если это чек данного банка
        """
        raise NotImplementedError

    @staticmethod
    def parse(text):
        """
        Парсит чек и извлекает поля

        Args:
            text: str - OCR-текст чека

        Returns:
            dict - распарсенные поля или None если не удалось
        """
        raise NotImplementedError


class UzumBankClassifier(ReceiptClassifier):
    """
    Классификатор для чеков Uzum Bank

    Маркеры:
    - "Uzum Bank" или "UZUM" в тексте
    - "Транзакция" или "Transaction"
    - Формат даты: DD.MM.YYYY HH:MM
    """

    # Маркеры для идентификации
    MARKERS = [
        r'uzum\s*bank',
        r'uzum',
        r'транзакция',
        r'transaction'
    ]

    @staticmethod
    def identify(text):
        """Проверяет наличие маркеров Uzum Bank"""
        text_lower = text.lower()
        return any(re.search(marker, text_lower) for marker in UzumBankClassifier.MARKERS)

    @staticmethod
    def parse(text):
        """
        Парсит чек Uzum Bank

        Ожидаемый формат:
        UZUM Bank
        Транзакция успешно завершена
        Продавец: [название]
        Сумма: [сумма] UZS
        Дата: DD.MM.YYYY HH:MM
        Карта: *[последние 4 цифры]
        """
        result = {
            'operator': None,
            'amount': None,
            'currency': 'UZS',
            'datetime': None,
            'card_last4': None,
            'transaction_type': None,
            'is_p2p': False,
            'app_name': 'Uzum Bank',
            'source': 'photo',
            'confidence': 0
        }

        # Извлекаем продавца (operator)
        operator_patterns = [
            r'продавец[:\s]+(.+?)(?:\n|$)',
            r'merchant[:\s]+(.+?)(?:\n|$)',
            r'получатель[:\s]+(.+?)(?:\n|$)'
        ]
        for pattern in operator_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                result['operator'] = match.group(1).strip()
                break

        # Извлекаем сумму
        amount_patterns = [
            r'сумма[:\s]+([-+]?\d+[\s,]?\d*\.?\d*)\s*(uzs|сум)',
            r'amount[:\s]+([-+]?\d+[\s,]?\d*\.?\d*)\s*(uzs|сум)',
            r'([-+]?\d+[\s,]?\d*\.?\d*)\s*(uzs|сум)'
        ]
        for pattern in amount_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                amount_str = match.group(1).replace(' ', '').replace(',', '')
                try:
                    result['amount'] = float(amount_str)
                    result['currency'] = 'UZS'
                    break
                except ValueError:
                    continue

        # Извлекаем дату и время
        datetime_patterns = [
            r'дата[:\s]+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})',
            r'date[:\s]+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})',
            r'(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})'
        ]
        for pattern in datetime_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                time_str = match.group(2)
                try:
                    dt = datetime.strptime(f"{date_str} {time_str}", "%d.%m.%Y %H:%M")
                    result['datetime'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                    break
                except ValueError:
                    continue

        # Извлекаем последние 4 цифры карты
        card_patterns = [
            r'карта[:\s]+\*(\d{4})',
            r'card[:\s]+\*(\d{4})',
            r'\*(\d{4})'
        ]
        for pattern in card_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                result['card_last4'] = match.group(1)
                break

        # Определяем тип транзакции
        if 'перевод' in text.lower() or 'p2p' in text.lower() or 'transfer' in text.lower():
            result['is_p2p'] = True
            result['transaction_type'] = 'P2P перевод'
        else:
            result['transaction_type'] = 'Оплата товаров и услуг'

        # Вычисляем уверенность парсинга
        confidence_score = 0
        if result['operator']:
            confidence_score += 25
        if result['amount']:
            confidence_score += 30
        if result['datetime']:
            confidence_score += 30
        if result['card_last4']:
            confidence_score += 15

        result['confidence'] = confidence_score

        # Возвращаем результат только если извлечены критичные поля
        if result['amount'] and result['datetime'] and result['card_last4']:
            return result

        return None


class GenericBankClassifier(ReceiptClassifier):
    """
    Универсальный классификатор для чеков с общими паттернами
    Используется если не подошёл ни один специализированный классификатор
    """

    @staticmethod
    def identify(text):
        """Всегда возвращает True как fallback"""
        return True

    @staticmethod
    def parse(text):
        """
        Парсит чек используя общие паттерны

        Ищет:
        - Суммы с валютой (UZS, USD, RUB)
        - Даты в различных форматах
        - Последние 4 цифры карты
        """
        result = {
            'operator': None,
            'amount': None,
            'currency': 'UZS',
            'datetime': None,
            'card_last4': None,
            'transaction_type': 'Оплата',
            'is_p2p': False,
            'app_name': 'Unknown',
            'source': 'photo',
            'confidence': 0
        }

        # Ищем любые суммы с валютой
        amount_match = re.search(r'([-+]?\d+[\s,]?\d*\.?\d*)\s*(uzs|usd|rub|сум)', text, re.IGNORECASE)
        if amount_match:
            amount_str = amount_match.group(1).replace(' ', '').replace(',', '')
            try:
                result['amount'] = float(amount_str)
                result['currency'] = amount_match.group(2).upper()
                if result['currency'] == 'СУМ':
                    result['currency'] = 'UZS'
            except ValueError:
                pass

        # Ищем даты
        datetime_patterns = [
            r'(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})',
            r'(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})',
            r'(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})'
        ]
        for pattern in datetime_patterns:
            match = re.search(pattern, text)
            if match:
                date_str = match.group(1)
                time_str = match.group(2)
                try:
                    # Пробуем разные форматы
                    for fmt in ["%d.%m.%Y %H:%M", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M"]:
                        try:
                            dt = datetime.strptime(f"{date_str} {time_str}", fmt)
                            result['datetime'] = dt.strftime("%Y-%m-%d %H:%M:%S")
                            break
                        except ValueError:
                            continue
                    if result['datetime']:
                        break
                except ValueError:
                    continue

        # Ищем последние 4 цифры карты
        card_match = re.search(r'\*(\d{4})', text)
        if card_match:
            result['card_last4'] = card_match.group(1)

        # Уверенность
        confidence_score = 0
        if result['amount']:
            confidence_score += 30
        if result['datetime']:
            confidence_score += 30
        if result['card_last4']:
            confidence_score += 15

        result['confidence'] = confidence_score

        # Возвращаем только если есть критичные поля
        if result['amount'] and result['datetime'] and result['card_last4']:
            return result

        return None


# Список всех классификаторов в порядке приоритета
CLASSIFIERS = [
    UzumBankClassifier,
    GenericBankClassifier  # Последний как fallback
]


def classify_and_parse(text):
    """
    Определяет банк и парсит чек

    Args:
        text: str - OCR-текст чека

    Returns:
        dict - результат парсинга с полями:
            - classifier: str - имя использованного классификатора
            - data: dict - распарсенные поля
            - confidence: float - уверенность парсинга (0-100)

    Raises:
        ValueError: если ни один классификатор не смог распарсить чек
    """
    for classifier in CLASSIFIERS:
        if classifier.identify(text):
            parsed = classifier.parse(text)
            if parsed:
                return {
                    'classifier': classifier.__name__,
                    'data': parsed,
                    'confidence': parsed['confidence']
                }

    raise ValueError("Не удалось распознать формат чека")
