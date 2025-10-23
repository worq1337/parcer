/**
 * Утилиты для нормализации поиска
 * Согласно patch-004 §8
 */

// Маппинг кириллицы в латиницу и обратно
const cyrillicToLatin = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts',
  'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
  'я': 'ya', 'ғ': 'gʻ', 'қ': 'qʻ', 'ў': 'oʻ', 'ҳ': 'h',
};

const latinToCyrillic = {
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'yo': 'ё', 'zh': 'ж',
  'z': 'з', 'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
  'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'x': 'х', 'h': 'х',
  'ts': 'ц', 'ch': 'ч', 'sh': 'ш', 'sch': 'щ', 'yu': 'ю', 'ya': 'я',
  'gʻ': 'ғ', "g'": 'ғ', 'qʻ': 'қ', "q'": 'қ', 'oʻ': 'ў', "o'": 'ў',
};

/**
 * Нормализует строку для поиска
 * - Приводит к нижнему регистру
 * - Удаляет лишние пробелы
 * - Удаляет знаки пунктуации (>,<,.)
 */
export function normalizeSearchString(str) {
  if (!str) return '';

  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Множественные пробелы в один
    .replace(/[>,<.]/g, '') // Удаляем специальные символы
    .replace(/['"«»]/g, ''); // Удаляем кавычки
}

/**
 * Транслитерирует кириллицу в латиницу
 */
export function transliterateCyrToLat(str) {
  if (!str) return '';

  let result = '';
  str = str.toLowerCase();

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    // Проверяем двухсимвольные комбинации
    if (i < str.length - 1) {
      const twoChar = str.substring(i, i + 2);
      if (cyrillicToLatin[twoChar]) {
        result += cyrillicToLatin[twoChar];
        i++; // Пропускаем следующий символ
        continue;
      }
    }
    result += cyrillicToLatin[char] || char;
  }

  return result;
}

/**
 * Транслитерирует латиницу в кириллицу
 */
export function transliterateLatToCyr(str) {
  if (!str) return '';

  let result = '';
  str = str.toLowerCase();

  // Сначала заменяем длинные комбинации
  const sortedKeys = Object.keys(latinToCyrillic).sort((a, b) => b.length - a.length);

  let i = 0;
  while (i < str.length) {
    let matched = false;

    for (const key of sortedKeys) {
      if (str.substring(i, i + key.length) === key) {
        result += latinToCyrillic[key];
        i += key.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result += str[i];
      i++;
    }
  }

  return result;
}

/**
 * Проверяет, содержит ли строка подстроку с учётом нормализации и транслитерации
 */
export function fuzzyIncludes(haystack, needle) {
  if (!haystack || !needle) return false;

  const normalizedHaystack = normalizeSearchString(haystack);
  const normalizedNeedle = normalizeSearchString(needle);

  // Прямое совпадение
  if (normalizedHaystack.includes(normalizedNeedle)) {
    return true;
  }

  // Пробуем транслитерировать needle в кириллицу и искать
  const needleCyr = transliterateLatToCyr(normalizedNeedle);
  if (normalizedHaystack.includes(needleCyr)) {
    return true;
  }

  // Пробуем транслитерировать haystack в латиницу и искать
  const haystackLat = transliterateCyrToLat(normalizedHaystack);
  if (haystackLat.includes(normalizedNeedle)) {
    return true;
  }

  // Пробуем транслитерировать needle в латиницу и искать в транслитерированном haystack
  const needleLat = transliterateCyrToLat(normalizedNeedle);
  if (haystackLat.includes(needleLat)) {
    return true;
  }

  return false;
}

/**
 * Нормализует последние 4 цифры карты
 * Допускает: *6714, 6714, ***6714 -> 6714
 */
export function normalizeCardLast4(input) {
  if (!input) return '';

  // Удаляем все символы кроме цифр
  const digits = input.replace(/\D/g, '');

  // Берём последние 4 цифры
  return digits.slice(-4);
}

/**
 * Нормализует тип транзакции (транслит -> русский)
 */
export function normalizeTransactionType(type) {
  if (!type) return '';

  const typeMap = {
    'pokupka': 'Оплата',
    'payment': 'Оплата',
    'oplata': 'Оплата',
    'popolnenie': 'Пополнение',
    'refill': 'Пополнение',
    'spisanie': 'Списание',
    'writeoff': 'Списание',
    'platezh': 'Платёж',
    'perevod': 'Перевод',
    'transfer': 'Перевод',
    'konversiya': 'Конверсия',
    'conversion': 'Конверсия',
    'e-com': 'E-Com',
    'ecom': 'E-Com',
    'vozvrat': 'Возврат',
    'refund': 'Возврат',
  };

  const normalized = normalizeSearchString(type);
  return typeMap[normalized] || type;
}

export default {
  normalizeSearchString,
  transliterateCyrToLat,
  transliterateLatToCyr,
  fuzzyIncludes,
  normalizeCardLast4,
  normalizeTransactionType,
};
