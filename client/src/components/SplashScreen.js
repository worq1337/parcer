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
  const [appMeta, setAppMeta] = useState({ version: '1.0.0', build: '' });

  useEffect(() => {
    checkCompatibility();
  }, []);

  const checkCompatibility = async () => {
    try {
      let meta = null;
      try {
        meta = window.appInfo?.getMeta ? await window.appInfo.getMeta() : null;
      } catch (metaError) {
        console.error('Ошибка получения метаданных приложения:', metaError);
      }
      if (meta) {
        setAppMeta({
          version: meta.version || '1.0.0',
          build: meta.build || ''
        });
      }

      const appVersion = meta?.version || '1.0.0';

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
        {/* Логотип */}
        <div className="splash-logo">
          <div className="logo-icon">₽</div>
        </div>

        {/* Спиннер */}
        <div className="splash-spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>

        {/* Текст */}
        <div className="splash-text">
          <div className="splash-title">Receipt Parser</div>
          <div className="splash-subtitle">
            {status === 'checking' && 'Проверка версии...'}
            {status === 'compatible' && `Версия ${appMeta.version} актуальна`}
            {status === 'incompatible' && compatInfo?.message}
            {status === 'error' && errorMessage}
          </div>
        </div>

        {/* Кнопки для несовместимой версии */}
        {status === 'incompatible' && (
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
        )}

        {/* Прогресс-бар */}
        <div className="splash-progress">
          <div className="splash-progress-bar"></div>
        </div>

        {/* Версия приложения */}
        <div className="splash-version">
          v{appMeta.version}{appMeta.build ? ` (${appMeta.build.slice(0, 7)})` : ''}
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
