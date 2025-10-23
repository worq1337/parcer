import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import Icon from '../icons/Icon';
import '../../styles/ColumnMenu.css';

/**
 * ColumnMenu - patch-010 §2, patch-016 §2,3
 * Новое меню колонки с 10 пунктами (как в Excel)
 *
 * Пункты меню:
 * 1. Сортировка ▸ По возрастанию • По убыванию • Сброс сортировки
 * 2. Фильтр по этой колонке...
 * 3. Формат колонки ▸ Выравнивание • Перенос по словам
 * 4. Ширина ▸ Авто-подогнать • Сбросить (patch-016 §2.2: перенесено из ПКМ)
 * 5. Колонки ▸ Скрыть эту • Показать/скрыть...
 * 6. Заморозить ▸ Слева до текущей • Снять заморозку
 * 7. Сброс настроек этой колонки
 */
const ColumnMenu = ({ column, api, position, onClose, showTotalsRow, onToggleTotalsRow }) => {
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);

  const colId = column?.getColId();
  const colDef = column?.getColDef();
  const field = colDef?.field;
  const headerName = colDef?.headerName || field;

  // patch-011 §3: Получаем текущее выравнивание из cellStyle
  const currentAlignment = colDef?.cellStyle?.textAlign || 'left';

  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Обработчики действий

  const handleSort = (direction) => {
    if (!api || !colId) return;

    if (direction === null) {
      // Сброс сортировки
      api.applyColumnState({
        state: [{ colId, sort: null }],
        defaultState: { sort: null },
      });
      toast.success('Сортировка сброшена');
    } else {
      api.applyColumnState({
        state: [{ colId, sort: direction }],
        defaultState: { sort: null },
      });
      toast.success(`Сортировка: ${direction === 'asc' ? 'по возрастанию' : 'по убыванию'}`);
    }
    onClose();
  };

  const handleOpenFilter = () => {
    toast.info('Открытие панели фильтров - функция будет реализована в §6');
    onClose();
  };

  const handleAlignment = (align) => {
    toast.info(`Выравнивание "${align}" - будет сохранено в настройках колонки`);
    // TODO: Сохранить в filtersStore.columnSettings[field].alignment
    onClose();
  };

  const handleWrapText = () => {
    toast.info('Переключение переноса по словам - будет сохранено в настройках');
    // TODO: Переключить в filtersStore.columnSettings[field].wrapText
    onClose();
  };

  const handleAggregateSelection = (type) => {
    if (!api) return;

    const selectedRows = api.getSelectedRows();
    if (selectedRows.length === 0) {
      toast.info('Выделите ячейки для расчёта агрегатов');
      return;
    }

    const values = selectedRows
      .map(row => row[field])
      .filter(val => val !== null && val !== undefined && !isNaN(parseFloat(val)))
      .map(val => parseFloat(String(val).replace(/\s/g, '').replace(',', '.')));

    if (values.length === 0) {
      toast.info('Нет числовых значений для расчёта');
      return;
    }

    let result;
    switch (type) {
      case 'sum':
        result = values.reduce((a, b) => a + b, 0);
        toast.success(`Сумма: ${result.toFixed(2)}`);
        break;
      case 'avg':
        result = values.reduce((a, b) => a + b, 0) / values.length;
        toast.success(`Среднее: ${result.toFixed(2)}`);
        break;
      case 'min':
        result = Math.min(...values);
        toast.success(`Минимум: ${result.toFixed(2)}`);
        break;
      case 'max':
        result = Math.max(...values);
        toast.success(`Максимум: ${result.toFixed(2)}`);
        break;
      case 'count':
        toast.success(`Количество: ${values.length}`);
        break;
      default:
        break;
    }

    onClose();
  };

  const handleToggleTotalsRow = () => {
    if (onToggleTotalsRow) {
      onToggleTotalsRow();
      toast.success(showTotalsRow ? 'Строка итогов скрыта' : 'Строка итогов показана');
    }
    onClose();
  };

  const handleAutoFitWidth = () => {
    if (!api || !column) return;

    api.autoSizeColumns([colId]);
    toast.success('Ширина колонки подогнана');
    onClose();
  };

  const handleResetWidth = () => {
    if (!api || !column) return;

    const defaultWidth = colDef?.width || 100;
    api.setColumnWidth(colId, defaultWidth);
    toast.success('Ширина колонки сброшена');
    onClose();
  };

  const handleHideColumn = () => {
    if (!api || !column) return;

    api.setColumnsVisible([colId], false);
    toast.success(`Колонка "${headerName}" скрыта`);
    onClose();
  };

  const handleShowHideColumns = () => {
    toast.info('Диалог показа/скрытия колонок - будет реализован в §8');
    // TODO: Открыть модал с чекбоксами всех колонок
    onClose();
  };

  const handleFreezeColumn = () => {
    if (!api || !column) return;

    api.setColumnsPinned([colId], 'left');
    toast.success(`Колонка "${headerName}" закреплена слева`);
    onClose();
  };

  const handleUnfreezeColumns = () => {
    if (!api) return;

    // Снимаем закрепление со всех колонок
    const allColumns = api.getAllGridColumns();
    const pinnedCols = allColumns.filter(col => col.getPinned()).map(col => col.getColId());

    api.setColumnsPinned(pinnedCols, null);
    toast.success('Закрепление колонок снято');
    onClose();
  };

  const handleResetColumn = () => {
    if (!api || !column) return;

    // Сбрасываем: ширину, сортировку, закрепление, видимость
    const defaultWidth = colDef?.width || 100;
    api.setColumnWidth(colId, defaultWidth);
    api.applyColumnState({
      state: [{ colId, sort: null }],
    });
    api.setColumnsPinned([colId], null);
    api.setColumnsVisible([colId], true);

    toast.success(`Настройки колонки "${headerName}" сброшены`);
    onClose();
  };

  // Проверяем, является ли колонка числовой
  const isNumericColumn = field === 'amount' || field === 'balance' || field === 'id';

  // Проверяем, поддерживает ли колонка перенос
  const supportsWrap = field === 'operator' || field === 'app';

  return (
    <div
      ref={menuRef}
      className="column-menu"
      style={{
        position: 'fixed',
        top: position?.top || 0,
        left: position?.left || 0,
        zIndex: 10000,
      }}
    >
      {/* 1. Сортировка - patch-016 §2.2 */}
      <div className="menu-section">
        <button className="menu-item" onClick={() => handleSort('asc')}>
          <Icon name="arrow_upward" size={16} />
          <span>Сортировать по возрастанию</span>
        </button>
        <button className="menu-item" onClick={() => handleSort('desc')}>
          <Icon name="arrow_downward" size={16} />
          <span>Сортировать по убыванию</span>
        </button>
        <button className="menu-item" onClick={() => handleSort(null)}>
          <Icon name="undo" size={16} />
          <span>Сбросить сортировку</span>
        </button>
      </div>

      <div className="menu-divider" />

      {/* 2. Фильтр */}
      <button className="menu-item" onClick={handleOpenFilter}>
        <Icon name="filter" size={16} />
        <span>Фильтр по этой колонке...</span>
      </button>

      <div className="menu-divider" />

      {/* 3. Выравнивание */}
      <div
        className="menu-item menu-item-submenu"
        onMouseEnter={() => setActiveSubmenu('alignment')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <Icon name="more_horiz" size={16} />
        <span>Выравнивание</span>
        <Icon name="chevron_right" size={16} className="submenu-arrow" />

        {activeSubmenu === 'alignment' && (
          <div className="submenu">
            <button
              className={`menu-item ${currentAlignment === 'left' ? 'menu-item-checked' : ''}`}
              onClick={() => handleAlignment('left')}
            >
              <span className="unified-menu-item-checkmark">
                {currentAlignment === 'left' && '✓'}
              </span>
              <span>Влево</span>
            </button>
            <button
              className={`menu-item ${currentAlignment === 'center' ? 'menu-item-checked' : ''}`}
              onClick={() => handleAlignment('center')}
            >
              <span className="unified-menu-item-checkmark">
                {currentAlignment === 'center' && '✓'}
              </span>
              <span>По центру</span>
            </button>
            <button
              className={`menu-item ${currentAlignment === 'right' ? 'menu-item-checked' : ''}`}
              onClick={() => handleAlignment('right')}
            >
              <span className="unified-menu-item-checkmark">
                {currentAlignment === 'right' && '✓'}
              </span>
              <span>Вправо</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Перенос по словам */}
      {supportsWrap && (
        <button className="menu-item" onClick={handleWrapText}>
          <Icon name="more_horiz" size={16} />
          <span>Перенос по словам</span>
        </button>
      )}

      {/* 5. Агрегаты по выделению (только для числовых колонок) */}
      {isNumericColumn && (
        <>
          <div className="menu-divider" />
          <div
            className="menu-item menu-item-submenu"
            onMouseEnter={() => setActiveSubmenu('aggregates')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <Icon name="trending_up" size={16} />
            <span>Агрегаты по выделению</span>
            <Icon name="chevron_right" size={16} className="submenu-arrow" />

            {activeSubmenu === 'aggregates' && (
              <div className="submenu">
                <button className="menu-item" onClick={() => handleAggregateSelection('sum')}>
                  <span>Сумма</span>
                </button>
                <button className="menu-item" onClick={() => handleAggregateSelection('avg')}>
                  <span>Среднее</span>
                </button>
                <button className="menu-item" onClick={() => handleAggregateSelection('min')}>
                  <span>Минимум</span>
                </button>
                <button className="menu-item" onClick={() => handleAggregateSelection('max')}>
                  <span>Максимум</span>
                </button>
                <button className="menu-item" onClick={() => handleAggregateSelection('count')}>
                  <span>Количество</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 6. Строка итогов */}
      {isNumericColumn && (
        <button className="menu-item" onClick={handleToggleTotalsRow}>
          <Icon name="more_horiz" size={16} />
          <span>Строка итогов</span>
        </button>
      )}

      <div className="menu-divider" />

      {/* 7. Ширина */}
      <div
        className="menu-item menu-item-submenu"
        onMouseEnter={() => setActiveSubmenu('width')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <Icon name="auto_width" size={16} />
        <span>Ширина</span>
        <Icon name="chevron_right" size={16} className="submenu-arrow" />

        {activeSubmenu === 'width' && (
          <div className="submenu">
            <button className="menu-item" onClick={handleAutoFitWidth}>
              <span>Авто-подогнать</span>
            </button>
            <button className="menu-item" onClick={handleResetWidth}>
              <span>Сбросить</span>
            </button>
          </div>
        )}
      </div>

      {/* 8. Колонки */}
      <div
        className="menu-item menu-item-submenu"
        onMouseEnter={() => setActiveSubmenu('columns')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <Icon name="menu" size={16} />
        <span>Колонки</span>
        <Icon name="chevron_right" size={16} className="submenu-arrow" />

        {activeSubmenu === 'columns' && (
          <div className="submenu">
            <button className="menu-item" onClick={handleHideColumn}>
              <span>Скрыть эту колонку</span>
            </button>
            <button className="menu-item" onClick={handleShowHideColumns}>
              <span>Показать/скрыть...</span>
            </button>
          </div>
        )}
      </div>

      {/* 9. Заморозить */}
      <div
        className="menu-item menu-item-submenu"
        onMouseEnter={() => setActiveSubmenu('freeze')}
        onMouseLeave={() => setActiveSubmenu(null)}
      >
        <Icon name="freeze" size={16} />
        <span>Заморозить</span>
        <Icon name="chevron_right" size={16} className="submenu-arrow" />

        {activeSubmenu === 'freeze' && (
          <div className="submenu">
            <button className="menu-item" onClick={handleFreezeColumn}>
              <span>Слева до текущей</span>
            </button>
            <button className="menu-item" onClick={handleUnfreezeColumns}>
              <span>Снять заморозку</span>
            </button>
          </div>
        )}
      </div>

      <div className="menu-divider" />

      {/* 10. Сброс настроек колонки */}
      <button className="menu-item menu-item-danger" onClick={handleResetColumn}>
        <Icon name="undo" size={16} />
        <span>Сброс настроек колонки</span>
      </button>
    </div>
  );
};

export default ColumnMenu;
