const express = require('express');
const router = express.Router();
const checkController = require('../controllers/checkController');

// GET /api/checks - Получить все чеки
router.get('/', checkController.getAll.bind(checkController));

// GET /api/checks/:id - Получить чек по ID
router.get('/:id', checkController.getById.bind(checkController));

// POST /api/checks - Создать новый чек
router.post('/', checkController.create.bind(checkController));

// POST /api/checks/parse - Парсинг чека из текста
router.post('/parse', checkController.parse.bind(checkController));

// PUT /api/checks/:id - Обновить чек
router.put('/:id', checkController.update.bind(checkController));

// DELETE /api/checks/:id - Удалить чек
router.delete('/:id', checkController.delete.bind(checkController));

module.exports = router;
