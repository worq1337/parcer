#!/bin/bash
# patch-021: Deploy script для загрузки обновлений на Cloudflare R2
# Использование: ./scripts/deploy-updates.sh

set -e  # Выходить при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Receipt Parser - Deploy Updates  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Проверка наличия wrangler CLI
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Ошибка: wrangler CLI не установлен!${NC}"
    echo ""
    echo "Установите wrangler:"
    echo "  npm install -g wrangler"
    echo ""
    echo "Или используйте npx:"
    echo "  npx wrangler ..."
    exit 1
fi

# Конфигурация
R2_BUCKET_NAME="${R2_BUCKET_NAME:-receipt-parser-updates}"

echo -e "${YELLOW}Конфигурация:${NC}"
echo "  R2 Bucket: $R2_BUCKET_NAME"
echo ""

# Переход в папку client
cd "$(dirname "$0")/../client"

# Шаг 1: Сборка приложения
echo -e "${YELLOW}[1/4] Сборка React приложения...${NC}"
npm run build
echo -e "${GREEN}✓ React build готов${NC}"
echo ""

# Шаг 2: Сборка Electron дистрибутива
echo -e "${YELLOW}[2/4] Сборка Electron дистрибутива...${NC}"
npx electron-builder --win --x64 -p never
echo -e "${GREEN}✓ Electron build готов${NC}"
echo ""

# Шаг 3: Проверка наличия артефактов
echo -e "${YELLOW}[3/4] Проверка артефактов...${NC}"
DIST_DIR="./dist"

if [ ! -f "$DIST_DIR/latest.yml" ]; then
    echo -e "${RED}Ошибка: latest.yml не найден в $DIST_DIR${NC}"
    exit 1
fi

if ! ls "$DIST_DIR"/*.exe 1> /dev/null 2>&1; then
    echo -e "${RED}Ошибка: .exe файлы не найдены в $DIST_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Все артефакты найдены${NC}"
echo ""

# Шаг 4: Загрузка на R2
echo -e "${YELLOW}[4/4] Загрузка на Cloudflare R2...${NC}"

# Загружаем latest.yml (no-cache для актуальности)
echo "  Загрузка latest.yml..."
wrangler r2 object put "$R2_BUCKET_NAME/latest.yml" \
  --file="$DIST_DIR/latest.yml" \
  --content-type="text/yaml" \
  --ct-no-cache

# Загружаем .exe файлы (с кешированием)
for exe_file in "$DIST_DIR"/*.exe; do
    if [ -f "$exe_file" ]; then
        filename=$(basename "$exe_file")
        echo "  Загрузка $filename..."
        wrangler r2 object put "$R2_BUCKET_NAME/$filename" \
          --file="$exe_file" \
          --content-type="application/octet-stream" \
          --ct="public, max-age=31536000, immutable"
    fi
done

# Загружаем .blockmap файлы (для delta updates)
for blockmap_file in "$DIST_DIR"/*.blockmap; do
    if [ -f "$blockmap_file" ]; then
        filename=$(basename "$blockmap_file")
        echo "  Загрузка $filename..."
        wrangler r2 object put "$R2_BUCKET_NAME/$filename" \
          --file="$blockmap_file" \
          --content-type="application/octet-stream" \
          --ct="public, max-age=31536000, immutable"
    fi
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Деплой завершён успешно! ✓  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Получаем версию из package.json
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Версия $VERSION загружена на R2${NC}"
echo ""
echo "Проверьте обновления:"
echo "  1. Запустите старую версию приложения"
echo "  2. Дождитесь уведомления об обновлении"
echo "  3. Нажмите 'Скачать' → 'Перезапустить'"
echo ""
