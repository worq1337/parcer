# 🚀 Инструкция: Первый релиз на GitHub

## Шаг 1: Создать репозиторий на GitHub

1. Перейти: https://github.com/new
2. **Repository name**: `receipt-parser`
3. **Description**: Desktop приложение для парсинга банковских чеков
4. **Public** ✅ (для автообновлений)
5. **НЕ** добавлять README, .gitignore, license (у нас уже есть)
6. Нажать **Create repository**

## Шаг 2: Подключить локальный репозиторий

```bash
cd "/Users/kulacidmyt/Documents/проекты /парсер клод"

# Добавить remote
git remote remove origin  # Если старый был
git remote add origin https://github.com/asintiko/receipt-parser.git

# Проверить
git remote -v
```

## Шаг 3: Подготовить коммит

```bash
# Убедиться что изменения добавлены
git status

# Добавить все нужные файлы
git add .gitignore README.md client/package.json client/RELEASE.md

# Коммит
git commit -m "feat: Initial release v1.0.0 with auto-update support

✅ patch-019 завершён
✅ Windows .exe готов к распространению
✅ Автообновление через GitHub Releases
✅ README для GitHub

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Шаг 4: Загрузить код на GitHub

```bash
# Переименовать ветку в main (если нужно)
git branch -M main

# Залить код
git push -u origin main
```

## Шаг 5: Создать первый Release v1.0.0

### Вариант A: Через веб-интерфейс (проще)

1. Перейти: https://github.com/asintiko/receipt-parser/releases
2. Нажать **"Create a new release"**
3. **Tag version**: `v1.0.0`
4. **Release title**: `Receipt Parser v1.0.0 - Initial Release`
5. **Description**:
```markdown
# 🎉 Первый релиз Receipt Parser!

Desktop-приложение для автоматического парсинга банковских чеков из SMS и Telegram.

## ✨ Возможности
- 🤖 Автоматический парсинг через OpenAI GPT-4
- 📱 Telegram Bot для получения SMS
- 📊 Excel-подобная таблица с AG Grid
- 🎨 Форматирование ячеек
- 📈 Агрегаты по выделению
- 🔍 Быстрые фильтры
- 📤 Экспорт в Excel
- 🔄 Автообновление через GitHub Releases

## 📥 Установка

Скачайте **Receipt Parser Setup 1.0.0.exe** (рекомендуется) или портативную версию.

### Системные требования
- Windows 7 SP1 / 8 / 10 / 11
- 2 GB RAM
- 300 MB свободного места

## 🏦 Поддерживаемые банки
- UzumBank (SMS + Telegram)
- Другие банки Узбекистана

---

**Автор**: asintiko  
**Backend**: http://144.31.17.123:3001
```

6. **Attach binaries**:
   - Перетащить `client/dist/Receipt Parser Setup 1.0.0.exe`
   - Перетащить `client/dist/Receipt Parser 1.0.0.exe` (портативная)
   - Перетащить `client/dist/Receipt Parser Setup 1.0.0.exe.blockmap`
   - Перетащить `client/dist/latest.yml`

7. Нажать **"Publish release"**

### Вариант B: Через командную строку (gh CLI)

```bash
# Установить GitHub CLI (если нет)
brew install gh

# Авторизоваться
gh auth login

# Создать release
cd "/Users/kulacidmyt/Documents/проекты /парсер клод/client/dist"

gh release create v1.0.0 \
  --title "Receipt Parser v1.0.0 - Initial Release" \
  --notes "🎉 Первый релиз! Desktop-приложение для парсинга банковских чеков." \
  "Receipt Parser Setup 1.0.0.exe" \
  "Receipt Parser 1.0.0.exe" \
  "Receipt Parser Setup 1.0.0.exe.blockmap" \
  "latest.yml"
```

## Шаг 6: Проверить автообновление

1. После публикации release, проверить:
   - https://github.com/asintiko/receipt-parser/releases
   - https://api.github.com/repos/asintiko/receipt-parser/releases/latest

2. Запустить приложение на чистом Windows
3. В меню: **Файл → Проверить обновления**
4. Должно показать "У вас последняя версия"

## Следующие релизы

Для выпуска версии 1.0.1, 1.1.0 и т.д.:

1. Обновить `version` в `client/package.json`
2. Собрать: `npm run build && npx electron-builder --win --x64`
3. Создать новый release с новым тегом (v1.0.1)
4. Пользователи получат уведомление об обновлении автоматически!

---

✅ **Всё готово!** Приложение будет автоматически проверять GitHub Releases и уведомлять пользователей о новых версиях.
