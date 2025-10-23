import React from 'react';
import '../styles/UpdateBanner.css';

/**
 * patch-021: UpdateBanner - Баннер уведомлений об обновлениях
 * Показывает состояние обновления приложения:
 * - Доступно обновление → кнопка "Скачать"
 * - Скачивается → прогресс-бар
 * - Скачано → кнопка "Перезапустить"
 */
const UpdateBanner = ({
  updateInfo,
  isUpdateAvailable,
  isDownloading,
  downloadProgress,
  isUpdateDownloaded,
  onDownload,
  onInstall,
  onDismiss
}) => {
  // Не показывать баннер если обновление недоступно
  if (!isUpdateAvailable && !isDownloading && !isUpdateDownloaded) {
    return null;
  }

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        {/* Иконка */}
        <div className="update-banner-icon">
          {isUpdateDownloaded ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" fill="currentColor"/>
            </svg>
          )}
        </div>

        {/* Текст */}
        <div className="update-banner-text">
          <div className="update-banner-title">
            {isUpdateDownloaded
              ? 'Обновление готово к установке'
              : isDownloading
              ? 'Загрузка обновления...'
              : 'Доступно обновление'}
          </div>
          <div className="update-banner-subtitle">
            {isUpdateDownloaded
              ? `Версия ${updateInfo?.version || 'N/A'} загружена. Перезапустите приложение для установки.`
              : isDownloading
              ? `Загружено: ${downloadProgress}%`
              : `Новая версия ${updateInfo?.version || 'N/A'} доступна для загрузки.`}
          </div>

          {/* Прогресс-бар при скачивании */}
          {isDownloading && (
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="update-banner-actions">
          {isUpdateDownloaded ? (
            <>
              <button
                className="update-btn update-btn-primary"
                onClick={onInstall}
              >
                Перезапустить
              </button>
              <button
                className="update-btn update-btn-secondary"
                onClick={onDismiss}
              >
                Позже
              </button>
            </>
          ) : isDownloading ? (
            <div className="update-spinner">
              <div className="spinner-circle" />
            </div>
          ) : (
            <>
              <button
                className="update-btn update-btn-primary"
                onClick={onDownload}
              >
                Скачать
              </button>
              <button
                className="update-btn update-btn-secondary"
                onClick={onDismiss}
              >
                Позже
              </button>
            </>
          )}
        </div>

        {/* Кнопка закрыть (X) */}
        {!isDownloading && (
          <button
            className="update-banner-close"
            onClick={onDismiss}
            aria-label="Закрыть"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default UpdateBanner;
