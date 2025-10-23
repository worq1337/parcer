/**
 * Словарь операторов и приложений
 * patch-008 §2, §11: Соответствие оператор → приложение + P2P флаг
 *
 * Источник: примеры из patch-008 §16
 */

export const OPERATORS_DICTIONARY = [
  // SQB
  {
    canonicalName: 'SQB',
    appName: 'SQB',
    synonyms: ['SQB MOBILE HUMO P2P', 'SQB MOBILE', 'SQB P2P', 'SQB'],
    isP2P: true,
  },

  // Humans (UPAY)
  {
    canonicalName: 'Humans',
    appName: 'Humans',
    synonyms: ['UPAY P2P', 'UPAY', 'Humans P2P', 'HUMANS'],
    isP2P: true,
  },

  // Tenge24
  {
    canonicalName: 'Tenge24',
    appName: 'Tenge24',
    synonyms: ['Tenge24 P2P', 'Tenge24', 'TENGE24'],
    isP2P: true,
  },

  // XAZNA
  {
    canonicalName: 'XAZNA',
    appName: 'XAZNA',
    synonyms: ['XAZNA P2P', 'XAZNA', 'Xazna'],
    isP2P: true,
  },

  // Uzcard
  {
    canonicalName: 'Uzcard',
    appName: 'Uzcard',
    synonyms: ['Uzcard', 'UZCARD', 'UzCard'],
    isP2P: false,
  },

  // Humo
  {
    canonicalName: 'Humo',
    appName: 'Humo',
    synonyms: ['Humo', 'HUMO'],
    isP2P: false,
  },

  // Payme
  {
    canonicalName: 'Payme',
    appName: 'Payme',
    synonyms: ['Payme', 'PAYME', 'PayMe'],
    isP2P: false,
  },

  // Click
  {
    canonicalName: 'Click',
    appName: 'Click',
    synonyms: ['Click', 'CLICK'],
    isP2P: false,
  },

  // Oson
  {
    canonicalName: 'Oson',
    appName: 'Oson',
    synonyms: ['Oson', 'OSON'],
    isP2P: false,
  },

  // Alif
  {
    canonicalName: 'Alif',
    appName: 'Alif',
    synonyms: ['Alif', 'ALIF'],
    isP2P: false,
  },

  // Apelsin
  {
    canonicalName: 'Apelsin',
    appName: 'Apelsin',
    synonyms: ['Apelsin', 'APELSIN'],
    isP2P: false,
  },
];

/**
 * Список уникальных приложений из словаря
 */
export const APP_NAMES = [
  ...new Set(OPERATORS_DICTIONARY.map(op => op.appName))
].sort();

/**
 * Поиск оператора по имени (с нечётким совпадением)
 * @param {string} operatorName - Название оператора
 * @returns {object|null} - Найденный оператор или null
 */
export const findOperatorByName = (operatorName) => {
  if (!operatorName) return null;

  const normalized = operatorName.trim().toLowerCase();

  // Точное совпадение с синонимом
  for (const operator of OPERATORS_DICTIONARY) {
    for (const synonym of operator.synonyms) {
      if (synonym.toLowerCase() === normalized) {
        return operator;
      }
    }
  }

  // Частичное совпадение (содержит)
  for (const operator of OPERATORS_DICTIONARY) {
    for (const synonym of operator.synonyms) {
      if (normalized.includes(synonym.toLowerCase()) || synonym.toLowerCase().includes(normalized)) {
        return operator;
      }
    }
  }

  return null;
};

/**
 * Получить приложение и P2P флаг по имени оператора
 * @param {string} operatorName - Название оператора
 * @returns {object} - { appName, isP2P }
 */
export const getOperatorInfo = (operatorName) => {
  const operator = findOperatorByName(operatorName);

  if (operator) {
    return {
      appName: operator.appName,
      isP2P: operator.isP2P,
    };
  }

  // Если не найден в словаре
  return {
    appName: null, // Не определено
    isP2P: false,
  };
};
