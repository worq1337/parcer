const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  win.loadFile('test.html');
});

app.on('window-all-closed', () => {
  app.quit();
});
