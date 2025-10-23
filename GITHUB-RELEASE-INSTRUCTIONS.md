# Инструкция: Создание GitHub Release для автообновлений

## Шаг 1: Создание Release

1. Открой в браузере: https://github.com/worq1337/parcer/releases/new

2. Заполни форму:
   - **Tag version**: `v1.0.0` (обязательно с буквой v)
   - **Release title**: `Receipt Parser v1.0.0`
   - **Description** (опционально):
     ```
     Первый публичный релиз Receipt Parser с автообновлением.

     ## Что нового:
     - Desktop приложение на Electron
     - Автоматическое обновление через GitHub Releases
     - Поддержка Windows x64
     ```

3. **Загрузи 4 файла** (перетащи в область "Attach binaries"):
   - `latest.yml`
   - `Receipt Parser Setup 1.0.0.exe`
   - `Receipt Parser 1.0.0.exe`
   - `Receipt Parser Setup 1.0.0.exe.blockmap`

   **Где находятся файлы:**
   ```
   /Users/kulacidmyt/Documents/проекты /парсер клод/client/dist/
   ```

4. Убедись что чекбокс **"Set as the latest release"** включен ✅

5. Нажми **"Publish release"**

## Шаг 2: Проверка

После создания Release проверь доступность файлов:

- Открой: https://github.com/worq1337/parcer/releases/tag/v1.0.0
- Убедись что все 4 файла отображаются в секции "Assets"
- Попробуй скачать `latest.yml` - должен открыться текстовый файл с метаданными

## Шаг 3: Сообщи мне

Когда Release будет создан - напиши "релиз готов" или пришли ссылку на него.

После этого я:
1. Обновлю конфигурацию приложения с GitHub URL
2. Пересоберу .exe с правильными настройками автообновления
3. Протестирую механизм проверки обновлений

## Формат URL для обновлений

electron-updater будет проверять:
```
https://github.com/worq1337/parcer/releases/download/v1.0.0/latest.yml
```

И скачивать:
```
https://github.com/worq1337/parcer/releases/download/v1.0.0/Receipt%20Parser%20Setup%201.0.0.exe
```

---

## Если что-то пошло не так:

### Файлы не загружаются
- Проверь размер файлов - GitHub ограничивает до 2 GB на файл (у нас все меньше)
- Попробуй загрузить файлы по одному

### Release не публикуется
- Убедись что tag начинается с буквы `v` (v1.0.0)
- Проверь что репозиторий публичный (Settings → General → Danger Zone → Change visibility)

### Ошибка доступа
- Убедись что залогинен под аккаунтом worq1337
- Проверь права доступа к репозиторию
