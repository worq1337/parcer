import React, { useState } from 'react';
import { toast } from 'react-toastify';
import Icon from '../icons/Icon';
import { loadHistory } from '../../services/userbotChatService';

/**
 * Chat header with bot info and actions
 */
const ChatHeader = ({ bot, onRefresh, refreshing }) => {
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleLoadHistory = async () => {
    if (!bot) return;

    const confirmed = window.confirm(
      `Загрузить историю сообщений от ${bot.name}?\n\n` +
      'Это загрузит старые сообщения, которые были отправлены ДО активации userbot.\n' +
      'Загрузка может занять несколько минут.\n\n' +
      'Продолжить?'
    );

    if (!confirmed) return;

    setLoadingHistory(true);
    try {
      const result = await loadHistory(bot.id, 30); // Last 30 days

      if (result.success) {
        toast.success(
          `✅ Загрузка завершена!\n\n` +
          `Обработано: ${result.loaded} сообщений\n` +
          `Новых: ${result.saved}\n` +
          `Дубликатов: ${result.skipped}`,
          { autoClose: 5000 }
        );
        // Refresh messages list
        if (onRefresh) {
          onRefresh();
        }
      } else {
        toast.error(`❌ Ошибка: ${result.error || 'Не удалось загрузить историю'}`);
      }
    } catch (error) {
      console.error('Load history error:', error);
      toast.error('❌ Ошибка при загрузке истории. Проверьте подключение к userbot.');
    } finally {
      setLoadingHistory(false);
    }
  };

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
          className="btn btn-primary btn-sm"
          onClick={handleLoadHistory}
          disabled={loadingHistory || refreshing}
          title="Загрузить старые сообщения из Telegram (последние 30 дней)"
        >
          <Icon name="download" size={18} />
          {loadingHistory ? 'Загрузка...' : 'Загрузить историю'}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onRefresh}
          disabled={refreshing || loadingHistory}
        >
          <Icon name="refresh" size={18} />
          {refreshing ? 'Обновление...' : 'Обновить'}
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
