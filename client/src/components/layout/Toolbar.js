import React, { useState, useRef } from 'react';
import { toast } from 'react-toastify'; // patch-008 §8
import { useChecksStore } from '../../state/checksStore';
import { useFiltersStore } from '../../state/filtersStore';
import { useSettingsStore } from '../../state/settingsStore'; // patch-008 §9
import Icon from '../icons/Icon';
import FiltersPanel from '../grid/FiltersPanel';
import '../../styles/Toolbar.css';
import { adminAPI } from '../../services/api';

/**
 * Тулбар с кнопками действий и фильтрами
 * Обновлён согласно patch-006 §10, §11, §9
 */
const Toolbar = ({ onImport, onExport, onRefresh, onAutoFitColumns, onResetWidths, filterScrollSection, onShowHelp, onShowSettings, onShowHotkeys }) => {
  const { canUndo, undo, canRedo, redo } = useChecksStore();
  const {
    quickSearch,
    setQuickSearch,
    filtersPanelOpen,
    toggleFiltersPanel,
    setFiltersPanelOpen,
    getActiveFiltersCount,
    cellDensity,
    setCellDensity,
    cycleCellDensity,
  } = useFiltersStore();

  // patch-008 §9: Настройки из settingsStore
  const { numberFormatting, updateNumberFormatting, resetViewSettings } = useSettingsStore();

  const [showFileMenu, setShowFileMenu] = useState(false); // patch-006 §11
  const [showViewMenu, setShowViewMenu] = useState(false); // patch-006 §12

  // FIX: Use useRef instead of window.searchDebounce for proper cleanup
  const searchDebounceRef = useRef(null);
  const searchInputRef = useRef(null);

  // Обработчик быстрого поиска с debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;

    // Debounce 200ms
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setQuickSearch(value);
    }, 200);
  };

  const densityIcons = {
    compact: 'density_small',
    standard: 'density_medium',
    large: 'density_large',
  };

  const densityLabels = {
    compact: 'Компактный',
    standard: 'Стандарт',
    large: 'Крупный',
  };

  // patch-008 §8: Обработчики базы данных
  const handleBackup = async () => {
    setShowFileMenu(false);

    try {
      toast.info('Создание резервной копии...');

      const response = await adminAPI.createBackup();

      if (!response || !response.success) {
        throw new Error(response?.error || 'Не удалось создать резервную копию');
      }

      const { backup } = response;
      toast.success(`Резервная копия создана: ${backup.filename}`);
    } catch (error) {
      console.error('Backup error:', error);
      toast.error(`Ошибка резервного копирования: ${error.message}`);
    }
  };

  const handleRestore = async () => {
    setShowFileMenu(false);

    // Предупреждение
    const confirmed = window.confirm(
      'ВНИМАНИЕ! Восстановление из резервной копии заменит все данные в базе данных.\n\n' +
      'Эта операция необратима. Вы уверены, что хотите продолжить?'
    );

    if (!confirmed) return;

    // Создаём невидимый input для выбора файла
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.sql.gz,.gz';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        toast.info('Восстановление из резервной копии...');

        const result = await adminAPI.restoreBackup(file);

        if (!result?.success) {
          throw new Error(result?.error || 'Ошибка при восстановлении из резервной копии');
        }
        toast.success('База данных успешно восстановлена. Перезагрузка...');

        // Перезагружаем страницу через 2 секунды
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (error) {
        console.error('Restore error:', error);
        toast.error(`Ошибка восстановления: ${error.message}`);
      }
    };

    input.click();
  };

  const handleOpenDataFolder = () => {
    setShowFileMenu(false);

    // В Electron можно использовать shell.openPath
    // В web-версии показываем информацию
    if (window.electron?.shell?.openPath) {
      // Electron API
      window.electron.shell.openPath(window.electron.app.getPath('userData'))
        .then(() => {
          toast.success('Папка данных открыта');
        })
        .catch((error) => {
          console.error('Error opening data folder:', error);
          toast.error('Ошибка при открытии папки данных');
        });
    } else {
      // Веб-версия - показываем путь к данным
      toast.info('Данные хранятся в localStorage браузера');
    }
  };

  const activeFiltersCount = getActiveFiltersCount();

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-section toolbar-actions">
          {/* patch-006 §11: Меню "Файл" */}
          <div className="toolbar-dropdown">
            <button
              className={`toolbar-button ${showFileMenu ? 'active' : ''}`}
              onClick={() => setShowFileMenu(!showFileMenu)}
              title="Файл"
            >
              <Icon name="folder" size={20} />
              <span>Файл</span>
              <Icon name="arrow_drop_down" size={16} />
            </button>

            {showFileMenu && (
              <div className="toolbar-dropdown-menu file-menu">
                {/* Импорт */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Импорт</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onImport('xlsx');
                      setShowFileMenu(false);
                    }}
                  >
                    <Icon name="import" size={18} />
                    <span>Excel (.xlsx)</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onImport('csv');
                      setShowFileMenu(false);
                    }}
                  >
                    <Icon name="import" size={18} />
                    <span>CSV</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* Экспорт */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Экспорт</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onExport('visible');
                      setShowFileMenu(false);
                    }}
                  >
                    <Icon name="export" size={18} />
                    <span>Видимые строки</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onExport('selected');
                      setShowFileMenu(false);
                    }}
                  >
                    <Icon name="export" size={18} />
                    <span>Выделение</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onExport('all');
                      setShowFileMenu(false);
                    }}
                  >
                    <Icon name="export" size={18} />
                    <span>Вся таблица</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* База данных */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">База данных</div>
                  <button
                    className="dropdown-item"
                    onClick={handleBackup}
                  >
                    <Icon name="save" size={18} />
                    <span>Сохранить резервную копию</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={handleRestore}
                  >
                    <Icon name="restore" size={18} />
                    <span>Восстановить из бэкапа</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={handleOpenDataFolder}
                  >
                    <Icon name="folder_open" size={18} />
                    <span>Открыть папку данных</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* patch-006 §10: Обновить - теперь в меню */}
                <button
                  className="dropdown-item"
                  onClick={() => {
                    onRefresh();
                    setShowFileMenu(false);
                  }}
                >
                  <Icon name="refresh" size={18} />
                  <span>Обновить данные</span>
                  <span className="dropdown-shortcut">Ctrl+R</span>
                </button>

                <div className="dropdown-divider" />

                {/* patch-008 §7: Настройки */}
                <button
                  className="dropdown-item"
                  onClick={() => {
                    onShowSettings();
                    setShowFileMenu(false);
                  }}
                >
                  <Icon name="settings" size={18} />
                  <span>Настройки...</span>
                </button>
              </div>
            )}
          </div>

          <div className="toolbar-divider" />

          {/* patch-006 §12: Меню "Вид" */}
          <div className="toolbar-dropdown">
            <button
              className={`toolbar-button ${showViewMenu ? 'active' : ''}`}
              onClick={() => setShowViewMenu(!showViewMenu)}
              title="Вид"
            >
              <Icon name="view_column" size={20} />
              <span>Вид</span>
              <Icon name="arrow_drop_down" size={16} />
            </button>

            {showViewMenu && (
              <div className="toolbar-dropdown-menu view-menu">
                {/* Плотность */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Плотность</div>
                  <button
                    className={`dropdown-item ${cellDensity === 'compact' ? 'active' : ''}`}
                    onClick={() => {
                      setCellDensity('compact');
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="density_small" size={18} />
                    <span>Компактный</span>
                  </button>
                  <button
                    className={`dropdown-item ${cellDensity === 'standard' ? 'active' : ''}`}
                    onClick={() => {
                      setCellDensity('standard');
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="density_medium" size={18} />
                    <span>Стандарт</span>
                  </button>
                  <button
                    className={`dropdown-item ${cellDensity === 'large' ? 'active' : ''}`}
                    onClick={() => {
                      setCellDensity('large');
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="density_large" size={18} />
                    <span>Крупный</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* Ширина колонок */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Ширина колонок</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onAutoFitColumns();
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="auto_width" size={18} />
                    <span>Авто-подогнать все</span>
                    <span className="dropdown-shortcut">Alt+Dbl Click</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onResetWidths();
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="width_normal" size={18} />
                    <span>Сбросить ширины</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* patch-008 §9: Колонки */}
                <button
                  className="dropdown-item"
                  onClick={() => {
                    // TODO: Открыть диалог управления колонками
                    setShowViewMenu(false);
                  }}
                >
                  <Icon name="view_column" size={18} />
                  <span>Колонки...</span>
                </button>

                <div className="dropdown-divider" />

                {/* patch-008 §9: Текст */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Текст</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      // TODO: Выравнивание в выделении
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="format_align_left" size={18} />
                    <span>Выравнивание в выделении</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      // TODO: Перенос по словам
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="wrap_text" size={18} />
                    <span>Перенос по словам</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* patch-008 §9: Числа */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Числа</div>
                  <button
                    className={`dropdown-item ${numberFormatting.thousandsSeparator ? 'active' : ''}`}
                    onClick={() => {
                      updateNumberFormatting({ thousandsSeparator: !numberFormatting.thousandsSeparator });
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="format_number" size={18} />
                    <span>Разделитель тысяч</span>
                    <span className="dropdown-hint">{numberFormatting.thousandsSeparator ? 'вкл' : 'выкл'}</span>
                  </button>
                  <button
                    className={`dropdown-item ${numberFormatting.negativeRed ? 'active' : ''}`}
                    onClick={() => {
                      updateNumberFormatting({ negativeRed: !numberFormatting.negativeRed });
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="format_color_text" size={18} />
                    <span>Отрицательные красным</span>
                    <span className="dropdown-hint">{numberFormatting.negativeRed ? 'вкл' : 'выкл'}</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* patch-008 §9: Сетка */}
                <div className="dropdown-section">
                  <div className="dropdown-section-title">Сетка</div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      // TODO: Границы ячеек (тонкие/обычные)
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="border_all" size={18} />
                    <span>Границы ячеек</span>
                    <span className="dropdown-hint">обычные</span>
                  </button>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      // TODO: Зебра-строки
                      setShowViewMenu(false);
                    }}
                  >
                    <Icon name="table_rows" size={18} />
                    <span>Зебра-строки</span>
                    <span className="dropdown-hint">выкл</span>
                  </button>
                </div>

                <div className="dropdown-divider" />

                {/* patch-008 §9: Сервис - Сброс настроек вида */}
                <button
                  className="dropdown-item"
                  onClick={() => {
                    if (window.confirm('Сбросить все настройки вида к значениям по умолчанию?')) {
                      resetViewSettings();
                    }
                    setShowViewMenu(false);
                  }}
                >
                  <Icon name="restore" size={18} />
                  <span>Сброс настроек вида</span>
                </button>
              </div>
            )}
          </div>

          <div className="toolbar-divider" />

          {/* Фильтры с бейджем */}
          <button
            className={`toolbar-button ${filtersPanelOpen ? 'active' : ''}`}
            onClick={toggleFiltersPanel}
            title="Фильтры (Ctrl/Cmd+Shift+F)"
          >
            <Icon name="filter_list" size={20} />
            <span>Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="filter-badge">{activeFiltersCount}</span>
            )}
          </button>

          <div className="toolbar-divider" />

          {/* patch-011 §5: Единая кнопка "Горячие клавиши" */}
          <button
            className="toolbar-button"
            onClick={onShowHotkeys}
            title="Горячие клавиши (Ctrl/Cmd+/)"
          >
            <Icon name="keyboard" size={20} />
          </button>
        </div>

        <div className="toolbar-section toolbar-search">
          {/* Быстрый поиск */}
          <div className="search-box">
            <Icon
              name="search"
              size={18}
              color="var(--color-text-secondary)"
            />
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Быстрый поиск по таблице..."
              defaultValue={quickSearch}
              onChange={handleSearchChange}
            />
            {quickSearch && (
              <button
                className="search-clear"
                onClick={() => {
                  setQuickSearch('');
                  if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                  }
                }}
                title="Очистить"
              >
                <Icon
                  name="close"
                  size={16}
                  color="var(--color-text-tertiary)"
                />
              </button>
            )}
          </div>

          <div className="toolbar-divider" />

          {/* Отменить */}
          <button
            className="toolbar-button"
            onClick={undo}
            disabled={!canUndo()}
            title="Отменить (Ctrl+Z)"
          >
            <Icon name="undo" size={20} />
          </button>

          {/* Повторить */}
          <button
            className="toolbar-button"
            onClick={redo}
            disabled={!canRedo()}
            title="Повторить (Ctrl+Y)"
          >
            <Icon name="redo" size={20} />
          </button>
        </div>
      </div>

      {/* Панель фильтров */}
      <FiltersPanel
        isOpen={filtersPanelOpen}
        onClose={() => setFiltersPanelOpen(false)}
        scrollToSection={filterScrollSection}
      />

      {/* Закрытие выпадающих меню при клике вне */}
      {(showFileMenu || showViewMenu) && (
        <div
          className="dropdown-overlay"
          onClick={() => {
            setShowFileMenu(false);
            setShowViewMenu(false);
          }}
        />
      )}
    </>
  );
};

export default Toolbar;
