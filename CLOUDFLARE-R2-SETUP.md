# 📦 Cloudflare R2 Setup - Auto-Updates без GitHub

Инструкция по настройке системы автообновлений через Cloudflare R2 (бесплатно до 10GB).

---

## Шаг 1: Создание Cloudflare R2 Bucket

### 1.1. Регистрация Cloudflare
1. Перейти: https://cloudflare.com
2. Создать аккаунт (если нет)
3. Войти в Dashboard

### 1.2. Создание R2 Bucket
1. В левом меню выбрать **R2 Object Storage**
2. Нажать **"Create bucket"**
3. Имя bucket: `receipt-parser-updates`
4. Location: **Automatic** (или ближайший регион)
5. Нажать **"Create bucket"**

### 1.3. Включение публичного доступа
1. Открыть созданный bucket `receipt-parser-updates`
2. Перейти на вкладку **Settings**
3. В разделе **Public access** нажать **"Allow Access"**
4. Подтвердить
5. Скопировать **Public bucket URL** (будет вида: `https://pub-xxxxx.r2.dev`)

**Важно**: Сохраните этот URL - он понадобится на следующих шагах!

---

## Шаг 2: Установка Wrangler CLI

Wrangler - это CLI инструмент от Cloudflare для работы с R2.

```bash
# Установка глобально
npm install -g wrangler

# Или используйте npx (не требует установки)
npx wrangler --version
```

### 2.1. Авторизация Wrangler
```bash
wrangler login
```

Откроется браузер для авторизации. Подтвердите доступ к вашему Cloudflare аккаунту.

---

## Шаг 3: Получение Cloudflare Account ID

```bash
# Вариант 1: Через Wrangler
wrangler whoami

# Вариант 2: Через Dashboard
# 1. Откройте https://dash.cloudflare.com
# 2. Выберите R2 Object Storage
# 3. Справа вверху: Account ID
```

Скопируйте **Account ID** (например: `abcdef1234567890`).

---

## Шаг 4: Настройка проекта

### 4.1. Обновление client/package.json

Откройте `client/package.json` и замените плейсхолдер R2 URL:

```json
"publish": {
  "provider": "generic",
  "url": "https://pub-xxxxx.r2.dev/"
}
```

Замените `https://pub-xxxxx.r2.dev/` на ваш **Public bucket URL** из Шага 1.3.

### 4.2. Обновление client/electron/main.js

Откройте `client/electron/main.js` и замените плейсхолдер:

```javascript
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://pub-xxxxx.r2.dev/';
```

Замените на ваш R2 URL.

### 4.3. Настройка scripts/deploy-updates.sh

Откройте `scripts/deploy-updates.sh` и установите переменные окружения:

```bash
# Перед запуском скрипта экспортируйте:
export R2_BUCKET_NAME="receipt-parser-updates"
export R2_ACCOUNT_ID="abcdef1234567890"  # Ваш Account ID из Шага 3
```

Или измените значения по умолчанию в самом скрипте (строки 22-23).

---

## Шаг 5: Первый деплой (тестовый)

### 5.1. Проверка конфигурации

```bash
# Проверить что wrangler авторизован
wrangler whoami

# Проверить доступ к bucket
wrangler r2 bucket list
```

Вы должны увидеть `receipt-parser-updates` в списке.

### 5.2. Сборка и деплой

```bash
# Переход в корень проекта
cd "/Users/kulacidmyt/Documents/проекты /парсер клод"

# Установка зависимостей (если ещё не установлены)
cd client && npm install && cd ..

# Запуск deploy-скрипта
./scripts/deploy-updates.sh
```

**Скрипт выполнит:**
1. Сборку React приложения (`npm run build`)
2. Сборку Electron дистрибутива (`electron-builder --win`)
3. Загрузку артефактов на R2:
   - `latest.yml` (с `no-cache` для актуальности)
   - `Receipt-Parser-Setup-X.X.X.exe` (с кешированием)
   - `*.blockmap` файлы (для delta updates)

### 5.3. Проверка на R2

1. Откройте Cloudflare Dashboard → R2
2. Перейдите в `receipt-parser-updates`
3. Убедитесь, что файлы загружены:
   - `latest.yml`
   - `Receipt-Parser-Setup-1.0.0.exe`
   - `Receipt-Parser-Setup-1.0.0.exe.blockmap`

---

## Шаг 6: Тестирование автообновлений

### 6.1. Установка v1.0.0 (текущая версия)

