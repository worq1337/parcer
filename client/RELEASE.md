# 📦 Release Instructions - Receipt Parser v1.0.0

## ✅ Готовые файлы для передачи клиенту

Все файлы находятся в папке `client/dist/`:

### 1. **Receipt Parser Setup 1.0.0.exe** (189 MB) - РЕКОМЕНДУЕТСЯ
- ✅ Полноценный установщик NSIS
- ✅ Поддержка x64 и 32-bit систем
- ✅ Создаёт ярлыки на рабочем столе и в меню Пуск
- ✅ Удаляется через "Установка и удаление программ"
- ✅ **АВТООБНОВЛЕНИЕ через GitHub Releases**

### 2. **Receipt Parser 1.0.0.exe** (97 MB)
- ✅ Портативная версия (не требует установки)
- ✅ Только x64
- ✅ Можно запускать с флешки
- ⚠️ Автообновление работает, но требует прав администратора

---

## 🚀 Как работает автообновление

### Настроено:
1. ✅ GitHub Releases в `package.json`
2. ✅ Репозиторий: `asintiko/receipt-parser`
3. ✅ `electron-updater` интегрирован в `electron/main.js`
4. ✅ Генерируется `latest.yml` с метаданными

### Как выпустить обновление:

#### Шаг 1: Увеличить версию
```bash
cd client
# Измените version в package.json (например, с 1.0.0 на 1.0.1)
```

#### Шаг 2: Собрать новую версию
```bash
npm run build
npx electron-builder --win --x64
```

#### Шаг 3: Создать GitHub Release

**Вариант A: Через веб-интерфейс GitHub**
1. Перейти: https://github.com/asintiko/receipt-parser/releases
2. Нажать **"Create a new release"**
3. Tag version: `v1.0.1` (с префиксом `v`)
4. Release title: `Receipt Parser v1.0.1`
5. Описание: описать изменения
6. Загрузить файлы:
   - `Receipt Parser Setup 1.0.1.exe`
   - `Receipt Parser Setup 1.0.1.exe.blockmap`
   - `latest.yml`
7. Нажать **"Publish release"**

**Вариант B: Через командную строку (gh CLI)**
```bash
# Установить GitHub CLI: brew install gh
gh auth login

# Создать release и загрузить файлы
cd client/dist
gh release create v1.0.1 \
  --title "Receipt Parser v1.0.1" \
  --notes "Описание изменений" \
  "Receipt Parser Setup 1.0.1.exe" \
  "Receipt Parser Setup 1.0.1.exe.blockmap" \
  "latest.yml"
```

#### Шаг 4: Клиент получит обновление автоматически
- При запуске приложения проверяется GitHub Releases
- Если найдена новая версия → показывается уведомление
- Пользователь нажимает "Скачать" → файл загружается
- Пользователь нажимает "Установить" → приложение перезапускается с новой версией

---

## 🔄 Как работает проверка обновлений

### В коде (`electron/main.js`):

```javascript
// Проверка обновлений при запуске
app.whenReady().then(() => {
  createWindow();
  autoUpdater.checkForUpdates(); // ← Проверка при старте
});

// События автообновления:
autoUpdater.on('update-available', (info) => {
  // Показываем уведомление пользователю
  mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', (info) => {
  // Предлагаем перезапустить приложение
  dialog.showMessageBox({
    type: 'info',
    title: 'Обновление готово',
    message: 'Новая версия загружена. Перезапустить сейчас?',
    buttons: ['Перезапустить', 'Позже']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
```

### Меню приложения:
- **Файл → Проверить обновления** - ручная проверка
- **Справка → О программе** - показать текущую версию

---

## 📋 Системные требования

### Минимальные:
- Windows 7 SP1 / 8 / 10 / 11
- 2 GB RAM
- 300 MB свободного места на диске
- Подключение к интернету (для API и автообновлений)

### Рекомендуемые:
- Windows 10 / 11 (64-bit)
- 4 GB RAM
- SSD

---

## 🌐 Конфигурация подключения

Приложение подключается к VPS backend:
- **API URL**: `http://144.31.17.123:3001/api`
- **Userbot URL**: `http://144.31.17.123:5001`

Настройки в `client/.env`:
```env
REACT_APP_API_URL=http://144.31.17.123:3001/api
REACT_APP_USERBOT_URL=http://144.31.17.123:5001
```

⚠️ **Важно**: Если меняете IP/домен бэкенда, нужно пересобрать .exe с новыми настройками!

---

## 🔐 Безопасность

### Сертификаты кода:
- ⚠️ Сейчас приложение **не подписано** цифровой подписью
- Windows может показывать предупреждение "Неопознанный издатель"
- Для production рекомендуется приобрести EV Code Signing Certificate:
  - DigiCert ($400/год)
  - Sectigo ($200/год)
  - GlobalSign ($300/год)

### После покупки сертификата:
```json
// package.json
"win": {
  "certificateFile": "path/to/cert.pfx",
  "certificatePassword": "your-password",
  "signingHashAlgorithms": ["sha256"],
  "sign": "./sign.js"
}
```

---

## 📊 Версионирование

Используем **Semantic Versioning** (semver):
- `MAJOR.MINOR.PATCH`
- **MAJOR** (1.x.x) - breaking changes
- **MINOR** (x.1.x) - новые фичи (обратно совместимые)
- **PATCH** (x.x.1) - bug fixes

Примеры:
- `1.0.0` → `1.0.1` - исправлен баг
- `1.0.1` → `1.1.0` - добавлена новая фича
- `1.1.0` → `2.0.0` - изменён API (не обратно совместимо)

---

## 🐛 Отладка автообновлений

### Логи:
- Windows: `%USERPROFILE%\AppData\Roaming\Receipt Parser\logs\main.log`
- Искать строки с `[autoUpdater]`

### Тестирование:
```bash
# 1. Собрать версию 1.0.0 и залить на GitHub
# 2. Изменить версию на 1.0.1
# 3. Собрать версию 1.0.1 и залить на GitHub
# 4. Запустить приложение 1.0.0
# 5. Проверить, что появилось уведомление об обновлении
```

### Принудительная проверка обновлений:
В `electron/main.js` можно изменить:
```javascript
autoUpdater.autoDownload = true; // Автоматическая загрузка
```

---

## 📝 Changelog

### v1.0.0 (2025-10-22)
- ✅ Полная реализация patch-019
- ✅ Luxon форматирование с Asia/Tashkent
- ✅ ПК без звёздочек
- ✅ Страница Операторов с тест-боксом
- ✅ UzumBank SMS parser
- ✅ VPS backend интеграция
- ✅ Автообновление через GitHub Releases

---

## 🆘 Поддержка

При проблемах с релизом:
1. Проверить `client/dist/builder-debug.yml` - детали сборки
2. Проверить логи electron: `%APPDATA%/Receipt Parser/logs/`
3. Проверить GitHub Releases API: https://api.github.com/repos/worq1337/fin-checks-system/releases/latest

---

## 📦 Структура релиза

```
client/dist/
├── Receipt Parser Setup 1.0.0.exe         # Установщик (для клиента)
├── Receipt Parser Setup 1.0.0.exe.blockmap # Метаданные (для GitHub)
├── Receipt Parser 1.0.0.exe               # Портативная версия
├── latest.yml                             # Конфиг автообновления (для GitHub)
├── builder-debug.yml                      # Debug информация
└── win-unpacked/                          # Распакованная версия (для отладки)
```

---

🎉 **Релиз готов к публикации!**
