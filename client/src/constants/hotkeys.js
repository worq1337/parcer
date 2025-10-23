export const HOTKEY_GROUPS = [
  {
    category: 'Редактирование',
    items: [
      {
        id: 'edit.focus-formula',
        shortcut: 'F2',
        description: 'Войти в режим редактирования строки формул для активной ячейки',
      },
      {
        id: 'edit.commit-down',
        shortcut: 'Enter',
        description: 'Сохранить изменения и перейти на строку вниз',
      },
      {
        id: 'edit.commit-up',
        shortcut: 'Shift+Enter',
        description: 'Сохранить изменения и перейти на строку вверх',
      },
      {
        id: 'edit.commit-right',
        shortcut: 'Tab',
        description: 'Сохранить изменения и перейти к следующей ячейке',
      },
      {
        id: 'edit.commit-left',
        shortcut: 'Shift+Tab',
        description: 'Сохранить изменения и перейти к предыдущей ячейке',
      },
      {
        id: 'edit.cancel',
        shortcut: 'Esc',
        description: 'Отменить редактирование или закрыть активную панель',
      },
      {
        id: 'edit.clear',
        shortcut: 'Delete',
        keywords: ['del', 'backspace'],
        description: 'Очистить содержимое активной ячейки',
      },
    ],
  },
  {
    category: 'Навигация',
    items: [
      {
        id: 'nav.down',
        shortcut: 'Enter',
        description: 'Переместиться на строку вниз (без режима редактирования)',
      },
      {
        id: 'nav.up',
        shortcut: 'Shift+Enter',
        description: 'Переместиться на строку вверх',
      },
      {
        id: 'nav.next',
        shortcut: 'Tab',
        description: 'Перейти к следующей ячейке',
      },
      {
        id: 'nav.prev',
        shortcut: 'Shift+Tab',
        description: 'Перейти к предыдущей ячейке',
      },
      {
        id: 'nav.arrows',
        shortcut: '↑ / ↓ / ← / →',
        keywords: ['стрелки'],
        description: 'Навигация по ячейкам стрелками',
      },
      {
        id: 'nav.home',
        shortcut: 'Home',
        description: 'Перейти в начало строки',
      },
      {
        id: 'nav.end',
        shortcut: 'End',
        description: 'Перейти в конец строки',
      },
      {
        id: 'nav.page-up',
        shortcut: 'Page Up',
        description: 'Прокрутить таблицу на страницу вверх',
      },
      {
        id: 'nav.page-down',
        shortcut: 'Page Down',
        description: 'Прокрутить таблицу на страницу вниз',
      },
    ],
  },
  {
    category: 'Буфер обмена',
    items: [
      {
        id: 'clipboard.copy',
        shortcut: 'Ctrl/Cmd+C',
        description: 'Копировать выделенные ячейки',
      },
      {
        id: 'clipboard.cut',
        shortcut: 'Ctrl/Cmd+X',
        description: 'Вырезать выделенные ячейки',
      },
      {
        id: 'clipboard.paste',
        shortcut: 'Ctrl/Cmd+V',
        description: 'Вставить из буфера обмена',
      },
      {
        id: 'clipboard.paste-special',
        shortcut: 'Ctrl/Cmd+Shift+V',
        description: 'Открыть меню специальной вставки',
      },
    ],
  },
  {
    category: 'Форматирование',
    items: [
      {
        id: 'format.align-left',
        shortcut: 'Ctrl/Cmd+Shift+L',
        description: 'Выравнивание текста по левому краю',
      },
      {
        id: 'format.align-center',
        shortcut: 'Ctrl/Cmd+Shift+E',
        description: 'Выравнивание текста по центру',
      },
      {
        id: 'format.align-right',
        shortcut: 'Ctrl/Cmd+Shift+R',
        description: 'Выравнивание текста по правому краю',
      },
      {
        id: 'format.open-color-picker',
        shortcut: 'Ctrl/Cmd+Alt+B',
        description: 'Открыть палитру цвета фона',
      },
      {
        id: 'format.copy-style',
        shortcut: 'Ctrl/Cmd+Alt+C',
        description: 'Скопировать формат текущей ячейки',
      },
      {
        id: 'format.paste-style',
        shortcut: 'Ctrl/Cmd+Alt+V',
        description: 'Применить скопированный формат',
      },
      {
        id: 'format.clear-color',
        shortcut: 'Ctrl/Cmd+Alt+Backspace',
        keywords: ['delete', 'backspace'],
        description: 'Очистить цвет фона ячейки',
      },
    ],
  },
  {
    category: 'Вид',
    items: [
      {
        id: 'view.autofit',
        shortcut: 'Alt+DoubleClick',
        description: 'Автоматически подогнать ширину всех колонок',
      },
      {
        id: 'view.density',
        shortcut: 'Ctrl/Cmd+Alt+D',
        description: 'Переключить плотность строк',
      },
      {
        id: 'view.quick-search',
        shortcut: 'Ctrl/Cmd+F',
        description: 'Открыть панель быстрого поиска',
      },
      {
        id: 'view.filters',
        shortcut: 'Ctrl/Cmd+Shift+F',
        description: 'Показать или скрыть расширенные фильтры',
      },
    ],
  },
  {
    category: 'История',
    items: [
      {
        id: 'history.undo',
        shortcut: 'Ctrl/Cmd+Z',
        description: 'Отменить последнее действие',
      },
      {
        id: 'history.redo',
        shortcut: 'Ctrl+Y / Cmd+Shift+Z',
        description: 'Повторить отменённое действие',
      },
      {
        id: 'history.save',
        shortcut: 'Ctrl/Cmd+S',
        description: 'Показать статус автосохранения',
      },
    ],
  },
  {
    category: 'Общие',
    items: [
      {
        id: 'general.hotkeys',
        shortcut: 'Ctrl/Cmd+/',
        description: 'Показать или скрыть справку по горячим клавишам',
      },
      {
        id: 'general.refresh',
        shortcut: 'Ctrl/Cmd+R',
        description: 'Обновить данные из базы',
      },
    ],
  },
];
