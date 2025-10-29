import React from 'react';
import Icon from '../icons/Icon';
import MessageCard from './MessageCard';

/**
 * Messages area with scrollable message list
 */
const MessagesArea = ({
  messages,
  loading,
  loadingMore,
  hasMore,
  onLoadOlder,
  selectedMessages,
  onToggleSelection,
  onProcess,
  onRetry
}) => {
  if (loading && messages.length === 0) {
    return (
      <div className="messages-area">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Загрузка сообщений...</div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages-area">
        <div className="empty-state">
          <Icon name="inbox" size={64} />
          <h3 className="empty-state-title">Нет сообщений</h3>
          <p className="empty-state-subtitle">
            Сообщения от этого бота будут отображаться здесь
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-area">
      {hasMore && (
        <div className="messages-load-more">
          <button
            className="btn btn-secondary btn-sm"
            onClick={onLoadOlder}
            disabled={loadingMore}
          >
            {loadingMore ? 'Загрузка...' : 'Загрузить предыдущие сообщения'}
          </button>
        </div>
      )}

      {messages.map(message => (
        <MessageCard
          key={message.id}
          message={message}
          selected={selectedMessages.has(message.id)}
          onSelect={onToggleSelection}
          onProcess={onProcess}
          onRetry={onRetry}
        />
      ))}

      {loading && messages.length > 0 && (
        <div className="messages-inline-loading">
          <div className="loading-spinner small"></div>
          <span>Обновление...</span>
        </div>
      )}
    </div>
  );
};

export default MessagesArea;
