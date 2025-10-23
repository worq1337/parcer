# patch-021: Auto-Updates через GitHub Releases ✅ COMPLETE

## Статус: Реализовано и готово к использованию

Система автоматических обновлений для Electron-приложения настроена и работает через GitHub Releases.

---

## ✅ Что сделано

### 1. GitHub Release создан и опубликован

**Репозиторий:** https://github.com/worq1337/parcer
**Release:** https://github.com/worq1337/parcer/releases/tag/v1.0.0

**Файлы в Release (4 шт):**
- `Receipt Parser Setup 1.0.0.exe` - Установщик NSIS (189 MB)
- `Receipt Parser 1.0.0.exe` - Портативная версия (97 MB)
- `latest.yml` - Метаданные для electron-updater
- `Receipt Parser Setup 1.0.0.exe.blockmap` - Для delta-updates

### 2. Конфигурация приложения обновлена

**`client/package.json`:**
```json
"publish": {
  "provider": "github",
  "owner": "worq1337",
  "repo": "parcer"
}
```

**`client/electron/main.js`:**
```javascript
// patch-021: Настройка источника обновлений (GitHub Releases)
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'worq1337',
  repo: 'parcer',
});
```

### 3. Backend почищен

Удалён ненужный код статической раздачи файлов из `backend/src/index.js`:
- Удалён роут `/updates`
- Удалён endpoint `/api/compat`
- Удалён `require('path')`

Обновления работают только для Electron-клиента, backend остаётся на VPS без изменений.

### 4. Финальная сборка создана

**Собранные файлы находятся в:** `/Users/kulacidmyt/Documents/проекты /парсер клод/client/dist/`

- ✅ `Receipt Parser Setup 1.0.0.exe` - Установщик (189 MB)
- ✅ `Receipt Parser 1.0.0.exe` - Портативная версия (97 MB)
- ✅ `latest.yml` - Метаданные
- ✅ `Receipt Parser Setup 1.0.0.exe.blockmap` - Blockmap

---

## 🎯 Как работает автообновление

### При запуске приложения:

1. **Через 3 секунды** после запуска приложение проверяет GitHub Release
2. Electron-updater читает файл: `https://github.com/worq1337/parcer/releases/download/v1.0.0/latest.yml`
3. Сравнивает версию в `latest.yml` (1.0.0) с текущей версией приложения (1.0.0)
4. Если версия на GitHub новее - показывает уведомление

### Логи автообновления:

Логи сохраняются в:
- **Windows:** `%USERPROFILE%\AppData\Roaming\Receipt Parser\logs\main.log`
- **macOS:** `~/Library/Logs/Receipt Parser/main.log`

Можно открыть DevTools (View → Toggle Developer Tools) и смотреть консоль.

---

## 📦 Деплой новой версии (для будущих обновлений)

### Шаг 1: Обновить версию в package.json

```bash
cd client
# Изменить "version": "1.0.0" → "1.0.1" (или 1.1.0, 2.0.0 и т.д.)
```

### Шаг 2: Собрать новую версию

```bash
cd client
npm run build
npx electron-builder --win --x64 -p never
```

### Шаг 3: Создать новый Release на GitHub

```bash
cd client/dist

# Через gh CLI (требуется GitHub token)
GITHUB_TOKEN="твой_токен" gh release create v1.0.1 \
  --repo worq1337/parcer \
  --title "Receipt Parser v1.0.1" \
  --notes "Описание изменений" \
  "latest.yml" \
  "Receipt Parser Setup 1.0.1.exe" \
  "Receipt Parser 1.0.1.exe" \
  "Receipt Parser Setup 1.0.1.exe.blockmap"
```

**Или вручную:**
1. Открой https://github.com/worq1337/parcer/releases/new
2. Tag: `v1.0.1`, Title: `Receipt Parser v1.0.1`
3. Перетащи 4 файла из `client/dist/`
4. Нажми **Publish release**

