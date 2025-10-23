# Обновление конфигурации для GitHub Releases

## Что нужно изменить после создания Release

### 1. client/package.json

**Текущая конфигурация** (Cloudflare R2):
```json
"publish": {
  "provider": "generic",
  "url": "https://pub-0f939d44dd1a418b98f1c40c967af1a2.r2.dev/"
}
```

**Новая конфигурация** (GitHub Releases):
```json
"publish": {
  "provider": "github",
  "owner": "worq1337",
  "repo": "parcer"
}
```

### 2. client/electron/main.js

**Текущая конфигурация** (Cloudflare R2):
```javascript
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://pub-0f939d44dd1a418b98f1c40c967af1a2.r2.dev/';

autoUpdater.setFeedURL({
  provider: 'generic',
  url: UPDATE_SERVER_URL,
});
```

**Новая конфигурация** (GitHub Releases):
```javascript
// Используем provider: 'github' с автоматическим определением URL
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'worq1337',
  repo: 'parcer',
});
```

**Или можно оставить generic provider** (работает одинаково):
```javascript
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://github.com/worq1337/parcer/releases/download/';

autoUpdater.setFeedURL({
  provider: 'generic',
  url: UPDATE_SERVER_URL,
});
```

### 3. backend/src/index.js

**Удалить ненужный код** (апдейты только для Electron, backend не трогаем):

Удалить строки 30-46:
```javascript
// patch-021: Static file serving для auto-updates
const path = require('path');
app.use('/updates', express.static(path.join(__dirname, '../../updates'), {
  setHeaders: (res, filePath) => {
    // CORS для electron-updater
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Range');

    // Кеширование
    if (filePath.endsWith('.yml')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.endsWith('.exe') || filePath.endsWith('.blockmap')) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
```

Удалить строку 31 (require path):
```javascript
const path = require('path');
```

Удалить из endpoints в строке 65:
```javascript
compat: '/api/compat' // patch-021: compatibility check
```

## Команды для пересборки

После изменения конфигурации:

```bash
# 1. Перейти в папку клиента
cd "/Users/kulacidmyt/Documents/проекты /парсер клод/client"

# 2. Пересобрать React приложение
npm run build

# 3. Собрать Electron .exe с новой конфигурацией
npx electron-builder --win --x64 -p never

# 4. Проверить что файлы созданы
ls -lh dist/*.exe dist/*.yml dist/*.blockmap
```

## Проверка работы автообновления

1. **Установить собранный .exe** на Windows машину
2. **Запустить приложение**
3. **Открыть DevTools** (View → Toggle Developer Tools)
4. **Проверить консоль** на наличие логов:
   - `Checking for updates...`
   - `Update available` или `Update not available`

5. **Проверить меню**:
   - Help → Check for Updates
   - Должно появиться уведомление о наличии/отсутствии обновлений

## Тестирование обновления

Для теста что обновление работает:

1. Создай Release v1.0.1 на GitHub
2. Измени version в package.json на 1.0.1
3. Пересобери .exe
4. Загрузи новые файлы в Release v1.0.1
5. Установи старую версию (1.0.0) и запусти
6. Приложение должно предложить обновиться до 1.0.1

---

## URL структура для GitHub Releases

electron-updater автоматически формирует URL:

**latest.yml:**
```
https://github.com/worq1337/parcer/releases/latest/download/latest.yml
```

**Установщик:**
```
https://github.com/worq1337/parcer/releases/download/v1.0.0/Receipt%20Parser%20Setup%201.0.0.exe
```

**Blockmap для delta-updates:**
```
https://github.com/worq1337/parcer/releases/download/v1.0.0/Receipt%20Parser%20Setup%201.0.0.exe.blockmap
```

При использовании `provider: 'github'`, electron-updater знает как правильно построить эти URL.
