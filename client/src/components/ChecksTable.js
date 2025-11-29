import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { toast } from 'react-toastify';
import { checksAPI } from '../services/api';
import { exportToExcel } from '../utils/excelExport';
import { formatAmount, formatBalance, formatCardLast4 } from '../utils/formatters';
import { useSettingsStore } from '../state/settingsStore';
import '../styles/ChecksTable.css';

const DEBIT_TRANSACTION_TYPES = ['Оплата', 'Списание', 'E-Com', 'Платёж'];

const ChecksTable = ({ refreshTrigger, onCheckDetails, onRefresh }) => {
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const numberFormatting = useSettingsStore((state) => state.numberFormatting);
  const gridRef = useRef(null);

  // Загрузка данных
  const loadChecks = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await checksAPI.getAll();
      setChecks(payload?.data || payload || []);
    } catch (error) {
      console.error('Ошибка загрузки чеков:', error);
      toast.error('Не удалось загрузить чеки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChecks();
  }, [loadChecks, refreshTrigger]);

  // Определение колонок
  const columnDefs = useMemo(() => [
    {
      headerName: '№',
      field: 'id',
      width: 80,
      filter: 'agNumberColumnFilter',
      pinned: 'left'
    },
    {
      headerName: 'Дата и время',
      field: 'datetime',
      width: 180,
      filter: 'agDateColumnFilter',
      valueFormatter: params => {
        if (!params.value) return '';
        const date = new Date(params.value);
        return date.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    },
    {
      headerName: 'Д.н.',
      field: 'weekday',
      width: 70,
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Дата',
      field: 'date_display',
      width: 100,
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Время',
      field: 'time_display',
      width: 90,
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Оператор/Продавец',
      field: 'operator',
      width: 300,
      filter: 'agTextColumnFilter',
      flex: 1
    },
    {
      headerName: 'Приложение',
      field: 'app',
      width: 150,
      filter: 'agTextColumnFilter',
      valueFormatter: params => params.value || '—'
    },
    {
      headerName: 'Сумма',
      field: 'amount',
      width: 150,
      filter: 'agNumberColumnFilter',
      valueFormatter: (params) => {
        if (params.value === null || params.value === undefined) {
          return '';
        }

        const numericValue = typeof params.value === 'number' ? params.value : Number(params.value);
        if (Number.isNaN(numericValue)) {
          return String(params.value);
        }

        return formatAmount(numericValue, numberFormatting);
      },
      cellStyle: params => {
        if (!params.value) return null;
        return {
          color:
            params.value >= 0
              ? 'var(--status-success)'
              : 'var(--status-error)',
          fontWeight: 'bold'
        };
      }
    },
    {
      headerName: 'Остаток',
      field: 'balance',
      width: 150,
      filter: 'agNumberColumnFilter',
      valueFormatter: params => {
        if (!params.value) return '—';
        return formatBalance(params.value, numberFormatting);
      }
    },
    {
      headerName: 'ПК',
      field: 'card_last4',
      width: 90,
      filter: 'agTextColumnFilter',
      valueFormatter: params => formatCardLast4(params.value)
    },
    {
      headerName: 'P2P',
      field: 'is_p2p',
      width: 80,
      filter: 'agTextColumnFilter',
      valueFormatter: params => params.value ? '✓' : '',
      cellStyle: { textAlign: 'center' }
    },
    {
      headerName: 'Тип',
      field: 'transaction_type',
      width: 130,
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Валюта',
      field: 'currency',
      width: 90,
      filter: 'agTextColumnFilter'
    },
    {
      headerName: 'Источник',
      field: 'source',
      width: 110,
      filter: 'agTextColumnFilter'
    }
  ], [numberFormatting]);

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.refreshCells({ columns: ['amount'], force: true });
    }
  }, [numberFormatting.thousandsSeparator, numberFormatting.decimalSeparator]);

  // Настройки по умолчанию для колонок
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: true
  }), []);

  // Локализация AG-Grid на русский язык
  const localeText = useMemo(() => ({
    // Фильтры
    filterOoo: 'Фильтр...',
    equals: 'Равно',
    notEqual: 'Не равно',
    lessThan: 'Меньше чем',
    greaterThan: 'Больше чем',
    lessThanOrEqual: 'Меньше или равно',
    greaterThanOrEqual: 'Больше или равно',
    inRange: 'В диапазоне',
    contains: 'Содержит',
    notContains: 'Не содержит',
    startsWith: 'Начинается с',
    endsWith: 'Заканчивается на',
    blank: 'Пусто',
    notBlank: 'Не пусто',
    andCondition: 'И',
    orCondition: 'ИЛИ',
    // Меню фильтров
    applyFilter: 'Применить',
    clearFilter: 'Очистить',
    resetFilter: 'Сбросить',
    // Пагинация
    page: 'Страница',
    to: 'до',
    of: 'из',
    more: 'ещё',
    next: 'Следующая',
    last: 'Последняя',
    first: 'Первая',
    previous: 'Предыдущая',
    // Выбор строк
    selectAll: 'Выбрать все',
    selectAllSearchResults: 'Выбрать все результаты поиска',
    searchOoo: 'Поиск...',
    // Прочее
    noRowsToShow: 'Нет данных для отображения',
    enabled: 'Включено',
    // Столбцы
    columns: 'Столбцы',
    filters: 'Фильтры',
    rowGroupColumns: 'Группировка',
    rowGroupColumnsEmptyMessage: 'Перетащите сюда для группировки',
    valueColumns: 'Значения',
    pivotMode: 'Режим сводной таблицы',
    groups: 'Группы',
    values: 'Значения',
    pivots: 'Столбцы сводной таблицы',
    valueColumnsEmptyMessage: 'Перетащите сюда для агрегации',
    pivotColumnsEmptyMessage: 'Перетащите сюда для сводной таблицы',
    // Контекстное меню
    copy: 'Копировать',
    copyWithHeaders: 'Копировать с заголовками',
    paste: 'Вставить',
    export: 'Экспорт'
  }), []);

  // Контекстное меню
  const getContextMenuItems = useCallback((params) => {
    if (!params.node) return [];

    return [
      {
        name: 'Подробности',
        icon: '<span>ℹ️</span>',
        action: () => {
          onCheckDetails(params.node.data);
        }
      },
      'separator',
      {
        name: 'Копировать значение',
        icon: '<span>📋</span>',
        action: () => {
          const value = params.value;
          navigator.clipboard.writeText(value);
          toast.success('Скопировано в буфер обмена');
        }
      },
      {
        name: 'Копировать строку',
        icon: '<span>📄</span>',
        action: () => {
          const row = params.node.data;
          const text = Object.values(row).join('\t');
          navigator.clipboard.writeText(text);
          toast.success('Строка скопирована');
        }
      },
      'separator',
      {
        name: 'Удалить',
        icon: '<span>🗑️</span>',
        action: async () => {
          if (window.confirm('Вы уверены, что хотите удалить этот чек?')) {
            try {
              await checksAPI.delete(params.node.data.id);
              toast.success('Чек удалён');
              onRefresh();
            } catch (error) {
              toast.error('Ошибка при удалении чека');
            }
          }
        }
      },
      'separator',
      {
        name: 'Копировать',
        action: () => {
          const value = params.value;
          navigator.clipboard.writeText(value);
        }
      },
      {
        name: 'Копировать с заголовками',
        action: () => {
          const colDef = params.column.getColDef();
          const header = colDef.headerName || colDef.field;
          const value = params.value;
          const text = `${header}\n${value}`;
          navigator.clipboard.writeText(text);
        }
      },
      {
        name: 'Экспорт',
        action: () => {
          handleExport();
        }
      }
    ];
  }, [onCheckDetails, onRefresh]);

  // Двойной клик для просмотра деталей
  const onRowDoubleClicked = useCallback((event) => {
    onCheckDetails(event.data);
  }, [onCheckDetails]);

  // Экспорт в Excel
  const handleExport = async () => {
    try {
      await exportToExcel(checks);
      toast.success('Экспорт завершён');
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      toast.error('Ошибка при экспорте в Excel');
    }
  };

  return (
    <div className="checks-table-container">
      <div className="table-toolbar">
        <div className="table-info">
          <span className="info-text">
            Всего чеков: <strong>{checks.length}</strong>
          </span>
        </div>
        <div className="table-actions">
          <button className="toolbar-button" onClick={handleExport}>
            <span className="button-icon">📊</span>
            Экспорт в Excel
          </button>
        </div>
      </div>

      <div className="ag-theme-alpine" style={{ height: 'calc(100% - 60px)', width: '100%' }}>
        {loading ? (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Загрузка данных...</p>
          </div>
        ) : (
          <AgGridReact
            ref={gridRef}
            rowData={checks}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            localeText={localeText}
            getContextMenuItems={getContextMenuItems}
            onRowDoubleClicked={onRowDoubleClicked}
            pagination={true}
            paginationPageSize={50}
            enableCellTextSelection={true}
            ensureDomOrder={true}
            animateRows={true}
            rowSelection="multiple"
            suppressRowClickSelection={true}
          />
        )}
      </div>
    </div>
  );
};

export default ChecksTable;
