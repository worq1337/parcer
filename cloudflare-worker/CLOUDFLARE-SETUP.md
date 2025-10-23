# Cloudflare Pages + R2 Setup для Auto-Updates

## ✅ Текущий статус

### Готово:
- ✅ R2 bucket создан: `receipt-parser-updates`
- ✅ Файлы загружены в R2:
  - `latest.yml` (357 B)
  - `Receipt Parser Setup 1.0.0.exe` (189 MB)
  - `Receipt Parser 1.0.0.exe` (97 MB)
  - `Receipt Parser Setup 1.0.0.exe.blockmap` (200 KB)
- ✅ Pages project создан: `receipt-parser-updates`
- ✅ Worker function загружен (`_worker.js`)
- ✅ Production URL готов: `https://receipt-parser-updates.pages.dev`

### Требует настройки:
❌ **R2 Binding для Pages Functions**

## 🔧 Инструкция по настройке R2 Binding

### Шаг 1: Откройте настройки Pages project

1. Перейдите: https://dash.cloudflare.com/138e65054e7e7b692469ffd8dbbd3156/pages/view/receipt-parser-updates
2. Кликните на вкладку **Settings** (в верхнем меню)

### Шаг 2: Добавьте R2 Binding

1. В левом меню найдите секцию **Functions**
2. Прокрутите вниз до **R2 bucket bindings**
3. Кликните **Add binding**
4. Заполните:
   - **Variable name**: `RECEIPT_PARSER_UPDATES`
   - **R2 bucket**: выберите `receipt-parser-updates` из dropdown
5. Кликните **Save**

### Шаг 3: Переразвертите Pages

После добавления binding нужно переразвернуть deployment:

1. Вернитесь на вкладку **Deployments**
2. Найдите последний deployment (должен быть с хешем вида `af8f9b41`)
3. Кликните три точки (...) справа от deployment
4. Выберите **Retry deployment** или **Promote to production**

**ИЛИ** просто сделайте новый deployment из командной строки:

```bash
cd "/Users/kulacidmyt/Documents/проекты /парсер клод/cloudflare-worker/pages-deploy"
wrangler pages deploy . --project-name=receipt-parser-updates --commit-dirty=true
```

### Шаг 4: Проверка работоспособности

После переразвертывания проверьте доступ к файлам:

```bash
# Должен вернуть HTTP 200 и содержимое latest.yml
curl -I https://receipt-parser-updates.pages.dev/latest.yml

# Должен вернуть HTTP 200 и начать скачивание .exe файла
curl -I "https://receipt-parser-updates.pages.dev/Receipt%20Parser%20Setup%201.0.0.exe"
```

Если видите **HTTP 200** вместо 404 - всё работает! ✅

## 🎯 Финальный шаг: Обновление конфигурации приложения

После того как файлы станут доступны, нужно обновить URL в приложении:

### `client/electron/main.js`

Замените:
```javascript
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://pub-0f939d44dd1a418b98f1c40c967af1a2.r2.dev/';
```

На:
```javascript
const UPDATE_SERVER_URL = process.env.UPDATE_SERVER_URL || 'https://receipt-parser-updates.pages.dev/';
```

### `client/package.json`

Замените:
```json
"publish": {
  "provider": "generic",
  "url": "https://pub-0f939d44dd1a418b98f1c40c967af1a2.r2.dev/"
}
```

На:
```json
"publish": {
  "provider": "generic",
  "url": "https://receipt-parser-updates.pages.dev/"
}
```

## 📝 Будущие обновления

Для деплоя новых версий приложения:

1. Соберите новую версию:
   ```bash
   cd client
   npm run build
   npx electron-builder --win --x64 -p never
   ```

2. Загрузите файлы в R2:
   ```bash
   cd dist
   wrangler r2 object put receipt-parser-updates/latest.yml --file=latest.yml --content-type=text/yaml
   wrangler r2 object put "receipt-parser-updates/Receipt Parser Setup X.X.X.exe" --file="Receipt Parser Setup X.X.X.exe" --content-type=application/octet-stream
   ```

3. Файлы автоматически станут доступны через Pages URL
4. Приложения пользователей автоматически получат уведомление об обновлении

## 🆘 Troubleshooting

### 404 на latest.yml после добавления binding
- Проверьте что binding создан с правильным именем: `RECEIPT_PARSER_UPDATES`
- Убедитесь что сделали redeploy после добавления binding
- Подождите 1-2 минуты для распространения изменений

### SSL handshake error
- Это нормально для preview URL (с хешем)
- Используйте production URL: `receipt-parser-updates.pages.dev`

### Worker function не работает
- Убедитесь что файл `_worker.js` находится в корне deployment
- Проверьте logs в Cloudflare Dashboard: Pages → Deployments → View logs
