import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import Icon from './icons/Icon';
import AppVersionBadge from './AppVersionBadge';
import QueueRow from './QueueRow';
import '../styles/Admin.css';
import { adminAPI } from '../services/api';
import { useQueueStream } from '../hooks/useQueueStream'; // patch-016 §7

// patch-010 §5: Троттлинг тостов (не чаще 1 раза в 5 сек для каждого типа ошибки)
const createToastThrottler = () => {
  const lastShown = {};
  const THROTTLE_MS = 5000;

  return (key, message, type = 'error') => {
    const now = Date.now();
    if (!lastShown[key] || now - lastShown[key] > THROTTLE_MS) {
      lastShown[key] = now;
      toast[type](message);
      return true;
    }
    return false;
  };
};

/**
 * Экран администрирования
 * patch-008 §12: Контроль конвейера парсинга и состояния системы
 * patch-009: Потоки/Очередь с таймлайном событий
 * patch-016 §6: ESC для закрытия
 */
const Admin = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState('system'); // system, queue, backups (убрана вкладка checks)
  const [systemStatus, setSystemStatus] = useState(null);
  const [queueChecks, setQueueChecks] = useState([]);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false); // patch-016 §7: Переключатель real-time
  const [duplicatesPreview, setDuplicatesPreview] = useState([]);
  const [duplicatesTotal, setDuplicatesTotal] = useState(0);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [duplicatesCleaning, setDuplicatesCleaning] = useState(false);

  // patch-023: Update checker state
  const [updateStatus, setUpdateStatus] = useState({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    info: null,
    progress: null
  });

  // patch-010 §5: Троттлер для тостов
  const showToastThrottled = useRef(createToastThrottler()).current;

  // patch-016 §7: SSE подключение для real-time обновлений очереди
  const handleQueueEvent = useRef((event) => {
    console.log('[Admin] Queue event received:', event);

    // Обновляем список очереди при получении события
    switch (event.type) {
      case 'check_received':
      case 'check_parsed':
      case 'check_saved':
      case 'duplicate_detected':
      case 'check_failed':
        // Перезагружаем очередь, чтобы показать обновления
        loadQueue();
        // Показываем тост только для важных событий
        if (event.type === 'check_saved') {
          toast.success(`✓ Чек сохранён: ${event.check_id || 'unknown'}`, { autoClose: 2000 });
        } else if (event.type === 'duplicate_detected') {
          toast.warning(`⚠ Дубликат обнаружен: ${event.check_id || 'unknown'}`, { autoClose: 3000 });
        } else if (event.type === 'check_failed') {
          toast.error(`✗ Ошибка обработки: ${event.error || 'unknown'}`, { autoClose: 4000 });
        }
        break;
      default:
        break;
    }
  }).current;

  const { connected: sseConnected, error: sseError, reconnect: sseReconnect } = useQueueStream(
    realtimeEnabled && activeTab === 'queue',
    handleQueueEvent
  );

  // patch-016 §6: Обработка ESC для закрытия
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // patch-023: Subscribe to update events
  useEffect(() => {
    if (!window.electron || !window.electron.updates) return;

    const {updates} = window.electron;

    // Создаем именованные обработчики
    const handleUpdateStatus = (status) => {
      setUpdateStatus(prev => ({ ...prev, checking: status.type === 'checking' }));
    };

    const handleUpdateAvailable = (info) => {
      setUpdateStatus(prev => ({
        ...prev,
        checking: false,
        available: true,
        info,
        error: null
      }));
      toast.info(`Доступна новая версия: ${info.version}`);
    };

    const handleUpdateNotAvailable = () => {
      setUpdateStatus(prev => ({
        ...prev,
        checking: false,
        available: false,
        error: null
      }));
      toast.success('У вас установлена последняя версия');
    };

    const handleUpdateError = (error) => {
      setUpdateStatus(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        error: error.message
      }));
      toast.error(`Ошибка обновления: ${error.message}`);
    };

    const handleDownloadProgress = (progress) => {
      setUpdateStatus(prev => ({
        ...prev,
        progress
      }));
    };

    const handleUpdateDownloaded = (info) => {
      setUpdateStatus(prev => ({
        ...prev,
        downloading: false,
        downloaded: true,
        info
      }));
      toast.success('Обновление загружено! Перезапустите приложение для установки.');
    };

    // Подписываемся на события
    updates.onUpdateStatus(handleUpdateStatus);
    updates.onUpdateAvailable(handleUpdateAvailable);
    updates.onUpdateNotAvailable(handleUpdateNotAvailable);
    updates.onUpdateError(handleUpdateError);
    updates.onDownloadProgress(handleDownloadProgress);
    updates.onUpdateDownloaded(handleUpdateDownloaded);

    // Отписываемся при размонтировании - удаляем только наши обработчики
    return () => {
      if (updates.removeListener) {
        updates.removeListener('update-status', handleUpdateStatus);
        updates.removeListener('update-available', handleUpdateAvailable);
        updates.removeListener('update-not-available', handleUpdateNotAvailable);
        updates.removeListener('update-error', handleUpdateError);
        updates.removeListener('update-download-progress', handleDownloadProgress);
        updates.removeListener('update-downloaded', handleUpdateDownloaded);
      }
    };
  }, []);

  // patch-023: Update handlers
  const handleCheckForUpdates = () => {
    if (!window.electron || !window.electron.updates) {
      toast.warning('Проверка обновлений доступна только в Electron');
      return;
    }
    setUpdateStatus(prev => ({ ...prev, checking: true, error: null }));
    window.electron.updates.check();
  };

  const handleDownloadUpdate = () => {
    if (!window.electron || !window.electron.updates) return;
    setUpdateStatus(prev => ({ ...prev, downloading: true }));
    window.electron.updates.download();
    toast.info('Начинается загрузка обновления...');
  };

  const handleInstallUpdate = () => {
    if (!window.electron || !window.electron.updates) return;
    window.electron.updates.install();
  };

  // Фильтры для очереди (patch-009)
  const [queueFilters, setQueueFilters] = useState({
    only_errors: false,
    source: 'all', // all, telegram, sms, manual
    period: '24h', // 1h, 6h, 24h, 7d, 30d, custom
    search: '', // поиск по check_id, карте, оператору
  });

  // Загрузка данных системы
  const loadSystemStatus = async () => {
    setLoading(true);
    try {
      // TODO: Заменить на реальный API когда бекэнд будет готов
      // Пока используем заглушку для демонстрации UI
      await new Promise(resolve => setTimeout(resolve, 500)); // Имитация задержки

      setSystemStatus({
        backend: { status: 'online', version: '1.0.0', commit: 'abc123f' },
        database: { status: 'connected', version: 'PostgreSQL 14.5' },
        telegram: { status: 'online', connected: true },
        queue: { length: 0, processing: 0 },
        parser: { provider: 'OpenAI', model: 'gpt-4', quota: '90%' },
      });
    } catch (error) {
      console.error('Error loading system status:', error);
      showToastThrottled('system-status-error', 'Ошибка загрузки статуса системы', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Загрузка очереди чеков (patch-009)
  const loadQueue = async () => {
    setLoading(true);
    try {
      // Вычислить период
      const now = new Date();
      let from = null;
      switch (queueFilters.period) {
        case '1h':
          from = new Date(now - 60 * 60 * 1000);
          break;
        case '6h':
          from = new Date(now - 6 * 60 * 60 * 1000);
          break;
        case '24h':
          from = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          from = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          from = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          from = null;
      }

      const requestFilters = {
        only_errors: queueFilters.only_errors,
        source: queueFilters.source,
        limit: 200,
        offset: 0,
      };

      if (from) {
        requestFilters.from = from.toISOString();
      }

      if (queueFilters.search) {
        requestFilters.q = queueFilters.search;
      }

      const data = await adminAPI.getQueue(requestFilters);

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to load queue');
      }

      setQueueChecks(data.rows || []);
    } catch (error) {
      console.error('Error loading queue:', error);
      // patch-010 §5: Троттлинг ошибок (не чаще 1 раза в 5 сек)
      showToastThrottled('queue-load-error', 'Ошибка загрузки очереди', 'error');
      setQueueChecks([]);
    } finally {
      setLoading(false);
    }
  };

  // Повторная обработка чека (patch-009)
  const handleRequeue = async (checkId) => {
    try {
      const data = await adminAPI.requeueCheck(checkId);

      if (!data?.success) {
        throw new Error(data?.error || 'Requeue failed');
      }

      toast.success('Чек отправлен на повторную обработку');
      // Перезагрузить очередь через 1 секунду
      setTimeout(loadQueue, 1000);
    } catch (error) {
      console.error('Error requeuing check:', error);
      showToastThrottled('requeue-error', 'Ошибка повторной обработки', 'error');
    }
  };

  // Открыть чек в основной таблице
  const handleOpenCheck = (checkId) => {
    // TODO: Переключиться на основной экран с чеками и найти этот чек
    toast.info(`Открыть чек ${checkId.substring(0, 8)} - в разработке`);
  };

  // Загрузка резервных копий
  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await adminAPI.getBackups();

      if (data.success) {
        setBackups(data.backups.map(b => ({
          ...b,
          size: formatFileSize(b.file_size)
        })));
      } else {
        throw new Error(data.error || 'Failed to load backups');
      }
    } catch (error) {
      console.error('Error loading backups:', error);
      showToastThrottled('backups-load-error', 'Ошибка загрузки резервных копий', 'error');
      setBackups([]);
    } finally {
      setLoading(false);
    }
  };

  // Создание резервной копии
  const handleCreateBackup = async () => {
    try {
      showToastThrottled('backup-create-info', 'Создание резервной копии...', 'info');
      setLoading(true);

      const data = await adminAPI.createBackup();

      if (data.success) {
        showToastThrottled('backup-create-success', 'Резервная копия создана', 'success');
        loadBackups(); // Перезагружаем список
      } else {
        throw new Error(data.error || 'Failed to create backup');
      }
    } catch (error) {
      console.error('Backup error:', error);
      showToastThrottled('backup-create-error', `Ошибка резервного копирования: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Форматирование размера файла
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDateTime = (value) => {
    if (!value) return '';
    try {
      const date = new Date(value);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return String(value);
    }
  };

  const loadDuplicatesPreview = async () => {
    setDuplicatesLoading(true);
    try {
      const data = await adminAPI.getDuplicates();
      if (data.success) {
        const totalFromApi = data.total || (data.duplicates?.[0]?.total_duplicates ?? 0);
        setDuplicatesPreview(data.duplicates || []);
        setDuplicatesTotal(totalFromApi);
        toast.info(`Найдено дубликатов: ${totalFromApi}`);
      } else {
        throw new Error(data.error || 'Не удалось получить дубликаты');
      }
    } catch (error) {
      console.error('Error loading duplicates:', error);
      showToastThrottled('duplicates-load-error', 'Ошибка загрузки дубликатов', 'error');
      setDuplicatesPreview([]);
      setDuplicatesTotal(0);
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const handleCleanDuplicates = async () => {
    if (duplicatesCleaning) return;
    const total = duplicatesTotal || duplicatesPreview.length;
    if (!total) {
      toast.info('Дубликаты не найдены');
      return;
    }

    const confirmed = window.confirm(
      `Очистить дубликаты? Будут удалены копии, оставляя по одному экземпляру. Найдено: ${total}.`
    );
    if (!confirmed) return;

    setDuplicatesCleaning(true);
    try {
      const data = await adminAPI.cleanDuplicates();
      if (data.success) {
        toast.success(`Удалено дубликатов: ${data.deleted || 0}`);
        await loadDuplicatesPreview();
      } else {
        throw new Error(data.error || 'Не удалось очистить дубликаты');
      }
    } catch (error) {
      console.error('Error cleaning duplicates:', error);
      showToastThrottled('duplicates-clean-error', 'Ошибка очистки дубликатов', 'error');
    } finally {
      setDuplicatesCleaning(false);
    }
  };

  // Загрузка данных при смене вкладки
  useEffect(() => {
    switch (activeTab) {
      case 'system':
        loadSystemStatus();
        break;
      case 'queue':
        loadQueue();
        break;
      case 'backups':
        loadBackups();
        break;
      default:
        break;
    }
  }, [activeTab, queueFilters]);

  // Статусный бейдж
  const StatusBadge = ({ status }) => {
    const statusMap = {
      online: { text: 'Онлайн', color: 'green' },
      connected: { text: 'Подключено', color: 'green' },
      offline: { text: 'Офлайн', color: 'red' },
      error: { text: 'Ошибка', color: 'red' },
      warning: { text: 'Предупреждение', color: 'orange' },
    };

    const info = statusMap[status] || { text: status, color: 'gray' };

    return (
      <span className={`status-badge status-${info.color}`}>{info.text}</span>
    );
  };

  const dedupTotal = duplicatesTotal || (duplicatesPreview?.length ?? 0);
  const duplicatesPreviewRows = Array.isArray(duplicatesPreview)
    ? duplicatesPreview.slice(0, 15)
    : [];

  return (
    <div className="admin-container">
      {/* Заголовок */}
      <div className="admin-header">
        <h2>Администрирование</h2>
        <button className="btn-close" onClick={onClose}>
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* Вкладки */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          <Icon name="settings" size={18} />
          <span>Система</span>
        </button>
        <button
          className={`admin-tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Icon name="list" size={18} />
          <span>Потоки/Очередь</span>
        </button>
        <button
          className={`admin-tab ${activeTab === 'backups' ? 'active' : ''}`}
          onClick={() => setActiveTab('backups')}
        >
          <Icon name="backup" size={18} />
          <span>Резервные копии</span>
        </button>
      </div>

      {/* Контент вкладок */}
      <div className="admin-content">
        {loading && (
          <div className="admin-loading">
            <Icon name="refresh" size={24} />
            <span>Загрузка...</span>
          </div>
        )}

        {/* Вкладка: Система */}
        {activeTab === 'system' && systemStatus && (
          <div className="tab-system">
            <div className="system-grid">
              {/* Бекэнд */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="cloud" size={20} />
                  <h3>Бекэнд</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">Статус:</span>
                    <StatusBadge status={systemStatus.backend.status} />
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Версия:</span>
                    <span>{systemStatus.backend.version}</span>
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Коммит:</span>
                    <span className="stat-code">{systemStatus.backend.commit}</span>
                  </div>
                </div>
              </div>

              {/* База данных */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="database" size={20} />
                  <h3>База данных</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">Статус:</span>
                    <StatusBadge status={systemStatus.database.status} />
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Версия:</span>
                    <span>{systemStatus.database.version}</span>
                  </div>
                </div>
              </div>

              {/* Telegram бот */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="telegram" size={20} />
                  <h3>Telegram бот</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">Статус:</span>
                    <StatusBadge status={systemStatus.telegram.status} />
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Подключен:</span>
                    <span>{systemStatus.telegram.connected ? 'Да' : 'Нет'}</span>
                  </div>
                </div>
              </div>

              {/* Очередь парсинга */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="queue" size={20} />
                  <h3>Очередь парсинга</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">В очереди:</span>
                    <span className="stat-number">{systemStatus.queue.length}</span>
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Обрабатывается:</span>
                    <span className="stat-number">{systemStatus.queue.processing}</span>
                  </div>
                </div>
              </div>

              {/* Парсер LLM */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="ai" size={20} />
                  <h3>Парсер LLM</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">Провайдер:</span>
                    <span>{systemStatus.parser.provider}</span>
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Модель:</span>
                    <span>{systemStatus.parser.model}</span>
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Квота:</span>
                    <span>{systemStatus.parser.quota}</span>
                  </div>
                </div>
              </div>

              {/* patch-023: Обновления приложения */}
              <div className="system-card">
                <div className="system-card-header">
                  <Icon name="refresh" size={20} />
                  <h3>Обновления</h3>
                </div>
                <div className="system-card-body">
                  <div className="system-stat">
                    <span className="stat-label">Версия:</span>
                    <AppVersionBadge />
                  </div>
                  <div className="system-stat">
                    <span className="stat-label">Статус:</span>
                    {updateStatus.checking && <span className="stat-info">Проверка...</span>}
                    {updateStatus.downloading && <span className="stat-info">Загрузка... {updateStatus.progress ? `${Math.round(updateStatus.progress.percent)}%` : ''}</span>}
                    {updateStatus.downloaded && <span className="stat-success">Готово к установке</span>}
                    {updateStatus.available && !updateStatus.downloading && !updateStatus.downloaded && (
                      <span className="stat-warning">Доступна v{updateStatus.info?.version}</span>
                    )}
                    {!updateStatus.checking && !updateStatus.available && !updateStatus.downloading && !updateStatus.downloaded && (
                      <span className="stat-success">Актуальная версия</span>
                    )}
                    {updateStatus.error && <span className="stat-error">{updateStatus.error}</span>}
                  </div>
                  <div className="system-stat">
                    <div className="update-actions" style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button
                        className="btn-sm btn-primary"
                        onClick={handleCheckForUpdates}
                        disabled={updateStatus.checking || updateStatus.downloading}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        {updateStatus.checking ? 'Проверка...' : 'Проверить'}
                      </button>
                      {updateStatus.available && !updateStatus.downloaded && (
                        <button
                          className="btn-sm btn-success"
                          onClick={handleDownloadUpdate}
                          disabled={updateStatus.downloading}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          {updateStatus.downloading ? 'Загрузка...' : 'Скачать'}
                        </button>
                      )}
                      {updateStatus.downloaded && (
                        <button
                          className="btn-sm btn-warning"
                          onClick={handleInstallUpdate}
                          style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                          Установить и перезапустить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="system-actions">
              <button className="btn-primary" onClick={loadSystemStatus}>
                <Icon name="refresh" size={18} />
                <span>Проверить ещё раз</span>
              </button>
              <button
                className="btn-secondary"
                onClick={() => toast.info('Логи - функция в разработке')}
              >
                <Icon name="file" size={18} />
                <span>Показать логи</span>
              </button>
            </div>

            {/* Очистка дубликатов */}
            <div className="system-card system-card-wide">
              <div className="system-card-header">
                <Icon name="warning" size={20} />
                <h3>Очистка дубликатов</h3>
              </div>
              <div className="system-card-body">
                <div className="system-stat">
                  <span className="stat-label">Найдено дубликатов:</span>
                  <span className="stat-number">{dedupTotal}</span>
                </div>

                <div className="duplicates-actions">
                  <button
                    className="btn-primary"
                    onClick={loadDuplicatesPreview}
                    disabled={duplicatesLoading}
                  >
                    {duplicatesLoading ? 'Поиск...' : 'Найти дубликаты'}
                  </button>
                  <button
                    className="btn-danger"
                    onClick={handleCleanDuplicates}
                    disabled={duplicatesCleaning || dedupTotal === 0}
                  >
                    {duplicatesCleaning ? 'Очистка...' : 'Очистить дубликаты'}
                  </button>
                  <span className="hint-text">
                    Дубликаты ищутся по fingerprint; остаётся по одному экземпляру.
                  </span>
                </div>

                <div className="duplicates-preview">
                  {duplicatesLoading ? (
                    <div className="duplicates-empty">
                      <Icon name="refresh" size={18} />
                      <span>Поиск дубликатов...</span>
                    </div>
                  ) : dedupTotal === 0 ? (
                    <div className="duplicates-empty">
                      <Icon name="check" size={20} />
                      <span>Дубликатов не найдено</span>
                    </div>
                  ) : (
                    <>
                      <div className="duplicates-meta">
                        <span>Предпросмотр (первые {duplicatesPreviewRows.length} из {dedupTotal})</span>
                      </div>
                      <div className="duplicates-table-wrapper">
                        <table className="duplicates-table">
                          <thead>
                            <tr>
                              <th>Оригинал</th>
                              <th>Дубликат</th>
                              <th>Сумма</th>
                              <th>Карта</th>
                              <th>Оператор</th>
                              <th>Дата/время</th>
                            </tr>
                          </thead>
                          <tbody>
                            {duplicatesPreviewRows.map((row) => (
                              <tr key={row.id}>
                                <td className="mono">{row.original_id || '—'}</td>
                                <td className="mono">{row.id}</td>
                                <td>{row.amount} {row.currency}</td>
                                <td className="mono">*{row.card_last4}</td>
                                <td>{row.operator}</td>
                                <td>{formatDateTime(row.datetime)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Вкладка: Потоки/Очередь (patch-009) */}
        {activeTab === 'queue' && (
          <div className="tab-queue">
            {/* Фильтры и поиск */}
            <div className="queue-filters">
              {/* patch-016 §7: Real-time переключатель */}
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={realtimeEnabled}
                  onChange={(e) => setRealtimeEnabled(e.target.checked)}
                />
                <span>
                  Real-time
                  {sseConnected && <span className="realtime-indicator connected"> ●</span>}
                  {!sseConnected && realtimeEnabled && <span className="realtime-indicator connecting"> ⟳</span>}
                </span>
              </label>

              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={queueFilters.only_errors}
                  onChange={(e) =>
                    setQueueFilters({ ...queueFilters, only_errors: e.target.checked })
                  }
                />
                <span>Только с ошибками</span>
              </label>

              <select
                className="filter-select"
                value={queueFilters.source}
                onChange={(e) =>
                  setQueueFilters({ ...queueFilters, source: e.target.value })
                }
              >
                <option value="all">Все источники</option>
                <option value="telegram">Telegram</option>
                <option value="sms">SMS</option>
                <option value="manual">Вручную</option>
              </select>

              <select
                className="filter-select"
                value={queueFilters.period}
                onChange={(e) =>
                  setQueueFilters({ ...queueFilters, period: e.target.value })
                }
              >
                <option value="1h">Последний час</option>
                <option value="6h">Последние 6 часов</option>
                <option value="24h">Последние 24 часа</option>
                <option value="7d">Последние 7 дней</option>
                <option value="30d">Последние 30 дней</option>
              </select>

              <input
                type="text"
                className="filter-search"
                placeholder="Поиск по Check ID, карте, оператору..."
                value={queueFilters.search}
                onChange={(e) =>
                  setQueueFilters({ ...queueFilters, search: e.target.value })
                }
              />

              <button className="btn-primary" onClick={loadQueue}>
                <Icon name="refresh" size={16} />
                <span>Обновить</span>
              </button>
            </div>

            {/* Таблица чеков с раскрывающимся таймлайном */}
            <div className="queue-table-container">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th style={{ width: '30px' }}></th>
                    <th>Check ID</th>
                    <th>Стадия</th>
                    <th>Статус</th>
                    <th>Время</th>
                    <th>Источник</th>
                    <th>Карта</th>
                    <th>Сумма</th>
                    <th>Оператор</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    // patch-010 §5: Skeleton при загрузке
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={`skeleton-${idx}`} className="skeleton-row">
                        <td colSpan="10" className="skeleton-cell">
                          <div className="skeleton-line" style={{ width: '100%', height: '40px' }}></div>
                        </td>
                      </tr>
                    ))
                  ) : queueChecks.length === 0 ? (
                    // patch-010 §5: Сообщение "Нет событий за период"
                    <tr>
                      <td colSpan="10" className="text-center text-muted" style={{ padding: '40px' }}>
                        <Icon name="info" size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <div style={{ fontSize: '16px', marginBottom: '8px' }}>Нет событий за выбранный период</div>
                        <div style={{ fontSize: '14px', opacity: 0.7 }}>
                          Попробуйте изменить фильтры или увеличить временной диапазон
                        </div>
                      </td>
                    </tr>
                  ) : (
                    queueChecks.map((check) => (
                      <QueueRow
                        key={check.check_id}
                        check={check}
                        onRequeue={handleRequeue}
                        onOpenCheck={handleOpenCheck}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Вкладка: Резервные копии */}
        {activeTab === 'backups' && (
          <div className="tab-backups">
            <div className="backups-header">
              <button
                className="btn-primary"
                onClick={handleCreateBackup}
                disabled={loading}
              >
                <Icon name="add" size={18} />
                Создать резервную копию
              </button>
            </div>
            <div className="backups-table-container">
              <table className="backups-table">
                <thead>
                  <tr>
                    <th>Файл</th>
                    <th>Размер</th>
                    <th>Создан</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center text-muted">
                        Резервные копии не найдены
                      </td>
                    </tr>
                  ) : (
                    backups.map((backup) => (
                      <tr key={backup.id}>
                        <td className="font-mono">{backup.filename}</td>
                        <td>{backup.size}</td>
                        <td>{new Date(backup.created_at).toLocaleString()}</td>
                        <td className="backups-actions">
                          <button
                            className="btn-icon"
                            onClick={() =>
                              toast.info('Скачать - функция в разработке')
                            }
                            title="Скачать"
                          >
                            <Icon name="download" size={18} />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Восстановить из ${backup.filename}?`
                                )
                              ) {
                                toast.info('Восстановление - функция в разработке');
                              }
                            }}
                            title="Восстановить"
                          >
                            <Icon name="restore" size={18} />
                          </button>
                          <button
                            className="btn-icon text-error"
                            onClick={() => {
                              if (window.confirm(`Удалить ${backup.filename}?`)) {
                                toast.info('Удаление - функция в разработке');
                              }
                            }}
                            title="Удалить"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
