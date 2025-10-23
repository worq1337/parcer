import React from 'react';
import { Icon as IconifyIcon } from '@iconify/react';

/**
 * Карта иконок согласно patch.md §6.2
 * Используем Material Symbols через Iconify
 */
const iconMap = {
  // Типы транзакций (приход/расход)
  'arrow_downward': 'mdi:arrow-down',
  'arrow_upward': 'mdi:arrow-up',

  // Источники
  'telegram': 'mdi:send',
  'sms': 'mdi:message-text',
  'manual': 'mdi:pencil',

  // Типы операций
  'payment': 'mdi:credit-card',
  'credit_card': 'mdi:credit-card',
  'add_circle': 'mdi:plus-circle',
  'sync_alt': 'mdi:sync',
  'shopping_bag': 'mdi:shopping',
  'do_not_disturb_on': 'mdi:minus-circle',

  // P2P
  'swap_horiz': 'mdi:swap-horizontal',

  // Действия в UI
  'refresh': 'mdi:refresh',
  'download': 'mdi:download',
  'upload': 'mdi:upload',
  'filter': 'mdi:filter',
  'search': 'mdi:magnify',
  'close': 'mdi:close',
  'delete': 'mdi:delete',
  'edit': 'mdi:pencil',
  'save': 'mdi:content-save',
  'cancel': 'mdi:cancel',
  'add': 'mdi:plus',
  'remove': 'mdi:minus',
  'settings': 'mdi:cog',
  'info': 'mdi:information',
  'warning': 'mdi:alert',
  'error': 'mdi:alert-circle',
  'success': 'mdi:check-circle',
  'copy': 'mdi:content-copy',
  'paste': 'mdi:content-paste',
  'cut': 'mdi:content-cut',
  'undo': 'mdi:undo',
  'redo': 'mdi:redo',
  'export': 'mdi:file-export',
  'import': 'mdi:file-import',
  'excel': 'mdi:microsoft-excel',
  'calendar': 'mdi:calendar',
  'clock': 'mdi:clock-outline',
  'menu': 'mdi:menu',
  'more_vert': 'mdi:dots-vertical',
  'more_horiz': 'mdi:dots-horizontal',
  'chevron_left': 'mdi:chevron-left',
  'chevron_right': 'mdi:chevron-right',
  'chevron_up': 'mdi:chevron-up',
  'chevron_down': 'mdi:chevron-down',
  'expand_more': 'mdi:chevron-down',
  'expand_less': 'mdi:chevron-up',
  'history': 'mdi:history',
  'duplicate': 'mdi:content-duplicate',

  // Специфичные
  'freeze': 'mdi:pin',
  'unfreeze': 'mdi:pin-off',
  'auto_width': 'mdi:table-column-width',
  'width_normal': 'mdi:table-refresh',
  'reset_width': 'mdi:table-refresh',

  // Плотность ячеек (patch-003)
  'density_small': 'mdi:view-headline',
  'density_medium': 'mdi:view-list',
  'density_large': 'mdi:view-agenda',

  // Фильтры (patch-003)
  'filter_list': 'mdi:filter-variant',

  // Объединение ячеек (patch-003)
  'merge': 'mdi:table-merge-cells',
  'unmerge': 'mdi:table-split-cell',

  // patch-010: Цвет фона
  'palette': 'mdi:palette',
  'format_number': 'mdi:numeric',

  // patch-010 §4: Горячие клавиши
  'keyboard': 'mdi:keyboard',
  'help': 'mdi:help-circle',

  // Пресеты фильтров (patch-004)
  'work': 'mdi:briefcase',
  'people': 'mdi:account-group',
  'trending_up': 'mdi:trending-up',
  'attach_money': 'mdi:currency-usd',
  'today': 'mdi:calendar-today',
  'weekend': 'mdi:beach',
  'nights_stay': 'mdi:weather-night',
  'message': 'mdi:message',
  'bookmark': 'mdi:bookmark',
};

/**
 * Компонент иконки
 * @param {string} name - название иконки из карты или прямое имя iconify
 * @param {string} color - цвет иконки
 * @param {number|string} size - размер иконки (px или rem)
 * @param {string} className - дополнительные CSS классы
 * @param {object} style - inline стили
 */
const Icon = ({
  name,
  color,
  size = 20,
  className = '',
  style = {},
  ...props
}) => {
  const iconName = iconMap[name] || name;

  return (
    <IconifyIcon
      icon={iconName}
      color={color}
      width={size}
      height={size}
      className={`icon ${className}`}
      style={style}
      {...props}
    />
  );
};

export default Icon;
