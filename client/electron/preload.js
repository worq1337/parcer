/**
 * patch-017 §5: Electron Preload Script
 * Expose safe APIs to renderer process for notifications and IPC
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Platform info
  platform: process.platform,

  // patch-021: App version (hardcoded to avoid asar issues)
  appVersion: '1.0.5',

  // patch-017 §5: Notifications API
  notifications: {
    // Show OS notification
    show: (title, body, data) => {
      ipcRenderer.send('show-notification', { title, body, data });
    },

    // Listen for notification clicks
    onClick: (callback) => {
      ipcRenderer.on('notification-clicked', (event, data) => {
        callback(data);
      });
    },

    // Remove click listener
    removeClickListener: () => {
      ipcRenderer.removeAllListeners('notification-clicked');
    }
  },

  // Navigation
  navigateTo: (view, tab) => {
    ipcRenderer.send('navigate-to', { view, tab });
  },

  // Auto-updater API
  updates: {
    // Check for updates
    check: () => {
      ipcRenderer.send('check-for-updates');
    },

    // Download update
    download: () => {
      ipcRenderer.send('download-update');
    },

    // Install downloaded update
    install: () => {
      ipcRenderer.send('install-update');
    },

    // Listen for update events
    onUpdateAvailable: (callback) => {
      ipcRenderer.on('update-available', (event, info) => {
        callback(info);
      });
    },

    onUpdateNotAvailable: (callback) => {
      ipcRenderer.on('update-not-available', (event, info) => {
        callback(info);
      });
    },

    onUpdateError: (callback) => {
      ipcRenderer.on('update-error', (event, error) => {
        callback(error);
      });
    },

    onDownloadProgress: (callback) => {
      ipcRenderer.on('update-download-progress', (event, progressObj) => {
        callback(progressObj);
      });
    },

    onUpdateDownloaded: (callback) => {
      ipcRenderer.on('update-downloaded', (event, info) => {
        callback(info);
      });
    },

    onUpdateStatus: (callback) => {
      ipcRenderer.on('update-status', (event, status) => {
        callback(status);
      });
    },

    // Remove listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('update-available');
      ipcRenderer.removeAllListeners('update-not-available');
      ipcRenderer.removeAllListeners('update-error');
      ipcRenderer.removeAllListeners('update-download-progress');
      ipcRenderer.removeAllListeners('update-downloaded');
      ipcRenderer.removeAllListeners('update-status');
    }
  }
});
