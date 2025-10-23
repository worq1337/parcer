# patch-017 §4: Userbot Service Dockerfile
# Telethon userbot для мониторинга сообщений от банковских ботов

FROM python:3.11-slim

# Рабочая директория
WORKDIR /app

# Копируем зависимости
COPY requirements.txt .

# Устанавливаем Python-зависимости
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Создаём директорию для session files
RUN mkdir -p /app/sessions

# Запускаем Flask-сервер + Telethon userbot
CMD ["python", "app.py"]
