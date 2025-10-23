import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { useSettingsStore } from '../state/settingsStore';
import { toast } from 'react-toastify';
import Icon from './icons/Icon';
import '../styles/Settings.css';
import notificationService from '../services/notificationService'; // patch-017 §5
import { adminAPI } from '../services/api';

Modal.setAppElement('#root');

const CLEAR_CONFIRM_TOKEN = 'ОЧИСТИТЬ';

/**
 * Экран настроек приложения
 * patch-008 §7: Меню Файл → Настройки
 * patch-016 §6: ESC для закрытия
 */
const Settings = ({ onClose }) => {
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
  const {
    numberFormatting,
    transactionLogic,
    duplicates,
    dictionary,
    paths,
    logs,
    theme,
    updateNumberFormatting,
    updateTransactionLogic,
    updateDuplicates,
    updateDictionary,
    updatePaths,
    updateLogs,
    setTheme,
    resetViewSettings,
  } = useSettingsStore();

  // patch-017 §5: Настройки уведомлений
  const [notificationSettings, setNotificationSettings] = useState(
    notificationService.getNotificationSettings()
  );
  const [isClearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmInput, setClearConfirmInput] = useState('');
  const [clearAcknowledged, setClearAcknowledged] = useState(false);
  const [clearInProgress, setClearInProgress] = useState(false);
  const [clearError, setClearError] = useState(null);

  const updateNotificationSettings = (updates) => {
    const newSettings = { ...notificationSettings, ...updates };
    setNotificationSettings(newSettings);
    notificationService.saveNotificationSettings(newSettings);
    toast.success('Настройки уведомлений сохранены');
  };

  const handleResetViewSettings = () => {
    if (window.confirm('Вы уверены, что хотите сбросить все настройки вида?')) {
      resetViewSettings();
      toast.success('Настройки вида сброшены');
    }
  };

  const handleRebuildIndexes = () => {
    if (window.confirm('Перестроить индексы базы данных? Это может занять время.')) {
      toast.info('Перестройка индексов - функция в разработке');
      // TODO: POST /admin/rebuild-indexes
    }
  };

  const handleOpenDataFolder = () => {
    toast.info('Открытие папки данных - функция в разработке');
    // TODO: Electron shell.openPath
  };

  const handleImportDictionary = () => {
    toast.info('Импорт словаря - функция в разработке');
  };

  const handleExportDictionary = () => {
    toast.info('Экспорт словаря - функция в разработке');
  };

  const handleExportLogs = () => {
    toast.info('Экспорт логов - функция в разработке');
    // TODO: Создать ZIP архив последней недели логов
  };

  const handleTestConnections = async () => {
    toast.info('Проверка соединений - функция в разработке');
    // TODO: Проверить: бекэнд / БД / Telegram-бот / WebSocket
  };

  // patch-016 §8: Очистка всей базы данных checks с автоматическим бэкапом
  const openClearChecksDialog = () => {
    setClearConfirmInput('');
    setClearAcknowledged(false);
    setClearError(null);
    setClearDialogOpen(true);
  };

  const closeClearChecksDialog = () => {
    if (clearInProgress) {
      return;
    }
    setClearDialogOpen(false);
  };

  const confirmClearChecks = async () => {
    if (clearConfirmInput.trim() !== CLEAR_CONFIRM_TOKEN || !clearAcknowledged) {
      setClearError(`Введите «${CLEAR_CONFIRM_TOKEN}» и отметьте подтверждение`);
      return;
    }

    let toastId = null;

    try {
      setClearInProgress(true);
      setClearError(null);
      toastId = toast.loading('Удаление чеков...');
      const result = await adminAPI.clearChecks();

      if (result.success) {
        const backupName = result.backup?.filename ? ` · Бэкап: ${result.backup.filename}` : '';
        if (toastId) {
          toast.update(toastId, {
            render: `Удалено ${result.deleted || 0} чеков${backupName}`,
            type: 'success',
            isLoading: false,
            autoClose: 4000,
          });
          toastId = null;
        } else {
          toast.success(`Удалено ${result.deleted || 0} чеков${backupName}`);
        }
        setClearDialogOpen(false);
      } else {
        const message = result.error || 'Не удалось очистить базу данных';
        setClearError(message);
        if (toastId) {
          toast.update(toastId, {
            render: message,
            type: 'error',
            isLoading: false,
            autoClose: 5000,
          });
          toastId = null;
        } else {
          toast.error(message);
        }
      }
    } catch (error) {
      console.error('Error clearing checks:', error);
      const message = error?.response?.data?.error || error.message || 'Не удалось очистить базу данных';
      setClearError(message);
      if (toastId) {
        toast.update(toastId, {
          render: message,
          type: 'error',
          isLoading: false,
          autoClose: 5000,
        });
        toastId = null;
      } else {
        toast.error('Ошибка при очистке базы данных');
      }
    } finally {
      setClearInProgress(false);
      if (toastId) {
        toast.dismiss(toastId);
      }
    }
  };

  return (
    <>
      <div className="settings-container">
        <div className="settings-header">
          <h2>Настройки</h2>
          <button className="settings-close-button" onClick={onClose} title="Закрыть">
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="settings-content">
        {/* 0. patch-016 §10: Тема оформления */}
        <section className="settings-section">
          <h3 className="settings-section-title">Внешний вид</h3>

          <div className="settings-item">
            <div className="settings-field">
              <label>Тема оформления:</label>
              <select
                className="settings-input"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="system">Системная</option>
                <option value="light">Светлая</option>
                <option value="dark">Тёмная</option>
              </select>
            </div>
            <p className="settings-hint">
              Системная тема автоматически переключается в зависимости от настроек ОС
            </p>
          </div>
        </section>

        {/* patch-017 §5: Уведомления */}
        <section className="settings-section">
          <h3 className="settings-section-title">Уведомления</h3>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={notificationSettings.enabled}
                onChange={(e) =>
                  updateNotificationSettings({ enabled: e.target.checked })
                }
              />
              <span>Включить OS-уведомления</span>
            </label>
            <p className="settings-hint">
              Показывать системные уведомления при добавлении новых чеков (только в Electron)
            </p>
          </div>

          {notificationSettings.enabled && (
            <>
              <div className="settings-item">
                <div className="settings-field">
                  <label>Режим уведомлений:</label>
                  <select
                    className="settings-input"
                    value={notificationSettings.mode}
                    onChange={(e) =>
                      updateNotificationSettings({ mode: e.target.value })
                    }
                  >
                    <option value="instant">Мгновенные (каждый чек)</option>
                    <option value="batch">Минутная сводка (батч)</option>
                  </select>
                </div>
                <p className="settings-hint">
                  Мгновенные: уведомление при каждом новом чеке (с троттлингом 5 сек).<br />
                  Минутная сводка: группирует чеки и показывает сводку раз в минуту.
                </p>
              </div>

              <div className="settings-item">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={notificationSettings.quietHoursEnabled || false}
                    onChange={(e) =>
                      updateNotificationSettings({ quietHoursEnabled: e.target.checked })
                    }
                  />
                  <span>Тихие часы</span>
                </label>
                <p className="settings-hint">
                  Не показывать уведомления в указанное время
                </p>
              </div>

              {notificationSettings.quietHoursEnabled && (
                <div className="settings-item">
                  <div className="settings-field">
                    <label>С:</label>
                    <input
                      type="time"
                      className="settings-input"
                      value={notificationSettings.quietHoursStart || '23:00'}
                      onChange={(e) =>
                        updateNotificationSettings({ quietHoursStart: e.target.value })
                      }
                    />
                    <label style={{ marginLeft: '1rem' }}>До:</label>
                    <input
                      type="time"
                      className="settings-input"
                      value={notificationSettings.quietHoursEnd || '07:00'}
                      onChange={(e) =>
                        updateNotificationSettings({ quietHoursEnd: e.target.value })
                      }
                    />
                  </div>
                  <p className="settings-hint">
                    По умолчанию: с 23:00 до 07:00 (ночное время)
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* 1. Форматирование чисел */}
        <section className="settings-section">
          <h3 className="settings-section-title">Форматирование чисел</h3>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={numberFormatting.thousandsSeparator}
                onChange={(e) =>
                  updateNumberFormatting({ thousandsSeparator: e.target.checked })
                }
              />
              <span>Разделитель тысяч</span>
            </label>
            <p className="settings-hint">Отображать пробелы между разрядами (например: 1 000 000)</p>
          </div>

          <div className="settings-item">
            <div className="settings-field">
              <label>Десятичный разделитель в UI:</label>
              <input type="text" value="," disabled className="settings-input-disabled" />
            </div>
            <p className="settings-hint">Запятая (фиксировано)</p>
          </div>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={numberFormatting.negativeRed}
                onChange={(e) =>
                  updateNumberFormatting({ negativeRed: e.target.checked })
                }
              />
              <span>Отрицательные числа красным</span>
            </label>
            <p className="settings-hint">Подсвечивать отрицательные значения красным цветом</p>
          </div>

        </section>

        {/* 2. Логика транзакций */}
        <section className="settings-section">
          <h3 className="settings-section-title">Логика транзакций</h3>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={!!transactionLogic.autoNegativeForDebits}
                onChange={(e) =>
                  updateTransactionLogic({ autoNegativeForDebits: e.target.checked })
                }
              />
              <span>Автоматически ставить минус для списаний</span>
            </label>
            <p className="settings-hint">
              Если включено — суммы для типов Оплата, Списание, E-Com, Платёж автоматически становятся отрицательными при вводе.<br />
              Если выключено — знак определяется вручную, система не меняет его автоматически.
            </p>
          </div>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={transactionLogic.autoDetectP2P}
                onChange={(e) =>
                  updateTransactionLogic({ autoDetectP2P: e.target.checked })
                }
              />
              <span>Автоопределение P2P по словарю</span>
            </label>
            <p className="settings-hint">Определять P2P транзакции на основе словаря операторов</p>
          </div>
        </section>

        {/* 3. Дубликаты */}
        <section className="settings-section">
          <h3 className="settings-section-title">Дубликаты</h3>

          <div className="settings-item">
            <div className="settings-field">
              <label>Окно совпадения по времени (мин):</label>
              <input
                type="number"
                min="1"
                max="60"
                value={duplicates.timeWindowMinutes}
                onChange={(e) =>
                  updateDuplicates({ timeWindowMinutes: parseInt(e.target.value) || 2 })
                }
                className="settings-input"
              />
            </div>
            <p className="settings-hint">Транзакции считаются дубликатами, если время различается менее чем на N минут</p>
          </div>

          <div className="settings-item">
            <div className="settings-field">
              <label>Порог суммы (UZS):</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={duplicates.amountThreshold}
                onChange={(e) =>
                  updateDuplicates({ amountThreshold: parseFloat(e.target.value) || 0.01 })
                }
                className="settings-input"
              />
            </div>
            <p className="settings-hint">Минимальная разница в сумме для различия транзакций</p>
          </div>
        </section>

        {/* 4. Справочник */}
        <section className="settings-section">
          <h3 className="settings-section-title">Справочник</h3>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={dictionary.suggestFromNewChecks}
                onChange={(e) =>
                  updateDictionary({ suggestFromNewChecks: e.target.checked })
                }
              />
              <span>Подтягивать предложения из новых чеков</span>
            </label>
            <p className="settings-hint">Предлагать добавлять неизвестных операторов в словарь</p>
          </div>

          <div className="settings-item">
            <div className="settings-buttons">
              <button className="settings-button" onClick={handleImportDictionary}>
                <Icon name="upload" size={16} />
                Импорт словаря
              </button>
              <button className="settings-button" onClick={handleExportDictionary}>
                <Icon name="download" size={16} />
                Экспорт словаря
              </button>
            </div>
          </div>
        </section>

        {/* 5. patch-010 §3: Пути и хранилище (обновлено) */}
        <section className="settings-section">
          <h3 className="settings-section-title">Хранилище данных</h3>

          <div className="settings-item">
            <div className="settings-field">
              <label>Путь к хранилищу:</label>
              <input
                type="text"
                value={paths.userDataPath || '~/Library/Application Support/Receipt Parser'}
                readOnly
                disabled
                className="settings-input-disabled"
              />
            </div>
            <p className="settings-hint">Автоматически определяется из app.getPath('userData')</p>
          </div>

          <div className="settings-item">
            <button className="settings-button" onClick={handleOpenDataFolder}>
              <Icon name="folder" size={16} />
              Открыть папку данных
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-field">
              <label>Путь к резервным копиям:</label>
              <div className="settings-path-field">
                <input
                  type="text"
                  value={paths.backupPath}
                  onChange={(e) => updatePaths({ backupPath: e.target.value })}
                  className="settings-input"
                  placeholder="/путь/к/бэкапам"
                />
                <button className="settings-button-small" onClick={handleOpenDataFolder}>
                  <Icon name="folder" size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 6. patch-010 §3.D: Логи и диагностика */}
        <section className="settings-section">
          <h3 className="settings-section-title">Логи и диагностика</h3>

          <div className="settings-item">
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={logs?.collectUILogs || false}
                onChange={(e) =>
                  updateLogs && updateLogs({ collectUILogs: e.target.checked })
                }
              />
              <span>Собирать логи UI</span>
            </label>
            <p className="settings-hint">По умолчанию выключено. Включите для диагностики проблем.</p>
          </div>

          <div className="settings-item">
            <button className="settings-button" onClick={handleExportLogs}>
              <Icon name="export" size={16} />
              Экспорт логов
            </button>
            <p className="settings-hint">Создаёт ZIP архив с логами последней недели</p>
          </div>

          <div className="settings-item">
            <button className="settings-button" onClick={handleTestConnections}>
              <Icon name="refresh" size={16} />
              Проверка соединений
            </button>
            <p className="settings-hint">Проверить: бекэнд / БД / Telegram-бот / Очередь (WebSocket/SSE)</p>
          </div>
        </section>

        {/* 7. Опасная зона */}
        <section className="settings-section settings-danger-zone">
          <h3 className="settings-section-title">Опасная зона</h3>

          <div className="settings-item">
            <button className="settings-button-danger" onClick={handleResetViewSettings}>
              <Icon name="warning" size={16} />
              Сбросить настройки вида
            </button>
            <p className="settings-hint">Вернуть все настройки отображения к значениям по умолчанию</p>
          </div>

          <div className="settings-item">
            <button className="settings-button-danger" onClick={handleRebuildIndexes}>
              <Icon name="build" size={16} />
              Перестроить индексы БД
            </button>
            <p className="settings-hint">Перестроить индексы базы данных (требует подтверждения)</p>
          </div>

          {/* patch-016 §8: Очистить все checks */}
          <div className="settings-item">
            <button className="settings-button-danger" onClick={openClearChecksDialog}>
              <Icon name="delete" size={16} />
              Очистить все чеки
            </button>
            <p className="settings-hint">
              <strong>КРИТИЧЕСКАЯ ОПЕРАЦИЯ:</strong> Удалить все записи из таблицы checks.<br />
              Перед удалением автоматически создаётся резервная копия.<br />
              Для подтверждения введите: <code>{CLEAR_CONFIRM_TOKEN}</code>
            </p>
          </div>
        </section>
      </div>
    </div>

    <Modal
      isOpen={isClearDialogOpen}
      onRequestClose={closeClearChecksDialog}
      className="modal confirm-modal"
      overlayClassName="modal-overlay"
      contentLabel="Очистить базу чеков"
    >
      <div className="modal-header">
        <h2>Очистить базу чеков?</h2>
        <button className="modal-close" onClick={closeClearChecksDialog} disabled={clearInProgress}>×</button>
      </div>
      <div className="modal-body">
        <p className="settings-warning">
          Эта операция удалит <strong>все</strong> чеки из базы данных. Перед удалением автоматически создаётся резервная копия.
        </p>
        <p className="settings-hint">Для подтверждения введите <code>{CLEAR_CONFIRM_TOKEN}</code> и отметьте чекбокс.</p>
        <input
          className="settings-input"
          placeholder={CLEAR_CONFIRM_TOKEN}
          value={clearConfirmInput}
          onChange={(e) => setClearConfirmInput(e.target.value)}
          disabled={clearInProgress}
        />
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={clearAcknowledged}
            onChange={(e) => setClearAcknowledged(e.target.checked)}
            disabled={clearInProgress}
          />
          <span>Я понимаю, что операция необратима</span>
        </label>
        {clearError && <p className="settings-error">{clearError}</p>}
      </div>
      <div className="modal-footer">
        <button className="action-button" onClick={closeClearChecksDialog} disabled={clearInProgress}>
          Отмена
        </button>
        <button
          className="action-button primary"
          onClick={confirmClearChecks}
          disabled={clearInProgress || clearConfirmInput.trim() !== CLEAR_CONFIRM_TOKEN || !clearAcknowledged}
        >
          {clearInProgress ? 'Удаление…' : 'Да, удалить'}
        </button>
      </div>
    </Modal>
    </>
  );
};

export default Settings;
