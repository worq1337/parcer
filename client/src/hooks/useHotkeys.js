import { useEffect } from 'react';

/**
 * Хук для обработки горячих клавиш
 * Согласно patch-003 §8
 *
 * @param {Object} hotkeys - объект с горячими клавишами и обработчиками
 *   ВАЖНО: hotkeys должен быть мемоизирован (useMemo/useCallback) чтобы избежать пересоздания слушателя
 *
 * Пример использования:
 * const hotkeysConfig = useMemo(() => ({
 *   'Ctrl+Shift+F': () => console.log('Open filters'),
 *   'Cmd+Shift+F': () => console.log('Open filters (Mac)'),
 *   'Ctrl+Alt+D': () => console.log('Toggle density'),
 * }), [dependencies]);
 * useHotkeys(hotkeysConfig);
 */
const useHotkeys = (hotkeys) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Игнорируем события из input/textarea, если не указано иное
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'TEXTAREA' ||
        event.target.isContentEditable
      ) {
        // Разрешаем только специальные комбинации, не конфликтующие с вводом
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          return;
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrl = event.ctrlKey || event.metaKey;
      const alt = event.altKey;
      const shift = event.shiftKey;
      const key = event.key.toLowerCase();

      // Формируем строку комбинации
      const parts = [];
      if (ctrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
      if (alt) parts.push('Alt');
      if (shift) parts.push('Shift');

      // Нормализуем ключ
      let normalizedKey = key;
      if (key.length === 1) {
        normalizedKey = key.toUpperCase();
      }
      parts.push(normalizedKey);

      const combination = parts.join('+');

      // Проверяем все возможные варианты (Ctrl и Cmd)
      const possibleCombinations = [combination];

      // Добавляем альтернативный вариант для Mac/Windows
      if (isMac && combination.startsWith('Cmd')) {
        possibleCombinations.push(combination.replace('Cmd', 'Ctrl'));
      } else if (!isMac && combination.startsWith('Ctrl')) {
        possibleCombinations.push(combination.replace('Ctrl', 'Cmd'));
      }

      // Проверяем совпадения
      for (const combo of possibleCombinations) {
        if (hotkeys[combo]) {
          event.preventDefault();
          event.stopPropagation();
          hotkeys[combo](event);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [hotkeys]); // FIX: Removed deps parameter - caller should memoize hotkeys object
};

export default useHotkeys;
