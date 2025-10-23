import React, { useState } from 'react';
import Modal from 'react-modal';
import { toast } from 'react-toastify';
import { checksAPI } from '../services/api';
import { APP_NAMES, getOperatorInfo } from '../data/operatorsDict';
import '../styles/Modal.css';

Modal.setAppElement('#root');

const AddCheckModal = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState('parse'); // parse или manual
  const [loading, setLoading] = useState(false);

  // Для парсинга
  const [text, setText] = useState('');

  // Для ручного ввода (patch-008 §2: добавлено поле app и isP2P)
  const [formData, setFormData] = useState({
    datetime: '',
    transactionType: 'Оплата',
    amount: '',
    currency: 'UZS',
    cardLast4: '',
    operator: '',
    app: '', // patch-008 §2: обязательное поле
    isP2P: false, // patch-008 §2: автоопределение из словаря
    balance: '',
    source: 'Manual'
  });

  // patch-008 §2: Обработчик изменения оператора с автоподстановкой приложения
  const handleOperatorChange = (operatorName) => {
    const operatorInfo = getOperatorInfo(operatorName);

    setFormData({
      ...formData,
      operator: operatorName,
      app: operatorInfo.appName || '', // Если не найдено - пусто
      isP2P: operatorInfo.isP2P,
    });

    // Показываем подсказку если оператор распознан
    if (operatorInfo.appName) {
      toast.info(`Приложение: ${operatorInfo.appName}${operatorInfo.isP2P ? ' (P2P)' : ''}`);
    }
  };

  const handleParse = async () => {
    if (!text.trim()) {
      toast.error('Введите текст чека');
      return;
    }

    setLoading(true);
    try {
      const response = await checksAPI.parse(text);

      if (response.success) {
        toast.success('Чек успешно добавлен');
        onSuccess();
        onClose();
      } else {
        toast.error(response.error || 'Ошибка парсинга');
      }
    } catch (error) {
      console.error('Ошибка парсинга:', error);
      if (error.response?.status === 409) {
        toast.warning('Этот чек уже существует (дубликат)');
      } else {
        toast.error('Ошибка при парсинге чека');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    // patch-008 §2: Валидация с проверкой приложения
    if (!formData.datetime || !formData.amount || !formData.cardLast4 || !formData.operator) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    // Предупреждение если приложение не определено
    if (!formData.app) {
      toast.warning('Приложение не определено - оператор не найден в словаре');
    }

    setLoading(true);
    try {
      const datetime = new Date(formData.datetime);
      const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

      const checkData = {
        datetime: formData.datetime,
        weekday: weekdays[datetime.getDay()],
        dateDisplay: `${datetime.getDate()} ${months[datetime.getMonth()]}`,
        timeDisplay: `${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}`,
        transactionType: formData.transactionType,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        cardLast4: formData.cardLast4,
        operator: formData.operator,
        app: formData.app || null, // patch-008 §2: добавляем приложение
        isP2P: formData.isP2P, // patch-008 §2: добавляем P2P флаг
        balance: formData.balance ? parseFloat(formData.balance) : null,
        source: formData.source,
        addedVia: 'manual'
      };

      const response = await checksAPI.create(checkData);

      if (response.success) {
        toast.success('Чек успешно добавлен');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Ошибка создания:', error);
      if (error.response?.status === 409) {
        toast.warning('Этот чек уже существует (дубликат)');
      } else {
        toast.error('Ошибка при создании чека');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="modal"
      overlayClassName="modal-overlay"
      contentLabel="Добавить чек"
    >
      <div className="modal-header">
        <h2>Добавить чек</h2>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>

      <div className="modal-body">
        <div className="mode-selector">
          <button
            className={`mode-button ${mode === 'parse' ? 'active' : ''}`}
            onClick={() => setMode('parse')}
          >
            Парсинг из текста
          </button>
          <button
            className={`mode-button ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            Ручной ввод
          </button>
        </div>

        {mode === 'parse' ? (
          <div className="parse-mode">
            <div className="form-group">
              <label>Текст чека (SMS или Telegram)</label>
              <textarea
                className="form-textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Вставьте текст SMS или сообщения из Telegram..."
                rows={10}
              />
              <small>
                Бот автоматически определит формат и распарсит все поля
              </small>
            </div>
          </div>
        ) : (
          <div className="manual-mode">
            <div className="form-row">
              <div className="form-group">
                <label>Дата и время *</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={formData.datetime}
                  onChange={(e) => setFormData({ ...formData, datetime: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Тип транзакции *</label>
                <select
                  className="form-input"
                  value={formData.transactionType}
                  onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                >
                  <option value="Оплата">Оплата</option>
                  <option value="Пополнение">Пополнение</option>
                  <option value="Списание">Списание</option>
                  <option value="Платёж">Платёж</option>
                  <option value="Конверсия">Конверсия</option>
                  <option value="Возврат">Возврат</option>
                  <option value="Операция">Операция</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Сумма *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Валюта</label>
                <select
                  className="form-input"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  {/* patch-008 §2, §10: только UZS/USD */}
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Последние 4 цифры карты *</label>
                <input
                  type="text"
                  maxLength="4"
                  className="form-input"
                  value={formData.cardLast4}
                  onChange={(e) => setFormData({ ...formData, cardLast4: e.target.value.replace(/\D/g, '') })}
                  placeholder="1234"
                />
              </div>
              <div className="form-group">
                <label>Остаток после операции</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Оператор/Продавец *</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.operator}
                  onChange={(e) => handleOperatorChange(e.target.value)}
                  placeholder="Название оператора или продавца"
                />
                <small>При вводе автоматически определится приложение и P2P</small>
              </div>
              <div className="form-group">
                <label>Приложение *</label>
                <select
                  className="form-input"
                  value={formData.app}
                  onChange={(e) => setFormData({ ...formData, app: e.target.value })}
                >
                  <option value="">Не определено</option>
                  {APP_NAMES.map(app => (
                    <option key={app} value={app}>{app}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isP2P}
                  onChange={(e) => setFormData({ ...formData, isP2P: e.target.checked })}
                  style={{ marginRight: '8px' }}
                />
                P2P транзакция
              </label>
            </div>

            <div className="form-group">
              <label>Источник</label>
              <select
                className="form-input"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              >
                {/* patch-008 §2, §10: только Telegram/SMS/Manual */}
                <option value="Manual">Manual</option>
                <option value="Telegram">Telegram</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button
          className="action-button primary"
          onClick={mode === 'parse' ? handleParse : handleManualSubmit}
          disabled={loading}
        >
          {loading ? 'Обработка...' : mode === 'parse' ? 'Парсить и добавить' : 'Добавить'}
        </button>
        <button className="action-button" onClick={onClose} disabled={loading}>
          Отмена
        </button>
      </div>
    </Modal>
  );
};

export default AddCheckModal;
