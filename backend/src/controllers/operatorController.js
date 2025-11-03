const Operator = require('../models/Operator');

class OperatorController {
  /**
   * Получить всех операторов
   */
  async getAll(req, res) {
    try {
      const operators = await Operator.getAll();

      res.json({
        success: true,
        count: operators.length,
        data: operators
      });
    } catch (error) {
      console.error('Ошибка при получении операторов:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при получении списка операторов'
      });
    }
  }

  /**
   * Получить оператора по ID
   */
  async getById(req, res) {
    try {
      const operator = await Operator.getById(req.params.id);

      if (!operator) {
        return res.status(404).json({
          success: false,
          error: 'Оператор не найден'
        });
      }

      res.json({
        success: true,
        data: operator
      });
    } catch (error) {
      console.error('Ошибка при получении оператора:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при получении оператора'
      });
    }
  }

  /**
   * Создать нового оператора
   */
  async create(req, res) {
    try {
      const { canonicalName, appName, isP2p, synonyms } = req.body;

      // Валидация
      if (!canonicalName || !appName) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо указать каноническое имя и название приложения'
        });
      }

      // Проверка на существование паттерна
      const exists = await Operator.patternExists(canonicalName);
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'Оператор с таким именем уже существует'
        });
      }

      const newOperator = await Operator.create({
        canonicalName,
        appName,
        isP2p,
        synonyms: synonyms || []
      });

      res.status(201).json({
        success: true,
        message: 'Оператор успешно добавлен',
        data: newOperator
      });
    } catch (error) {
      console.error('Ошибка при создании оператора:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при создании оператора: ' + error.message
      });
    }
  }

  /**
   * Обновить оператора
   */
  async update(req, res) {
    try {
      const { canonicalName, appName, isP2p, synonyms } = req.body;
      const id = req.params.id;

      // Валидация
      if (!canonicalName || !appName) {
        return res.status(400).json({
          success: false,
          error: 'Необходимо указать каноническое имя и название приложения'
        });
      }

      // Проверка на существование паттерна (исключая текущий)
      const exists = await Operator.patternExists(canonicalName, id);
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'Оператор с таким именем уже существует'
        });
      }

      const updatedOperator = await Operator.update(id, {
        canonicalName,
        appName,
        isP2p,
        synonyms: synonyms || []
      });

      if (!updatedOperator) {
        return res.status(404).json({
          success: false,
          error: 'Оператор не найден'
        });
      }

      res.json({
        success: true,
        message: 'Оператор успешно обновлен',
        data: updatedOperator
      });
    } catch (error) {
      console.error('Ошибка при обновлении оператора:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при обновлении оператора'
      });
    }
  }

  /**
   * Удалить оператора
   */
  async delete(req, res) {
    try {
      const deletedOperator = await Operator.delete(req.params.id);

      if (!deletedOperator) {
        return res.status(404).json({
          success: false,
          error: 'Оператор не найден'
        });
      }

      res.json({
        success: true,
        message: 'Оператор успешно удален',
        data: deletedOperator
      });
    } catch (error) {
      console.error('Ошибка при удалении оператора:', error);
      res.status(500).json({
        success: false,
        error: 'Ошибка при удалении оператора'
      });
    }
  }
}

module.exports = new OperatorController();
