import React, { useState, useEffect, useRef } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/App.css';

import Header from './components/Header';
import Toolbar from './components/layout/Toolbar';
import ActiveFiltersChips from './components/grid/ActiveFiltersChips';
import ChecksGrid from './components/grid/ChecksGrid';
import FormulaStatusBar from './components/grid/FormulaStatusBar'; // patch-013
import Settings from './components/Settings'; // patch-008 §7
import Operators from './components/Operators'; // patch-008 §11
import Admin from './components/Admin'; // patch-008 §12
import Userbot from './components/Userbot'; // patch-017 §4
import AddCheckModal from './components/AddCheckModal';
import CheckDetailsModal from './components/CheckDetailsModal';
import HelpModal from './components/HelpModal'; // patch-006 §9
import HotkeysModal from './components/HotkeysModal'; // patch-010 §4
import UpdateBanner from './components/UpdateBanner'; // patch-021: Updates banner
import SplashScreen from './components/SplashScreen'; // patch-021: Splash screen
import LicenseKeyModal from './components/LicenseKeyModal'; // patch-022: License key validation

import { useChecksStore } from './state/checksStore';
import { useFiltersStore } from './state/filtersStore';
import { useSettingsStore } from './state/settingsStore';
import { exportToExcel } from './utils/excelExport';
import { toast } from 'react-toastify';
import useHotkeys from './hooks/useHotkeys';
import notificationService from './services/notificationService'; // patch-017 §5
import { useQueueStream } from './hooks/useQueueStream'; // patch-017 §5
import { useNotifications } from './hooks/useNotifications'; // patch-017 §5
import { useAutoUpdater } from './hooks/useAutoUpdater'; // Auto-updater hook

/**
 * Главный компонент приложения
 * Обновлен согласно patch-006-excel-parity-and-ux-cleanup.md
 * Добавлены горячие клавиши и справка
 */