1. Перейдите в `client/dist/`
2. Запустите `Receipt Parser Setup 1.0.0.exe`
3. Установите приложение
4. Убедитесь, что приложение работает

### 6.2. Выпуск v1.0.1 (тестовая версия)

```bash
cd client

# Изменить версию в package.json
# "version": "1.0.0" → "version": "1.0.1"

# Пересобрать и задеплоить
cd ..
./scripts/deploy-updates.sh
```

### 6.3. Проверка обновления

1. Запустите приложение v1.0.0 (установленный на Шаге 6.1)
2. При запуске появится:
   - **Splash screen** с проверкой совместимости
   - Если доступно обновление → **Update Banner** вверху
3. Нажмите **"Скачать"** в баннере
4. Дождитесь окончания загрузки (прогресс-бар)
5. Нажмите **"Перезапустить"**
6. Приложение перезапустится с новой версией v1.0.1

---

## Шаг 7: Обновление минимальной версии (опционально)

Если хотите заблокировать запуск старых версий, отредактируйте `backend/src/routes/compatRoutes.js`:

```javascript
// Минимальная поддерживаемая версия
const MIN_SUPPORTED_VERSION = '1.0.0';

// Версия, обязательная для обновления (null = нет обязательных)
const REQUIRED_VERSION = '1.0.1'; // ← Измените с null на нужную версию
```

Теперь при запуске v1.0.0 сплэш-экран заблокирует доступ и покажет кнопку "Обновить сейчас".

---

## Шаг 8: Basic-Auth (опционально)

Если хотите защитить обновления паролем:

### 8.1. Настройка Cloudflare R2

R2 не поддерживает Basic-Auth напрямую, но можно использовать:
- Cloudflare Workers (создать middleware для проверки заголовков)
- Приватный bucket + подписанные URL

### 8.2. В приложении (client/electron/main.js)

Раскомментируйте:

```javascript
autoUpdater.setFeedURL({
  provider: 'generic',
  url: UPDATE_SERVER_URL,
  headers: {
    Authorization: 'Basic ' + Buffer.from('user:password').toString('base64')
  }
});
```

Замените `user:password` на ваши учётные данные.

---

## Troubleshooting

### Проблема 1: wrangler не найден

```bash
# Установите wrangler
npm install -g wrangler

# Или используйте npx
npx wrangler login
```

### Проблема 2: Ошибка "Access denied" при загрузке

```bash
# Переавторизуйтесь
wrangler logout
wrangler login
```

### Проблема 3: Приложение не видит обновление

1. Убедитесь, что `latest.yml` загружен на R2
2. Проверьте URL в `package.json` и `main.js` (должен совпадать с R2)
3. Проверьте публичный доступ к bucket (Settings → Public access = Allowed)
4. Откройте DevTools в приложении (View → Toggle Developer Tools)
5. Проверьте логи auto-updater:
   ```
   %APPDATA%/Receipt Parser/logs/main.log  (Windows)
   ~/Library/Logs/Receipt Parser/main.log  (macOS)
   ```

### Проблема 4: Обновление скачивается, но не устанавливается

1. Убедитесь, что `.exe` и `.blockmap` загружены на R2
2. Проверьте права доступа (запустите приложение от администратора)
3. Проверьте версию в `latest.yml` (должна быть новее установленной)

---

## Лимиты Cloudflare R2 (Free Tier)

- **Хранилище**: 10 GB бесплатно
- **Операции Class A**: 1 млн/месяц бесплатно (загрузка файлов)
- **Операции Class B**: 10 млн/месяц бесплатно (скачивание файлов)
- **Egress**: Бесплатный (без ограничений)

Для приложения с ~200 MB .exe файлом:
- **Хранилище**: ~200 MB × 5 версий = 1 GB (в пределах лимита)
- **Скачивания**: 10 млн/месяц = ~50,000 установок/обновлений (достаточно)

---

## Следующие релизы

Для выпуска новой версии (например, 1.0.2):

```bash
# 1. Изменить версию в client/package.json
"version": "1.0.2"

# 2. Запустить deploy-скрипт
./scripts/deploy-updates.sh

# 3. Пользователи получат обновление автоматически!
```

---

## Полезные ссылки

- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [electron-updater Docs](https://www.electron.build/auto-update)
- [electron-builder Generic Provider](https://www.electron.build/configuration/publish#genericserveroptions)

---

✅ **Готово!** Ваша система автообновлений работает без GitHub, полностью бесплатно (в пределах лимитов R2).
