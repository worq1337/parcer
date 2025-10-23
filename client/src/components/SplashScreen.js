import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/SplashScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

/**
 * patch-021: SplashScreen - Сплэш-экран с проверкой совместимости
 * Показывается при запуске приложения, проверяет /api/compat
 * Блокирует запуск если версия устарела (required=true)
 */
const SplashScreen = ({ onReady }) => {
  const [status, setStatus] = useState('checking'); // checking, compatible, incompatible, error
  const [compatInfo, setCompatInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    checkCompatibility();
  }, []);

  const checkCompatibility = async () => {
    try {
      // Получаем версию приложения
      const appVersion = window.electron?.appVersion || '1.0.0';

      // Проверяем совместимость с сервером
      const response = await axios.get(`${API_URL}/compat`, {
        params: { version: appVersion },
        timeout: 5000
      });

      const data = response.data;
      setCompatInfo(data);

      if (data.compatible) {
        // Версия совместима
        setStatus('compatible');

        // Автоматически скрыть сплэш через 2 секунды
        setTimeout(() => {
          onReady();
        }, 2000);
      } else {
        // Версия несовместима
        setStatus('incompatible');

        // Если обновление не обязательное, всё равно пропустить через 5 секунд
        if (!data.required) {
          setTimeout(() => {
            onReady();
          }, 5000);
        }
        // Если required=true, блокируем навсегда (кнопка "Обновить" обязательна)
      }
    } catch (error) {
      console.error('Ошибка проверки совместимости:', error);
      setStatus('error');
      setErrorMessage(
        error.response?.data?.error ||
        'Не удалось подключиться к серверу. Проверьте интернет-соединение.'
      );

      // При ошибке подключения всё равно пропустить через 3 секунды
      setTimeout(() => {
        onReady();
      }, 3000);
    }
  };

  // Обработчик кнопки "Обновить сейчас"
  const handleUpdateNow = () => {
    if (window.electron?.updates) {
      window.electron.updates.check();
      // Скрываем сплэш, чтобы пользователь мог видеть UpdateBanner
      onReady();
    } else {
      // В браузере - открыть страницу загрузки
      window.open('https://github.com/asintiko/receipt-parser/releases', '_blank');
    }
  };

  // Обработчик кнопки "Продолжить без обновления" (только если !required)
  const handleContinue = () => {
    onReady();
  };

  return (
    <div className="splash-screen">
      <div className="splash-content">
        {/* Логотип/Иконка */}
        <div className="splash-logo">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect width="80" height="80" rx="16" fill="url(#gradient)"/>
            <path
              d="M25 35L35 45L55 25"
              stroke="white"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="80" y2="80">
                <stop offset="0%" stopColor="#667eea"/>
                <stop offset="100%" stopColor="#764ba2"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Название приложения */}
        <h1 className="splash-title">Receipt Parser</h1>

        {/* Статус проверки */}
        {status === 'checking' && (
          <div className="splash-status">
            <div className="splash-spinner" />
            <p>Проверка версии...</p>
          </div>
        )}

        {status === 'compatible' && (
          <div className="splash-status splash-status-success">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="#4caf50"/>
            </svg>
            <p className="text-success">
              {compatInfo?.updateAvailable
                ? `Версия ${compatInfo?.currentVersion}. Доступно обновление ${compatInfo?.recommendedVersion}.`
                : `Версия ${compatInfo?.currentVersion} актуальна.`}
            </p>
          </div>
        )}

        {status === 'incompatible' && (
          <div className="splash-status splash-status-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 20h20L12 2zm0 5.5l6 11H6l6-11z" fill="#ff9800"/>
              <path d="M11 10h2v5h-2zm0 6h2v2h-2z" fill="white"/>
            </svg>
            <div>
              <p className="text-warning">{compatInfo?.message}</p>
              {compatInfo?.required && (
                <p className="text-muted">
                  Для продолжения работы необходимо обновить приложение.
                </p>
              )}
            </div>

            <div className="splash-buttons">
              <button className="splash-btn splash-btn-primary" onClick={handleUpdateNow}>
                Обновить сейчас
              </button>
              {!compatInfo?.required && (
                <button className="splash-btn splash-btn-secondary" onClick={handleContinue}>
                  Продолжить без обновления
                </button>
              )}
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="splash-status splash-status-error">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#f44336"/>
              <path d="M15 9l-6 6m0-6l6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-error">{errorMessage}</p>
            <p className="text-muted">Продолжение через несколько секунд...</p>
          </div>
        )}

        {/* Версия приложения */}
        <div className="splash-version">
          Версия {window.electron?.appVersion || '1.0.0'}
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
