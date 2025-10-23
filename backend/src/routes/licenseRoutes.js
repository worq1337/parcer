const express = require('express');
const router = express.Router();

// Валидный лицензионный ключ (хранится на сервере)
const VALID_LICENSE_KEY = 'qjfnbcleJNFkfejdg83JFnelvndjfn8ndsknsg9q383qq@@jjfndndn#$hjdfd';

/**
 * POST /api/license/validate
 * Проверка лицензионного ключа
 */
router.post('/validate', async (req, res) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        error: 'Лицензионный ключ не указан'
      });
    }

    // Проверяем ключ
    const isValid = licenseKey === VALID_LICENSE_KEY;

    if (isValid) {
      return res.json({
        success: true,
        message: 'Лицензионный ключ активирован',
        valid: true
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Неверный лицензионный ключ',
        valid: false
      });
    }

  } catch (error) {
    console.error('Ошибка при проверке лицензионного ключа:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка сервера при проверке ключа'
    });
  }
});

module.exports = router;
