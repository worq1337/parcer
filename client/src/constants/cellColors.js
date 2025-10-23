const BASE_CELL_COLORS = [
  {
    id: 'gray-10',
    name: 'Серый 10%',
    light: '#f5f5f5',
    dark: '#2c323a',
  },
  {
    id: 'gray-30',
    name: 'Серый 30%',
    light: '#e0e0e0',
    dark: '#353d4a',
  },
  {
    id: 'blue-soft',
    name: 'Синий светлый',
    light: '#e3f2fd',
    dark: '#1f3f66',
  },
  {
    id: 'turquoise',
    name: 'Бирюзовый',
    light: '#e0f7fa',
    dark: '#1f4d4d',
  },
  {
    id: 'green-soft',
    name: 'Зелёный светлый',
    light: '#e8f5e9',
    dark: '#1f4d39',
  },
  {
    id: 'yellow-soft',
    name: 'Жёлтый светлый',
    light: '#fffde7',
    dark: '#5a461a',
  },
  {
    id: 'orange-soft',
    name: 'Оранжевый светлый',
    light: '#fff3e0',
    dark: '#5a2f1a',
  },
  {
    id: 'red-soft',
    name: 'Красный светлый',
    light: '#ffebee',
    dark: '#5a1f2a',
  },
  {
    id: 'purple-soft',
    name: 'Фиолетовый светлый',
    light: '#f3e5f5',
    dark: '#3e2f5a',
  },
];

const normalizeHex = (hex) => {
  if (!hex) {
    return null;
  }
  const value = hex.trim().toLowerCase();
  if (!value.startsWith('#')) {
    return `#${value}`;
  }
  return value;
};

const HEX_TO_COLOR_KEY = (() => {
  const map = new Map();
  BASE_CELL_COLORS.forEach((token) => {
    if (token.light) {
      map.set(normalizeHex(token.light), token.id);
    }
    if (token.dark) {
      map.set(normalizeHex(token.dark), token.id);
    }
  });

  // Поддержка старых значений палитры (дубликаты light)
  [
    '#f5f5f5',
    '#e0e0e0',
    '#e3f2fd',
    '#e8f5e9',
    '#fffde7',
    '#fff3e0',
    '#ffebee',
    '#f3e5f5',
  ].forEach((legacy) => {
    const key = normalizeHex(legacy);
    if (!map.has(key)) {
      const match = BASE_CELL_COLORS.find((token) => normalizeHex(token.light) === key);
      if (match) {
        map.set(key, match.id);
      }
    }
  });

  return map;
})();

export const CELL_COLOR_TOKENS = BASE_CELL_COLORS;

export const getCellColorOptions = (theme = 'light') => {
  const options = [
    {
      id: null,
      name: 'Без цвета',
      color: null,
      preview: 'transparent',
    },
  ];

  BASE_CELL_COLORS.forEach((token) => {
    const color = theme === 'dark' ? token.dark : token.light;
    options.push({
      id: token.id,
      name: token.name,
      color,
      preview: color || 'transparent',
    });
  });

  return options;
};

export const resolveCellColor = (theme = 'light', colorKey) => {
  if (!colorKey) {
    return null;
  }

  const token = BASE_CELL_COLORS.find((entry) => entry.id === colorKey);
  if (!token) {
    return null;
  }

  return theme === 'dark' ? token.dark : token.light;
};

export const findColorKeyByHex = (hex) => {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  return HEX_TO_COLOR_KEY.get(normalized) || null;
};

export const getCellColorName = (colorKey) => {
  if (!colorKey) {
    return 'Без цвета';
  }
  const token = BASE_CELL_COLORS.find((entry) => entry.id === colorKey);
  return token ? token.name : 'Цвет';
};
