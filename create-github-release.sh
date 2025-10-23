#!/bin/bash

# Скрипт для создания GitHub Release вручную через API
# Требуется Personal Access Token от аккаунта worq1337

echo "================================="
echo "GitHub Release Creator"
echo "================================="
echo ""
echo "Для создания Release нужен Personal Access Token (PAT)"
echo ""
echo "Как получить токен:"
echo "1. Зайди на GitHub под аккаунтом worq1337"
echo "2. Открой: https://github.com/settings/tokens/new"
echo "3. Заполни:"
echo "   - Note: receipt-parser-release"
echo "   - Expiration: 7 days (достаточно для разовой загрузки)"
echo "   - Select scopes: [✓] repo (полный доступ к репозиторию)"
echo "4. Нажми Generate token"
echo "5. Скопируй токен (он показывается только один раз!)"
echo ""
read -p "Введи Personal Access Token: " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Токен не введен. Выход."
  exit 1
fi

OWNER="worq1337"
REPO="parcer"
TAG="v1.0.0"
NAME="Receipt Parser v1.0.0"
BODY="Первый публичный релиз Receipt Parser с автообновлением.

## Что нового:
- Desktop приложение на Electron
- Автоматическое обновление через GitHub Releases
- Поддержка Windows x64

## Файлы:
- \`Receipt Parser Setup 1.0.0.exe\` - Установщик NSIS (189 MB)
- \`Receipt Parser 1.0.0.exe\` - Портативная версия (97 MB)
- \`latest.yml\` - Метаданные для автообновления
- \`Receipt Parser Setup 1.0.0.exe.blockmap\` - Delta-updates"

echo "Создаю Release $TAG в репозитории $OWNER/$REPO..."
echo ""

# Создание Release
RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$OWNER/$REPO/releases \
  -d "{
    \"tag_name\": \"$TAG\",
    \"name\": \"$NAME\",
    \"body\": $(echo "$BODY" | jq -Rs .),
    \"draft\": false,
    \"prerelease\": false
  }")

RELEASE_ID=$(echo "$RESPONSE" | grep -o '"id": [0-9]*' | head -1 | grep -o '[0-9]*')
UPLOAD_URL=$(echo "$RESPONSE" | grep -o '"upload_url": "[^"]*' | cut -d'"' -f4 | sed 's/{?name,label}//')

if [ -z "$RELEASE_ID" ]; then
  echo "❌ Ошибка при создании Release:"
  echo "$RESPONSE" | jq .
  exit 1
fi

echo "✅ Release создан! ID: $RELEASE_ID"
echo "🔗 URL: https://github.com/$OWNER/$REPO/releases/tag/$TAG"
echo ""

# Загрузка файлов
FILES=(
  "latest.yml"
  "Receipt Parser Setup 1.0.0.exe"
  "Receipt Parser 1.0.0.exe"
  "Receipt Parser Setup 1.0.0.exe.blockmap"
)

cd "/Users/kulacidmyt/Documents/проекты /парсер клод/client/dist"

for FILE in "${FILES[@]}"; do
  echo "Загружаю: $FILE"

  # Определяем Content-Type
  if [[ "$FILE" == *.yml ]]; then
    CONTENT_TYPE="text/yaml"
  elif [[ "$FILE" == *.exe ]]; then
    CONTENT_TYPE="application/octet-stream"
  elif [[ "$FILE" == *.blockmap ]]; then
    CONTENT_TYPE="application/octet-stream"
  else
    CONTENT_TYPE="application/octet-stream"
  fi

  # Загружаем файл
  UPLOAD_RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: $CONTENT_TYPE" \
    --data-binary @"$FILE" \
    "${UPLOAD_URL}?name=$(echo "$FILE" | jq -sRr @uri)")

  # Проверяем успех
  if echo "$UPLOAD_RESPONSE" | grep -q '"state": "uploaded"'; then
    echo "  ✅ Загружено"
  else
    echo "  ❌ Ошибка загрузки:"
    echo "$UPLOAD_RESPONSE" | jq .
  fi

  echo ""
done

echo "================================="
echo "✅ Release готов!"
echo "🔗 https://github.com/$OWNER/$REPO/releases/tag/$TAG"
echo "================================="
echo ""
echo "Теперь можно обновить конфигурацию приложения и пересобрать .exe"
