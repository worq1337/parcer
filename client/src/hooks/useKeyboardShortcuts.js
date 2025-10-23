import { useEffect } from 'react';

/**
 * Хук для глобальных горячих клавиш (patch-006 §9)
 * @param {Object} shortcuts - Объект с обработчиками: { 'Ctrl+/': handler, 'F2': handler }
 * @param {boolean} enabled - Включены ли горячие клавиши
 */
const useKeyboardShortcuts = (shortcuts, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Игнорируем если фокус в input/textarea (кроме специальных клавиш)
      const isInputFocused =
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable;

      // Определяем комбинацию клавиш
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      let keyCombo = '';

      if (cmdOrCtrl) keyCombo += 'Ctrl+';
      if (e.shiftKey) keyCombo += 'Shift+';
      if (e.altKey) keyCombo += 'Alt+';

      // Добавляем основную клавишу
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      keyCombo += key;

      // Проверяем есть ли обработчик для этой комбинации
      const handler = shortcuts[keyCombo];

      if (handler) {
        // Для некоторых клавиш разрешаем работу в input
        const allowedInInput = ['Ctrl+/', 'Ctrl+Shift+F', 'Escape', 'F2'];

        if (!isInputFocused || allowedInInput.includes(keyCombo)) {
          e.preventDefault();
          handler(e);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
};

export default useKeyboardShortcuts;
