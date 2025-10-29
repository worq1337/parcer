const { app, BrowserWindow, Menu, Notification, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;

if (process.env.ELECTRON_HW_ACCEL === 'off') {
  app.disableHardwareAcceleration();
}

// ============ Single Instance Lock ============
// Предотвращаем запуск нескольких копий приложения
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  // Другой экземпляр уже запущен, выходим
  app.quit();
} else {
  // Обработчик для случая, когда пользователь пытается запустить второй экземпляр
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Фокусируем существующее окно
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// ============ Auto-Updater Configuration ============
// Настройка auto-updater для проверки обновлений
autoUpdater.autoDownload = false; // Спрашивать перед скачиванием
autoUpdater.autoInstallOnAppQuit = true; // Автоматическая установка при выходе

// Логи auto-updater
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';

// patch-021: Настройка источника обновлений (GitHub Releases)
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'worq1337',
  repo: 'parcer',
});

ipcMain.handle('app:getMeta', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    build: process.env.BUILD_SHA || 'dev',
    builtAt: process.env.BUILD_DATE || new Date().toISOString()
  };
});

// ============ Windows App User Model ID ============
// Для правильного отображения в панели задач Windows
app.setAppUserModelId(process.env.APP_ID || 'com.parcer.app');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false, // Не показываем окно пока не загрузится контент
    icon: path.join(__dirname, '..', 'build', 'icon.ico'), // Иконка для Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js') // patch-017 §5
    },
    title: 'Парсер банковских чеков',
    backgroundColor: '#f5f5f5'
  });

  // Определяем URL для загрузки
  const isDev = !app.isPackaged;
  const startURL = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startURL);

  // Показываем окно когда контент загрузился
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Создаем меню
  const menuTemplate = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Обновить',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Выход',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить все' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' }
      ]
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'Проверить обновления',
          click: () => {
            if (!app.isPackaged) {
              const { dialog } = require('electron');
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Обновления',
                message: 'Проверка обновлений недоступна в режиме разработки',
                detail: 'Обновления работают только в собранной версии приложения.'
              });
              return;
            }
            autoUpdater.checkForUpdates();
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Проверка обновлений',
              message: 'Проверяем наличие обновлений...',
              detail: 'Вы получите уведомление, если доступна новая версия.'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'О программе',
          click: () => {
            const { dialog } = require('electron');
            const buildSha = (process.env.BUILD_SHA || '').toString();
            const shortSha = buildSha ? ` (${buildSha.slice(0, 7)})` : '';
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'О программе',
              message: 'Парсер банковских чеков',
              detail: `Версия ${app.getVersion()}${shortSha}\n\nСистема автоматического парсинга банковских транзакций из SMS и Telegram-уведомлений узбекских банков.`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Проверка обновлений через 3 секунды после запуска (только в production)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('render-process-gone', (event, webContents, details) => {
  console.error('[renderer gone]', details);
  if (details.reason === 'crashed' || details.reason === 'oom' || details.reason === 'abnormal-exit') {
    try {
      webContents.reloadIgnoringCache();
    } catch (error) {
      console.error('Failed to reload crashed renderer', error);
    }
  }
});

app.on('child-process-gone', (event, details) => {
  console.warn('[child gone]', details);
});

// ============ patch-017 §5: Notifications IPC Handlers ============

// Показать OS-уведомление
ipcMain.on('show-notification', (event, { title, body, data }) => {
  if (!Notification.isSupported()) {
    console.warn('Notifications are not supported on this system');
    return;
  }

  const notification = new Notification({
    title,
    body,
    silent: false,
    urgency: 'normal'
  });

  notification.on('click', () => {
    // Фокус на главное окно
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();

      // Отправить событие клика обратно в renderer
      mainWindow.webContents.send('notification-clicked', data);
    }
  });

  notification.show();
});

// Навигация в определённый view/tab
ipcMain.on('navigate-to', (event, { view, tab }) => {
  if (mainWindow) {
    // Отправить команду навигации в renderer
    mainWindow.webContents.send('navigate-to', { view, tab });
  }
});

// ============ Auto-Updater Event Handlers ============

// Проверка обновлений
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { type: 'checking' });
  }
});

// Обновление доступно
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

// Обновления нет
autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info);
  }
});

// Ошибка при проверке
autoUpdater.on('error', (err) => {
  // Игнорируем ошибки 404 (нет файлов обновлений в релизе)
  const is404Error = err.message && (
    err.message.includes('404') ||
    err.message.includes('Cannot find latest.yml') ||
    err.message.includes('HttpError: 404')
  );

  if (is404Error) {
    console.log('Update files not found in latest release (expected for Android-only releases)');
    return;
  }

  console.error('Update error:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', { message: err.message });
  }
});

// Прогресс загрузки
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

// Обновление загружено
autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

// IPC обработчики для управления обновлениями из renderer
ipcMain.on('check-for-updates', () => {
  if (!app.isPackaged) {
    console.log('Updates disabled in development mode');
    return;
  }
  autoUpdater.checkForUpdates();
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