function App() {
  const [currentView, setCurrentView] = useState('checks'); // checks, operators, settings, admin
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState(null);
  const [activeCell, setActiveCell] = useState(null);
  const [selectedRanges, setSelectedRanges] = useState([]); // patch-013
  const [filterScrollSection, setFilterScrollSection] = useState(null);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false); // patch-006 §9
  const [isHotkeysModalOpen, setIsHotkeysModalOpen] = useState(false); // patch-010 §4
  const [showSplash, setShowSplash] = useState(true); // patch-021: Splash screen
  const [showUpdateBanner, setShowUpdateBanner] = useState(true); // patch-021: Update banner
  const [isLicenseValid, setIsLicenseValid] = useState(false); // patch-022: License validation
  const [showLicenseModal, setShowLicenseModal] = useState(false); // patch-022: License modal

  const { loadChecks, checks } = useChecksStore();
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);
  const { toggleFiltersPanel, cycleCellDensity, setFiltersPanelOpen, filtersPanelOpen } = useFiltersStore();

  // Рефы для методов ChecksGrid
  const autoFitColumnsRef = useRef(null);
  const resetWidthsRef = useRef(null);
  const gridApiRef = useRef(null); // patch-013
  const formulaBarRef = useRef(null); // patch-013

  // patch-022: Проверка лицензионного ключа при первом запуске
  useEffect(() => {
    const licenseActivated = localStorage.getItem('licenseActivated');
    if (licenseActivated === 'true') {
      setIsLicenseValid(true);
    } else {
      setShowLicenseModal(true);
    }
  }, []);

  // Загрузка данных при монтировании (только после активации лицензии)
  useEffect(() => {
    if (isLicenseValid) {
      loadChecks();
    }
  }, [loadChecks, isLicenseValid]);

  // Обработчик успешной валидации лицензии
  const handleLicenseValidated = (isValid) => {
    if (isValid) {
      setIsLicenseValid(true);
      setShowLicenseModal(false);
    }
  };

  // patch-017 §5: Инициализация notification service
  useEffect(() => {
    // Обработчик кликов по уведомлениям
    const handleNotificationClick = (data) => {
      console.log('[App] Notification clicked:', data);

      // Переход в админ панель (вкладка "queue")
      setCurrentView('admin');

      // Фокус на окно
      if (gridApiRef.current) {
        returnFocusToGrid();
      }
    };

    // Инициализация сервиса
    notificationService.init(handleNotificationClick);

    // Cleanup
    return () => {
      notificationService.cleanup();
    };
  }, []);

  // patch-017 §5: Обработка событий очереди для уведомлений
  const handleQueueEvent = useRef((event) => {
    // Показываем уведомление только при успешном добавлении чека
    if (event.type === 'check_saved' && event.check) {
      notificationService.notifyCheckAdded(event.check);
    }
  }).current;

  // Подключаемся к потоку событий только если не в админ панели
  // (в админ панели своя подписка для real-time обновлений)
  const { connected: queueConnected } = useQueueStream(
    currentView !== 'admin', // Не подключаться когда в админке
    handleQueueEvent
  );

  // patch-017 §5: Подключаемся к SSE для OS уведомлений
  useNotifications(true); // Всегда включено

  // Auto-updater hook - проверка обновлений в фоне
  const {
    updateInfo,
    isUpdateAvailable,
    isDownloading,
    downloadProgress,
    isUpdateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useAutoUpdater();

  const handleRefresh = () => {
    loadChecks();
    toast.success('Данные обновлены');
  };

  // patch-021: Handlers для UpdateBanner
  const handleDismissUpdateBanner = () => {
    setShowUpdateBanner(false);
  };

  const handleSplashReady = () => {
    setShowSplash(false);
  };

  const handleCheckDetails = (check) => {
    if (!check) {
      toast.error('Не удалось открыть детали чека');
      return;
    }

    // Создаём копию, чтобы реактивно открывать модал даже для того же объекта
    setSelectedCheck({ ...check });
  };

  const handleOpenCheckInGrid = (checkToOpen) => {
    if (!checkToOpen) {
      return;
    }

    setSelectedCheck(null);
    setCurrentView('checks');

    const api = gridApiRef.current;
    if (api) {
      const targetId = String(checkToOpen.id);
      let rowNode = api.getRowNode(targetId);

      if (!rowNode) {
        api.forEachNode((node) => {
          if (!rowNode && node?.data && String(node.data.id) === targetId) {
            rowNode = node;
          }
        });
      }

      if (rowNode) {
        const rowIndex = rowNode.rowIndex;
        if (typeof rowIndex === 'number') {
          api.ensureIndexVisible(rowIndex, 'middle');
          api.setFocusedCell(rowIndex, 'datetime');
        }
        api.clearRangeSelection();
        api.deselectAll();
        rowNode.setSelected(true);
      }
    }

    returnFocusToGrid();
  };

  // patch-016 §6: Возврат фокуса в таблицу после закрытия модалок
  const returnFocusToGrid = () => {
    // Даем время на анимацию закрытия модала
    setTimeout(() => {
      if (gridApiRef.current && currentView === 'checks') {
        const focusedCell = gridApiRef.current.getFocusedCell();
        if (!focusedCell) {
          // Если нет фокуса, устанавливаем на первую ячейку
          const firstNode = gridApiRef.current.getDisplayedRowAtIndex(0);
          if (firstNode) {
            gridApiRef.current.setFocusedCell(0, 'datetime');
          }
        }
        // Возвращаем фокус на контейнер грида
        const gridDiv = document.querySelector('.ag-root-wrapper');
        if (gridDiv) {
          gridDiv.focus();
        }
      }
    }, 100);
  };

  const handleExport = async () => {
    try {
      await exportToExcel(checks);
      toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      toast.error('Ошибка при экспорте в Excel');
    }
  };

  const handleImport = () => {
    // TODO: Реализовать импорт
    toast.info('Функция импорта в разработке');
  };

  const handleAutoFitColumns = () => {
    if (autoFitColumnsRef.current) {
      autoFitColumnsRef.current();
    }
  };

  const handleResetWidths = () => {
    if (resetWidthsRef.current) {
      resetWidthsRef.current();
    }
  };

  // patch-013: Обработка изменения значения ячейки из FormulaStatusBar
  const handleCellValueChange = () => {
    if (gridApiRef.current) {
      gridApiRef.current.refreshCells({ force: true });
    }
  };

  // Горячие клавиши (patch-006 §9, patch-010 §4)
  useHotkeys({
    // patch-010 §4: Горячие клавиши (Ctrl/Cmd+/)
    'Ctrl+/': () => {
      setIsHotkeysModalOpen(true);
    },
    'Cmd+/': () => {
      setIsHotkeysModalOpen(true);
    },

    // Обновить данные
    'Ctrl+R': (e) => {
      e.preventDefault();
      handleRefresh();
    },
    'Cmd+R': (e) => {
      e.preventDefault();
      handleRefresh();
    },

    // Открыть/закрыть панель фильтров
    'Ctrl+Shift+F': () => {
      if (currentView === 'checks') {
        toggleFiltersPanel();
      }
    },
    'Cmd+Shift+F': () => {
      if (currentView === 'checks') {
        toggleFiltersPanel();
      }
    },

    // Переключить плотность ячеек
    'Ctrl+Alt+D': () => {
      if (currentView === 'checks') {
        cycleCellDensity();
        const labels = { compact: 'Компактный', standard: 'Стандарт', large: 'Крупный' };
        toast.info(`Плотность: ${labels[useFiltersStore.getState().cellDensity]}`);
      }
    },
    'Cmd+Alt+D': () => {
      if (currentView === 'checks') {
        cycleCellDensity();
        const labels = { compact: 'Компактный', standard: 'Стандарт', large: 'Крупный' };
        toast.info(`Плотность: ${labels[useFiltersStore.getState().cellDensity]}`);
      }
    },

    // patch-013: F2 — войти в редактирование активной ячейки
    'F2': () => {
      if (currentView === 'checks' && formulaBarRef.current) {
        formulaBarRef.current.focusInput();
      }
    },

    // patch-016 §13: Ctrl/Cmd+F — быстрый поиск (открыть панель фильтров с фокусом на поиске)
    'Ctrl+F': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        setFiltersPanelOpen(true);
        // Фокус на поле поиска будет установлен при открытии панели
      }
    },
    'Cmd+F': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        setFiltersPanelOpen(true);
      }
    },

    // patch-016 §13: Ctrl/Cmd+S — сохранить (на самом деле автосохранение)
    'Ctrl+S': (e) => {
      e.preventDefault();
      toast.info('Изменения сохраняются автоматически', { autoClose: 2000 });
    },
    'Cmd+S': (e) => {
      e.preventDefault();
      toast.info('Изменения сохраняются автоматически', { autoClose: 2000 });
    },

    // patch-016 §13: Undo/Redo через checksStore
    'Ctrl+Z': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        const { undo, canUndo } = useChecksStore.getState();
        if (canUndo()) {
          undo();
          toast.info('Отменено');
        }
      }
    },
    'Cmd+Z': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        const { undo, canUndo } = useChecksStore.getState();
        if (canUndo()) {
          undo();
          toast.info('Отменено');
        }
      }
    },

    'Ctrl+Y': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        const { redo, canRedo } = useChecksStore.getState();
        if (canRedo()) {
          redo();
          toast.info('Повторено');
        }
      }
    },
    'Cmd+Shift+Z': (e) => {
      if (currentView === 'checks') {
        e.preventDefault();
        const { redo, canRedo } = useChecksStore.getState();
        if (canRedo()) {
          redo();
          toast.info('Повторено');
        }
      }
    },
  });

  return (
    <div className="app">
      {/* patch-021: Splash screen при запуске */}
      {showSplash && <SplashScreen onReady={handleSplashReady} />}

      {/* patch-021: Update banner */}
      {showUpdateBanner && (
        <UpdateBanner
          updateInfo={updateInfo}
          isUpdateAvailable={isUpdateAvailable}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          isUpdateDownloaded={isUpdateDownloaded}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
          onDismiss={handleDismissUpdateBanner}
        />
      )}

      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        onAddCheck={() => setIsAddModalOpen(true)}
        onRefresh={handleRefresh}
      />

      {currentView === 'checks' && (
        <>
          {/* Тулбар с кнопками и фильтрами - сразу под Header */}
          <Toolbar
            onImport={handleImport}
            onExport={handleExport}
            onRefresh={handleRefresh}
            onAutoFitColumns={handleAutoFitColumns}
            onResetWidths={handleResetWidths}
            filterScrollSection={filterScrollSection}
            onShowHelp={() => setIsHelpModalOpen(true)}
            onShowSettings={() => setCurrentView('settings')}
            onShowHotkeys={() => setIsHotkeysModalOpen(true)}
          />

          {/* Чипы активных фильтров - patch-004 §2 */}
          <ActiveFiltersChips
            onOpenFilters={(section) => {
              setFilterScrollSection(section);
              setFiltersPanelOpen(true);
            }}
          />

          {/* patch-013: Строка формул и статуса */}
          <FormulaStatusBar
            ref={formulaBarRef}
            gridApi={gridApiRef.current}
            activeCell={activeCell}
            selectedRanges={selectedRanges}
            onCellValueChange={handleCellValueChange}
          />

          {/* Основная таблица - занимает все доступное пространство */}
          <main className="main-content">
            <ChecksGrid
              onCheckDetails={handleCheckDetails}
              onActiveCellChange={setActiveCell}
              onSelectionRangesChange={setSelectedRanges}
              onAutoFitColumns={autoFitColumnsRef}
              onResetWidths={resetWidthsRef}
              gridApiRef={gridApiRef}
              resolvedTheme={resolvedTheme}
            />
          </main>
        </>
      )}

      {/* patch-008 §11: Экран операторы */}
      {currentView === 'operators' && (
        <main className="main-content">
          <Operators onClose={() => {
            setCurrentView('checks');
            returnFocusToGrid();
          }} />
        </main>
      )}

      {/* patch-008 §7: Экран настроек */}
      {currentView === 'settings' && (
        <main className="main-content">
          <Settings onClose={() => {
            setCurrentView('checks');
            returnFocusToGrid();
          }} />
        </main>
      )}

      {/* patch-008 §12: Экран администрирование */}
      {currentView === 'admin' && (
        <main className="main-content">
          <Admin onClose={() => {
            setCurrentView('checks');
            returnFocusToGrid();
          }} />
        </main>
      )}

      {/* patch-017 §4: Экран Telegram userbot */}
      {currentView === 'userbot' && (
        <main className="main-content">
          <Userbot onClose={() => {
            setCurrentView('checks');
            returnFocusToGrid();
          }} />
        </main>
      )}

      {isAddModalOpen && (
        <AddCheckModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            returnFocusToGrid();
          }}
          onSuccess={handleRefresh}
        />
      )}

      {selectedCheck && (
        <CheckDetailsModal
          check={selectedCheck}
          onClose={() => {
            setSelectedCheck(null);
            returnFocusToGrid();
          }}
          onOpenInTable={handleOpenCheckInGrid}
        />
      )}

      {/* patch-006 §9: Справка по горячим клавишам */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => {
          setIsHelpModalOpen(false);
          returnFocusToGrid();
        }}
      />

      {/* patch-010 §4: Модал горячих клавиш */}
      <HotkeysModal
        isOpen={isHotkeysModalOpen}
        onClose={() => {
          setIsHotkeysModalOpen(false);
          returnFocusToGrid();
        }}
      />

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        toastStyle={{
          background: 'var(--modal-bg)',
          color: 'var(--modal-fg)',
          border: '1px solid var(--modal-border)',
        }}
        progressStyle={{
          background: 'var(--color-accent-primary)',
        }}
      />

      {/* patch-022: Модальное окно активации лицензии */}
      {showLicenseModal && !isLicenseValid && (
        <LicenseKeyModal onValidate={handleLicenseValidated} />
      )}
    </div>
  );
}

export default App;
