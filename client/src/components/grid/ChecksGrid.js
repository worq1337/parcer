import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { toast } from 'react-toastify';
import { useChecksStore } from '../../state/checksStore';
import { useFiltersStore } from '../../state/filtersStore';
import { useCellStylesStore } from '../../state/cellStylesStore';
import { formatAmount, formatBalance, formatCardLast4, formatP2P } from '../../utils/formatters';
import { prepareForApi, shouldShowToast } from '../../utils/modelTransform';
import {
  isCellInSelection,
  getSelectedCells,
  applyCellStyleToSelection,
  collectNumericValuesFromSelection,
  calculateStats,
  formatNumber,
} from '../../utils/selectionHelpers'; // patch-015
import { useSettingsStore } from '../../state/settingsStore';
import ColorPicker from '../ui/ColorPicker';
import {
  resolveCellColor,
  findColorKeyByHex,
  getCellColorOptions,
  getCellColorName,
} from '../../constants/cellColors';
import Icon from '../icons/Icon';
import ColumnMenuButton from './ColumnMenuButton';
import ColumnMenu from './ColumnMenu';
import ColumnVisibilityModal from '../ColumnVisibilityModal';
import '../../styles/ChecksGrid.css';

const InfoButtonRenderer = (params) => {
  const { data, node, api } = params;
  const onCheckDetails = params.onCheckDetails;

  if (node?.rowPinned || !data || typeof onCheckDetails !== 'function') {
    return null;
  }

  const guardPointer = (event) => {
    event.stopPropagation();
  };

  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    api?.stopEditing();
    onCheckDetails({ ...data });
  };

  return (
    <button
      type="button"
      onMouseDown={guardPointer}
      onDoubleClick={guardPointer}
      onPointerDown={guardPointer}
      onKeyDown={guardPointer}
      onClick={handleClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-accent-primary)',
      }}
      title="Детали чека"
      aria-label={`Детали чека ${data.id ?? ''}`}
    >
      <Icon name="info" size={20} />
    </button>
  );
};

const ALIGNMENT_LABELS = {
  left: 'влево',
  center: 'по центру',
  right: 'вправо',
};

const LARGE_SELECTION_PROGRESS_THRESHOLD = 30000;
const DEBIT_TRANSACTION_TYPES = ['Оплата', 'Списание', 'E-Com', 'Платёж'];
const SOURCE_OPTIONS = ['Telegram', 'SMS', 'Manual'];

const resolveRowNode = (api, rowRef) => {
  if (!api || rowRef === undefined || rowRef === null) {
    return null;
  }

  const ref = String(rowRef);
  let node = api.getRowNode(ref);
  if (node) {
    return node;
  }

  let fallback = null;
  api.forEachNode((candidate) => {
    if (fallback) {
      return;
    }
    const candidateId = candidate?.id !== undefined && candidate?.id !== null ? String(candidate.id) : null;
    const dataId = candidate?.data?.id !== undefined && candidate?.data?.id !== null ? String(candidate.data.id) : null;
    if (candidateId === ref || dataId === ref) {
      fallback = candidate;
    }
  });

  return fallback;
};