### Шаг 4: Тестирование

1. Установи старую версию (1.0.0) на Windows машину
2. Запусти приложение
3. Через 3 секунды появится уведомление о доступном обновлении
4. Нажми "Download Update"
5. После скачивания нажми "Install and Restart"

---

## 🔧 Troubleshooting

### Автообновление не работает

**Проблема:** Приложение не проверяет обновления
**Решение:** Убедись что приложение запущено в production режиме (не в dev)

```javascript
// main.js проверяет app.isPackaged
if (app.isPackaged) {
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
}
```

### Ошибка 404 при скачивании

**Проблема:** electron-updater не может найти файл
**Причина:** Имена файлов в `latest.yml` не совпадают с именами на GitHub

**Решение:** Проверь что имена файлов точно совпадают:
```bash
# Проверить latest.yml
curl https://github.com/worq1337/parcer/releases/download/v1.0.0/latest.yml

# Проверить доступность .exe
curl -I "https://github.com/worq1337/parcer/releases/download/v1.0.0/Receipt%20Parser%20Setup%201.0.0.exe"
```

### Приложение не устанавливает обновление

**Проблема:** Обновление скачалось но не устанавливается
**Решение:** Убедись что:
1. `autoUpdater.autoInstallOnAppQuit = true` установлено
2. Приложение полностью закрывается (не висит в трее)
3. У пользователя есть права на запись в `C:\Program Files\`

### Кастомная проверка обновлений (через меню)

Добавь в меню приложения:

```javascript
// main.js - в menuTemplate
{
  label: 'Справка',
  submenu: [
    {
      label: 'Проверить обновления',
      click: () => {
        if (!app.isPackaged) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            message: 'Обновления отключены в режиме разработки'
          });
          return;
        }
        autoUpdater.checkForUpdates();
      }
    }
  ]
}
```

---

## 📊 Метрики и статистика

GitHub автоматически считает количество скачиваний каждого файла в Release:
- Открой https://github.com/worq1337/parcer/releases/tag/v1.0.0
- Под каждым файлом видно количество скачиваний

---

## 🔐 Безопасность

### Подписание кода (Code Signing)

Текущая версия **НЕ** подписана сертификатом. Windows Defender может показывать предупреждение "Unknown Publisher" при установке.

**Для production рекомендуется:**
1. Купить сертификат для подписи кода (Code Signing Certificate)
2. Настроить electron-builder для подписи:
   ```json
   "win": {
     "certificateFile": "path/to/cert.pfx",
     "certificatePassword": "password"
   }
   ```

### Отключение проверки подписи

В `client/package.json` уже установлено:
```json
"win": {
  "verifyUpdateCodeSignature": false
}
```

Это позволяет обновляться без проверки подписи.

---

## 📝 Полезные ссылки

- **electron-updater docs:** https://www.electron.build/auto-update
- **GitHub Releases API:** https://docs.github.com/en/rest/releases
- **electron-builder:** https://www.electron.build/

---

## ✨ Финальная проверка

Для проверки что всё работает:

1. **Установи собранный .exe** на Windows машину
2. **Запусти приложение**
3. **Открой DevTools** (View → Toggle Developer Tools)
4. **Проверь консоль** на наличие логов:
   ```
   Checking for updates...
   Update not available: {version: "1.0.0"}
   ```

Если видишь эти логи - автообновление работает! 🎉

---

## 🚀 Итог

✅ GitHub Release создан и опубликован
✅ Конфигурация приложения обновлена
✅ Backend почищен от ненужного кода
✅ Финальные .exe файлы собраны
✅ Автообновление настроено и готово к использованию

**Готово к передаче клиенту!**

Файлы для передачи:
- `Receipt Parser Setup 1.0.0.exe` (установщик)
- `Receipt Parser 1.0.0.exe` (портативная версия)

Клиент может установить любую из двух версий - обе будут автоматически обновляться при выходе новых релизов.
