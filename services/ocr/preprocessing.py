"""
patch-017 §2: Preprocessing pipeline для улучшения качества изображений перед OCR

Этапы обработки:
1. Загрузка изображения
2. Resize (если слишком большое/маленькое)
3. Deskew (выравнивание наклона)
4. Sharpen (увеличение резкости)
5. Binarize (чёрно-белое с адаптивным порогом)
6. Denoise (удаление шума)
"""

import io
from PIL import Image, ImageFilter, ImageEnhance


def load_image(image_bytes):
    """
    Загружает изображение из байтов

    Args:
        image_bytes: bytes - содержимое файла изображения

    Returns:
        PIL.Image - загруженное изображение
    """
    return Image.open(io.BytesIO(image_bytes))


def resize_if_needed(image, target_width=1200, target_height=1600):
    """
    Изменяет размер изображения если оно слишком большое или маленькое
    Оптимальный размер для OCR: ~1200x1600 пикселей

    Args:
        image: PIL.Image
        target_width: int - целевая ширина
        target_height: int - целевая высота

    Returns:
        PIL.Image - изображение с оптимальным размером
    """
    width, height = image.size

    # Если изображение слишком маленькое (< 800px по меньшей стороне)
    min_side = min(width, height)
    if min_side < 800:
        scale = 800 / min_side
        new_width = int(width * scale)
        new_height = int(height * scale)
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Если изображение слишком большое (> 2000px по большей стороне)
    max_side = max(width, height)
    if max_side > 2000:
        scale = 2000 / max_side
        new_width = int(width * scale)
        new_height = int(height * scale)
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

    return image


def deskew_image(image):
    """
    Выравнивает наклон изображения

    TODO: В будущем можно добавить автоопределение угла наклона через OpenCV
    Пока возвращаем изображение без изменений

    Args:
        image: PIL.Image

    Returns:
        PIL.Image - изображение (пока без выравнивания)
    """
    # Пока возвращаем без изменений
    # В будущем можно добавить определение угла наклона и поворот
    return image


def sharpen_image(image, factor=2.0):
    """
    Увеличивает резкость изображения

    Args:
        image: PIL.Image
        factor: float - коэффициент резкости (1.0 = без изменений, 2.0 = сильная резкость)

    Returns:
        PIL.Image - изображение с увеличенной резкостью
    """
    enhancer = ImageEnhance.Sharpness(image)
    return enhancer.enhance(factor)


def binarize_image(image):
    """
    Преобразует изображение в чёрно-белое с адаптивным порогом
    Улучшает распознавание текста

    Args:
        image: PIL.Image

    Returns:
        PIL.Image - бинаризованное изображение
    """
    # Конвертируем в grayscale
    gray = image.convert('L')

    # Увеличиваем контраст
    enhancer = ImageEnhance.Contrast(gray)
    contrasted = enhancer.enhance(1.5)

    # Простая бинаризация (в будущем можно добавить adaptive threshold)
    # threshold = 128
    # binarized = contrasted.point(lambda x: 0 if x < threshold else 255, '1')

    return contrasted


def denoise_image(image):
    """
    Удаляет шум с изображения

    Args:
        image: PIL.Image

    Returns:
        PIL.Image - изображение без шума
    """
    # Применяем медианный фильтр для удаления шума
    return image.filter(ImageFilter.MedianFilter(size=3))


def preprocess_image(image_bytes, steps=None):
    """
    Полный pipeline обработки изображения

    Args:
        image_bytes: bytes - исходное изображение
        steps: list - список этапов обработки (по умолчанию все)
                     ['resize', 'deskew', 'sharpen', 'binarize', 'denoise']

    Returns:
        bytes - обработанное изображение в формате PNG
        dict - метаданные обработки (размеры, примененные шаги)
    """
    if steps is None:
        steps = ['resize', 'sharpen', 'binarize', 'denoise']

    # Загружаем изображение
    image = load_image(image_bytes)
    original_size = image.size

    metadata = {
        'original_size': original_size,
        'steps_applied': []
    }

    # Применяем шаги обработки
    if 'resize' in steps:
        image = resize_if_needed(image)
        metadata['steps_applied'].append('resize')

    if 'deskew' in steps:
        image = deskew_image(image)
        metadata['steps_applied'].append('deskew')

    if 'sharpen' in steps:
        image = sharpen_image(image)
        metadata['steps_applied'].append('sharpen')

    if 'binarize' in steps:
        image = binarize_image(image)
        metadata['steps_applied'].append('binarize')

    if 'denoise' in steps:
        image = denoise_image(image)
        metadata['steps_applied'].append('denoise')

    metadata['processed_size'] = image.size

    # Сохраняем в байты
    output = io.BytesIO()
    image.save(output, format='PNG')
    processed_bytes = output.getvalue()

    return processed_bytes, metadata
