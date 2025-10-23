# patch-017 §2: OCR Service Dockerfile
# Tesseract + ImageMagick + pyvips для обработки изображений чеков

FROM python:3.11-slim

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-rus \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Рабочая директория
WORKDIR /app

# Копируем зависимости
COPY requirements.txt .

# Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Создаём директорию для временных файлов
RUN mkdir -p /tmp/ocr

# Запускаем Flask-сервер
CMD ["python", "app.py"]
