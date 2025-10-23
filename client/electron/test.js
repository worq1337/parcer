console.log('Starting test...');
try {
  const electron = require('electron');
  console.log('Electron loaded:', typeof electron);
  console.log('App:', typeof electron.app);
  console.log('BrowserWindow:', typeof electron.BrowserWindow);
} catch (error) {
  console.error('Error loading electron:', error.message);
}
