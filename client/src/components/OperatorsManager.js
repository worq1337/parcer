import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { operatorsAPI } from '../services/api';
import '../styles/OperatorsManager.css';

const OperatorsManager = ({ refreshTrigger }) => {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    pattern: '',
    appName: '',
    isP2p: true
  });
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Загрузка операторов
  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      const response = await operatorsAPI.getAll();
      setOperators(response.data || []);
    } catch (error) {
      console.error('Ошибка загрузки операторов:', error);
      toast.error('Не удалось загрузить операторов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOperators();
  }, [loadOperators, refreshTrigger]);

  // Фильтрация
  const filteredOperators = operators.filter(op =>
    op.pattern.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.app_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Начать добавление
  const handleStartAdd = () => {
    setIsAdding(true);
    setFormData({ pattern: '', appName: '', isP2p: true });
    setEditingId(null);
  };

  // Начать редактирование
  const handleStartEdit = (operator) => {
    setEditingId(operator.id);
    setFormData({
      pattern: operator.pattern,
      appName: operator.app_name,
      isP2p: operator.is_p2p
    });
    setIsAdding(false);
  };

  // Отмена
  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ pattern: '', appName: '', isP2p: true });
  };

  // Сохранение
  const handleSave = async () => {
    if (!formData.pattern.trim() || !formData.appName.trim()) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    try {
      if (isAdding) {
        await operatorsAPI.create(formData);
        toast.success('Оператор добавлен');
      } else if (editingId) {
        await operatorsAPI.update(editingId, formData);
        toast.success('Оператор обновлён');
      }
      handleCancel();
      loadOperators();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      if (error.response?.status === 409) {
        toast.error('Оператор с таким паттерном уже существует');
      } else {
        toast.error('Ошибка при сохранении');
      }
    }
  };

  // Удаление
  const handleDelete = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого оператора?')) {
      return;
    }

    try {
      await operatorsAPI.delete(id);
      toast.success('Оператор удалён');
      loadOperators();
    } catch (error) {
      console.error('Ошибка удаления:', error);
      toast.error('Ошибка при удалении');
    }
  };

  return (
    <div className="operators-manager">
      <div className="operators-header">
        <h2>Справочник операторов и приложений</h2>
        <div className="operators-actions">
          <input
            type="text"
            className="search-input"
            placeholder="Поиск..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {!isAdding && !editingId && (
            <button className="action-button primary" onClick={handleStartAdd}>
              <span className="button-icon">+</span>
              Добавить оператора
            </button>
          )}
        </div>
      </div>

      {(isAdding || editingId) && (
        <div className="operator-form">
          <h3>{isAdding ? 'Добавление оператора' : 'Редактирование оператора'}</h3>
          <div className="form-group">
            <label>Паттерн оператора *</label>
            <input
              type="text"
              className="form-input"
              value={formData.pattern}
              onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
              placeholder="Например: SQB MOBILE HUMO P2P"
            />
            <small>Точное название как в сообщении чека</small>
          </div>
          <div className="form-group">
            <label>Название приложения *</label>
            <input
              type="text"
              className="form-input"
              value={formData.appName}
              onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
              placeholder="Например: SQB"
            />
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={formData.isP2p}
                onChange={(e) => setFormData({ ...formData, isP2p: e.target.checked })}
              />
              P2P сервис
            </label>
          </div>
          <div className="form-actions">
            <button className="action-button primary" onClick={handleSave}>
              Сохранить
            </button>
            <button className="action-button" onClick={handleCancel}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Загрузка операторов...</p>
        </div>
      ) : (
        <div className="operators-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>№</th>
                <th style={{ width: '40%' }}>Паттерн оператора</th>
                <th style={{ width: '30%' }}>Приложение</th>
                <th style={{ width: '100px' }}>P2P</th>
                <th style={{ width: '150px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredOperators.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                    {searchTerm ? 'Ничего не найдено' : 'Нет операторов'}
                  </td>
                </tr>
              ) : (
                filteredOperators.map((operator, index) => (
                  <tr key={operator.id}>
                    <td>{index + 1}</td>
                    <td>{operator.pattern}</td>
                    <td><strong>{operator.app_name}</strong></td>
                    <td style={{ textAlign: 'center' }}>
                      {operator.is_p2p ? '✓' : '—'}
                    </td>
                    <td>
                      <button
                        className="table-action-btn edit"
                        onClick={() => handleStartEdit(operator)}
                        title="Редактировать"
                      >
                        ✏️
                      </button>
                      <button
                        className="table-action-btn delete"
                        onClick={() => handleDelete(operator.id)}
                        title="Удалить"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="table-footer">
            Всего операторов: <strong>{filteredOperators.length}</strong>
            {searchTerm && ` (из ${operators.length})`}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorsManager;
