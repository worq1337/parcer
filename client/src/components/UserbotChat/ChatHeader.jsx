import React from 'react';
import Icon from '../icons/Icon';

/**
 * Chat header with bot info and actions
 */
const ChatHeader = ({ bot, onRefresh, refreshing }) => {
  if (!bot) {
    return (
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-header-details">
            <h3>Выберите бота</h3>
            <p className="chat-header-subtitle">
              Список ботов находится слева
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalMessages = bot.stats
    ? bot.stats.processed + bot.stats.unprocessed + bot.stats.error + bot.stats.pending
    : 0;

  return (
    <div className="chat-header">
      <div className="chat-header-info">
        <div className="chat-header-icon">{bot.icon}</div>
        <div className="chat-header-details">
          <h3>{bot.name}</h3>
          <p className="chat-header-subtitle">
            {bot.username} • Всего сообщений: {totalMessages}
          </p>
        </div>
      </div>
      <div className="chat-header-actions">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <Icon name="refresh" size={18} />
          {refreshing ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
