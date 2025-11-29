import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import ColumnVisibilityModal from './components/ColumnVisibilityModal'; // Column visibility management

import { useChecksStore } from './state/checksStore';
import { useFiltersStore } from './state/filtersStore';
import { useSettingsStore } from './state/settingsStore';
import { useCellStylesStore } from './state/cellStylesStore'; // Cell formatting
import { exportToExcel, importFromExcel } from './utils/excelExport';
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
function MainAppShell({ resolvedTheme }) {
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
  const [isColumnVisibilityModalOpen, setIsColumnVisibilityModalOpen] = useState(false); // Column visibility modal

  const { loadChecks, checks } = useChecksStore();
  const { toggleFiltersPanel, cycleCellDensity, setFiltersPanelOpen, filtersPanelOpen } = useFiltersStore();
  const { setAlignment, setWrapText } = useCellStylesStore(); // Cell formatting methods

  // Рефы для методов ChecksGrid
  const autoFitColumnsRef = useRef(null);
  const resetWidthsRef = useRef(null);
  const gridApiRef = useRef(null); // patch-013
  const formulaBarRef = useRef(null); // patch-013

  useEffect(() => {
    loadChecks({ silent: true });
  }, [loadChecks]);

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
    downloadUpdate,
    installUpdate,
  } = useAutoUpdater();

  const handleRefresh = () => {
    loadChecks({ silent: true, forceFullRefresh: true });
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

  const handleExport = async (type = 'all') => {
    try {
      let dataToExport = [];

      switch (type) {
        case 'visible':
          // Экспорт видимых (отфильтрованных) строк
          if (gridApiRef.current) {
            const rowData = [];
            gridApiRef.current.forEachNodeAfterFilter((node) => {
              if (node.data) rowData.push(node.data);
            });
            dataToExport = rowData;
          } else {
            dataToExport = checks;
          }
          break;

        case 'selected':
          // Экспорт выделенных строк
          if (gridApiRef.current) {
            const selectedRows = gridApiRef.current.getSelectedRows();
            if (selectedRows.length === 0) {
              toast.warning('Нет выделенных строк для экспорта');
              return;
            }
            dataToExport = selectedRows;
          } else {
            toast.warning('Не удалось получить выделенные строки');
            return;
          }
          break;

        case 'all':
        default:
          // Экспорт всех строк
          dataToExport = checks;
          break;
      }

      await exportToExcel(dataToExport);

      const typeLabels = {
        visible: 'видимых',
        selected: 'выделенных',
        all: 'всех'
      };
      toast.success(`Экспорт ${typeLabels[type]} строк завершён (${dataToExport.length} шт.)`);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      toast.error('Ошибка при экспорте в Excel');
    }
  };

  const handleImport = async () => {
    try {
      // Создаем скрытый input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls';

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          toast.info('Импорт данных...');

          // Парсим Excel файл
          const importedChecks = await importFromExcel(file);

          if (!importedChecks || importedChecks.length === 0) {
            toast.warning('Файл не содержит данных для импорта');
            return;
          }

          // Добавляем каждый чек через checksStore
          let successCount = 0;
          let errorCount = 0;

          for (const check of importedChecks) {
            try {
              await addCheck(check, { skipToast: true });
              successCount++;
            } catch (error) {
              console.error('Ошибка импорта чека:', check, error);
              errorCount++;
            }
          }

          // Обновляем список чеков
          await loadChecks({ silent: true, forceFullRefresh: true });

          // Показываем результат
          if (errorCount === 0) {
            toast.success(`Импортировано ${successCount} чеков`);
          } else {
            toast.warning(`Импортировано ${successCount} чеков, ошибок: ${errorCount}`);
          }
        } catch (error) {
          console.error('Ошибка импорта:', error);
          toast.error('Ошибка при импорте файла');
        }
      };

      input.click();
    } catch (error) {
      console.error('Ошибка открытия диалога:', error);
      toast.error('Ошибка при выборе файла');
    }
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

  // NEW: Show column visibility modal
  const handleShowColumnVisibility = () => {
    setIsColumnVisibilityModalOpen(true);
  };

  // NEW: Apply alignment to selected cells
  const handleApplyAlignment = (alignment) => {
    const api = gridApiRef.current;
    if (!api) {
      toast.warning('Grid API не готов');
      return;
    }

    const cellRanges = api.getCellRanges();
    if (!cellRanges || cellRanges.length === 0) {
      toast.warning('Выделите ячейки для применения выравнивания');
      return;
    }

    let cellsUpdated = 0;

    cellRanges.forEach(range => {
      const startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
      const endRow = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
      const columns = range.columns || [];

      columns.forEach(column => {
        const field = column.getColDef().field;

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
          const rowNode = api.getDisplayedRowAtIndex(rowIndex);
          if (rowNode && rowNode.data) {
            const checkId = rowNode.data.id;
            setAlignment(checkId, field, alignment);
            cellsUpdated++;
          }
        }
      });
    });

    api.refreshCells({ force: true });

    const alignmentNames = {
      left: 'левому краю',
      center: 'центру',
      right: 'правому краю'
    };
    toast.success(`Выравнивание по ${alignmentNames[alignment]} применено к ${cellsUpdated} ячейкам`);
  };

  // NEW: Apply wrap text to selected cells
  const handleApplyWrapText = (wrap = true) => {
    const api = gridApiRef.current;
    if (!api) {
      toast.warning('Grid API не готов');
      return;
    }

    const cellRanges = api.getCellRanges();
    if (!cellRanges || cellRanges.length === 0) {
      toast.warning('Выделите ячейки для применения переноса текста');
      return;
    }

    let cellsUpdated = 0;

    cellRanges.forEach(range => {
      const startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
      const endRow = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
      const columns = range.columns || [];

      columns.forEach(column => {
        const field = column.getColDef().field;

        for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
          const rowNode = api.getDisplayedRowAtIndex(rowIndex);
          if (rowNode && rowNode.data) {
            const checkId = rowNode.data.id;
            setWrapText(checkId, field, wrap);
            cellsUpdated++;
          }
        }
      });
    });

    api.refreshCells({ force: true });
    toast.success(`Перенос текста применен к ${cellsUpdated} ячейкам`);
  };

  // patch-013: Обработка изменения значения ячейки из FormulaStatusBar
  const handleCellValueChange = () => {
    if (gridApiRef.current) {
      gridApiRef.current.refreshCells({ force: true });
    }
  };

  // FIX: Memoize hotkeys object to prevent recreation on every render
  const hotkeysConfig = useMemo(() => ({
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

    // Переключить плотность ячеек (FIX: Changed from Cmd+Alt+D to avoid macOS Dock conflict)
    'Ctrl+Shift+D': () => {
      if (currentView === 'checks') {
        cycleCellDensity();
        const labels = { compact: 'Компактный', standard: 'Стандарт', large: 'Крупный' };
        toast.info(`Плотность: ${labels[useFiltersStore.getState().cellDensity]}`);
      }
    },
    'Cmd+Shift+D': () => {
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
    // FIX: preventDefault уже вызывается в useHotkeys, дублирование убрано
    'Ctrl+S': () => {
      toast.info('Изменения сохраняются автоматически', { autoClose: 2000 });
    },
    'Cmd+S': () => {
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
  }), [currentView, toggleFiltersPanel, cycleCellDensity, setFiltersPanelOpen]); // Dependencies

  // Горячие клавиши (patch-006 §9, patch-010 §4)
  useHotkeys(hotkeysConfig);

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
            onShowColumnVisibility={handleShowColumnVisibility}
            onApplyAlignment={handleApplyAlignment}
            onApplyWrapText={handleApplyWrapText}
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
              onExportSelected={() => handleExport('selected')}
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

      {/* Column visibility modal */}
      <ColumnVisibilityModal
        isOpen={isColumnVisibilityModalOpen}
        onClose={() => setIsColumnVisibilityModalOpen(false)}
        columnDefs={null} // Will be set dynamically from ChecksGrid
        api={gridApiRef.current}
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

    </div>
  );
}

function App() {
  const [isLicenseValid, setIsLicenseValid] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const resolvedTheme = useSettingsStore((state) => state.resolvedTheme);

  useEffect(() => {
    const licenseActivated = localStorage.getItem('licenseActivated');
    if (licenseActivated === 'true') {
      setIsLicenseValid(true);
    } else {
      setShowLicenseModal(true);
    }
  }, []);

  const handleLicenseValidated = (isValid) => {
    if (isValid) {
      setIsLicenseValid(true);
      setShowLicenseModal(false);
    }
  };

  if (!isLicenseValid) {
    return (
      <div className="app">
        {showLicenseModal && (
          <LicenseKeyModal onValidate={handleLicenseValidated} />
        )}
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
      </div>
    );
  }

  return <MainAppShell resolvedTheme={resolvedTheme} />;
}

export default App;
