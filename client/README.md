# Receipt Parser - Desktop Client

Electron desktop приложение для парсера банковских чеков Узбекистана.

## Быстрый старт

### Development

```bash
# 1. Установите зависимости
npm install

# 2. Создайте .env файл (скопируйте из .env.example)
cp .env.example .env

# 3. Настройте API URL в .env
REACT_APP_API_URL=http://localhost:3001/api

# 4. Запустите приложение
npm run electron-dev
```

### Production Build

```bash
# 1. Настройте production .env
REACT_APP_API_URL=https://api.your-domain.com/api

# 2. Соберите приложение
npm run build

# 3. Создайте дистрибутивы
npm run dist
```

Результат в папке `dist/`:
- macOS: `.dmg` и `.zip` файлы
- Windows: `.exe` установщик и портабельная версия

## Auto-Update

Приложение автоматически проверяет обновления при запуске (только в production build).

### Настройка сервера обновлений

1. Настройте URL в `package.json`:
```json
"publish": {
  "provider": "generic",
  "url": "https://updates.your-domain.com"
}
```

2. После каждого релиза загружайте файлы на сервер:
- `*.dmg`, `*.exe` - установочные файлы
- `latest-mac.yml`, `latest.yml` - метаданные версий

## Code Signing

### macOS

Требуется Apple Developer Account ($99/год).

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
npm run dist
```

### Windows

Требуется Code Signing Certificate от CA.

```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password
npm run dist
```

## Структура проекта

```
client/
├── electron/           # Electron main process
│   ├── main.js        # Entry point, auto-updater
│   └── preload.js     # IPC bridge (безопасность)
├── src/               # React приложение
│   ├── components/    # UI компоненты
│   ├── hooks/         # React hooks (включая useAutoUpdater)
│   ├── services/      # API клиенты
│   ├── state/         # Zustand stores
│   └── styles/        # CSS файлы
├── public/            # Статические файлы
├── build/             # Production build (после npm run build)
├── dist/              # Electron distributables (после npm run dist)
├── .env               # Environment variables (не коммитить!)
├── .env.example       # Пример env файла
└── package.json       # Dependencies и build config
```

## Технологии

- **Electron** 25.9 - Desktop framework
- **React** 18.2 - UI framework
- **AG Grid** 31.0 - Таблица с Excel-подобным UX
- **Zustand** 5.0 - State management
- **Axios** - HTTP клиент
- **electron-updater** - Auto-update система
- **react-toastify** - Уведомления

## Полезные команды

```bash
# Development
npm start              # React dev server только
npm run electron-dev   # React + Electron в dev режиме

# Production
npm run build          # Собрать React app
npm run dist           # Собрать Electron дистрибутивы
npm run package        # Собрать для Mac + Windows

# Electron
npm run electron       # Запустить Electron с production build
```

## Переменные окружения

### Development (.env)
```env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_USERBOT_URL=http://localhost:5001
```

### Production (.env)
```env
REACT_APP_API_URL=https://api.your-domain.com/api
REACT_APP_USERBOT_URL=https://userbot.your-domain.com
```

## Backend Setup

Для работы клиента нужен запущенный backend:

```bash
cd ../backend
docker-compose up -d postgres backend
```

См. [DEPLOYMENT.md](../DEPLOYMENT.md) для production развёртывания.

## Troubleshooting

### Electron не запускается

```bash
# Очистите кеши
rm -rf node_modules package-lock.json
npm install
```

### Auto-update не работает

- Auto-update работает только в production build (`npm run dist`)
- В development режиме обновления отключены
- Проверьте `publish.url` в `package.json`

### "Cannot connect to API"

- Проверьте `REACT_APP_API_URL` в `.env`
- Убедитесь что backend запущен
- Проверьте CORS настройки на backend

## Документация

- [Deployment Guide](../DEPLOYMENT.md) - Развёртывание на production
- [CLAUDE.md](../CLAUDE.md) - Архитектура и паттерны
- [Electron Docs](https://www.electronjs.org/docs/latest/)
- [AG Grid Docs](https://www.ag-grid.com/react-data-grid/)

## License

ISC
