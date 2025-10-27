const Check = require('../models/Check');
const parserService = require('../services/parserService');
const { logQueueEvent, normalizeQueueSource } = require('../utils/queueLogger');

class CheckController {
  /**
   * Получить все чеки
   */
  async getAll(req, res) {
    try {
      const filters = {
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        cardLast4: req.query.cardLast4,
        transactionType: req.query.transactionType,
        operator: req.query.operator,
        app: req.query.app,
        isP2p: req.query.isP2p
      };

      const checks = await Check.getAll(filters);

      res.json({
        success: true,
        count: checks.length,
        data: checks
      });
    } catch (error) {
      console.error('Ошибка при получении чеков:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при получении списка чеков'
      });
    }
  }

  /**
   * Получить чек по ID
   */
  async getById(req, res) {
    try {
      const check = await Check.getById(req.params.id);

      if (!check) {
        return res.status(404).json({
          success: false,
          error: 'Чек не найден'
        });
      }

      res.json({
        success: true,
        data: check
      });
    } catch (error) {
      console.error('Ошибка при получении чека:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при получении чека'
      });
    }
  }

  /**
   * Создать новый чек
   */
  async create(req, res) {
    try {
      const checkData = req.body;

      // Проверка на дубликат
      const duplicate = await Check.checkDuplicate({
        cardLast4: checkData.cardLast4 || checkData.card_last4,
        datetime: checkData.datetime,
        amount: checkData.amount,
        operator: checkData.operator,
        transactionType: checkData.transactionType,
      });

      if (duplicate) {
        await logQueueEvent(
          duplicate.check_id,
          'duplicate_checked',
          normalizeQueueSource(checkData.source || duplicate.source || 'manual'),
          {
            status: 'error',
            message: 'Duplicate detected during manual creation',
          }
        );
        return res.status(409).json({
          success: false,
          error: 'Такой чек уже существует в системе (дубликат)',
          duplicate: duplicate
        });
      }

      const newCheck = await Check.create(checkData);

      await logQueueEvent(
        newCheck.check_id,
        'saved',
        normalizeQueueSource(checkData.source || newCheck.source || 'manual'),
        {
          status: 'ok',
          message: 'Check created via admin API',
        }
      );

      res.status(201).json({
        success: true,
        message: 'Чек успешно добавлен',
        data: newCheck
      });
    } catch (error) {
      console.error('Ошибка при создании чека:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при создании чека: ' + error.message
      });
    }
  }

  /**
   * Обновить чек
   */
  async update(req, res) {
    try {
      const updatedCheck = await Check.update(req.params.id, req.body);

      if (!updatedCheck) {
        return res.status(404).json({
          success: false,
          error: 'Чек не найден'
        });
      }

      res.json({
        success: true,
        message: 'Чек успешно обновлен',
        data: updatedCheck
      });
    } catch (error) {
      console.error('Ошибка при обновлении чека:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при обновлении чека'
      });
    }
  }

  /**
   * Удалить чек
   */
  async delete(req, res) {
    try {
      const deletedCheck = await Check.delete(req.params.id);

      if (!deletedCheck) {
        return res.status(404).json({
          success: false,
          error: 'Чек не найден'
        });
      }

      res.json({
        success: true,
        message: 'Чек успешно удален',
        data: deletedCheck
      });
    } catch (error) {
      console.error('Ошибка при удалении чека:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при удалении чека'
      });
    }
  }

  /**
   * Парсинг чека из текста или изображения
   */
  async parse(req, res) {
    try {
      const { text, imageUrl } = req.body;

      // Проверяем, что передан хотя бы один из параметров
      if (!text && !imageUrl) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо предоставить text (текст чека) или imageUrl (ссылка на изображение)'
        });
      }

      // Формируем input для парсера
      const input = imageUrl ? { imageUrl, text } : text;

      const result = await parserService.parseReceipt(input);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // Проверка на дубликат
      const duplicate = await Check.checkDuplicate({
        cardLast4: result.data.cardLast4 || result.data.card_last4,
        datetime: result.data.datetime,
        amount: Math.abs(result.data.amount),
        operator: result.data.operator,
        transactionType: result.data.transactionType,
      });

      if (duplicate) {
        await logQueueEvent(
          duplicate.check_id,
          'duplicate_checked',
          normalizeQueueSource(result.source || duplicate.source || 'manual'),
          {
            status: 'error',
            message: 'Duplicate detected during automatic parsing',
          }
        );
        return res.status(409).json({
          success: false,
          error: 'Такой чек уже существует в системе (дубликат)',
          duplicate: duplicate,
          parsed: result.data
        });
      }

      // Автоматически сохраняем, если не дубликат
      const newCheck = await Check.create(result.data);

      await logQueueEvent(
        newCheck.check_id,
        'saved',
        normalizeQueueSource(result.source || newCheck.source || 'manual'),
        {
          status: 'ok',
          message: 'Check parsed and saved automatically',
        }
      );

      res.json({
        success: true,
        message: 'Чек успешно распарсен и добавлен',
        data: newCheck
      });
    } catch (error) {
      console.error('Ошибка при парсинге чека:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при парсинге чека: ' + error.message
      });
    }
  }
}

module.exports = new CheckController();
