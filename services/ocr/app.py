"""
patch-017 §2: OCR Service Flask App

Эндпоинты:
- POST /ocr/process - обработка изображения чека
- GET /health - healthcheck
"""

import os
import base64
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS

from preprocessing import preprocess_image
from ocr_engine import extract_text
from classifiers import classify_and_parse


app = Flask(__name__)
CORS(app)


@app.route('/health', methods=['GET'])
def health():
    """
    Healthcheck endpoint
    """
    return jsonify({
        'status': 'healthy',
        'service': 'ocr',
        'version': '1.0.0'
    })


@app.route('/ocr/process', methods=['POST'])
def process_receipt():
    """
    Обрабатывает изображение чека

    Request body:
    {
        "image": "base64-encoded image data",
        "preprocess": true/false (default: true),
        "preprocess_steps": ["resize", "sharpen", "binarize", "denoise"] (optional)
    }

    Response:
    {
        "success": true/false,
        "ocr_result": {
            "text": "распознанный текст",
            "confidence": 85.5,
            "lines": [...]
        },
        "parsed_data": {
            "classifier": "UzumBankClassifier",
            "data": {
                "operator": "...",
                "amount": 100000,
                "currency": "UZS",
                "datetime": "2025-01-15 14:30:00",
                "card_last4": "1234",
                ...
            },
            "confidence": 85
        },
        "preprocessing": {
            "original_size": [1920, 1080],
            "processed_size": [1200, 675],
            "steps_applied": ["resize", "sharpen", "binarize", "denoise"]
        },
        "error": "..." (если success: false)
    }
    """
    try:
        # Валидация запроса
        if not request.json:
            return jsonify({
                'success': False,
                'error': 'Request body must be JSON'
            }), 400

        image_b64 = request.json.get('image')
        if not image_b64:
            return jsonify({
                'success': False,
                'error': 'Missing "image" field in request body'
            }), 400

        # Декодируем base64
        try:
            image_bytes = base64.b64decode(image_b64)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid base64 image data: {str(e)}'
            }), 400

        # Проверяем размер (макс 10 МБ)
        max_size_mb = int(os.getenv('MAX_IMAGE_SIZE_MB', 10))
        if len(image_bytes) > max_size_mb * 1024 * 1024:
            return jsonify({
                'success': False,
                'error': f'Image size exceeds {max_size_mb} MB limit'
            }), 400

        # Предобработка (если включена)
        should_preprocess = request.json.get('preprocess', True)
        preprocessing_metadata = None

        if should_preprocess:
            preprocess_steps = request.json.get('preprocess_steps', None)
            processed_bytes, preprocessing_metadata = preprocess_image(
                image_bytes,
                steps=preprocess_steps
            )
        else:
            processed_bytes = image_bytes

        # OCR - извлечение текста
        ocr_result = extract_text(processed_bytes)

        # Проверяем уверенность OCR
        if ocr_result['confidence'] < 30:
            return jsonify({
                'success': False,
                'error': 'OCR confidence too low (< 30%)',
                'ocr_result': ocr_result,
                'preprocessing': preprocessing_metadata,
                'suggestion': 'Попробуйте загрузить более качественное изображение'
            }), 422

        # Классификация и парсинг
        try:
            parsed_result = classify_and_parse(ocr_result['text'])
        except ValueError as e:
            # Не удалось распознать формат чека
            return jsonify({
                'success': False,
                'error': str(e),
                'ocr_result': ocr_result,
                'preprocessing': preprocessing_metadata,
                'suggestion': 'Формат чека не распознан. Попробуйте отправить текстовое сообщение вместо фото.'
            }), 422

        # Проверяем уверенность парсинга
        if parsed_result['confidence'] < 50:
            # Низкая уверенность - отправляем как черновик
            return jsonify({
                'success': True,
                'status': 'draft',
                'ocr_result': ocr_result,
                'parsed_data': parsed_result,
                'preprocessing': preprocessing_metadata,
                'message': 'Чек распознан с низкой уверенностью. Требуется проверка.',
                'warning': 'Confidence < 50%'
            }), 200

        # Успешное распознавание
        return jsonify({
            'success': True,
            'status': 'parsed',
            'ocr_result': {
                'text': ocr_result['text'],
                'confidence': ocr_result['confidence']
            },
            'parsed_data': parsed_result,
            'preprocessing': preprocessing_metadata
        }), 200

    except Exception as e:
        # Внутренняя ошибка
        print(f"OCR Service Error: {str(e)}")
        traceback.print_exc()

        return jsonify({
            'success': False,
            'error': 'Internal OCR service error',
            'details': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'production') == 'development'

    print(f"🔍 OCR Service starting on port {port}...")
    print(f"📊 Max image size: {os.getenv('MAX_IMAGE_SIZE_MB', 10)} MB")
    print(f"🌐 Tesseract language: {os.getenv('TESSERACT_LANG', 'rus+eng')}")

    app.run(host='0.0.0.0', port=port, debug=debug)
