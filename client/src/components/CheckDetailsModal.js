import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import { toast } from 'react-toastify';
import { formatAmount, formatBalance, formatDateTime, formatCardLast4 } from '../utils/formatters';
import { useSettingsStore } from '../state/settingsStore';
import { adminAPI } from '../services/api';
import '../styles/Modal.css';

Modal.setAppElement('#root');

const CheckDetailsModal = ({ check, onClose, onOpenInTable }) => {
  const numberFormatting = useSettingsStore((state) => state.numberFormatting);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);

  useEffect(() => {
    if (!check || !check.check_id) {
      setTimeline([]);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);

    adminAPI.getQueueEvents(check.check_id)
      .then((response) => {
        if (cancelled) return;
        if (response.success) {
          setTimeline(response.events || []);
        } else {
          setTimeline([]);
          setTimelineError('Не удалось загрузить таймлайн');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setTimeline([]);
        setTimelineError(error.message || 'Не удалось загрузить таймлайн');
      })
      .finally(() => {
        if (!cancelled) {
          setTimelineLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [check?.check_id]);

  if (!check) return null;

  const formattedAmount = `${formatAmount(check.amount, numberFormatting)} ${check.currency || 'UZS'}`;
  const balanceDisplay =
    check.balance !== null && check.balance !== undefined
      ? `${formatBalance(check.balance, numberFormatting)} ${check.currency || 'UZS'}`
      : '—';

  const metadataString = check.metadata
    ? typeof check.metadata === 'string'
      ? check.metadata
      : JSON.stringify(check.metadata, null, 2)
    : null;

  const resolveEventTime = (event) => {
    const timestamp = event?.created_at || event?.timestamp;
    if (!timestamp) return '—';
    return formatDateTime(timestamp);
  };

  const handleCopy = async (value, label) => {
    if (!value) {
      toast.error('Нет данных для копирования');
      return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(value));
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = String(value);
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success(`${label} скопирован`);
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      toast.error('Не удалось скопировать');
    }
  };

  const handleCopyNumber = () => handleCopy(check.id, 'Номер чека');
  const handleCopyTxId = () => handleCopy(check.check_id, 'TxID');
  const handleOpenInTableClick = () => {
    if (typeof onOpenInTable === 'function') {
      onOpenInTable(check);
    }
  };

  return (
    <Modal
      isOpen={!!check}
      onRequestClose={onClose}
      className="modal details-modal"
      overlayClassName="modal-overlay"
      contentLabel="Детали чека"
    >
      <div className="modal-header">
        <h2>Детали чека #{check.id}</h2>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>

      <div className="modal-body details-body">
        <div className="details-grid">
          <div className="detail-item">
            <label>Номер</label>
            <div className="detail-value">{check.id}</div>
          </div>

          {check.check_id && (
            <div className="detail-item">
              <label>TxID</label>
              <div className="detail-value">{check.check_id}</div>
            </div>
          )}

          <div className="detail-item">
            <label>Дата и время</label>
            <div className="detail-value">
              {formatDateTime(check.datetime)}
              {check.weekday && <span className="badge">{check.weekday}</span>}
            </div>
          </div>

          <div className="detail-item">
            <label>Тип транзакции</label>
            <div className="detail-value">
              <span className="badge badge-type">{check.transaction_type}</span>
            </div>
          </div>

          <div className="detail-item">
            <label>Сумма</label>
            <div
              className="detail-value amount"
              style={{
                color: check.amount >= 0
                  ? 'var(--status-success)'
                  : 'var(--status-error)',
              }}
            >
              {formattedAmount}
            </div>
          </div>

          <div className="detail-item">
            <label>Остаток после операции</label>
            <div className="detail-value">{balanceDisplay}</div>
          </div>

          <div className="detail-item">
            <label>Карта</label>
            <div className="detail-value">
              {formatCardLast4(check.card_last4)}
            </div>
          </div>

          <div className="detail-item">
            <label>Оператор/Продавец</label>
            <div className="detail-value">
              {check.operator || '—'}
            </div>
          </div>

          <div className="detail-item">
            <label>Приложение</label>
            <div className="detail-value">
              {check.app || '—'}
            </div>
          </div>

          <div className="detail-item">
            <label>P2P перевод</label>
            <div className="detail-value">
              {check.is_p2p ? '✓ Да' : '— Нет'}
            </div>
          </div>

          <div className="detail-item">
            <label>Источник данных</label>
            <div className="detail-value">
              <span className="badge badge-source">{check.source || '—'}</span>
            </div>
          </div>

          <div className="detail-item">
            <label>Способ добавления</label>
            <div className="detail-value">
              {check.added_via || '—'}
            </div>
          </div>

          <div className="detail-item">
            <label>Создан</label>
            <div className="detail-value">
              {check.created_at ? formatDateTime(check.created_at) : '—'}
            </div>
          </div>

          <div className="detail-item">
            <label>Обновлён</label>
            <div className="detail-value">
              {check.updated_at ? formatDateTime(check.updated_at) : '—'}
            </div>
          </div>
        </div>

        {check.raw_text && (
          <div className="detail-section">
            <label>Исходный текст</label>
            <div className="raw-text">
              {check.raw_text}
            </div>
          </div>
        )}

        {metadataString && (
          <div className="detail-section">
            <label>Метаданные</label>
            <pre className="raw-text">{metadataString}</pre>
          </div>
        )}

        <div className="detail-section">
          <label>Таймлайн обработки</label>
          {timelineLoading && <p className="detail-value">Загрузка…</p>}
          {!timelineLoading && timelineError && (
            <p className="detail-value" style={{ color: 'var(--status-warning)' }}>{timelineError}</p>
          )}
          {!timelineLoading && !timelineError && timeline.length === 0 && (
            <p className="detail-value">Нет событий</p>
          )}
          {!timelineLoading && !timelineError && timeline.length > 0 && (
            <table className="timeline-table">
              <thead>
                <tr>
                  <th>Этап</th>
                  <th>Статус</th>
                  <th>Сообщение</th>
                  <th>Время</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((event) => (
                  <tr key={`${event.id || event.stage}-${event.created_at || event.timestamp || Math.random()}`}>
                    <td>{event.stage || '—'}</td>
                    <td>{event.status || '—'}</td>
                    <td>{event.message || event.details || '—'}</td>
                    <td>{resolveEventTime(event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="modal-footer">
        {typeof onOpenInTable === 'function' && (
          <button className="action-button" onClick={handleOpenInTableClick}>
            Открыть в таблице
          </button>
        )}
        <button className="action-button" onClick={handleCopyNumber}>
          Копировать №
        </button>
        {check.check_id && (
          <button className="action-button" onClick={handleCopyTxId}>
            Копировать TxID
          </button>
        )}
        <button className="action-button primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
};

export default CheckDetailsModal;
