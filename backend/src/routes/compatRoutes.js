/**
 * patch-021: Compatibility Check Endpoint
 * Проверяет совместимость версии клиента с сервером
 */

const express = require('express');
const router = express.Router();

// Текущая минимальная поддерживаемая версия
const MIN_SUPPORTED_VERSION = '1.0.0';
// Рекомендуемая версия (последняя stable)
const RECOMMENDED_VERSION = '1.0.0';
// Версия, которая обязательна для обновления (null = нет обязательных обновлений)
const REQUIRED_VERSION = null;

/**
 * Сравнивает две версии в формате semver (x.y.z)
 * @returns {number} -1 если v1 < v2, 0 если равны, 1 если v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * GET /api/compat?version=1.0.0
 * Проверка совместимости версии клиента
 */
router.get('/', (req, res) => {
  const clientVersion = req.query.version;

  // Валидация версии
  if (!clientVersion) {
    return res.status(400).json({
      success: false,
      error: 'Missing version parameter'
    });
  }

  // Проверка формата версии (x.y.z)
  if (!/^\d+\.\d+\.\d+$/.test(clientVersion)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid version format. Expected: x.y.z'
    });
  }

  // Проверка минимальной версии
  const isAboveMinVersion = compareVersions(clientVersion, MIN_SUPPORTED_VERSION) >= 0;

  // Проверка обязательного обновления
  const needsRequiredUpdate = REQUIRED_VERSION
    ? compareVersions(clientVersion, REQUIRED_VERSION) < 0
    : false;

  // Проверка рекомендуемой версии
  const hasNewerVersion = compareVersions(clientVersion, RECOMMENDED_VERSION) < 0;

  // Определяем совместимость
  const compatible = isAboveMinVersion && !needsRequiredUpdate;

  // Формируем ответ
  const response = {
    success: true,
    compatible,
    currentVersion: clientVersion,
    minVersion: MIN_SUPPORTED_VERSION,
    recommendedVersion: RECOMMENDED_VERSION,
    requiredVersion: REQUIRED_VERSION,
    required: needsRequiredUpdate, // true = блокировать запуск
    updateAvailable: hasNewerVersion,
    message: compatible
      ? (hasNewerVersion
          ? `Доступна новая версия ${RECOMMENDED_VERSION}. Рекомендуем обновиться.`
          : 'Вы используете актуальную версию.')
      : (needsRequiredUpdate
          ? `Требуется обновление до версии ${REQUIRED_VERSION}. Текущая версия не поддерживается.`
          : `Минимальная поддерживаемая версия: ${MIN_SUPPORTED_VERSION}. Пожалуйста, обновитесь.`)
  };

  res.json(response);
});

/**
 * GET /api/compat/info
 * Информация о текущих версиях (для админ панели)
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    minSupportedVersion: MIN_SUPPORTED_VERSION,
    recommendedVersion: RECOMMENDED_VERSION,
    requiredVersion: REQUIRED_VERSION,
    serverVersion: '1.0.0', // Версия backend API
    description: 'Версионирование клиент-серверного приложения'
  });
});

module.exports = router;
