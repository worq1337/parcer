import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Icon from './icons/Icon';
import UserbotChatLayout from './UserbotChat/UserbotChatLayout';
import '../styles/Userbot.css';
import { userbotAPI } from '../services/api';

/**
 * Telegram Userbot управление
 * patch-017 §4: UI для логина, мониторинга и управления userbot
 * v1.0.9: Added chat functionality for bot messages
 */
const Userbot = ({ onClose }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loginStep, setLoginStep] = useState('phone'); // phone, code, password, authorized
  const [activeTab, setActiveTab] = useState('control'); // control, chat
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [monitoredBots] = useState([
    { id: 915326936, name: 'CardXabar', username: '@CardXabarBot' },
    { id: 856264490, name: 'ID:856264490', username: '(недоступен)' },
    { id: 7028509569, name: 'NBU Card', username: '@NBUCard_bot' }
  ]);

  // Загрузка статуса при монтировании
  useEffect(() => {
    loadStatus();
    // Автообновление статуса каждые 15 секунд (увеличено с 5 для стабильности)
    // Но НЕ обновляем если пользователь в процессе авторизации
    const interval = setInterval(() => {
      // Не обновлять статус если пользователь вводит код или пароль
      if (loginStep !== 'code' && loginStep !== 'password') {
        loadStatus();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [loginStep]); // Зависимость от loginStep для корректной проверки

  // ESC для закрытия
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const loadStatus = async () => {
    try {
      const data = await userbotAPI.getStatus();
      setStatus(data);

      // Определить текущий шаг логина
      // ВАЖНО: Не сбрасывать loginStep если пользователь в процессе авторизации
      if (data.authorized) {
        setLoginStep('authorized');
      } else if (loginStep === 'phone' || loginStep === 'authorized') {
        // Обновляем loginStep только если на начальном шаге или был авторизован
        setLoginStep('phone');
      }
      // Если loginStep = 'code' или 'password', НЕ меняем его
    } catch (error) {
      console.error('Error loading userbot status:', error);
      // Не показываем тост при каждой ошибке, только при первой загрузке
      if (!status) {
        toast.error('Не удалось подключиться к userbot сервису');
      }
    }
  };

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await userbotAPI.login(phoneNumber);

      if (result.success) {
        if (result.status === 'code_sent') {
          setLoginStep('code');
          toast.success('Код отправлен на ' + phoneNumber);
        } else if (result.status === 'already_authorized') {
          toast.success('Уже авторизован');
          await loadStatus();
        }
      } else {
        toast.error(result.error || 'Ошибка отправки кода');
      }
    } catch (error) {
      console.error('Phone submit error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await userbotAPI.login(phoneNumber, code);

      if (result.success) {
        if (result.status === 'authorized') {
          toast.success('Успешно авторизован!');
          await loadStatus();
          setCode('');
        }
      } else if (result.status === 'password_required') {
        setLoginStep('password');
        toast.info('Требуется 2FA пароль');
      } else {
        toast.error(result.error || 'Неверный код');
      }
    } catch (error) {
      console.error('Code submit error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await userbotAPI.login(phoneNumber, code, password);

      if (result.success && result.status === 'authorized') {
        toast.success('Успешно авторизован!');
        await loadStatus();
        setPassword('');
      } else {
        toast.error(result.error || 'Неверный пароль');
      }
    } catch (error) {
      console.error('Password submit error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await userbotAPI.start();

      if (result.success) {
        toast.success(result.message || 'Userbot запущен');
        await loadStatus();
      } else {
        toast.error(result.error || 'Ошибка запуска');
      }
    } catch (error) {
      console.error('Start error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const result = await userbotAPI.stop();

      if (result.success) {
        toast.success(result.message || 'Userbot остановлен');
        await loadStatus();
      } else {
        toast.error(result.error || 'Ошибка остановки');
      }
    } catch (error) {
      console.error('Stop error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm('Выйти из аккаунта? Session будет удалена, потребуется новый логин.')) {
      return;
    }

    setLoading(true);
    try {
      const result = await userbotAPI.logout();

      if (result.success) {
        toast.success(result.message || 'Session удалена');
        setLoginStep('phone');
        setPhoneNumber('');
        setCode('');
        setPassword('');
        await loadStatus();
      } else {
        toast.error(result.error || 'Ошибка при выходе');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Ошибка подключения к userbot сервису');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) {
      return <span className="status-badge offline">Отключен</span>;
    }

    if (!status.authorized) {
      return <span className="status-badge warning">Не авторизован</span>;
    }

    if (status.running) {
      return <span className="status-badge online">Запущен</span>;
    }

    return <span className="status-badge stopped">Остановлен</span>;
  };

  return (
    <div className="userbot-container">
      <div className="userbot-header">
        <div className="header-title-section">
          <h2>Telegram Userbot</h2>
          <p className="header-subtitle">
            Автоматическая пересылка сообщений от банковских ботов
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', marginRight: '12px' }}>
            <button
              className={`btn btn-sm ${activeTab === 'control' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('control')}
            >
              <Icon name="settings" size={18} />
              Управление
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('chat')}
            >
              <Icon name="chat" size={18} />
              Чат с ботами
            </button>
          </div>
          {getStatusBadge()}
        </div>
      </div>

      {activeTab === 'chat' ? (
        <UserbotChatLayout />
      ) : (
        <div className="userbot-content">
        {/* Левая панель: Логин/Статус */}
        <div className="userbot-section userbot-login-section">
          <h3>
            <Icon name="account_circle" size={24} />
            Авторизация
          </h3>

          {loginStep === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="login-form">
              <div className="form-group">
                <label>Номер телефона</label>
                <input
                  type="tel"
                  placeholder="+998901234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={loading}
                  required
                  pattern="^\+?[0-9]{10,15}$"
                  className="form-input"
                />
                <div className="form-hint">
                  Формат: +998901234567
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Отправка...' : 'Отправить код'}
              </button>
            </form>
          )}

          {loginStep === 'code' && (
            <form onSubmit={handleCodeSubmit} className="login-form">
              <div className="form-group">
                <label>Код из Telegram</label>
                <input
                  type="text"
                  placeholder="12345"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={loading}
                  required
                  className="form-input"
                  autoFocus
                />
                <div className="form-hint">
                  Проверьте сообщения от Telegram
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setLoginStep('phone');
                    setCode('');
                  }}
                  disabled={loading}
                >
                  Назад
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Проверка...' : 'Подтвердить'}
                </button>
              </div>
            </form>
          )}

          {loginStep === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="login-form">
              <div className="form-group">
                <label>2FA Пароль</label>
                <input
                  type="password"
                  placeholder="Ваш облачный пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="form-input"
                  autoFocus
                />
                <div className="form-hint">
                  Двухфакторная аутентификация включена
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setLoginStep('code');
                    setPassword('');
                  }}
                  disabled={loading}
                >
                  Назад
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Проверка...' : 'Войти'}
                </button>
              </div>
            </form>
          )}

          {loginStep === 'authorized' && status?.user && (
            <div className="user-info">
              <div className="user-avatar">
                <Icon name="account_circle" size={64} />
              </div>
              <div className="user-details">
                <h4>{status.user.first_name} {status.user.last_name || ''}</h4>
                {status.user.username && (
                  <p className="user-username">@{status.user.username}</p>
                )}
                <p className="user-phone">{status.user.phone}</p>
                <p className="user-id">ID: {status.user.id}</p>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleLogout}
                disabled={loading}
              >
                Выйти из аккаунта
              </button>
            </div>
          )}
        </div>

        {/* Правая панель: Управление и мониторинг */}
        <div className="userbot-section userbot-control-section">
          <h3>
            <Icon name="settings" size={24} />
            Управление
          </h3>

          {status?.authorized ? (
            <div className="control-panel">
              <div className="control-group">
                <label>Статус мониторинга</label>
                <div className="toggle-control">
                  <button
                    className={`btn ${status.running ? 'btn-success' : 'btn-primary'}`}
                    onClick={status.running ? handleStop : handleStart}
                    disabled={loading}
                  >
                    {loading ? (
                      'Загрузка...'
                    ) : status.running ? (
                      <>
                        <Icon name="stop" size={20} />
                        Остановить
                      </>
                    ) : (
                      <>
                        <Icon name="play_arrow" size={20} />
                        Запустить
                      </>
                    )}
                  </button>
                </div>
                <div className="form-hint">
                  {status.running
                    ? 'Userbot активно мониторит сообщения от ботов'
                    : 'Мониторинг остановлен'}
                </div>
              </div>

              <div className="monitored-bots">
                <h4>Мониторимые боты ({monitoredBots.length})</h4>
                <div className="bots-list">
                  {monitoredBots.map((bot) => (
                    <div key={bot.id} className="bot-item">
                      <div className="bot-info">
                        <Icon name="smart_toy" size={20} />
                        <div>
                          <div className="bot-name">{bot.name}</div>
                          <div className="bot-username">{bot.username}</div>
                        </div>
                      </div>
                      <div className="bot-id">ID: {bot.id}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="info-box">
                <Icon name="info" size={20} />
                <div>
                  <strong>Как это работает:</strong>
                  <p>
                    Userbot подключается к вашему Telegram аккаунту и отслеживает сообщения
                    от указанных ботов. Когда приходит новое уведомление о транзакции,
                    оно автоматически пересылается в парсер-бот для обработки.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="not-authorized-message">
              <Icon name="lock" size={48} />
              <p>Требуется авторизация для управления userbot</p>
              <p className="hint">Введите номер телефона для начала</p>
            </div>
          )}
        </div>
      </div>
      )}

      <div className="userbot-footer">
        <button className="btn btn-secondary" onClick={onClose}>
          <Icon name="close" size={20} />
          Закрыть
        </button>
      </div>
    </div>
  );
};

export default Userbot;
