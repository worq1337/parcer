import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const THEME_VALUES = ['light', 'dark', 'system'];
const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

const getSystemThemePreference = () => {
  if (!isBrowser || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

const applyThemeToDocument = (resolvedTheme, source) => {
  if (!isBrowser) {
    return;
  }

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;

  if (source) {
    document.documentElement.dataset.themeSource = source;
  } else {
    delete document.documentElement.dataset.themeSource;
  }
};

const setupSystemThemeListener = (onChange) => {
  if (!isBrowser || !window.matchMedia) {
    return null;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (event) => {
    onChange(event.matches ? 'dark' : 'light');
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }

  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
};

let cleanupSystemThemeListener = null;
let syncThemeEffectsImpl = () => getSystemThemePreference();

/**
 * Хранилище настроек приложения
 * patch-008 §7: Настройки из меню Файл → Настройки
 * patch-016 §9,10: Расширенное форматирование чисел и тема
 */
export const useSettingsStore = create(
  persist(
    (set, get) => {
      const syncThemeEffects = (theme, options = {}) => {
        const { updateState = false } = options;
        const normalizedTheme = THEME_VALUES.includes(theme) ? theme : 'system';

        const apply = () => {
          if (cleanupSystemThemeListener) {
            cleanupSystemThemeListener();
            cleanupSystemThemeListener = null;
          }

          const isSystem = normalizedTheme === 'system';
          const resolved = isSystem ? getSystemThemePreference() : normalizedTheme;

          applyThemeToDocument(resolved, isSystem ? 'system' : 'manual');

          if (isSystem) {
            cleanupSystemThemeListener = setupSystemThemeListener((nextResolvedTheme) => {
              applyThemeToDocument(nextResolvedTheme, 'system');
              set({ resolvedTheme: nextResolvedTheme });
            });
          }

          if (updateState) {
            const prevState = get();
            if (prevState.resolvedTheme !== resolved || prevState.theme !== normalizedTheme) {
              set({ resolvedTheme: resolved, theme: normalizedTheme });
            }
          }

          return resolved;
        };

        return apply();
      };

      syncThemeEffectsImpl = (theme, options) => syncThemeEffects(theme, options);

      return {
        // 1. Форматирование чисел - patch-016 §9
        numberFormatting: {
          // Разделитель тысяч: false | 'space' | 'thinSpace' | 'dot' | 'comma'
          thousandsSeparator: false,
          // Десятичный разделитель: ',' | '.'
          decimalSeparator: ',',
          // Отрицательные числа красным
          negativeRed: false,
          // Показывать минус у списаний (Оплата, Списание, E-Com, Платёж)
          showMinusForDebits: false,
          // Символ P2P: '' | '1' | '✓' | '•'
          p2pSymbol: '✓',
        },

        // patch-016 §10: Тёма интерфейса
        theme: 'system', // 'light' | 'dark' | 'system'
        resolvedTheme: getSystemThemePreference(),

        // 2. Логика транзакций
        transactionLogic: {
          autoNegativeForDebits: true, // Автоматически минус для списаний (по умолчанию вкл)
          autoDetectP2P: true, // Автоопределение P2P по словарю (вкл)
        },

        // 3. Дубликаты
        duplicates: {
          timeWindowMinutes: 2, // Окно совпадения по времени (мин)
          amountThreshold: 0.01, // Порог суммы (UZS)
        },

        // 4. Справочник
        dictionary: {
          suggestFromNewChecks: true, // Подтягивать предложения из новых чеков
        },

        // 5. patch-010 §3.A: Пути и хранилище (обновлено)
        paths: {
          userDataPath: '', // Путь к хранилищу (app.getPath('userData'), read-only)
          backupPath: '', // Путь к файлам резервных копий
        },

        // 6. patch-010 §3.D: Логи и диагностика
        logs: {
          collectUILogs: false, // Собирать логи UI (по умолчанию выкл)
        },

        // 7. patch-013: Строка формул и статуса
        formulaBar: {
          showSummaryChips: true, // Показывать сводные чипы (по умолчанию вкл)
          height: 40, // Высота строки формул (px)
          lastCursorPosition: 0, // Последняя позиция курсора
        },

        // Методы обновления
        updateNumberFormatting: (updates) =>
          set((state) => ({
            numberFormatting: { ...state.numberFormatting, ...updates },
          })),

        updateTransactionLogic: (updates) =>
          set((state) => ({
            transactionLogic: { ...state.transactionLogic, ...updates },
          })),

        updateDuplicates: (updates) =>
          set((state) => ({
            duplicates: { ...state.duplicates, ...updates },
          })),

        updateDictionary: (updates) =>
          set((state) => ({
            dictionary: { ...state.dictionary, ...updates },
          })),

        updatePaths: (updates) =>
          set((state) => ({
            paths: { ...state.paths, ...updates },
          })),

        updateLogs: (updates) =>
          set((state) => ({
            logs: { ...state.logs, ...updates },
          })),

        updateFormulaBar: (updates) =>
          set((state) => ({
            formulaBar: { ...state.formulaBar, ...updates },
          })),

        // patch-016 §10: Установка темы
        setTheme: (theme) => {
          if (!THEME_VALUES.includes(theme)) {
            console.warn(`Unsupported theme value: ${theme}`);
            return;
          }

          const prevTheme = get().theme;
          const prevResolvedTheme = get().resolvedTheme;

          const resolvedTheme = syncThemeEffects(theme);

          if (theme !== prevTheme || resolvedTheme !== prevResolvedTheme) {
            set({ theme, resolvedTheme });
          }
        },

        // Опасная зона: Сброс настроек вида
        resetViewSettings: () => {
          // Очищаем настройки колонок и фильтров из localStorage
          localStorage.removeItem('filters-store');
          window.location.reload(); // Перезагружаем для применения
        },
      };
    },
    {
      name: 'settings-store',
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (!isBrowser) {
          return;
        }

        const themeFromState = state?.theme;
        const nextTheme = THEME_VALUES.includes(themeFromState)
          ? themeFromState
          : useSettingsStore.getState().theme;

        syncThemeEffectsImpl(nextTheme, { updateState: true });
      },
    }
  )
);

if (isBrowser) {
  const schedule = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => setTimeout(fn, 0);
  schedule(() => {
    const { theme } = useSettingsStore.getState();
    syncThemeEffectsImpl(theme, { updateState: true });
  });
}
