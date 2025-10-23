import React, { useState } from 'react';
import Icon from './icons/Icon';
import { toast } from 'react-toastify';
import { adminAPI } from '../services/api';

/**
 * QueueRow - строка очереди с раскрывающимся таймлайном событий
 * patch-009: Отображение чека и всех его событий обработки
 */
const QueueRow = ({ check, onRequeue, onOpenCheck }) => {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Загрузить события при раскрытии
  const loadEvents = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setLoadingEvents(true);
    try {
      const data = await adminAPI.getQueueEvents(check.check_id);

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to load events');
      }

      setEvents(data.events || []);
      setExpanded(true);
    } catch (error) {
      console.error('Error loading events:', error);
      toast.error('Ошибка загрузки событий');
    } finally {
      setLoadingEvents(false);
    }
  };

  // Определить цвет статуса
  const getStatusClass = () => {
    if (check.last_status === 'error') return 'status-error';
    if (check.last_stage === 'saved') return 'status-success';
    return 'status-processing';
  };

  // Форматирование стадии на русский
  const formatStage = (stage) => {
    const stages = {
      'received': 'Получен',
      'recorded': 'Записан',
      'normalized': 'Нормализован',
      'dictionary_matched': 'Оператор найден',
      'p2p_flagged': 'P2P помечен',
      'duplicate_checked': 'Проверка дубликата',
      'saved': 'Сохранён',
      'failed_parse': 'Ошибка парсинга',
      'failed_validation': 'Ошибка валидации',
      'failed_db': 'Ошибка БД',
      'requeued': 'Повтор обработки'
    };
    return stages[stage] || stage;
  };

  // Копировать check_id в буфер
  const copyCheckId = () => {
    navigator.clipboard.writeText(check.check_id);
    toast.success('Check ID скопирован');
  };

  return (
    <>
      <tr className={`queue-row ${getStatusClass()}`} onClick={loadEvents}>
        <td className="expand-cell">
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={16} />
        </td>
        <td className="font-mono check-id-cell" title={check.check_id}>
          <span onClick={(e) => { e.stopPropagation(); copyCheckId(); }}>
            {check.check_id.substring(0, 8)}...
          </span>
        </td>
        <td>
          <span className={`stage-badge stage-${check.last_stage}`}>
            {formatStage(check.last_stage)}
          </span>
        </td>
        <td>
          <span className={`status-badge ${getStatusClass()}`}>
            {check.last_status === 'error' ? 'ОШИБКА' :
             check.last_stage === 'saved' ? 'УСПЕШНО' : 'В ОБРАБОТКЕ'}
          </span>
        </td>
        <td>{new Date(check.last_time).toLocaleString('ru-RU')}</td>
        <td>{check.source}</td>
        <td>****{check.card_last4}</td>
        <td className="text-right">
          {check.amount ? parseFloat(check.amount).toLocaleString('ru-RU', {
            minimumFractionDigits: 2
          }) : '—'}
        </td>
        <td>{check.operator || '—'}</td>
        <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn-icon"
            onClick={() => onRequeue(check.check_id)}
            title="Повторить обработку"
          >
            <Icon name="refresh" size={16} />
          </button>
          <button
            className="btn-icon"
            onClick={() => onOpenCheck(check.check_id)}
            title="Открыть в таблице чеков"
          >
            <Icon name="external-link" size={16} />
          </button>
        </td>
      </tr>

      {/* Раскрытый таймлайн событий */}
      {expanded && (
        <tr className="timeline-row">
          <td colSpan="10">
            <div className="timeline-container">
              {loadingEvents ? (
                <div className="timeline-loading">
                  <Icon name="refresh" size={20} />
                  <span>Загрузка событий...</span>
                </div>
              ) : (
                <table className="timeline-table">
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Этап</th>
                      <th>Статус</th>
                      <th>Детали/сообщение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id} className={event.status === 'error' ? 'event-error' : ''}>
                        <td>{new Date(event.created_at).toLocaleString('ru-RU')}</td>
                        <td>
                          <span className={`stage-badge stage-${event.stage}`}>
                            {formatStage(event.stage)}
                          </span>
                        </td>
                        <td>
                          <span className={`status-indicator status-${event.status}`}>
                            {event.status}
                          </span>
                        </td>
                        <td>
                          <div className="event-details">
                            {event.message && <div className="event-message">{event.message}</div>}
                            {event.payload && (
                              <div className="event-payload">
                                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export default QueueRow;
