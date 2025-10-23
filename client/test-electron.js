console.log('Starting minimal electron test...');

try {
  const electron = require('electron');
  console.log('Electron type:', typeof electron);

  if (typeof electron === 'object') {
    console.log('SUCCESS: Electron loaded as object');
    console.log('Available properties:', Object.keys(electron));

    const { app } = electron;
    if (app) {
      console.log('app is available');
      app.whenReady().then(() => {
        console.log('Electron is ready!');
        app.quit();
      });
    } else {
      console.log('ERROR: app is undefined');
    }
  } else {
    console.log('ERROR: Electron loaded as:', electron);
  }
} catch (error) {
  console.error('Error:', error.message);
}
