import React from 'react';
import Icon from '../icons/Icon';
import { formatTimestamp, getStatusBadge } from '../../utils/messageHelpers';

/**
 * Individual message card component
 */
const MessageCard = ({
  message,
  selected,
  onSelect,
  onProcess,
  onRetry
}) => {
  const statusBadge = getStatusBadge(message.status);

  return (
    <div className={`message-card ${selected ? 'selected' : ''}`}>
      <div className="message-card-header">
        <div className="message-card-meta">
          <input
            type="checkbox"
            className="message-checkbox"
            checked={selected}
            onChange={() => onSelect(message.id)}
          />
          <span className="message-timestamp">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <div className={`message-status-badge ${message.status}`}>
          <span>{statusBadge.icon}</span>
          <span>{statusBadge.text}</span>
        </div>
      </div>

      <div className="message-text">{message.text}</div>

      {message.data && Object.keys(message.data).length > 0 && (
        <div className="message-extracted-data">
          <div className="message-extracted-data-title">Извлеченные данные</div>
          <div className="message-data-grid">
            {message.data.amount && (
              <div className="message-data-item">
                <div className="message-data-label">Сумма</div>
                <div className="message-data-value">{message.data.amount}</div>
              </div>
            )}
            {message.data.merchant && (
              <div className="message-data-item">
                <div className="message-data-label">Получатель</div>
                <div className="message-data-value">{message.data.merchant}</div>
              </div>
            )}
            {message.data.card && (
              <div className="message-data-item">
                <div className="message-data-label">Карта</div>
                <div className="message-data-value">****{message.data.card}</div>
              </div>
            )}
            {message.data.date && (
              <div className="message-data-item">
                <div className="message-data-label">Дата</div>
                <div className="message-data-value">{message.data.date}</div>
              </div>
            )}
            {message.data.time && (
              <div className="message-data-item">
                <div className="message-data-label">Время</div>
                <div className="message-data-value">{message.data.time}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {message.error && (
        <div className="message-error">
          <Icon name="error" size={16} />
          <span>{message.error}</span>
        </div>
      )}

      <div className="message-actions">
        {message.status === 'unprocessed' && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => onProcess(message.id)}
          >
            <Icon name="play_arrow" size={16} />
            Обработать
          </button>
        )}
        {message.status === 'error' && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onRetry(message.id)}
          >
            <Icon name="refresh" size={16} />
            Повторить
          </button>
        )}
        {message.status === 'processed' && message.sheet_url && (
          <a
            href={message.sheet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <Icon name="open_in_new" size={16} />
            Открыть в таблице
          </a>
        )}
      </div>
    </div>
  );
};

export default MessageCard;
