import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

/**
 * React Hook для управления auto-updater в Electron
 */
export const useAutoUpdater = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);

  useEffect(() => {
    // Проверяем, что мы в Electron
    if (!window.electron?.updates) {
      console.log('Auto-updater not available (not in Electron)');
      return;
    }

    const { updates } = window.electron;

    // Обработчик доступного обновления
    const handleUpdateAvailable = (info) => {
      console.log('Update available:', info);
      setUpdateInfo(info);
      setIsUpdateAvailable(true);

      toast.info(
        `Доступна новая версия ${info.version}. Нажмите здесь для загрузки.`,
        {
          onClick: () => downloadUpdate(),
          autoClose: false,
          closeOnClick: false,
        }
      );
    };

    // Обработчик отсутствия обновлений
    const handleUpdateNotAvailable = (info) => {
      console.log('Update not available:', info);
      setIsUpdateAvailable(false);
    };

    // Обработчик ошибки
    const handleUpdateError = (error) => {
      console.error('Update error:', error);
      toast.error(`Ошибка проверки обновлений: ${error.message}`);
      setIsDownloading(false);
    };

    // Обработчик прогресса загрузки
    const handleDownloadProgress = (progressObj) => {
      const percent = Math.round(progressObj.percent);
      setDownloadProgress(percent);
      console.log(`Download progress: ${percent}%`);
    };

    // Обработчик завершения загрузки
    const handleUpdateDownloaded = (info) => {
      console.log('Update downloaded:', info);
      setIsDownloading(false);
      setIsUpdateDownloaded(true);

      toast.success(
        `Обновление ${info.version} загружено. Перезапустите приложение для установки.`,
        {
          onClick: () => installUpdate(),
          autoClose: false,
          closeOnClick: false,
        }
      );
    };

    // Подписываемся на события
    updates.onUpdateAvailable(handleUpdateAvailable);
    updates.onUpdateNotAvailable(handleUpdateNotAvailable);
    updates.onUpdateError(handleUpdateError);
    updates.onDownloadProgress(handleDownloadProgress);
    updates.onUpdateDownloaded(handleUpdateDownloaded);

    // Отписываемся при размонтировании
    return () => {
      updates.removeAllListeners();
    };
  }, []);

  // Проверить обновления вручную
  const checkForUpdates = () => {
    if (window.electron?.updates) {
      window.electron.updates.check();
      toast.info('Проверка обновлений...');
    }
  };

  // Загрузить обновление
  const downloadUpdate = () => {
    if (window.electron?.updates && isUpdateAvailable) {
      setIsDownloading(true);
      window.electron.updates.download();
      toast.info('Загрузка обновления...');
    }
  };

  // Установить обновление (перезапустить приложение)
  const installUpdate = () => {
    if (window.electron?.updates && isUpdateDownloaded) {
      window.electron.updates.install();
    }
  };

  return {
    updateInfo,
    isUpdateAvailable,
    isDownloading,
    downloadProgress,
    isUpdateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
};

export default useAutoUpdater;
