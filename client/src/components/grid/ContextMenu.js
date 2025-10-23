import React from 'react';
import Icon from '../icons/Icon';
import '../../styles/ContextMenu.css';

/**
 * Контекстное меню для грида (как в Excel)
 * Согласно patch-006 §1: полное ПКМ-меню с P2P и другими функциями
 */
export const getContextMenuItems = ({
  params,
  onCheckDetails,
  onRefresh,
  onCopy,
  onCut,
  onPaste,
  onPasteSpecial,
  onInsertRow,
  onInsertColumn,
  onDelete,
  onFreeze,
  onFilterByValue,
  onFilterKeepOnly,
  onFilterExclude,
  onFilterByCard,
  onExportSelected,
  onShowHistory,
  onMergeCells,
  onUnmergeCells,
  onAutoFitColumn,
  onResetColumnWidth,
  onSetDensity,
  onToggleP2P,
  onSetAlignment,
  onToggleWrap,
  onSetNumberFormat,
  onSetBackgroundColor, // patch-010 §2: Цвет фона
}) => {
  if (!params.node) return [];

  const menuItems = [
    // 1. Вырезать
    {
      name: 'Вырезать',
      icon: renderIcon('cut'),
      shortcut: 'Ctrl+X',
      action: () => {
        onCut && onCut(params);
      },
    },

    // 2. Копировать
    {
      name: 'Копировать',
      icon: renderIcon('copy'),
      shortcut: 'Ctrl+C',
      action: () => {
        onCopy && onCopy(params);
      },
    },

    // 3. Вставить
    {
      name: 'Вставить',
      icon: renderIcon('paste'),
      shortcut: 'Ctrl+V',
      action: () => {
        onPaste && onPaste(params);
      },
    },

    // 4. Специальная вставка
    {
      name: 'Специальная вставка',
      icon: renderIcon('paste'),
      subMenu: [
        {
          name: 'Только значения',
          action: () => {
            onPasteSpecial && onPasteSpecial(params, 'values');
          },
        },
        {
          name: 'Только формат',
          action: () => {
            onPasteSpecial && onPasteSpecial(params, 'format');
          },
        },
        {
          name: 'Транспонировать',
          action: () => {
            onPasteSpecial && onPasteSpecial(params, 'transpose');
          },
        },
        {
          name: 'Значения с числовым форматом',
          action: () => {
            onPasteSpecial && onPasteSpecial(params, 'values-format');
          },
        },
      ],
    },

    'separator',

    // 5. Вставить строку выше/ниже
    {
      name: 'Вставить строку',
      icon: renderIcon('add'),
      subMenu: [
        {
          name: 'Выше',
          action: () => {
            onInsertRow && onInsertRow(params, 'above');
          },
        },
        {
          name: 'Ниже',
          action: () => {
            onInsertRow && onInsertRow(params, 'below');
          },
        },
      ],
    },

    // 6. patch-010 §2: Вставить столбец слева/справа
    {
      name: 'Вставить столбец',
      icon: renderIcon('add'),
      subMenu: [
        {
          name: 'Слева',
          action: () => {
            onInsertColumn && onInsertColumn(params, 'left');
          },
        },
        {
          name: 'Справа',
          action: () => {
            onInsertColumn && onInsertColumn(params, 'right');
          },
        },
      ],
    },

    'separator',

    // 7. Удалить строку/содержимое
    {
      name: 'Удалить',
      icon: renderIcon('delete'),
      shortcut: 'Del',
      subMenu: [
        {
          name: 'Удалить строку',
          action: () => {
            onDelete && onDelete(params, 'row');
          },
        },
        {
          name: 'Удалить содержимое ячеек',
          action: () => {
            onDelete && onDelete(params, 'content');
          },
        },
      ],
    },

    'separator',

    // patch-006 §1: Выравнивание
    {
      name: 'Выравнивание',
      icon: renderIcon('align_left'),
      subMenu: [
        {
          name: 'По левому краю',
          action: () => {
            onSetAlignment && onSetAlignment(params, 'left');
          },
        },
        {
          name: 'По центру',
          action: () => {
            onSetAlignment && onSetAlignment(params, 'center');
          },
        },
        {
          name: 'По правому краю',
          action: () => {
            onSetAlignment && onSetAlignment(params, 'right');
          },
        },
      ],
    },

    // patch-006 §1: Числовой формат
    {
      name: 'Числовой формат',
      icon: renderIcon('format_number'),
      subMenu: [
        {
          name: 'Сумма (−/+)',
          action: () => {
            onSetNumberFormat && onSetNumberFormat(params, 'amount');
          },
        },
        {
          name: 'Остаток',
          action: () => {
            onSetNumberFormat && onSetNumberFormat(params, 'balance');
          },
        },
        {
          name: 'Без разделителя тысяч',
          action: () => {
            onSetNumberFormat && onSetNumberFormat(params, 'no-thousands');
          },
        },
        {
          name: 'С разделителем тысяч',
          action: () => {
            onSetNumberFormat && onSetNumberFormat(params, 'with-thousands');
          },
        },
      ],
    },

    // patch-010 §2: Цвет фона (6-8 нейтральных оттенков)
    {
      name: 'Цвет фона',
      icon: renderIcon('palette'),
      subMenu: [
        {
          name: 'Нет',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, null);
          },
        },
        {
          name: 'Серый светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#f5f5f5');
          },
        },
        {
          name: 'Серый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#e0e0e0');
          },
        },
        {
          name: 'Синий светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#e3f2fd');
          },
        },
        {
          name: 'Зелёный светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#e8f5e9');
          },
        },
        {
          name: 'Жёлтый светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#fffde7');
          },
        },
        {
          name: 'Оранжевый светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#fff3e0');
          },
        },
        {
          name: 'Красный светлый',
          action: () => {
            onSetBackgroundColor && onSetBackgroundColor(params, '#ffebee');
          },
        },
      ],
    },

    'separator',

    // Объединение/разъединение ячеек (patch-006 §1, §7.2)
    {
      name: 'Объединить ячейки',
      icon: renderIcon('merge'),
      shortcut: 'Ctrl+Alt+M',
      action: () => {
        onMergeCells && onMergeCells(params);
      },
    },
    {
      name: 'Разъединить',
      icon: renderIcon('unmerge'),
      shortcut: 'Ctrl+Alt+U',
      action: () => {
        onUnmergeCells && onUnmergeCells(params);
      },
    },

    'separator',

    // 8. Заморозить столбец
    {
      name: 'Заморозить столбец',
      icon: renderIcon('freeze'),
      action: () => {
        onFreeze && onFreeze(params, true);
      },
    },
    {
      name: 'Снять заморозку',
      icon: renderIcon('unfreeze'),
      action: () => {
        onFreeze && onFreeze(params, false);
      },
    },

    'separator',

    // Управление шириной колонок (patch-003 §7)
    {
      name: 'Авто-ширина колонки',
      icon: renderIcon('auto_width'),
      action: () => {
        onAutoFitColumn && onAutoFitColumn(params);
      },
    },
    {
      name: 'Сбросить ширину колонки',
      icon: renderIcon('reset_width'),
      action: () => {
        onResetColumnWidth && onResetColumnWidth(params);
      },
    },

    'separator',

    // 9. Контекстные фильтры (patch-004 §4)
    {
      name: 'Оставить только это',
      icon: renderIcon('filter'),
      action: () => {
        onFilterKeepOnly && onFilterKeepOnly(params);
      },
    },
    {
      name: 'Исключить это значение',
      icon: renderIcon('filter'),
      action: () => {
        onFilterExclude && onFilterExclude(params);
      },
    },
    {
      name: 'Фильтр по этой карте',
      icon: renderIcon('credit_card'),
      action: () => {
        onFilterByCard && onFilterByCard(params);
      },
      disabled: !params.column || params.column.colId !== 'card_number',
    },

    'separator',

    // Плотность (patch-003 §7)
    {
      name: 'Плотность',
      icon: renderIcon('density_medium'),
      subMenu: [
        {
          name: 'Компактный',
          action: () => {
            onSetDensity && onSetDensity('compact');
          },
        },
        {
          name: 'Стандарт',
          action: () => {
            onSetDensity && onSetDensity('standard');
          },
        },
        {
          name: 'Крупный',
          action: () => {
            onSetDensity && onSetDensity('large');
          },
        },
      ],
    },

    'separator',

    // 10-11. Экспорт
    {
      name: 'Копировать как',
      icon: renderIcon('copy'),
      subMenu: [
        {
          name: 'CSV',
          action: () => {
            copyAsFormat(params, 'csv');
          },
        },
        {
          name: 'TSV',
          action: () => {
            copyAsFormat(params, 'tsv');
          },
        },
      ],
    },
    {
      name: 'Экспортировать выделенное в Excel',
      icon: renderIcon('excel'),
      action: () => {
        onExportSelected && onExportSelected(params);
      },
    },

    'separator',

    // 12. История изменений строки
    {
      name: 'История изменений строки',
      icon: renderIcon('history'),
      action: () => {
        onShowHistory && onShowHistory(params);
      },
    },

    // 13. Открыть детали чека
    {
      name: 'Открыть детали чека',
      icon: renderIcon('info'),
      action: () => {
        onCheckDetails && onCheckDetails(params.node.data);
      },
    },

    'separator',

    // patch-006 §1, §6: Управление P2P
    {
      name: params.node.data?.is_p2p
        ? 'Снять отметку P2P'
        : 'Отметить как P2P',
      icon: renderIcon('swap_horiz'),
      action: () => {
        onToggleP2P && onToggleP2P(params);
      },
    },

    // 14. Отметить как дубликат
    {
      name: params.node.data?.is_duplicate
        ? 'Снять отметку дубликата'
        : 'Отметить как дубликат',
      icon: renderIcon('duplicate'),
      action: () => {
        // TODO: Реализовать пометку дубликатов
        console.log('Toggle duplicate', params.node.data);
      },
    },
  ];

  return menuItems;
};

/**
 * Рендер иконки для AG Grid
 */
// AG Grid не поддерживает HTML строки для иконок в контекстном меню
// Возвращаем undefined, чтобы показать меню без иконок
function renderIcon(name) {
  return undefined; // AG Grid показывает текст без иконки
}

/**
 * Копирование в различных форматах
 */
function copyAsFormat(params, format) {
  const data = params.node.data;
  let text = '';

  const separator = format === 'csv' ? ',' : '\t';

  if (format === 'csv' || format === 'tsv') {
    text = Object.values(data).join(separator);
  }

  navigator.clipboard.writeText(text);
}

export default getContextMenuItems;
