# 📊 Receipt Parser - Парсер банковских чеков

Desktop-приложение для автоматического парсинга и анализа банковских транзакций из SMS и Telegram-уведомлений банков Узбекистана.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Electron](https://img.shields.io/badge/electron-25.9.8-brightgreen)
![License](https://img.shields.io/badge/license-ISC-green)

## ✨ Возможности

- 🤖 **Автоматический парсинг** чеков через OpenAI GPT-4
- 📱 **Telegram Bot** для получения SMS-уведомлений
- 📊 **Excel-подобная таблица** с AG Grid
- 🎨 **Форматирование ячеек** (цвета, выравнивание, перенос текста)
- 📈 **Агрегаты по выделению** (сумма, среднее, количество)
- 🔍 **Быстрые фильтры** по дате, валюте, P2P, оператору
- 📤 **Экспорт в Excel** с форматированием
- 🔄 **Автообновление** через GitHub Releases
- 🌙 **Тёмная тема**

## 🏦 Поддерживаемые банки

- **UzumBank** (SMS + Telegram)
- Другие банки Узбекистана (через OpenAI)

## 📥 Установка

### Windows

1. Скачайте **Receipt Parser Setup 1.0.0.exe** из [Releases](https://github.com/asintiko/receipt-parser/releases)
2. Запустите установщик
3. Следуйте инструкциям мастера установки

**Портативная версия**: Скачайте **Receipt Parser 1.0.0.exe** - не требует установки

### Системные требования

- Windows 7 SP1 / 8 / 10 / 11
- 2 GB RAM
- 300 MB свободного места
- Подключение к интернету

## 🚀 Быстрый старт

1. Запустите приложение
2. Откройте Telegram Bot (настройки в приложении)
3. Отправьте SMS-чек боту
4. Чек автоматически распарсится и появится в таблице

## 🛠 Технологии

### Frontend (Client)
- **Electron** 25.9.8 - Desktop framework
- **React** 18.2.0 - UI library
- **AG Grid** 31.0.1 - Таблица с Excel-функциями
- **Zustand** 5.0.8 - State management
- **Luxon** 3.4.4 - Работа с датами и таймзонами
- **ExcelJS** 4.4.0 - Экспорт в Excel

### Backend
- **Node.js** + **Express**
- **PostgreSQL** 15
- **OpenAI API** (GPT-4)
- **Telegram Bot API**

## 📊 Скриншоты

*(Здесь можно добавить скриншоты интерфейса)*

## 🔄 Автообновление

Приложение автоматически проверяет обновления при запуске. Когда доступна новая версия:
1. Появляется уведомление
2. Нажмите "Скачать"
3. После загрузки нажмите "Установить и перезапустить"

Или проверьте вручную: **Файл → Проверить обновления**

## 🤝 Разработка

```bash
# Установка зависимостей
cd client && npm install
cd ../backend && npm install

# Запуск в dev-режиме
cd client && npm run electron-dev

# Сборка для Windows
cd client && npm run build
npx electron-builder --win --x64
```

## 📝 Changelog

### v1.0.0 (2025-10-22)
- ✅ Полная реализация patch-019
- ✅ Luxon форматирование с Asia/Tashkent
- ✅ ПК без звёздочек (только 4 цифры)
- ✅ Страница Операторов с тест-боксом
- ✅ UzumBank SMS parser
- ✅ VPS backend интеграция
- ✅ Автообновление через GitHub Releases

## 📄 Лицензия

ISC License

---

**Автор**: asintiko  
**Контакты**: [GitHub](https://github.com/asintiko)
