const express = require('express');
const router = express.Router();
const operatorController = require('../controllers/operatorController');

// GET /api/operators - Получить всех операторов
router.get('/', operatorController.getAll.bind(operatorController));

// GET /api/operators/:id - Получить оператора по ID
router.get('/:id', operatorController.getById.bind(operatorController));

// POST /api/operators - Создать нового оператора
router.post('/', operatorController.create.bind(operatorController));

// PUT /api/operators/:id - Обновить оператора
router.put('/:id', operatorController.update.bind(operatorController));

// DELETE /api/operators/:id - Удалить оператора
router.delete('/:id', operatorController.delete.bind(operatorController));

module.exports = router;