const cellsFromSelectionKeys = (api, keys) => {
  if (!api || !Array.isArray(keys) || keys.length === 0) {
    return [];
  }

  const seen = new Set();
  const result = [];

  keys.forEach((rawKey) => {
    if (typeof rawKey !== 'string' || rawKey.length === 0) {
      return;
    }

    const parts = rawKey.split('__');
    if (!parts.length) {
      return;
    }

    const rowToken = parts.shift();
    const colKey = parts.join('__');

    if (!rowToken || !colKey) {
      return;
    }

    const rowNode = resolveRowNode(api, rowToken);
    const rowIndex = typeof rowNode?.rowIndex === 'number' ? rowNode.rowIndex : null;
    const rowNodeId = rowNode?.id !== undefined && rowNode?.id !== null ? String(rowNode.id) : null;
    const rowId = rowNode?.data?.id !== undefined && rowNode?.data?.id !== null
      ? String(rowNode.data.id)
      : (rowNodeId || String(rowToken));

    const dedupeKey = `${rowId}:${colKey}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    result.push({
      rowId,
      rowNodeId,
      colKey,
      rowIndex,
    });
  });

  return result;
};

const getBackgroundColorKeyFromStyle = (style) => {
  if (!style) {
    return null;
  }
  if (style.backgroundColorKey) {
    return style.backgroundColorKey;
  }
  return findColorKeyByHex(style.backgroundColor);
};

const createInitialSelectionStatsState = () => ({
  isOpen: false,
  position: null,
  columnName: '',
  field: null,
  statsByMode: {
    display: null,
    incomeExpense: null,
  },
  activeMode: 'display',
});

const initialColorPickerState = {
  isOpen: false,
  position: null,
  currentColorKey: null,
};

const initialPasteSpecialState = {
  isOpen: false,
  position: null,
};

const normalizeNumericValue = (value) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const GridContextMenu = ({ items, position, onClose }) => {
  const backdropRef = useRef(null);
  const menuRef = useRef(null);
  const submenuRef = useRef(null);
  const MENU_MARGIN = 8;
  const [submenuData, setSubmenuData] = useState(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  useEffect(() => {
    setSubmenuData(null);
  }, [items, position]);

  useLayoutEffect(() => {
    if (!menuRef.current || !position) {
      return;
    }

    const menuEl = menuRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(220, viewportHeight - MENU_MARGIN * 2);
    const maxWidth = Math.max(240, viewportWidth - MENU_MARGIN * 2);

    menuEl.style.maxHeight = `${maxHeight}px`;
    menuEl.style.maxWidth = `${maxWidth}px`;
    menuEl.style.overflowY = 'auto';
    menuEl.style.left = `${position.x}px`;
    menuEl.style.top = `${position.y}px`;

    let rect = menuEl.getBoundingClientRect();
    let nextX = position.x;
    let nextY = position.y;

    if (rect.width > maxWidth) {
      menuEl.style.width = `${maxWidth}px`;
      rect = menuEl.getBoundingClientRect();
    }

    if (rect.right > viewportWidth - MENU_MARGIN) {
      nextX = Math.max(MENU_MARGIN, viewportWidth - rect.width - MENU_MARGIN);
    } else {
      nextX = Math.max(MENU_MARGIN, nextX);
    }

    if (rect.bottom > viewportHeight - MENU_MARGIN) {
      nextY = Math.max(MENU_MARGIN, viewportHeight - rect.height - MENU_MARGIN);
    } else {
      nextY = Math.max(MENU_MARGIN, nextY);
    }

    menuEl.style.left = `${nextX}px`;
    menuEl.style.top = `${nextY}px`;
  }, [position, items]);

  useLayoutEffect(() => {
    if (!submenuData || !submenuRef.current) {
      return;
    }

    const submenuEl = submenuRef.current;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = Math.max(180, viewportHeight - MENU_MARGIN * 2);
    const maxWidth = Math.max(180, viewportWidth - MENU_MARGIN * 2);

    submenuEl.style.maxHeight = `${maxHeight}px`;
    submenuEl.style.maxWidth = `${maxWidth}px`;
    submenuEl.style.overflowY = 'auto';
    submenuEl.style.left = `${submenuData.position.x}px`;
    submenuEl.style.top = `${submenuData.position.y}px`;

    let rect = submenuEl.getBoundingClientRect();
    let nextX = submenuData.position.x;
    let nextY = submenuData.position.y;

    if (rect.width > maxWidth) {
      submenuEl.style.width = `${maxWidth}px`;
      rect = submenuEl.getBoundingClientRect();
    }

    if (rect.right > viewportWidth - MENU_MARGIN) {
      nextX = Math.max(MENU_MARGIN, viewportWidth - rect.width - MENU_MARGIN);
    } else {
      nextX = Math.max(MENU_MARGIN, nextX);
    }

    if (rect.bottom > viewportHeight - MENU_MARGIN) {
      nextY = Math.max(MENU_MARGIN, viewportHeight - rect.height - MENU_MARGIN);
    } else {
      nextY = Math.max(MENU_MARGIN, nextY);
    }

    submenuEl.style.left = `${nextX}px`;
    submenuEl.style.top = `${nextY}px`;
  }, [submenuData]);

  const handleBackdropMouseDown = useCallback((event) => {
    const menuEl = menuRef.current;
    const submenuEl = submenuRef.current;
    const target = event.target;

    if (
      menuEl &&
      !menuEl.contains(target) &&
      (!submenuEl || !submenuEl.contains(target))
    ) {
      onClose();
    }
  }, [onClose]);

  const handleMenuMouseDown = useCallback((event) => {
    event.stopPropagation();
  }, []);

  if (!position) {
    return null;
  }

  return (
    <div
      ref={backdropRef}
      className="grid-context-menu-backdrop"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={menuRef}
        className="grid-context-menu"
        style={{ top: position.y, left: position.x }}
        role="menu"
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={handleMenuMouseDown}
      >
        {items.map((item, index) => {
          if (item === 'separator') {
            return <div key={`separator-${index}`} className="grid-context-menu__separator" />;
          }

          const disabled = Boolean(item.disabled);
          const hasSubmenu = Array.isArray(item.subMenu) && item.subMenu.length > 0;
          const isSubmenuOpen = submenuData?.index === index;

          const itemClasses = ['grid-context-menu__item'];
          if (disabled) itemClasses.push('grid-context-menu__item--disabled');
          if (item.isActive) itemClasses.push('grid-context-menu__item--active');
          if (hasSubmenu) itemClasses.push('grid-context-menu__item--submenu');
          if (isSubmenuOpen) itemClasses.push('grid-context-menu__item--submenu-open');

          const handleClick = (event) => {
            if (disabled) {
              return;
            }

            if (hasSubmenu) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (isSubmenuOpen) {
                setSubmenuData(null);
              } else {
                setSubmenuData({
                  index,
                  items: item.subMenu,
                  position: {
                    x: rect.right,
                    y: rect.top,
                  },
                });
              }
              return;
            }

            setSubmenuData(null);

            if (typeof item.action === 'function') {
              item.action();
            }

            onClose();
          };

          return (
            <button
              key={`${item.name}-${index}`}
              type="button"
              className={itemClasses.join(' ')}
              onClick={handleClick}
              disabled={disabled}
            >
              <span className="grid-context-menu__label">
                {item.isActive && <span className="grid-context-menu__bullet" />}
                <span>{item.name}</span>
              </span>
              <span className="grid-context-menu__shortcut-container">
                {item.shortcut && (
                  <span className="grid-context-menu__shortcut">{item.shortcut}</span>
                )}
                {hasSubmenu && <span className="grid-context-menu__arrow">▸</span>}
              </span>
            </button>
          );
        })}
      </div>

      {submenuData && (
        <div
          ref={submenuRef}
          className="grid-context-menu grid-context-submenu"
          style={{
            top: submenuData.position.y,
            left: submenuData.position.x,
          }}
          role="menu"
          onContextMenu={(event) => event.preventDefault()}
          onMouseDown={handleMenuMouseDown}
        >
          {submenuData.items.map((subItem, subIndex) => {
            if (subItem === 'separator') {
              return <div key={`submenu-separator-${subIndex}`} className="grid-context-menu__separator" />;
            }

            const disabled = Boolean(subItem.disabled);
            const itemClasses = ['grid-context-menu__item'];
            if (disabled) itemClasses.push('grid-context-menu__item--disabled');
            if (subItem.isActive) itemClasses.push('grid-context-menu__item--active');

            const handleSubClick = () => {
              if (disabled) {
                return;
              }

              if (typeof subItem.action === 'function') {
                subItem.action();
              }

              onClose();
            };

            return (
              <button
                key={`${subItem.name}-${subIndex}`}
                type="button"
                className={itemClasses.join(' ')}
                onClick={handleSubClick}
                disabled={disabled}
              >
                <span className="grid-context-menu__label">
                  {subItem.isActive && <span className="grid-context-menu__bullet" />}
                  <span>{subItem.name}</span>
                </span>
                {subItem.shortcut && (
                  <span className="grid-context-menu__shortcut">{subItem.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SelectionStatsPopover = ({
  isOpen,
  position,
  columnName,
  activeMode,
  statsByMode,
  onModeChange,
  onCopy,
  onClose,
  formatValue,
  formatCount,
}) => {
  const popoverRef = useRef(null);
  const MODES = [
    { key: 'display', label: 'Как отображается' },
    { key: 'incomeExpense', label: 'Приход–расход' },
  ];

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleMouseDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen || !popoverRef.current || !position) {
      return;
    }

    const popover = popoverRef.current;
    const { innerWidth, innerHeight } = window;
    const padding = 12;

    popover.style.left = `${position.x}px`;
    popover.style.top = `${position.y}px`;

    const rect = popover.getBoundingClientRect();
    let nextX = position.x;
    let nextY = position.y;

    if (rect.right > innerWidth - padding) {
      nextX = Math.max(padding, innerWidth - rect.width - padding);
    } else {
      nextX = Math.max(padding, nextX);
    }

    if (rect.bottom > innerHeight - padding) {
      nextY = Math.max(padding, innerHeight - rect.height - padding);
    } else {
      nextY = Math.max(padding, nextY);
    }

    popover.style.left = `${nextX}px`;
    popover.style.top = `${nextY}px`;
  }, [isOpen, position]);

  if (!isOpen || !position) {
    return null;
  }

  const stats = statsByMode[activeMode];

  return (
    <div
      ref={popoverRef}
      className="selection-stats-popover"
      style={{ top: position.y, left: position.x }}
      role="dialog"
      aria-modal="true"
    >
      <div className="selection-stats-popover__header">
        <span className="selection-stats-popover__title">
          Посчитать — {columnName}
        </span>
        <button
          type="button"
          className="selection-stats-popover__close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      <div className="selection-stats-popover__modes">
        {MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            className={`selection-stats-popover__mode ${activeMode === mode.key ? 'is-active' : ''}`}
            onClick={() => onModeChange(mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {stats ? (
        <>
          <div className="selection-stats-popover__stats">
            <div className="selection-stats-popover__row">
              <span className="selection-stats-popover__label">Σ</span>
              <span className="selection-stats-popover__value">{formatValue(stats.sum)}</span>
            </div>
            <div className="selection-stats-popover__row">
              <span className="selection-stats-popover__label">Avg</span>
              <span className="selection-stats-popover__value">{formatValue(stats.avg)}</span>
            </div>
            <div className="selection-stats-popover__row">
              <span className="selection-stats-popover__label">Min</span>
              <span className="selection-stats-popover__value">{formatValue(stats.min)}</span>
            </div>
            <div className="selection-stats-popover__row">
              <span className="selection-stats-popover__label">Max</span>
              <span className="selection-stats-popover__value">{formatValue(stats.max)}</span>
            </div>
            <div className="selection-stats-popover__row">
              <span className="selection-stats-popover__label">Кол-во</span>
              <span className="selection-stats-popover__value">{formatCount(stats.count)}</span>
            </div>
          </div>
          <button
            type="button"
            className="selection-stats-popover__copy"
            onClick={onCopy}
          >
            Копировать результат
          </button>
        </>
      ) : (
        <div className="selection-stats-popover__empty">Нет числовых значений в выделении</div>
      )}
    </div>
  );
};

const PasteSpecialPopover = ({ isOpen, position, onSelect, onClose }) => {
  const popoverRef = useRef(null);
  const options = [
    {
      mode: 'values',
      title: 'Только значения',
      description: 'Вставить данные без форматирования',
    },
    {
      mode: 'format',
      title: 'Только формат',
      description: 'Применить скопированный стиль ячейки',
    },
  ];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onSelect('values');
      } else if (event.key === '1') {
        event.preventDefault();
        onSelect('values');
      } else if (event.key === '2') {
        event.preventDefault();
        onSelect('format');
      }
    };

    const handleMouseDown = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, onClose, onSelect]);

  useLayoutEffect(() => {
    if (!isOpen || !popoverRef.current || !position) {
      return;
    }

    const popover = popoverRef.current;
    const { innerWidth, innerHeight } = window;
    const padding = 12;

    popover.style.left = `${position.x}px`;
    popover.style.top = `${position.y}px`;

    const rect = popover.getBoundingClientRect();
    let nextX = position.x;
    let nextY = position.y;

    if (rect.right > innerWidth - padding) {
      nextX = Math.max(padding, innerWidth - rect.width - padding);
    } else {
      nextX = Math.max(padding, nextX);
    }

    if (rect.bottom > innerHeight - padding) {
      nextY = Math.max(padding, innerHeight - rect.height - padding);
    } else {
      nextY = Math.max(padding, nextY);
    }

    popover.style.left = `${nextX}px`;
    popover.style.top = `${nextY}px`;
  }, [isOpen, position]);

  if (!isOpen || !position) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      className="paste-special-popover"
      style={{ top: position.y, left: position.x }}
      role="dialog"
      aria-modal="true"
    >
      <div className="paste-special-popover__header">
        <span className="paste-special-popover__title">Специальная вставка</span>
        <button type="button" className="paste-special-popover__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <div className="paste-special-popover__options">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="paste-special-popover__option"
            onClick={() => onSelect(option.mode)}
          >
            <span className="paste-special-popover__option-title">{option.title}</span>
            <span className="paste-special-popover__option-description">{option.description}</span>
          </button>
        ))}
      </div>
      <div className="paste-special-popover__hint">Enter / 1 — значения, 2 — формат, Esc — закрыть</div>
    </div>
  );
};

/**
 * Переработанная таблица чеков
 * Согласно patch.md §1-3 и patch-003
 */
const ChecksGrid = ({
  onCheckDetails,
  onAutoFitColumns,
  onResetWidths,
  onActiveCellChange,
  onSelectionRangesChange,
  gridApiRef,
  resolvedTheme = 'light',
}) => {
  const gridRef = useRef(null);
  const [selectedCells, setSelectedCells] = useState([]);
  const [activeCell, setActiveCell] = useState(null);
  const [contextMenuState, setContextMenuState] = useState({
    isOpen: false,
    position: null,
    params: null,
  });
  const [cellSelectionState, setCellSelectionState] = useState({
    isSelecting: false,
    anchor: null,
    focus: null,
    keys: [],
  });

  const selectedCellKeySet = useMemo(
    () => new Set(cellSelectionState.keys),
    [cellSelectionState.keys]
  );

  const buildSelectionSnapshot = useCallback((api, options = {}) => {
    if (!api) {
      return [];
    }

    const { fallbackCell = null, includeFocusFallback = true } = options;

    const directSelection = getSelectedCells(api);
    if (directSelection.length > 0) {
      return directSelection;
    }

    const keySelection = cellsFromSelectionKeys(api, cellSelectionState.keys);
    if (keySelection.length > 0) {
      return keySelection;
    }

    if (fallbackCell && fallbackCell.node && fallbackCell.column) {
      const rowNode = fallbackCell.node;
      const column = fallbackCell.column;
      const colDef = typeof column.getColDef === 'function' ? column.getColDef() : null;
      const colKey = colDef?.field
        || (typeof column.getColId === 'function' ? column.getColId() : null)
        || (typeof column === 'string' ? column : null);
      const rowId = rowNode?.data?.id !== undefined && rowNode?.data?.id !== null
        ? String(rowNode.data.id)
        : rowNode?.id !== undefined && rowNode?.id !== null
          ? String(rowNode.id)
          : null;

      if (colKey && rowId) {
        return [{
          rowId,
          rowNodeId: rowNode?.id !== undefined && rowNode?.id !== null ? String(rowNode.id) : null,
          colKey,
          rowIndex: typeof rowNode.rowIndex === 'number' ? rowNode.rowIndex : null,
        }];
      }
    }

    if (includeFocusFallback) {
      const focusedCell = api.getFocusedCell?.();
      if (focusedCell && focusedCell.column) {
        const colDef = typeof focusedCell.column.getColDef === 'function' ? focusedCell.column.getColDef() : null;
        const colKey = colDef?.field
          || (typeof focusedCell.column.getColId === 'function' ? focusedCell.column.getColId() : null);
        const rowNode = typeof focusedCell.rowIndex === 'number'
          ? api.getDisplayedRowAtIndex(focusedCell.rowIndex)
          : resolveRowNode(api, focusedCell.rowIndex);

        const rowId = rowNode?.data?.id !== undefined && rowNode?.data?.id !== null
          ? String(rowNode.data.id)
          : rowNode?.id !== undefined && rowNode?.id !== null
            ? String(rowNode.id)
            : null;

        if (rowId && colKey) {
          return [{
            rowId,
            rowNodeId: rowNode?.id !== undefined && rowNode?.id !== null ? String(rowNode.id) : null,
            colKey,
            rowIndex: typeof rowNode?.rowIndex === 'number' ? rowNode.rowIndex : null,
          }];
        }
      }
    }

    return [];
  }, [cellSelectionState.keys]);

  const cellCountFormatter = useMemo(() => new Intl.NumberFormat('ru-RU'), []);

  const formatCellsAmount = useCallback(
    (count) => cellCountFormatter.format(count),
    [cellCountFormatter]
  );

  const { numberFormatting, transactionLogic } = useSettingsStore();
  const autoNegativeForDebits = transactionLogic?.autoNegativeForDebits !== false;

  const [selectionStatsState, setSelectionStatsState] = useState(() => createInitialSelectionStatsState());
  const [colorPickerState, setColorPickerState] = useState(initialColorPickerState);
  const colorPickerTargetRef = useRef(null);
  const [pasteSpecialState, setPasteSpecialState] = useState(initialPasteSpecialState);
  const pasteSpecialTargetRef = useRef(null);

  const closeColorPicker = useCallback(() => {
    setColorPickerState(initialColorPickerState);
    colorPickerTargetRef.current = null;
  }, []);

  const closePasteSpecialMenu = useCallback(() => {
    setPasteSpecialState(initialPasteSpecialState);
    pasteSpecialTargetRef.current = null;
  }, []);

  const decimalSeparator = numberFormatting?.decimalSeparator ?? ',';
  const thousandsSeparator = Boolean(numberFormatting?.thousandsSeparator);

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ columns: ['amount'], force: true });
    }
  }, [numberFormatting.thousandsSeparator, numberFormatting.decimalSeparator]);

  const formatSelectionNumber = useCallback(
    (value) =>
      formatNumber(value, {
        decimalSeparator,
        thousandsSeparator,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [decimalSeparator, thousandsSeparator]
  );

  const closeSelectionStatsPopover = useCallback(() => {
    setSelectionStatsState((prev) => (prev.isOpen ? createInitialSelectionStatsState() : prev));
  }, []);

  const handleSelectionStatsModeChange = useCallback((mode) => {
    if (mode !== 'display' && mode !== 'incomeExpense') {
      return;
    }

    setSelectionStatsState((prev) => {
      if (!prev.isOpen || prev.activeMode === mode) {
        return prev;
      }

      return {
        ...prev,
        activeMode: mode,
      };
    });
  }, []);

  const handleCopySelectionStats = useCallback(() => {
    if (!selectionStatsState.isOpen) {
      toast.info('Нет данных для копирования');
      return;
    }

    const stats = selectionStatsState.statsByMode[selectionStatsState.activeMode];
    if (!stats) {
      toast.info('Нет данных для копирования');
      return;
    }

    const result = `Σ: ${formatSelectionNumber(stats.sum)}; Avg: ${formatSelectionNumber(stats.avg)}; Min: ${formatSelectionNumber(stats.min)}; Max: ${formatSelectionNumber(stats.max)}; Count: ${formatCellsAmount(stats.count)}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(result)
        .then(() => {
          toast.success('Результат скопирован');
        })
        .catch(() => {
          toast.info(result);
        });
    } else {
      toast.info(result);
    }
  }, [formatCellsAmount, formatSelectionNumber, selectionStatsState]);

  const {
    getCellStyle,
    setBackgroundColor,
    setAlignment,
    setWrapText,
    applyStylesBatch,
  } = useCellStylesStore();
  const { pushHistory } = useChecksStore();

  const applyStylePatchToSelection = useCallback(async ({ params, stylePatch, buildMessage, emptySelectionMessage }) => {
    if (!params?.api) {
      return null;
    }

    const selectionSnapshot = buildSelectionSnapshot(params.api, {
      fallbackCell: params,
    });
    if (selectionSnapshot.length === 0) {
      toast.info(emptySelectionMessage || 'Сначала выделите ячейки');
      return null;
    }

    const totalCells = selectionSnapshot.length;
    const showProgress = totalCells > LARGE_SELECTION_PROGRESS_THRESHOLD;
    let toastId = null;

    let progressHandler;
    if (showProgress) {
      toastId = toast.loading('Применение формата… 0%');
      progressHandler = (processed, total) => {
        const denominator = total || totalCells;
        const percent = denominator === 0 ? 100 : Math.min(100, Math.round((processed / denominator) * 100));
        toast.update(toastId, {
          render: `Применение формата… ${percent}%`,
          type: 'info',
          isLoading: true,
          autoClose: false,
        });
      };
    }

    try {
      const result = await applyCellStyleToSelection({
        api: params.api,
        stylePatch,
        getCellStyle,
        applyStylesBatch,
        pushHistory,
        cells: selectionSnapshot,
        onProgress: progressHandler,
      });

      if (!result || result.cellsAffected === 0) {
        if (toastId) {
          toast.update(toastId, {
            render: 'Изменений не требуется',
            type: 'info',
            isLoading: false,
            autoClose: 2000,
          });
        } else {
          toast.info('Формат без изменений');
        }
        return result;
      }

      const message =
        typeof buildMessage === 'function'
          ? buildMessage(result)
          : typeof buildMessage === 'string'
            ? buildMessage
            : 'Формат применён';

      if (toastId) {
        toast.update(toastId, {
          render: message,
          type: 'success',
          isLoading: false,
          autoClose: 2000,
        });
      } else if (message) {
        toast.success(message);
      }

      return result;
    } catch (error) {
      console.error('Ошибка применения формата', error);
      if (toastId) {
        toast.update(toastId, {
          render: 'Ошибка при применении формата',
          type: 'error',
          isLoading: false,
          autoClose: 4000,
        });
      } else {
        toast.error('Ошибка при применении формата');
      }
      return null;
    }
  }, [applyStylesBatch, buildSelectionSnapshot, getCellStyle, pushHistory]);

  // patch-010 §1,2: Состояние для меню колонки
  const [columnMenuState, setColumnMenuState] = useState({
    isOpen: false,
    column: null,
    position: null,
  });

  const [showColumnVisibilityModal, setShowColumnVisibilityModal] = useState(false);

  // patch-010 §4: Состояние для строки итогов
  const [showTotalsRow, setShowTotalsRow] = useState(false);
  const [pinnedBottomRowData, setPinnedBottomRowData] = useState([]);

  // Zustand stores
  const {
    checks,
    loading,
    loadChecks,
    deleteCheck,
    deleteChecks,
    updateCheck,
    updateChecks,
    addCheck,
  } = useChecksStore();

  const {
    p2pFilter,
    currencyFilter,
    quickSearch,
    applyFilters,
    columnSettings,
    setColumnWidth,
    cellDensity,
    setCellDensity,
    dateFilter,
    textFilters,
    numericFilters,
    updateTextFilter,
    updateNumericFilter,
    setFiltersPanelOpen,
    addCellMerge,
    removeCellMerge,
  } = useFiltersStore();

  // FIX: Remove duplicate loadChecks() - already called in App.js
  // useEffect(() => {
  //   loadChecks();
  // }, [loadChecks]);

  // Применение фильтров
  // FIX: Убраны избыточные зависимости - applyFilters сам использует все фильтры из store
  const filteredChecks = useMemo(() => {
    return applyFilters(checks);
  }, [checks, applyFilters]);

  // patch-013: Передаем gridApi наружу через ref
  useEffect(() => {
    if (gridApiRef && gridRef.current?.api) {
      gridApiRef.current = gridRef.current.api;
    }
  }, [gridApiRef]);

  const recalcTotalsRow = useCallback(() => {
    if (!showTotalsRow) {
      setPinnedBottomRowData([]);
      return;
    }

    let amountSum = 0;
    let balanceSum = 0;
    let visibleCount = 0;

    const api = gridRef.current?.api;

    if (api) {
      api.forEachNodeAfterFilterAndSort((node) => {
        if (!node || node.rowPinned || !node.data) {
          return;
        }

        const amountValue = normalizeNumericValue(node.data.amount);
        if (amountValue !== null) {
          amountSum += amountValue;
        }

        const balanceValue = normalizeNumericValue(node.data.balance);
        if (balanceValue !== null) {
          balanceSum += balanceValue;
        }

        visibleCount += 1;
      });
    } else {
      filteredChecks.forEach((row) => {
        if (!row) return;

        const amountValue = normalizeNumericValue(row.amount);
        if (amountValue !== null) {
          amountSum += Math.abs(amountValue);
        }

        const balanceValue = normalizeNumericValue(row.balance);
        if (balanceValue !== null) {
          balanceSum += Math.abs(balanceValue);
        }

        visibleCount += 1;
      });
    }

    const totalsRow = {
      id: 'TOTALS',
      datetime: '',
      weekday: '',
      date_display: '',
      time_display: '',
      operator: `Всего: ${formatCellsAmount(visibleCount)}`,
      app: '',
      amount: formatSelectionNumber(amountSum),
      balance: formatSelectionNumber(balanceSum),
      card_last4: '',
      is_p2p: '',
      transaction_type: '',
      currency: '',
      source: '',
      info: '',
    };

    setPinnedBottomRowData([totalsRow]);
  }, [filteredChecks, formatCellsAmount, formatSelectionNumber, showTotalsRow]);

  useEffect(() => {
    recalcTotalsRow();
  }, [recalcTotalsRow]);

  const handleGridStateChange = useCallback(() => {
    recalcTotalsRow();
  }, [recalcTotalsRow]);

  // patch-010 §1,2: Обработчик открытия меню колонки
  const handleColumnMenuClick = useCallback((params) => {
    if (!params || !gridRef.current) return;

    const { column, eHeaderCell } = params;
    if (!column || !eHeaderCell) return;

    // Получаем позицию заголовка для размещения меню
    const rect = eHeaderCell.getBoundingClientRect();

    setColumnMenuState({
      isOpen: true,
      column,
      position: {
        top: rect.bottom + 2,
        left: rect.left,
      },
    });
  }, []);

  // Закрытие меню колонки
  const handleCloseColumnMenu = useCallback(() => {
    setColumnMenuState({
      isOpen: false,
      column: null,
      position: null,
    });
  }, []);

  // Настройки плотности ячеек согласно patch-003 §2
  const densitySettings = useMemo(() => {
    const settings = {
      compact: { rowHeight: 28, cellPadding: 6 },
      standard: { rowHeight: 36, cellPadding: 10 },
      large: { rowHeight: 44, cellPadding: 14 },
    };
    return settings[cellDensity] || settings.standard;
  }, [cellDensity]);

  // patch-012: Функция для применения пользовательских стилей к ячейкам
  const applyCellStyle = useCallback((params, baseStyle = {}) => {
    if (!params || !params.data || !params.colDef || !params.colDef.field) return baseStyle;

    const checkId = params.data.id;
    const rowNodeId = params.node?.id ?? checkId;
    const field = params.colDef.field;
    const userStyle = getCellStyle(checkId, field);
    const cellKey = `${rowNodeId}__${field}`;
    const backgroundColorKey = getBackgroundColorKeyFromStyle(userStyle);
    const resolvedBackgroundColor =
      resolveCellColor(resolvedTheme, backgroundColorKey) ||
      userStyle.backgroundColor ||
      null;

    // Get column-level settings from filtersStore (applied to all cells in column)
    const columnAlignment = columnSettings.alignment[field];
    const columnWrapText = columnSettings.wrapText[field];

    const mergedStyle = {
      ...baseStyle,
      ...(resolvedBackgroundColor && { backgroundColor: resolvedBackgroundColor }),
      // Apply column-level alignment first, then cell-level (cell-level takes precedence)
      ...(columnAlignment && { textAlign: columnAlignment }),
      ...(userStyle.alignment && { textAlign: userStyle.alignment }),
      // Apply column-level wrap first, then cell-level (cell-level takes precedence)
      ...(columnWrapText && { whiteSpace: 'normal', wordWrap: 'break-word' }),
      ...(userStyle.wrapText && { whiteSpace: 'normal', wordWrap: 'break-word' }),
    };

    if (selectedCellKeySet.has(cellKey)) {
      return {
        ...mergedStyle,
        boxShadow: 'inset 0 0 0 2px rgba(37, 99, 235, 0.75)',
      };
    }

    return mergedStyle;
  }, [getCellStyle, resolvedTheme, selectedCellKeySet, columnSettings]);

  const computeSelectionKeys = useCallback((anchor, focus, api) => {
    if (!anchor || !focus || !api) return [];

    const columns = api.getAllDisplayedColumns();
    const columnIds = columns.map(col => col.getColId());
    const startRow = Math.min(anchor.rowIndex, focus.rowIndex);
    const endRow = Math.max(anchor.rowIndex, focus.rowIndex);
    const startColIndex = columnIds.indexOf(anchor.colId);
    const endColIndex = columnIds.indexOf(focus.colId);

    if (startColIndex === -1 || endColIndex === -1) {
      return [];
    }

    const fromCol = Math.min(startColIndex, endColIndex);
    const toCol = Math.max(startColIndex, endColIndex);
    const keys = [];

    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      const rowNode = api.getDisplayedRowAtIndex(rowIndex);
      if (!rowNode || !rowNode.data) continue;

      const rowId = rowNode.id ?? rowNode.data.id;
      if (rowId === undefined || rowId === null) continue;

      for (let colIndex = fromCol; colIndex <= toCol; colIndex++) {
        const colId = columnIds[colIndex];
        if (!colId) continue;
        keys.push(`${rowId}__${colId}`);
      }
    }

    return keys;
  }, []);

  const buildNewCheckPayload = useCallback((referenceData) => {
    const now = new Date();
    const localeDate = now.toLocaleDateString('ru-RU');
    const localeTime = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const weekday = now.toLocaleDateString('ru-RU', { weekday: 'short' });

    const normalize = (value, fallback = '') => {
      if (value === null || value === undefined) {
        return fallback;
      }
      return value;
    };

    const reference = referenceData || {};
    const fallbackCard = String(1000 + Math.floor(Math.random() * 9000));
    const cardLast4 = normalize(reference.card_last4 || reference.cardLast4, fallbackCard);

    return {
      datetime: now.toISOString(),
      weekday,
      dateDisplay: localeDate,
      timeDisplay: localeTime,
      operator: normalize(reference.operator),
      app: normalize(reference.app, ''),
      amount: 0,
      balance: Number.isFinite(reference.balance) ? reference.balance : 0,
      cardLast4,
      isP2p: false,
      transactionType: normalize(reference.transaction_type || reference.transactionType, 'Оплата'),
      currency: normalize(reference.currency, 'UZS'),
      source: normalize(reference.source, 'Manual'),
      rawText: '',
      addedVia: 'manual',
    };
  }, []);

  const handleCellMouseDown = useCallback((params) => {
    if (!params?.event || params.event.button !== 0) return;
    if (!params.node || !params.column) return;

    if (typeof params.event.preventDefault === 'function') {
      params.event.preventDefault();
    }
    if (typeof params.event.stopPropagation === 'function') {
      params.event.stopPropagation();
    }

    if (typeof window.getSelection === 'function') {
      try {
        const selection = window.getSelection();
        if (selection && typeof selection.removeAllRanges === 'function') {
          selection.removeAllRanges();
        }
      } catch (err) {
        // ignore selection errors
      }
    }

    const colId = params.column.getColId();
    if (!colId) return;

    const rowIndex = params.node.rowIndex;
    const anchor = params.event.shiftKey && cellSelectionState.anchor
      ? cellSelectionState.anchor
      : { rowIndex, colId };
    const focus = { rowIndex, colId };
    const keys = computeSelectionKeys(anchor, focus, params.api);

    setCellSelectionState({
      isSelecting: true,
      anchor,
      focus,
      keys,
    });

    const finishSelection = () => {
      setCellSelectionState((prev) => ({
        ...prev,
        isSelecting: false,
      }));
      window.removeEventListener('mouseup', finishSelection);
    };

    window.addEventListener('mouseup', finishSelection);
  }, [cellSelectionState.anchor, computeSelectionKeys]);

  const handleCellMouseOver = useCallback((params) => {
    if (!cellSelectionState.isSelecting) return;
    if (!params?.node || !params.column) return;
    const colId = params.column.getColId();
    if (!colId) return;

    if (params.event && typeof params.event.preventDefault === 'function') {
      params.event.preventDefault();
    }

    const focus = {
      rowIndex: params.node.rowIndex,
      colId,
    };

    const keys = computeSelectionKeys(cellSelectionState.anchor, focus, params.api);
    setCellSelectionState((prev) => ({
      ...prev,
      focus,
      keys,
    }));
  }, [cellSelectionState.isSelecting, cellSelectionState.anchor, computeSelectionKeys]);

  // Определение колонок согласно §17
  const infoButtonParams = useMemo(() => ({ onCheckDetails }), [onCheckDetails]);

  const columnDefs = useMemo(() => [
    {
      headerName: '№',
      field: 'id', // Сохраняем 'id' как идентификатор колонки для настроек
      width: columnSettings.widths['id'] || 64,
      filter: 'agNumberColumnFilter',
      pinned: 'left',
      cellClass: 'cell-number',
      editable: false,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      sortable: false, // patch-017 §3: нельзя сортировать по порядковому номеру
      // patch-017 §3: динамический номер = позиция в текущем отображаемом порядке
      valueGetter: (params) => {
        // Используем rowIndex + 1 для нумерации с 1 (вместо ID из БД)
        return params.node && params.node.rowIndex !== null && params.node.rowIndex !== undefined
          ? params.node.rowIndex + 1
          : null;
      },
    },
    {
      headerName: 'Дата и время',
      field: 'datetime',
      width: columnSettings.widths['datetime'] || 180,
      filter: 'agDateColumnFilter',
      editable: true, // patch-007 §1
      cellEditor: 'agTextCellEditor', // TODO: Комбинированный date+time редактор
      valueFormatter: params => {
        if (!params.value) return '';
        const date = new Date(params.value);
        return date.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      headerName: 'Д.н.',
      field: 'weekday',
      width: columnSettings.widths['weekday'] || 56,
      filter: 'agTextColumnFilter',
      cellClass: 'cell-centered',
      editable: false,
      cellStyle: (params) =>
        applyCellStyle(params, {
          color: 'var(--color-text-secondary)',
          fontWeight: '500',
        }),
    },
    {
      headerName: 'Дата',
      field: 'date_display',
      width: columnSettings.widths['date_display'] || 84,
      filter: 'agTextColumnFilter',
      editable: false,
      cellClass: 'cell-monospace',
    },
    {
      headerName: 'Время',
      field: 'time_display',
      width: columnSettings.widths['time_display'] || 72,
      filter: 'agTextColumnFilter',
      editable: false,
      cellClass: 'cell-monospace',
    },
    {
      headerName: 'Оператор/Продавец',
      field: 'operator',
      width: columnSettings.widths['operator'] || 260,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agTextCellEditor', // TODO: Автокомплит по словарю операторов (patch-007 §1)
      wrapText: cellDensity === 'large', // patch-007 §2
      autoHeight: cellDensity === 'large', // patch-007 §2
      cellStyle: (params) => applyCellStyle(params, {
        whiteSpace: cellDensity === 'large' ? 'normal' : 'nowrap',
        overflow: cellDensity === 'large' ? 'visible' : 'hidden',
        textOverflow: cellDensity === 'large' ? 'clip' : 'ellipsis',
      }),
      tooltipField: 'operator', // patch-007 §2: тултип с полным значением
    },
    {
      headerName: 'Приложение',
      field: 'app',
      width: columnSettings.widths['app'] || 120,
      filter: 'agTextColumnFilter',
      editable: true, // patch-007 §1: выпадающий список
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['—', 'Uzcard', 'Humo', 'Payme', 'Click', 'Oson', 'Alif', 'Apelsin'],
      },
      valueFormatter: params => {
        const value = params.value;
        if (value === null || value === undefined || value === '' || value === '—') {
          return '—';
        }
        return value;
      },
      wrapText: cellDensity === 'large', // patch-007 §2
      autoHeight: cellDensity === 'large', // patch-007 §2
      cellStyle: (params) => {
        if (!params || !params.data) return {};
        return applyCellStyle(params, {
          color: params.value ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
          fontWeight: params.value ? '500' : '400',
          fontStyle: params.value ? 'normal' : 'italic',
          whiteSpace: cellDensity === 'large' ? 'normal' : 'nowrap',
          overflow: cellDensity === 'large' ? 'visible' : 'hidden',
          textOverflow: cellDensity === 'large' ? 'clip' : 'ellipsis',
        });
      },
      tooltipField: 'app', // patch-007 §2
    },
    {
      headerName: 'Сумма',
      field: 'amount',
      width: columnSettings.widths['amount'] || 140,
      filter: 'agNumberColumnFilter',
      editable: true,
      cellEditor: 'agTextCellEditor', // patch-007 §1: текстовый для ввода запятой
      valueFormatter: (params) => {
        const { value } = params;
        if (value === null || value === undefined) {
          return '';
        }

        const numericValue = typeof value === 'number' ? value : Number(value);
        if (Number.isNaN(numericValue)) {
          return String(value);
        }

        return formatAmount(numericValue, numberFormatting);
      },
      valueParser: params => {
        // patch-007 §4: парсер ввода - принимаем и запятую, и точку
        const strValue = String(params.newValue).replace(/\s/g, '').replace(',', '.');
        return parseFloat(strValue);
      },
      cellStyle: (params) => applyCellStyle(params, {
        // patch-007 §9: убираем цветную окраску, только монохром
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }),
      cellClass: 'cell-number',
    },
    {
      headerName: 'Остаток',
      field: 'balance',
      width: columnSettings.widths['balance'] || 140,
      filter: 'agNumberColumnFilter',
      editable: true,
      cellEditor: 'agTextCellEditor', // patch-007 §1: текстовый для ввода запятой
      valueFormatter: params => {
        const { value } = params;
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        // patch-007 §4: формат dddddd,dd без разделителя тысяч
        return formatBalance(value, numberFormatting);
      },
      valueParser: params => {
        // patch-007 §4: парсер ввода - принимаем и запятую, и точку
        const strValue = String(params.newValue).replace(/\s/g, '').replace(',', '.');
        return parseFloat(strValue);
      },
      cellClass: 'cell-number',
      cellStyle: (params) => applyCellStyle(params, {
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }),
    },
    {
      headerName: 'ПК',
      field: 'card_last4',
      width: columnSettings.widths['card_last4'] || 84,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => formatCardLast4(params.value),
      valueParser: params => {
        // patch-007 §1: только 4 цифры, убираем * и другие символы
        return String(params.newValue).replace(/\D/g, '').slice(-4);
      },
      cellClass: 'cell-monospace cell-centered',
    },
    {
      headerName: 'P2P',
      field: 'is_p2p',
      width: columnSettings.widths['is_p2p'] || 72,
      filter: 'agTextColumnFilter',
      editable: true, // patch-006 §6: делаем редактируемым
      valueFormatter: params => {
        // patch-006 §6: показываем "1" если есть, пусто если нет
        return formatP2P(params.value);
      },
      cellClass: 'cell-centered',
      cellStyle: (params) => applyCellStyle(params, {
        fontVariantNumeric: 'tabular-nums',
      }),
    },
    {
      headerName: 'Тип',
      field: 'transaction_type',
      width: columnSettings.widths['transaction_type'] || 140,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: [
          'Оплата',
          'Пополнение',
          'Конверсия',
          'E-Com',
          'Списание',
          'Платёж',
          'Возврат',
        ],
      },
    },
    {
      headerName: 'Валюта',
      field: 'currency',
      width: columnSettings.widths['currency'] || 84,
      filter: 'agTextColumnFilter',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['UZS', 'USD'],
      },
      cellClass: 'cell-centered',
    },
    {
      headerName: 'Источник',
      field: 'source',
      width: columnSettings.widths['source'] || 120,
      filter: 'agSetColumnFilter',
      filterParams: {
        values: SOURCE_OPTIONS,
        suppressMiniFilter: false,
      },
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: SOURCE_OPTIONS,
      },
      valueSetter: (params) => {
        const nextValue = typeof params.newValue === 'string' ? params.newValue.trim() : '';
        const resolved = SOURCE_OPTIONS.find(
          (option) => option.toLowerCase() === nextValue.toLowerCase()
        );
        if (!resolved) {
          return false;
        }
        if (params.data.source === resolved) {
          return false;
        }
        params.data.source = resolved;
        return true;
      },
      cellRenderer: (params) => {
        const resolved = SOURCE_OPTIONS.find(
          (option) => option.toLowerCase() === String(params.value ?? '').toLowerCase()
        ) || 'Manual';
        const iconMap = {
          Telegram: 'telegram',
          SMS: 'sms',
          Manual: 'manual',
        };
        const icon = iconMap[resolved] || 'info';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon name={icon} size={16} />
            <span>{resolved}</span>
          </div>
        );
      },
    },
    {
      headerName: '',
      field: 'info',
      width: columnSettings.widths['info'] || 48,
      pinned: 'right',
      sortable: false,
      filter: false,
      editable: false,
      suppressNavigable: true,
      resizable: false,
      cellRenderer: InfoButtonRenderer,
      cellRendererParams: infoButtonParams,
    },
  ], [columnSettings.widths, infoButtonParams, cellDensity, applyCellStyle, numberFormatting]);

  // patch-010 §1: Фабрика для кастомного заголовка колонки
  const CustomHeaderComponent = useCallback((props) => {
    const headerRef = useRef(null);

    const handleMenuClick = () => {
      if (headerRef.current) {
        handleColumnMenuClick({
          column: props.column,
          eHeaderCell: headerRef.current.parentElement,
        });
      }
    };

    return (
      <div ref={headerRef}>
        <ColumnMenuButton {...props} onMenuClick={handleMenuClick} />
      </div>
    );
  }, [handleColumnMenuClick]);

  // Настройки по умолчанию для колонок
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: false, // patch-008 §3: Убираем колонечные фильтры
    resizable: true,
    floatingFilter: false, // Отключаем встроенные фильтры AG Grid
    suppressHeaderMenuButton: true, // patch-010 §1: Отключаем встроенное меню AG Grid
    headerComponent: CustomHeaderComponent, // patch-010 §1: Кастомный заголовок
    cellStyle: (params) => applyCellStyle(params),
    editable: true,
  }), [CustomHeaderComponent, applyCellStyle]);

  // Обработчики для контекстного меню (patch-003)
  const handleMergeCells = useCallback((params) => {
    toast.info('Функция объединения ячеек в разработке');
    // TODO: Реализовать объединение ячеек
  }, []);

  const handleUnmergeCells = useCallback((params) => {
    toast.info('Функция разъединения ячеек в разработке');
    // TODO: Реализовать разъединение ячеек
  }, []);

  const handleAutoFitColumn = useCallback((params) => {
    if (!gridRef.current || !params.column) return;

    const api = gridRef.current.api;
    if (api) {
      api.autoSizeColumns([params.column.getColId()]);
      toast.success('Ширина колонки подогнана');
    }
  }, []);

  const handleResetColumnWidth = useCallback((params) => {
    if (!gridRef.current || !params.column) return;

    const column = params.column;
    const colDef = column.getColDef();
    if (colDef.field) {
      column.setActualWidth(colDef.width || 100);
      toast.success('Ширина колонки сброшена');
    }
  }, []);

  const handleSetDensity = useCallback((density) => {
    setCellDensity(density);
    toast.success(`Плотность: ${density === 'compact' ? 'Компактный' : density === 'large' ? 'Крупный' : 'Стандарт'}`);
  }, [setCellDensity]);

  // Контекстные фильтры (patch-004 §4)
  const handleFilterKeepOnly = useCallback((params) => {
    if (!params.value || !params.column) return;

    const field = params.column.colId;
    const value = params.value;

    // Для разных полей применяем соответствующие фильтры
    if (field === 'operator') {
      updateTextFilter('operator', value);
      toast.success(`Фильтр: только оператор "${value}"`);
    } else if (field === 'app') {
      updateTextFilter('app', value);
      toast.success(`Фильтр: только приложение "${value}"`);
    } else if (field === 'transaction_type') {
      updateTextFilter('transaction_type', value);
      toast.success(`Фильтр: только тип "${value}"`);
    } else if (field === 'source') {
      updateTextFilter('source', value);
      toast.success(`Фильтр: только источник "${value}"`);
    }

    setFiltersPanelOpen(true);
  }, [updateTextFilter, setFiltersPanelOpen]);

  const handleFilterExclude = useCallback((params) => {
    if (!params.value || !params.column) return;

    const field = params.column.colId;
    const value = params.value;

    toast.info(`Исключение значений пока не реализовано. Поле: ${field}, значение: ${value}`);
  }, []);

  const handleFilterByCard = useCallback((params) => {
    if (!params.value) return;

    const cardNumber = params.value;
    const last4 = cardNumber.replace(/\D/g, '').slice(-4);

    // Можно добавить поле для фильтрации по картам в будущем
    toast.success(`Фильтр по карте *${last4}`);
  }, []);

  // patch-006 §1, §6: Обработчик переключения P2P
  const handleToggleP2P = useCallback(async (params) => {
    if (!params.node || !params.node.data) return;

    const newP2PValue = !params.node.data.is_p2p;

    try {
      await updateCheck(params.node.data.id, {
        is_p2p: newP2PValue,
      });

      // Обновляем значение в гриде
      params.node.setDataValue('is_p2p', newP2PValue);

      toast.success(newP2PValue ? 'Отмечено как P2P' : 'Метка P2P снята');
    } catch (error) {
      console.error('Error toggling P2P:', error);
      toast.error('Ошибка при изменении P2P');
    }
  }, [autoNegativeForDebits, updateCheck]);

  // patch-006 §1: Обработчики числового формата
  const handleSetNumberFormat = useCallback((params, format) => {
    toast.info(`Числовой формат ${format} - в разработке`);
    // TODO: Реализовать переключение формата чисел
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuState((prev) => {
      if (!prev.isOpen) {
        return prev;
      }

      return {
        isOpen: false,
        position: null,
        params: null,
      };
    });
  }, []);

  // patch-014: Обработчик контекстного меню с сохранением выделения
  const handleCellContextMenu = useCallback((params) => {
    if (!params?.event) {
      return;
    }

    closeSelectionStatsPopover();
    closeColorPicker();
    closePasteSpecialMenu();

    params.event.preventDefault();

    const { api, node, column } = params;

    if (!api || !node || !column) return;

    // Проверяем, находится ли кликнутая ячейка внутри текущего выделения
    const colId = column.getColId();
    const rowIndex = node.rowIndex;
    const cellIsInSelection = isCellInSelection(api, rowIndex, colId);

    // Если ячейка НЕ в выделении — делаем её единственным выделением
    if (!cellIsInSelection) {
      api.clearRangeSelection();
      api.addCellRange({
        rowStartIndex: rowIndex,
        rowEndIndex: rowIndex,
        columns: [column.getColId()],
      });
    }

    // Устанавливаем фокус на ячейку
    api.setFocusedCell(rowIndex, column);

    const { clientX, clientY } = params.event;

    setContextMenuState({
      isOpen: true,
      position: { x: clientX, y: clientY },
      params,
    });
  }, [closeColorPicker, closePasteSpecialMenu, closeSelectionStatsPopover]);

  useEffect(() => {
    if (!contextMenuState.isOpen) {
      return;
    }

    const handleScroll = (event) => {
      const target = event?.target;
      if (target instanceof Element && target.closest('.grid-context-menu')) {
        return;
      }

      closeContextMenu();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        closeContextMenu();
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [contextMenuState.isOpen, closeContextMenu]);

  const getFocusedCellParams = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) {
      return null;
    }

    const focusedCell = api.getFocusedCell();
    if (focusedCell) {
      const node = api.getDisplayedRowAtIndex(focusedCell.rowIndex);
      if (!node) return null;
      const column = focusedCell.column;
      return {
        api,
        column,
        node,
        value: node.data?.[column.getColDef().field],
      };
    }

    const selection = buildSelectionSnapshot(api, {
      includeFocusFallback: false,
    });
    if (selection.length > 0) {
      const { rowIndex, colKey } = selection[0];
      const column = api.getColumn(colKey);
      const node = typeof rowIndex === 'number' ? api.getDisplayedRowAtIndex(rowIndex) : null;
      if (!column || !node) return null;
      return {
        api,
        column,
        node,
        value: node.data?.[colKey],
      };
    }

    return null;
  }, []);

  // Буфер обмена (копирование диапазона)
  const copySelectionToClipboard = useCallback(async () => {
    const api = gridRef.current?.api;
    if (!api || !navigator.clipboard || !navigator.clipboard.writeText) {
      toast.error('Буфер обмена недоступен');
      return false;
    }

    const cells = buildSelectionSnapshot(api);

    if (cells.length === 0) {
      const params = getFocusedCellParams();
      if (!params) {
        toast.info('Нет выделения для копирования');
        return false;
      }
      const text = params.value !== null && params.value !== undefined ? String(params.value) : '';
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.error('Clipboard copy failed', error);
        toast.error('Не удалось скопировать');
        return false;
      }
    }

    const columnsOrder = api.getAllDisplayedColumns().map((col) => col.getColId());
    const rowsMap = new Map();

    cells.forEach(({ rowIndex, colKey }) => {
      if (typeof rowIndex !== 'number') {
        return;
      }

      if (!rowsMap.has(rowIndex)) {
        rowsMap.set(rowIndex, new Map());
      }

      const rowNode = api.getDisplayedRowAtIndex(rowIndex);
      const rawValue = rowNode?.data?.[colKey];
      let formattedValue = '';

      if (colKey === 'amount' || colKey === 'balance') {
        const numeric = normalizeNumericValue(rawValue);
        formattedValue = numeric !== null ? formatSelectionNumber(numeric) : '';
      } else if (rawValue !== null && rawValue !== undefined) {
        formattedValue = String(rawValue);
      }

      rowsMap.get(rowIndex).set(colKey, formattedValue);
    });

    const sortedRowIndices = Array.from(rowsMap.keys()).sort((a, b) => a - b);

    const lines = sortedRowIndices.map((rowIndex) => {
      const rowMap = rowsMap.get(rowIndex);
      const selectedColumns = Array.from(rowMap.keys()).sort(
        (a, b) => columnsOrder.indexOf(a) - columnsOrder.indexOf(b)
      );
      return selectedColumns.map((colKey) => rowMap.get(colKey)).join('\t');
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      return true;
    } catch (error) {
      console.error('Clipboard copy failed', error);
      toast.error('Не удалось скопировать');
      return false;
    }
  }, [buildSelectionSnapshot, formatSelectionNumber, getFocusedCellParams]);

  // Обработчики буфера обмена (определены до сборки пунктов контекстного меню)
  const handleCopy = useCallback(async () => {
    const success = await copySelectionToClipboard();
    if (success) {
      toast.success('Скопировано в буфер обмена');
    }
  }, [copySelectionToClipboard]);

  const handleCut = useCallback((params) => {
    if (params.value === undefined) {
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      toast.error('Буфер обмена недоступен');
      return;
    }

    navigator.clipboard.writeText(String(params.value))
      .then(() => {
        toast.success('Скопировано в буфер обмена');
        params.node.setDataValue(params.column.getColDef().field, '');
      })
      .catch(() => {
        toast.error('Не удалось скопировать');
      });
  }, []);

  const handlePaste = useCallback((params) => {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      toast.error('Буфер обмена недоступен');
      return;
    }

    navigator.clipboard.readText()
      .then((text) => {
        params.node.setDataValue(params.column.getColDef().field, text);
        toast.success('Вставлено из буфера обмена');
      })
      .catch(() => {
        toast.error('Не удалось получить данные из буфера обмена');
      });
  }, []);

  const handleDelete = useCallback((params, type, options = {}) => {
    const { silent = false } = options;
    if (type === 'row') {
      // Проверяем, есть ли выбранные строки
      const selectedRows = params.api?.getSelectedRows() || [];
      const selectedCount = selectedRows.length;

      // Если выбрано больше 1 строки, удаляем все выбранные
      if (selectedCount > 1) {
        if (window.confirm(`Вы уверены, что хотите удалить ${selectedCount} выбранных чеков?`)) {
          const ids = selectedRows.map(row => row.id);
          deleteChecks(ids).then(() => {
            if (!silent) {
              toast.success(`Удалено ${selectedCount} чеков`);
            }
            params.api.deselectAll();
          }).catch(error => {
            console.error('Error deleting selected checks:', error);
            toast.error(`Ошибка при удалении: ${error.message}`);
          });
        }
      } else {
        // Удаляем только текущую строку
        if (window.confirm('Вы уверены, что хотите удалить этот чек?')) {
          deleteCheck(params.node.data.id);
          if (!silent) {
            toast.success('Чек удалён');
          }
        }
      }
    } else if (type === 'content') {
      params.node.setDataValue(params.column.getColDef().field, '');
      if (!silent) {
        toast.success('Содержимое ячейки удалено');
      }
    }
  }, [deleteCheck, deleteChecks]);

  // Массовое удаление выбранных строк
  const handleBulkDelete = useCallback(async () => {
    const selectedRows = gridRef.current?.api.getSelectedRows() || [];
    if (selectedRows.length === 0) {
      toast.info('Нет выбранных чеков');
      return;
    }

    if (window.confirm(`Вы уверены, что хотите удалить ${selectedRows.length} чеков?`)) {
      try {
        const ids = selectedRows.map(row => row.id);
        await deleteChecks(ids);
        toast.success(`Удалено ${selectedRows.length} чеков`);
        gridRef.current?.api.deselectAll();
      } catch (error) {
        console.error('Error in bulk delete:', error);
        toast.error(`Ошибка при удалении: ${error.message}`);
      }
    }
  }, [deleteChecks]);

  // Массовое обновление выбранных строк
  const handleBulkUpdate = useCallback(async (field, value) => {
    const selectedRows = gridRef.current?.api.getSelectedRows() || [];
    if (selectedRows.length === 0) {
      toast.info('Нет выбранных чеков');
      return;
    }

    if (window.confirm(`Обновить поле "${field}" для ${selectedRows.length} чеков?`)) {
      try {
        const updates = selectedRows.map(row => ({
          id: row.id,
          data: { [field]: value }
        }));
        await updateChecks(updates);
        toast.success(`Обновлено ${selectedRows.length} чеков`);

        // Refresh grid
        selectedRows.forEach(row => {
          const node = gridRef.current?.api.getRowNode(String(row.id));
          if (node) {
            node.setDataValue(field, value);
          }
        });

        gridRef.current?.api.deselectAll();
      } catch (error) {
        console.error('Error in bulk update:', error);
        toast.error(`Ошибка при обновлении: ${error.message}`);
      }
    }
  }, [updateChecks]);

  const handleSort = useCallback((params, direction) => {
    if (!params?.column || !params?.api) return;

    const colId = params.column.getColId();
    params.api.applyColumnState({
      state: [{ colId, sort: direction }],
      defaultState: { sort: null },
    });

    if (direction === 'asc') {
      toast.success('Сортировка по возрастанию');
    } else if (direction === 'desc') {
      toast.success('Сортировка по убыванию');
    } else {
      toast.success('Сортировка сброшена');
    }
  }, []);

  // patch-015: Батч-форматирование выделения
  const handleSetAlignment = useCallback((params, alignment) => {
    if (!params?.api || !alignment) return;

    applyStylePatchToSelection({
      params,
      stylePatch: { alignment },
      buildMessage: ({ cellsAffected }) => {
        const label = ALIGNMENT_LABELS[alignment] || alignment;
        return `Выравнивание ${label} применено к ${formatCellsAmount(cellsAffected)} яч.`;
      },
    });
  }, [applyStylePatchToSelection, formatCellsAmount]);

  const handleSetBackgroundColor = useCallback((params, colorKey) => {
    if (!params?.api) return;

    applyStylePatchToSelection({
      params,
      stylePatch: { backgroundColorKey: colorKey || null },
      buildMessage: ({ cellsAffected }) => {
        if (!colorKey) {
          return `Цвет фона снят с ${formatCellsAmount(cellsAffected)} яч.`;
        }
        const label = getCellColorName(colorKey);
        return `Цвет «${label}» применён к ${formatCellsAmount(cellsAffected)} яч.`;
      },
    });
  }, [applyStylePatchToSelection, formatCellsAmount]);

  const handleToggleWrap = useCallback((params) => {
    if (!params?.api || !params?.node || !params?.column) return;

    const field = params.column.getColDef().field;
    const checkId = params.node?.data?.id;
    if (!checkId || !field) return;

    const currentStyle = getCellStyle(checkId, field);
    const nextWrapValue = !currentStyle.wrapText;

    applyStylePatchToSelection({
      params,
      stylePatch: { wrapText: nextWrapValue },
      buildMessage: ({ cellsAffected }) =>
        nextWrapValue
        ? `Перенос включён для ${formatCellsAmount(cellsAffected)} яч.`
        : `Перенос выключен для ${formatCellsAmount(cellsAffected)} яч.`,
    });
  }, [applyStylePatchToSelection, formatCellsAmount, getCellStyle]);

  const handleColorPickerSelect = useCallback((colorKey) => {
    const targetParams = colorPickerTargetRef.current;
    closeColorPicker();
    if (targetParams) {
      handleSetBackgroundColor(targetParams, colorKey);
    }
  }, [closeColorPicker, handleSetBackgroundColor]);

  const openColorPicker = useCallback(() => {
    closePasteSpecialMenu();
    closeSelectionStatsPopover();
    const params = getFocusedCellParams();
    if (!params) {
      toast.info('Нет активной ячейки для изменения цвета');
      return;
    }

    colorPickerTargetRef.current = params;

    const field = params.column.getColDef().field;
    const checkId = params.node?.data?.id;
    const currentStyle = checkId ? getCellStyle(checkId, field) : {};
    const currentColorKey = getBackgroundColorKeyFromStyle(currentStyle);
    const gridElement = gridRef.current?.eGridDiv;

    let position = { x: window.innerWidth / 2 - 120, y: 120 };
    if (gridElement) {
      const rect = gridElement.getBoundingClientRect();
      position = {
        x: rect.left + rect.width / 2 - 120,
        y: rect.top + 60,
      };
    }

    setColorPickerState({
      isOpen: true,
      position,
      currentColorKey,
    });
  }, [closePasteSpecialMenu, closeSelectionStatsPopover, getCellStyle, getFocusedCellParams]);

  const handleInsertRow = useCallback(async (params, position) => {
    try {
      const referenceData = params?.node?.data;
      const payload = buildNewCheckPayload(referenceData);

      const baseIndex = referenceData
        ? Math.max(0, checks.findIndex((check) => check.id === referenceData.id))
        : checks.length;
      const insertAt = position === 'below' ? baseIndex + 1 : baseIndex;

      const newCheck = await addCheck(payload, { insertAt });

      toast.success(position === 'above' ? 'Строка вставлена выше' : 'Строка вставлена ниже');

      // Обновляем отображение грида и фокусируем новую строку
      window.requestAnimationFrame(() => {
        if (!params?.api || !newCheck?.id) return;

        let targetNode = null;
        params.api.forEachNode((node) => {
          if (node.data && node.data.id === newCheck.id) {
            targetNode = node;
          }
        });

        if (targetNode) {
          params.api.ensureIndexVisible(targetNode.rowIndex, 'middle');
          params.api.setFocusedCell(targetNode.rowIndex, params.column);
        } else {
          params.api.refreshClientSideRowModel('sort');
        }
      });
    } catch (error) {
      console.error('Error inserting row:', error);
      toast.error('Не удалось вставить строку');
    }
  }, [addCheck, buildNewCheckPayload, checks]);

  // patch-012 §5: Формат-пипетка
  const [copiedFormat, setCopiedFormat] = useState(null);

  const handleCopyFormat = useCallback((params) => {
    if (!params || !params.node || !params.column) return;
    const checkId = params.node.data.id;
    const field = params.column.getColDef().field;
    const style = getCellStyle(checkId, field);
    const backgroundColorKey = getBackgroundColorKeyFromStyle(style);
    setCopiedFormat({
      backgroundColorKey,
      backgroundColorFallback: style.backgroundColor || null,
      alignment: style.alignment,
      wrapText: style.wrapText,
    });
    toast.success('Формат скопирован');
  }, [getCellStyle]);

  const handlePasteFormat = useCallback((params) => {
    if (!copiedFormat) {
      toast.warning('Сначала скопируйте формат');
      return;
    }
    if (!params || !params.node || !params.column) return;
    const checkId = params.node.data.id;
    const field = params.column.getColDef().field;

    if (copiedFormat.backgroundColorKey !== undefined) {
      setBackgroundColor(checkId, field, copiedFormat.backgroundColorKey || null);
    } else if (copiedFormat.backgroundColorFallback !== undefined) {
      const inferredKey = findColorKeyByHex(copiedFormat.backgroundColorFallback);
      setBackgroundColor(checkId, field, inferredKey || null);
    }
    if (copiedFormat.alignment) {
      setAlignment(checkId, field, copiedFormat.alignment);
    }
    if (copiedFormat.wrapText !== undefined) {
      setWrapText(checkId, field, copiedFormat.wrapText);
    }

    toast.success('Формат применён');
    params.api.refreshCells({ rowNodes: [params.node], force: true });
  }, [copiedFormat, setBackgroundColor, setAlignment, setWrapText]);

  const handlePasteSpecial = useCallback((params, mode) => {
    if (!params) return;

    switch (mode) {
      case 'values':
        handlePaste(params);
        break;
      case 'format':
        handlePasteFormat(params);
        break;
      default:
        toast.info('Пока поддерживается только вставка значений или формата');
        break;
    }
  }, [handlePaste, handlePasteFormat]);

  const openPasteSpecialMenu = useCallback(() => {
    const params = getFocusedCellParams();
    if (!params) {
      toast.info('Сначала выберите ячейку для вставки');
      return;
    }

    pasteSpecialTargetRef.current = params;

    const gridElement = gridRef.current?.eGridDiv;
    let position = {
      x: window.innerWidth / 2 - 160,
      y: 140,
    };

    if (gridElement) {
      const rect = gridElement.getBoundingClientRect();
      position = {
        x: rect.left + rect.width / 2 - 160,
        y: rect.top + 80,
      };
    }

    closeColorPicker();
    closeSelectionStatsPopover();

    setPasteSpecialState({
      isOpen: true,
      position,
    });
  }, [closeColorPicker, closeSelectionStatsPopover, getFocusedCellParams]);

  const handlePasteSpecialSelect = useCallback((mode) => {
    const params = pasteSpecialTargetRef.current;
    closePasteSpecialMenu();

    if (!params) {
      toast.info('Нет активной ячейки для вставки');
      return;
    }

    handlePasteSpecial(params, mode);
  }, [closePasteSpecialMenu, handlePasteSpecial]);

  useEffect(() => {
    const handleKeyDown = async (event) => {
      const api = gridRef.current?.api;
      const gridElement = gridRef.current?.eGridDiv;
      if (!api || !gridElement) {
        return;
      }

      const activeElement = document.activeElement;
      const isInsideGrid = activeElement ? gridElement.contains(activeElement) : false;

      if (!isInsideGrid && !colorPickerState.isOpen && !selectionStatsState.isOpen && !pasteSpecialState.isOpen) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const ctrl = isMac ? event.metaKey : event.ctrlKey;
      const shift = event.shiftKey;
      const alt = event.altKey;
      const key = event.key.toLowerCase();

      const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );

      const prevent = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (ctrl && shift && !alt) {
        if (['l', 'e', 'r'].includes(key) && !isEditing) {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            if (key === 'l') {
              handleSetAlignment(params, 'left');
            } else if (key === 'e') {
              handleSetAlignment(params, 'center');
            } else if (key === 'r') {
              handleSetAlignment(params, 'right');
            }
          }
        }

        if (key === 'v' && !isEditing) {
          prevent();
          openPasteSpecialMenu();
        }
        return;
      }

      if (ctrl && alt) {
        if (!isEditing && key === 'b') {
          prevent();
          openColorPicker();
        } else if (!isEditing && key === 'c') {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handleCopyFormat(params);
          }
        } else if (!isEditing && key === 'v') {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handlePasteFormat(params);
          }
        } else if (!isEditing && key === 'backspace') {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handleSetBackgroundColor(params, null);
          }
        }
        return;
      }

      if (ctrl && !alt && !shift) {
        if (!isEditing && key === 'c') {
          prevent();
          const success = await copySelectionToClipboard();
          if (success) {
            toast.success('Скопировано в буфер обмена');
          }
        } else if (!isEditing && key === 'x') {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handleCut(params);
          }
        } else if (!isEditing && key === 'v') {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handlePaste(params);
          }
        }
      }

      if (!ctrl && !alt && !shift && (key === 'delete' || key === 'backspace')) {
        if (!isEditing) {
          const params = getFocusedCellParams();
          if (params) {
            prevent();
            handleDelete(params, 'content', { silent: true });
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    colorPickerState.isOpen,
    copySelectionToClipboard,
    handleDelete,
    getFocusedCellParams,
    handleCut,
    handlePaste,
    handlePasteFormat,
    handlePasteSpecial,
    handleSetAlignment,
    handleSetBackgroundColor,
    handleCopyFormat,
    openPasteSpecialMenu,
    openColorPicker,
    pasteSpecialState.isOpen,
    selectionStatsState.isOpen,
  ]);

  // patch-015 §2: Посчитать по выделению (popover)
  const handleCalculateSelection = useCallback((params) => {
    if (!params?.column || !params?.api) {
      return;
    }

    const field = params.column.getColDef().field;
    if (field !== 'amount' && field !== 'balance') {
      toast.warning('Расчёт доступен только для колонок Сумма и Остаток');
      return;
    }

    const selectionSnapshot = buildSelectionSnapshot(params.api, {
      fallbackCell: params,
      includeFocusFallback: false,
    });
    if (selectionSnapshot.length === 0) {
      toast.info('Сначала выделите ячейки');
      return;
    }

    const displayValues = collectNumericValuesFromSelection(params.api, field, {
      cells: selectionSnapshot,
    });

    if (!displayValues.length) {
      toast.warning('Нет числовых значений для расчёта');
      return;
    }

    const incomeValues = collectNumericValuesFromSelection(params.api, field, {
      cells: selectionSnapshot,
      incomeExpense: true,
    });

    const statsByMode = {
      display: calculateStats(displayValues),
      incomeExpense: calculateStats(incomeValues),
    };

    const position = (() => {
      if (params.event && typeof params.event.clientX === 'number' && typeof params.event.clientY === 'number') {
        return { x: params.event.clientX + 12, y: params.event.clientY + 12 };
      }
      if (contextMenuState.position) {
        return { x: contextMenuState.position.x + 12, y: contextMenuState.position.y + 12 };
      }
      return { x: 24, y: 24 };
    })();

    setSelectionStatsState({
      isOpen: true,
      position,
      columnName: params.column.getColDef().headerName || field,
      field,
      statsByMode,
      activeMode: 'display',
    });
  }, [buildSelectionSnapshot, contextMenuState.position]);

  // patch-012 §4: Переключение строки итогов
  const handleToggleTotalsRow = useCallback(() => {
    setShowTotalsRow((prev) => {
      const next = !prev;
      if (!next) {
        setPinnedBottomRowData([]);
      }
      return next;
    });
    toast.success(showTotalsRow ? 'Строка итогов скрыта' : 'Строка итогов показана');
  }, [setPinnedBottomRowData, showTotalsRow]);

  // patch-010 §1,2: Старое меню колонки удалено, используется новое ColumnMenu

  // Контекстное меню (patch-006 §1, patch-010 §2, patch-012)
  const buildContextMenuItems = useCallback((params) => {
    if (!params?.node || !params?.column) {
      return [];
    }

    const field = params.column.getColDef().field;
    const checkId = params.node.data.id;
    const style = getCellStyle(checkId, field);
    const columnSort = typeof params.column.getSort === 'function' ? params.column.getSort() : null;

    const items = [];
    const pushSeparator = () => {
      if (items.length > 0 && items[items.length - 1] !== 'separator') {
        items.push('separator');
      }
    };

    // patch-016 §2: Убрали сортировку из ПКМ (перенесена в меню заголовка)

    // Буфер обмена
    pushSeparator();
    items.push(
      {
        name: 'Копировать',
        shortcut: 'Ctrl+C',
        action: () => handleCopy(),
      },
      {
        name: 'Вырезать',
        shortcut: 'Ctrl+X',
        action: () => handleCut(params),
      },
      {
        name: 'Вставить',
        shortcut: 'Ctrl+V',
        action: () => handlePaste(params),
      },
      {
        name: 'Вставить только значения',
        action: () => handlePasteSpecial(params, 'values'),
      },
      {
        name: 'Вставить только формат',
        action: () => handlePasteSpecial(params, 'format'),
      },
    );

    // patch-014: Убрали "Вставить строку выше/ниже", оставили только Удалить
    pushSeparator();

    // Проверка количества выбранных строк для массовых операций
    const selectedRowsCount = params.api?.getSelectedRows()?.length || 0;

    if (selectedRowsCount > 1) {
      // Массовые операции (показываются только когда выбрано >1 строки)
      items.push(
        {
          name: `Удалить выбранные строки (${selectedRowsCount})`,
          action: () => handleBulkDelete(),
        },
        {
          name: `Изменить выбранные строки (${selectedRowsCount})`,
          submenu: [
            {
              name: 'Изменить оператора',
              action: () => {
                const value = prompt('Введите нового оператора:');
                if (value !== null) handleBulkUpdate('operator', value);
              },
            },
            {
              name: 'Изменить приложение',
              action: () => {
                const value = prompt('Введите новое приложение:');
                if (value !== null) handleBulkUpdate('app', value);
              },
            },
            {
              name: 'Изменить тип транзакции',
              action: () => {
                const value = prompt('Введите новый тип транзакции:');
                if (value !== null) handleBulkUpdate('transaction_type', value);
              },
            },
            {
              name: 'Изменить валюту',
              action: () => {
                const value = prompt('Введите новую валюту (UZS, USD, EUR):');
                if (value !== null) handleBulkUpdate('currency', value);
              },
            },
            {
              name: 'Изменить источник',
              action: () => {
                const value = prompt('Введите новый источник (SMS, Telegram, Manual):');
                if (value !== null) handleBulkUpdate('source', value);
              },
            },
          ],
        },
      );
      pushSeparator();
    }

    items.push(
      {
        name: 'Удалить строку',
        action: () => handleDelete(params, 'row'),
      },
      {
        name: 'Очистить содержимое ячейки',
        action: () => handleDelete(params, 'content'),
      },
    );

    // Форматирование текста
    pushSeparator();
    items.push(
      {
        name: 'Выравнивание влево',
        shortcut: 'Ctrl+Shift+L',
        isActive: style.alignment === 'left',
        action: () => handleSetAlignment(params, 'left'),
      },
      {
        name: 'Выравнивание по центру',
        shortcut: 'Ctrl+Shift+E',
        isActive: style.alignment === 'center',
        action: () => handleSetAlignment(params, 'center'),
      },
      {
        name: 'Выравнивание вправо',
        shortcut: 'Ctrl+Shift+R',
        isActive: style.alignment === 'right',
        action: () => handleSetAlignment(params, 'right'),
      },
      // patch-016 §2: Убрали "Включить перенос" из ПКМ (перенесено в меню заголовка)
    );

    // Цвета
    pushSeparator();
    const palette = getCellColorOptions(resolvedTheme);
    const backgroundColorKey = getBackgroundColorKeyFromStyle(style);

    items.push({
      name: 'Цвет фона',
      subMenu: palette.map((option) => ({
        name: option.name,
        isActive:
          (option.id === null && !backgroundColorKey) ||
          (option.id !== null && option.id === backgroundColorKey),
        action: () => handleSetBackgroundColor(params, option.id),
      })),
    });

    // Формат-пипетка
    pushSeparator();
    items.push(
      {
        name: 'Скопировать формат ячейки',
        shortcut: 'Ctrl+Alt+C',
        action: () => handleCopyFormat(params),
      },
      // patch-016 §2: Убрали "Применить формат ячейки" из ПКМ (хоткей Ctrl+Alt+V остаётся)
    );

    // patch-016 §2: Убрали "Авто-ширина колонки" и "Сбросить ширину" из ПКМ (перенесены в меню заголовка)

    // Числовые операции
    if (field === 'amount' || field === 'balance') {
      pushSeparator();
      items.push({
        name: 'Посчитать по выделению',
        action: () => handleCalculateSelection(params),
      });
      items.push({
        name: showTotalsRow ? 'Скрыть строку итогов' : 'Показать строку итогов',
        action: () => handleToggleTotalsRow(),
      });
    }

    // patch-016 §2: Убрали "Снять отметку P2P" из ПКМ (делается через редактирование ячейки P2P или модалку)

    // Статус и действия
    const tailItems = [];

    if (typeof onCheckDetails === 'function') {
      tailItems.push({
        name: 'Открыть детали чека',
        action: () => onCheckDetails(params.node.data),
      });
    }

    if (tailItems.length) {
      pushSeparator();
      items.push(...tailItems);
    }

    // Удаляем повторяющиеся или завершающие разделители
    while (items.length && items[items.length - 1] === 'separator') {
      items.pop();
    }

    return items;
  }, [
    getCellStyle,
    handleAutoFitColumn,
    handleCalculateSelection,
    handleCopy,
    handleCopyFormat,
    handleCut,
    handleDelete,
    handleInsertRow,
    handlePaste,
    handlePasteFormat,
    handlePasteSpecial,
    handleResetColumnWidth,
    handleSetAlignment,
    handleSetBackgroundColor,
    handleSort,
    handleToggleP2P,
    handleToggleTotalsRow,
    handleToggleWrap,
    onCheckDetails,
    showTotalsRow,
    resolvedTheme,
  ]);

  /**
   * patch-007 §1, §10: Надёжное сохранение ячейки с валидацией и откатом
   * @param {number} rowId - ID строки
   * @param {string} colKey - Ключ колонки
   * @param {any} newValue - Новое значение
   * @param {any} oldValue - Старое значение
   * @param {object} node - AG Grid node для отката
   * @param {object} data - Данные строки
   */
  const saveCell = useCallback(async (rowId, colKey, newValue, oldValue, node, data) => {
    const snapshotBefore = JSON.parse(JSON.stringify(data || {}));
    // 1. Локальная валидация
    let validatedValue = newValue;

    try {
      // Валидация чисел (Сумма, Остаток)
      if (colKey === 'amount' || colKey === 'balance') {
        // Принимаем и запятую, и точку → нормализуем
        const strValue = String(newValue).replace(/\s/g, '').replace(',', '.');
        const numValue = parseFloat(strValue);

        if (isNaN(numValue)) {
          throw new Error('Введите корректное число');
        }

        // Диапазон [-9e12 … 9e12]
        if (numValue < -9e12 || numValue > 9e12) {
          throw new Error('Число вне допустимого диапазона');
        }

        validatedValue = numValue;

        // patch-007 §4: Автоматика знака для списаний
        if (colKey === 'amount' && data.transaction_type) {
          const creditTypes = ['Пополнение', 'Возврат', 'Конверсия(+)'];

          if (autoNegativeForDebits && DEBIT_TRANSACTION_TYPES.includes(data.transaction_type) && numValue > 0) {
            validatedValue = -Math.abs(numValue);
            toast.info('Автоматически добавлен знак "-" для списания');
          }

          if (creditTypes.includes(data.transaction_type) && numValue < 0) {
            validatedValue = Math.abs(numValue);
            toast.warning('Для пополнения знак "-" запрещён');
          }
        }
      }

      // Валидация ПК (ровно 4 цифры)
      if (colKey === 'card_last4') {
        const cleaned = String(newValue).replace(/\D/g, '');
        if (cleaned.length !== 4 && cleaned.length !== 0) {
          throw new Error('ПК должен содержать ровно 4 цифры');
        }
        validatedValue = cleaned;
      }

      // Валидация P2P
      if (colKey === 'is_p2p') {
        validatedValue = newValue === '1' || newValue === 1 || newValue === true;
      }

      if (colKey === 'app') {
        const normalized = typeof newValue === 'string' ? newValue.trim() : newValue;
        validatedValue =
          normalized === null ||
          normalized === undefined ||
          normalized === '' ||
          normalized === '—'
            ? null
            : normalized;
      }

      if (colKey === 'source') {
        const normalized = typeof newValue === 'string' ? newValue.trim() : '';
        const resolved = SOURCE_OPTIONS.find(
          (option) => option.toLowerCase() === normalized.toLowerCase()
        );
        if (!resolved) {
          throw new Error('Выберите один из вариантов: Telegram, SMS или Manual');
        }
        validatedValue = resolved;
      }

      // Валидация даты и времени
      if (colKey === 'datetime') {
        const date = new Date(newValue);
        if (isNaN(date.getTime())) {
          throw new Error('Некорректная дата');
        }
        validatedValue = newValue;
      }

      // 2. Оптимистичное обновление UI
      node.setDataValue(colKey, validatedValue);

      // 3. Отправка на сервер (patch-008 §1: используем слой преобразования)
      const apiData = prepareForApi({
        [colKey]: validatedValue,
      });

      const updatedCheck = await updateCheck(rowId, apiData);

      // 4. Успешное сохранение
      toast.success('Изменения сохранены');

      const snapshotAfter = JSON.parse(JSON.stringify(
        updatedCheck
          ? { ...snapshotBefore, ...updatedCheck }
          : { ...snapshotBefore, [colKey]: validatedValue }
      ));

      const applySnapshot = (snapshot) => {
        if (!snapshot) return;
        const normalizedSnapshot = { ...snapshot, id: rowId };

        const api = gridRef.current?.api;
        if (api) {
          const targetNode = api.getRowNode(String(rowId));
          if (targetNode) {
            targetNode.setData({ ...targetNode.data, ...normalizedSnapshot });
            api.refreshCells({ rowNodes: [targetNode], force: true });
          }
        }

        useChecksStore.setState((state) => ({
          checks: state.checks.map((check) =>
            check.id === rowId ? { ...check, ...normalizedSnapshot } : check
          ),
        }));

        recalcTotalsRow();
      };

      if (typeof pushHistory === 'function') {
        pushHistory({
          undo: () => applySnapshot(snapshotBefore),
          redo: () => applySnapshot(snapshotAfter),
        });
      }

    } catch (error) {
      // 5. Откат при ошибке
      console.error('Error saving cell:', error);
      node.setDataValue(colKey, oldValue);

      // patch-008 §1: Троттлим спам тостами (один тост за 5 сек для одной операции)
      const toastKey = `error-${rowId}-${colKey}`;
      if (shouldShowToast(toastKey)) {
        // Понятное сообщение об ошибке
        const errorMessage = error.message || 'Не удалось сохранить изменения';
        toast.error(`Ошибка: ${errorMessage}`);
      }

      // TODO: Логирование в userData/logs/app.log (patch-007 §10.5)
      // TODO: Подсветить ячейку иконкой предупреждения с тултипом (patch-008 §1)
    }
  }, [autoNegativeForDebits, pushHistory, recalcTotalsRow, updateCheck]);

  // Обработчик редактирования ячейки (patch-007 §1)
  const onCellValueChanged = useCallback(async (event) => {
    const { data, colDef, newValue, oldValue, node } = event;

    if (newValue === oldValue) return;

    await saveCell(data.id, colDef.field, newValue, oldValue, node, data);
    recalcTotalsRow();
  }, [recalcTotalsRow, saveCell]);

  // Обработчик изменения размера колонки
  const onColumnResized = useCallback((event) => {
    if (event.finished && event.column) {
      const field = event.column.getColDef().field;
      const width = event.column.getActualWidth();
      setColumnWidth(field, width);
    }
  }, [setColumnWidth]);

  // patch-007 §5: Обработчик перемещения колонок (DnD)
  const onColumnMoved = useCallback((event) => {
    if (!gridRef.current || !event.finished) return;

    const api = gridRef.current.api;
    if (api) {
      // Получаем новый порядок колонок
      const columnState = api.getColumnState();
      const newOrder = columnState.map(col => col.colId);

      // TODO: Сохранить порядок в settings.json через Zustand (patch-007 §7)
      console.log('New column order:', newOrder);
      toast.info('Порядок колонок изменён');
    }
  }, []);

  // patch-013: Обработчик фокуса на ячейке (активная ячейка)
  const onCellFocused = useCallback((event) => {
    if (!gridRef.current?.api) return;

    const focusedCell = gridRef.current.api.getFocusedCell();
    if (!focusedCell) {
      setActiveCell(null);
      if (onActiveCellChange) {
        onActiveCellChange(null);
      }
      return;
    }

    const rowNode = gridRef.current.api.getDisplayedRowAtIndex(focusedCell.rowIndex);
    if (!rowNode) return;

    const cellData = {
      data: rowNode.data,
      column: focusedCell.column,
      colDef: focusedCell.column.getColDef(),
      rowIndex: focusedCell.rowIndex,
      node: rowNode
    };

    setActiveCell(cellData);
    if (onActiveCellChange) {
      onActiveCellChange(cellData);
    }
  }, [onActiveCellChange]);

  // patch-013: Обработчик изменения выделения (диапазоны)
  const onSelectionChanged = useCallback(() => {
    const selectedRows = gridRef.current?.api.getSelectedRows() || [];
    const selectedCells = [];

    // Получаем выделенные ячейки для статус-бара
    gridRef.current?.api.forEachNode((node) => {
      if (node.isSelected()) {
        selectedCells.push({
          value: node.data.amount,
          row: node.rowIndex,
        });
      }
    });

    setSelectedCells(selectedCells);

    // patch-013: Получаем диапазоны выделения ячеек
    if (gridRef.current?.api && onSelectionRangesChange) {
      const cellRanges = gridRef.current.api.getCellRanges() || [];
      onSelectionRangesChange(cellRanges);
    }

    setSelectionStatsState((prev) => (prev.isOpen ? createInitialSelectionStatsState() : prev));
    setColorPickerState((prev) => (prev.isOpen ? initialColorPickerState : prev));
    setPasteSpecialState((prev) => (prev.isOpen ? initialPasteSpecialState : prev));
  }, [onSelectionRangesChange]);

  // patch-008 §1: Двойной клик НЕ открывает модал, только редактирование
  // patch-016 §4: Автосортировка по datetime (старые сверху) при загрузке
  const onGridReady = useCallback((params) => {
    if (!params.api) return;

    // Устанавливаем дефолтную сортировку по datetime (asc = старые сверху)
    params.api.applyColumnState({
      state: [
        { colId: 'datetime', sort: 'asc' },
      ],
      defaultState: { sort: null },
    });

    // Сохраняем ссылку на API если нужно
    if (gridApiRef && typeof gridApiRef === 'function') {
      gridApiRef(params.api);
    } else if (gridApiRef && typeof gridApiRef === 'object') {
      gridApiRef.current = params.api;
    }
  }, [gridApiRef]);

  // Для просмотра деталей - кнопка Info в правой колонке
  const onRowDoubleClicked = useCallback((event) => {
    // Ничего не делаем, редактирование срабатывает автоматически через AG Grid
  }, []);

  function handleFilterByValue(params) {
    // TODO: Добавить фильтр по значению ячейки
    console.log('Filter by value:', params.value);
  }

  // Автоподгон ширины колонок (patch-003 §4)
  const handleAutoFit = useCallback(() => {
    if (!gridRef.current) return;

    const api = gridRef.current.api;
    if (api) {
      // Автоматически подгоняем ширину всех колонок
      api.autoSizeAllColumns(false);
      toast.success('Ширина колонок подогнана');
    }
  }, []);

  // Сброс ширины колонок (patch-003 §4)
  const handleResetWidths = useCallback(() => {
    if (!gridRef.current) return;

    const api = gridRef.current.api;
    if (api) {
      // Сбрасываем ширину колонок к дефолтным значениям
      const allColumns = api.getAllGridColumns();
      if (allColumns) {
        allColumns.forEach((column) => {
          const colDef = column.getColDef();
          // Возвращаем исходную ширину из columnDefs
          if (colDef.field) {
            api.setColumnWidth(column.getColId(), colDef.width || 100);
          }
        });
        toast.success('Ширина колонок сброшена');
      }
    }
  }, []);

  useEffect(() => {
    const gridInstance = gridRef.current;
    const gridElement = gridInstance?.eGridDiv;
    if (!gridElement) {
      return;
    }

    const handleHeaderDoubleClick = (event) => {
      if (!event.altKey) {
        return;
      }

      const headerCell = event.target?.closest('.ag-header-cell');
      if (!headerCell) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleAutoFit();
    };

    gridElement.addEventListener('dblclick', handleHeaderDoubleClick);
    return () => {
      gridElement.removeEventListener('dblclick', handleHeaderDoubleClick);
    };
  }, [handleAutoFit]);

  // Экспонируем методы через пропсы
  useEffect(() => {
    if (onAutoFitColumns) {
      onAutoFitColumns.current = handleAutoFit;
    }
    if (onResetWidths) {
      onResetWidths.current = handleResetWidths;
    }
  }, [handleAutoFit, handleResetWidths, onAutoFitColumns, onResetWidths]);

  // Локализация AG-Grid
  const localeText = useMemo(() => ({
    noRowsToShow: 'Нет данных для отображения',
    page: 'Страница',
    to: 'до',
    of: 'из',
    more: 'ещё',
    filterOoo: 'Фильтр...',
    equals: 'Равно',
    notEqual: 'Не равно',
    contains: 'Содержит',
    notContains: 'Не содержит',
    startsWith: 'Начинается с',
    endsWith: 'Заканчивается на',
  }), []);

  const contextMenuItems = useMemo(() => {
    if (!contextMenuState.isOpen || !contextMenuState.params) {
      return [];
    }

    return buildContextMenuItems(contextMenuState.params);
  }, [contextMenuState.isOpen, contextMenuState.params, buildContextMenuItems]);

  const containerClassName = useMemo(() => {
    const classes = [
      'ag-theme-alpine',
      `density-${cellDensity}`,
      'checks-grid-container',
      resolvedTheme === 'dark' ? 'theme-dark' : 'theme-light',
    ];
    if (cellSelectionState.isSelecting) {
      classes.push('is-selecting');
    }
    return classes.join(' ');
  }, [cellDensity, cellSelectionState.isSelecting, resolvedTheme]);

  return (
    <div className={containerClassName}>
      {loading ? (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Загрузка данных...</p>
        </div>
      ) : (
        <>
          <AgGridReact
            ref={gridRef}
            rowData={filteredChecks}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            localeText={localeText}
            getRowId={(params) => {
              if (!params.data) return undefined;
              if (params.data.id !== undefined && params.data.id !== null) {
                return String(params.data.id);
              }
              if (params.data.check_id) {
                return String(params.data.check_id);
              }
              return undefined;
            }}
            onGridReady={onGridReady}
            onRowDoubleClicked={onRowDoubleClicked}
            onCellValueChanged={onCellValueChanged}
            onColumnResized={onColumnResized}
            onColumnMoved={onColumnMoved}
            onSelectionChanged={onSelectionChanged}
            onCellFocused={onCellFocused}
            onFilterChanged={handleGridStateChange}
            onSortChanged={handleGridStateChange}
            onRowDataUpdated={handleGridStateChange}
            onCellContextMenu={handleCellContextMenu}
            onCellClicked={closeContextMenu}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseOver={handleCellMouseOver}
            // patch-010 §4: Строка итогов
            pinnedBottomRowData={pinnedBottomRowData}
            // Настройки плотности (patch-003 §2)
            rowHeight={densitySettings.rowHeight}
            headerHeight={densitySettings.rowHeight + 8}
            // Настройки производительности (§10)
            rowBuffer={10}
            immutableData={true}
            deltaRowDataMode={true}
            asyncTransactionWaitMillis={50}
            suppressAnimationFrame={true}
            suppressRowTransform={true}
            cellSelection={true}
            rowSelection="multiple"
            suppressRowClickSelection={true}
          // Редактирование (patch-007 §1: F2/двойной клик)
          singleClickEdit={false}
            stopEditingWhenCellsLoseFocus={true}
            enterNavigatesVertically={true}
            enterNavigatesVerticallyAfterEdit={true}
            // patch-007 §5: Drag-and-drop колонок
            suppressDragLeaveHidesColumns={true}
            suppressMovableColumns={false}
          // Анимации
          animateRows={false}
          // Другие опции
          enableCellTextSelection={true}
          ensureDomOrder={false}
          suppressContextMenu={true}
          enableFillHandle={false}
          />

          {/* patch-010 §1,2,4: Новое меню колонки */}
          {columnMenuState.isOpen && (
            <ColumnMenu
              column={columnMenuState.column}
              api={gridRef.current?.api}
              position={columnMenuState.position}
              onClose={handleCloseColumnMenu}
              showTotalsRow={showTotalsRow}
              onToggleTotalsRow={handleToggleTotalsRow}
              onShowColumnVisibility={() => setShowColumnVisibilityModal(true)}
            />
          )}

          {showColumnVisibilityModal && (
            <ColumnVisibilityModal
              isOpen={showColumnVisibilityModal}
              onClose={() => setShowColumnVisibilityModal(false)}
              columnDefs={columnDefs}
              api={gridRef.current?.api}
            />
          )}

          {contextMenuState.isOpen && contextMenuState.position && (
            <GridContextMenu
              position={contextMenuState.position}
              items={contextMenuItems}
              onClose={closeContextMenu}
            />
          )}

          <SelectionStatsPopover
            isOpen={selectionStatsState.isOpen}
            position={selectionStatsState.position}
            columnName={selectionStatsState.columnName}
            activeMode={selectionStatsState.activeMode}
            statsByMode={selectionStatsState.statsByMode}
            onModeChange={handleSelectionStatsModeChange}
            onCopy={handleCopySelectionStats}
            onClose={closeSelectionStatsPopover}
            formatValue={formatSelectionNumber}
            formatCount={formatCellsAmount}
          />

          <PasteSpecialPopover
            isOpen={pasteSpecialState.isOpen}
            position={pasteSpecialState.position}
            onSelect={handlePasteSpecialSelect}
            onClose={closePasteSpecialMenu}
          />

          {colorPickerState.isOpen && colorPickerState.position && (
            <div
              style={{
                position: 'fixed',
                top: colorPickerState.position.y,
                left: colorPickerState.position.x,
                zIndex: 10001,
              }}
            >
              <ColorPicker
                selectedKey={colorPickerState.currentColorKey}
                onColorSelect={handleColorPickerSelect}
                onClose={closeColorPicker}
                theme={resolvedTheme}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChecksGrid;
