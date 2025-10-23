"""
patch-017 §2: OCR Engine - распознавание текста с изображений

Использует Tesseract OCR с настройками для банковских чеков
"""

import io
import pytesseract
from PIL import Image


def extract_text(image_bytes, lang='rus+eng', config=''):
    """
    Извлекает текст из изображения используя Tesseract OCR

    Args:
        image_bytes: bytes - изображение для распознавания
        lang: str - языки для распознавания (по умолчанию русский + английский)
        config: str - дополнительные параметры Tesseract

    Returns:
        dict - результаты OCR:
            - text: str - распознанный текст
            - confidence: float - средняя уверенность (0-100)
            - lines: list - список строк с координатами и уверенностью
    """
    # Загружаем изображение
    image = Image.open(io.BytesIO(image_bytes))

    # Базовая конфигурация Tesseract для банковских чеков
    # --psm 6 = Assume a single uniform block of text (подходит для чеков)
    # --oem 3 = Use both legacy and LSTM engines (лучшее качество)
    default_config = '--psm 6 --oem 3'
    full_config = f"{default_config} {config}".strip()

    # Извлекаем текст
    text = pytesseract.image_to_string(image, lang=lang, config=full_config)

    # Получаем детальные данные с координатами и уверенностью
    data = pytesseract.image_to_data(image, lang=lang, config=full_config, output_type=pytesseract.Output.DICT)

    # Вычисляем среднюю уверенность
    confidences = [int(conf) for conf in data['conf'] if conf != '-1']
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    # Группируем по строкам
    lines = []
    current_line = []
    current_line_num = -1

    for i in range(len(data['text'])):
        if data['text'][i].strip() == '':
            continue

        line_num = data['line_num'][i]

        if line_num != current_line_num:
            if current_line:
                lines.append({
                    'text': ' '.join([word['text'] for word in current_line]),
                    'confidence': sum([word['confidence'] for word in current_line]) / len(current_line),
                    'words': current_line
                })
            current_line = []
            current_line_num = line_num

        current_line.append({
            'text': data['text'][i],
            'confidence': int(data['conf'][i]) if data['conf'][i] != '-1' else 0,
            'left': data['left'][i],
            'top': data['top'][i],
            'width': data['width'][i],
            'height': data['height'][i]
        })

    # Добавляем последнюю строку
    if current_line:
        lines.append({
            'text': ' '.join([word['text'] for word in current_line]),
            'confidence': sum([word['confidence'] for word in current_line]) / len(current_line),
            'words': current_line
        })

    return {
        'text': text.strip(),
        'confidence': avg_confidence,
        'lines': lines
    }


def extract_text_simple(image_bytes):
    """
    Упрощённая версия извлечения текста - только текст без деталей

    Args:
        image_bytes: bytes - изображение для распознавания

    Returns:
        str - распознанный текст
    """
    result = extract_text(image_bytes)
    return result['text']
