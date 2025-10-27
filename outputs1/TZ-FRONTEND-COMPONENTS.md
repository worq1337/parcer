# 📋 ДЕТАЛЬНОЕ ТЗ: Функционал чата с ботами в Telegram Userbot

**Версия:** 1.0  
**Дата:** 26 октября 2025  
**Для разработчика**

---

## 🎯 Задача

Добавить функционал чата с ботами на существующую вкладку **"Telegram userbot"**.

**Сейчас есть:**
- Информация об авторизации (Svyatoslav Lee)
- Кнопка "Выйти из аккаунта"
- Список мониторимых ботов (CardXabar, ID:856264490, NBU Card)
- Статус "ЗАПУЩЕН"

**Нужно добавить:**
- Чат с выбранным ботом справа от списка
- Просмотр истории сообщений от бота
- Фильтрация сообщений по статусам
- Возможность обработать старые чеки вручную
- Массовая обработка (галочки + кнопка "Обработать выбранные")
- Загрузка дополнительной истории

---

## 📁 Структура файлов

### Добавить в проект:

```
src/
├── components/
│   └── UserbotChat/                    ← НОВАЯ ПАПКА
│       ├── UserbotChatLayout.jsx       ← Главный layout (левая + правая панель)
│       ├── BotsList.jsx                ← Список ботов (уже есть, но расширим)
│       ├── ChatPanel.jsx               ← Панель чата (правая часть)
│       ├── ChatHeader.jsx              ← Заголовок чата
│       ├── FiltersBar.jsx              ← Фильтры сообщений
│       ├── MessagesArea.jsx            ← Область сообщений
│       ├── MessageCard.jsx             ← Карточка сообщения
│       ├── BulkActionsBar.jsx          ← Панель массовых действий
│       └── styles.css                  ← Стили
│
├── hooks/
│   └── useUserbotChat.js               ← Hook для работы с чатом
│
├── services/
│   └── userbotChatService.js           ← API сервис
│
└── utils/
    └── messageHelpers.js               ← Вспомогательные функции
```

---

## 💻 КОД КОМПОНЕНТОВ

### 1. UserbotChatLayout.jsx (главный компонент)

```jsx
import React, { useState } from 'react';
import BotsList from './BotsList';
import ChatPanel from './ChatPanel';
import { useUserbotChat } from '../../hooks/useUserbotChat';
import './styles.css';

/**
 * Главный layout для чата с ботами
 * Левая панель - список ботов
 * Правая панель - чат с выбранным ботом
 */
function UserbotChatLayout() {
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [filter, setFilter] = useState('all'); // all | processed | pending | error | unprocessed
  const [selectedMessages, setSelectedMessages] = useState([]);

  // Получаем данные через custom hook
  const {
    bots,
    messages,
    loading,
    error,
    hasMore,
    loadMore,
    processMessage,
    processMultiple,
    retryMessage,
    loadFullHistory
  } = useUserbotChat(selectedBotId, filter);

  const handleSelectBot = (botId) => {
    setSelectedBotId(botId);
    setSelectedMessages([]); // Сбросить выбранные при смене бота
  };

  const handleToggleMessage = (messageId) => {
    setSelectedMessages(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleSelectAll = () => {
    if (selectedMessages.length === messages.length) {
      setSelectedMessages([]);
    } else {
      setSelectedMessages(messages.map(m => m.id));
    }
  };

  const handleProcessSelected = async () => {
    try {
      await processMultiple(selectedMessages);
      setSelectedMessages([]);
    } catch (error) {
      console.error('Ошибка массовой обработки:', error);
      alert('Ошибка при обработке сообщений');
    }
  };

  return (
    <div className="userbot-chat-layout">
      {/* Левая панель - список ботов */}
      <BotsList
        bots={bots}
        selectedBotId={selectedBotId}
        onSelectBot={handleSelectBot}
      />

      {/* Правая панель - чат */}
      <ChatPanel
        bot={bots.find(b => b.id === selectedBotId)}
        messages={messages}
        filter={filter}
        onFilterChange={setFilter}
        selectedMessages={selectedMessages}
        onToggleMessage={handleToggleMessage}
        onSelectAll={handleSelectAll}
        onProcessSelected={handleProcessSelected}
        onProcessMessage={processMessage}
        onRetryMessage={retryMessage}
        onLoadMore={loadMore}
        onLoadFullHistory={loadFullHistory}
        hasMore={hasMore}
        loading={loading}
        error={error}
      />
    </div>
  );
}

export default UserbotChatLayout;
```

---

### 2. BotsList.jsx (список ботов - расширенный)

```jsx
import React from 'react';

/**
 * Список ботов в левой панели
 * Уже существует, но добавляем onClick для открытия чата
 */
function BotsList({ bots, selectedBotId, onSelectBot }) {
  return (
    <div className="bots-list-container">
      <div className="bots-list-header">
        <h3 className="bots-list-title">Мониторимые боты</h3>
        <span className="bots-count">({bots.length})</span>
      </div>

      <div className="bots-list">
        {bots.map(bot => (
          <div
            key={bot.id}
            className={`bot-item ${selectedBotId === bot.id ? 'active' : ''}`}
            onClick={() => onSelectBot(bot.id)}
          >
            <div className="bot-avatar">
              {bot.icon || bot.name.charAt(0)}
            </div>
            
            <div className="bot-info">
              <div className="bot-name">{bot.name}</div>
              <div className="bot-username">{bot.username}</div>
              
              <div className="bot-stats">
                <span className="stat-badge success" title="Обработано">
                  ✓ {bot.stats.processed}
                </span>
                <span className="stat-badge pending" title="В очереди">
                  ⏱ {bot.stats.pending}
                </span>
                {bot.stats.errors > 0 && (
                  <span className="stat-badge error" title="Ошибки">
                    ✕ {bot.stats.errors}
                  </span>
                )}
                <span className="stat-badge unprocessed" title="Не обработано">
                  📝 {bot.stats.unprocessed}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BotsList;
```

---

### 3. ChatPanel.jsx (панель чата)

```jsx
import React from 'react';
import ChatHeader from './ChatHeader';
import FiltersBar from './FiltersBar';
import MessagesArea from './MessagesArea';
import BulkActionsBar from './BulkActionsBar';

/**
 * Панель чата с ботом (правая часть)
 */
function ChatPanel({
  bot,
  messages,
  filter,
  onFilterChange,
  selectedMessages,
  onToggleMessage,
  onSelectAll,
  onProcessSelected,
  onProcessMessage,
  onRetryMessage,
  onLoadMore,
  onLoadFullHistory,
  hasMore,
  loading,
  error
}) {
  if (!bot) {
    return (
      <div className="chat-panel empty">
        <div className="empty-state">
          <div className="empty-icon">👈</div>
          <div className="empty-text">Выберите бота</div>
          <div className="empty-subtext">
            Кликните на бота слева чтобы увидеть сообщения
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      {/* Заголовок */}
      <ChatHeader
        bot={bot}
        onLoadFullHistory={onLoadFullHistory}
      />

      {/* Фильтры */}
      <FiltersBar
        filter={filter}
        onFilterChange={onFilterChange}
        messages={messages}
      />

      {/* Сообщения */}
      <MessagesArea
        messages={messages}
        selectedMessages={selectedMessages}
        onToggleMessage={onToggleMessage}
        onProcessMessage={onProcessMessage}
        onRetryMessage={onRetryMessage}
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        loading={loading}
        error={error}
        filter={filter}
      />

      {/* Панель массовых действий */}
      {selectedMessages.length > 0 && (
        <BulkActionsBar
          selectedCount={selectedMessages.length}
          totalCount={messages.length}
          onSelectAll={onSelectAll}
          onProcessSelected={onProcessSelected}
        />
      )}
    </div>
  );
}

export default ChatPanel;
```

---

### 4. ChatHeader.jsx (заголовок чата)

```jsx
import React from 'react';

/**
 * Заголовок чата с информацией о боте и действиями
 */
function ChatHeader({ bot, onLoadFullHistory }) {
  return (
    <div className="chat-header">
      <div className="chat-bot-info">
        <div className="bot-avatar-large">
          {bot.icon || bot.name.charAt(0)}
        </div>
        <div>
          <h2 className="chat-bot-name">{bot.name}</h2>
          <p className="chat-bot-username">{bot.username}</p>
        </div>
      </div>

      <div className="chat-actions">
        <button className="chat-action-btn" title="Поиск">
          🔍 Поиск
        </button>
        <button
          className="chat-action-btn primary"
          onClick={onLoadFullHistory}
          title="Загрузить всю историю сообщений"
        >
          🔄 Загрузить историю
        </button>
      </div>
    </div>
  );
}

export default ChatHeader;
```

---

### 5. FiltersBar.jsx (фильтры)

```jsx
import React from 'react';

/**
 * Фильтры сообщений по статусам
 */
function FiltersBar({ filter, onFilterChange, messages }) {
  const getCount = (status) => {
    if (status === 'all') return messages.length;
    return messages.filter(m => m.status === status).length;
  };

  const filters = [
    { value: 'all', label: 'Все', icon: '' },
    { value: 'unprocessed', label: 'Не обработано', icon: '📝' },
    { value: 'processed', label: 'Обработано', icon: '✓' },
    { value: 'pending', label: 'В очереди', icon: '⏱' },
    { value: 'error', label: 'Ошибки', icon: '✕' }
  ];

  return (
    <div className="filters-bar">
      {filters.map(f => (
        <button
          key={f.value}
          className={`filter-btn ${filter === f.value ? 'active' : ''}`}
          onClick={() => onFilterChange(f.value)}
        >
          {f.icon} {f.label}
          <span className="filter-count">{getCount(f.value)}</span>
        </button>
      ))}
    </div>
  );
}

export default FiltersBar;
```

---

### 6. MessagesArea.jsx (область сообщений)

```jsx
import React, { useRef, useEffect } from 'react';
import MessageCard from './MessageCard';

/**
 * Область со списком сообщений
 */
function MessagesArea({
  messages,
  selectedMessages,
  onToggleMessage,
  onProcessMessage,
  onRetryMessage,
  onLoadMore,
  hasMore,
  loading,
  error,
  filter
}) {
  const messagesEndRef = useRef(null);

  // Автоскролл при загрузке новых сообщений (если пользователь внизу)
  useEffect(() => {
    if (messagesEndRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesEndRef.current.parentElement;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      
      if (isAtBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="messages-area">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Загрузка сообщений...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="messages-area">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <p>Ошибка загрузки: {error}</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages-area">
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-text">Нет сообщений</div>
          <div className="empty-subtext">
            {filter === 'all'
              ? 'Сообщения от этого бота будут появляться здесь'
              : 'Нет сообщений с таким статусом'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-area">
      {/* Кнопка загрузить больше СВЕРХУ */}
      {hasMore && (
        <div className="load-more-top">
          <button
            className="load-more-btn"
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? 'Загрузка...' : '⬆️ Загрузить ещё'}
          </button>
        </div>
      )}

      {/* Список сообщений */}
      {messages.map(message => (
        <MessageCard
          key={message.id}
          message={message}
          isSelected={selectedMessages.includes(message.id)}
          onToggleSelect={() => onToggleMessage(message.id)}
          onProcess={() => onProcessMessage(message.id)}
          onRetry={() => onRetryMessage(message.id)}
        />
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessagesArea;
```

---

### 7. MessageCard.jsx (карточка сообщения)

```jsx
import React from 'react';
import { formatTime, getStatusInfo } from '../../utils/messageHelpers';

/**
 * Карточка одного сообщения
 */
function MessageCard({
  message,
  isSelected,
  onToggleSelect,
  onProcess,
  onRetry
}) {
  const statusInfo = getStatusInfo(message.status);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    alert('Текст скопирован');
  };

  const handleViewInSheet = () => {
    if (message.sheetUrl) {
      window.open(message.sheetUrl, '_blank');
    }
  };

  return (
    <div className={`message-card ${message.status} ${isSelected ? 'selected' : ''}`}>
      {/* Галочка выбора */}
      <input
        type="checkbox"
        className="message-checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
      />

      <div className="message-content">
        {/* Заголовок */}
        <div className="message-header">
          <span className="message-time">
            {formatTime(message.timestamp)}
          </span>
          <span className={`message-status ${message.status}`}>
            {statusInfo.icon} {statusInfo.label}
          </span>
        </div>

        {/* Оригинальный текст */}
        <div className="message-text">
          {message.text}
        </div>

        {/* Извлеченные данные */}
        {message.data && Object.keys(message.data).length > 0 && (
          <div className="message-data">
            {Object.entries(message.data).map(([key, value]) => (
              <div key={key} className="data-item">
                <span className="data-label">{key}:</span>
                <span className="data-value">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ошибка (если есть) */}
        {message.error && (
          <div className="message-error">
            <strong>Ошибка:</strong> {message.error}
          </div>
        )}

        {/* Действия */}
        <div className="message-actions">
          {message.status === 'unprocessed' && (
            <>
              <button className="msg-btn primary" onClick={onProcess}>
                ✓ Обработать
              </button>
              <button className="msg-btn" onClick={handleCopy}>
                📋 Копировать
              </button>
            </>
          )}

          {message.status === 'pending' && (
            <button className="msg-btn" onClick={onRetry}>
              🔄 Повторить
            </button>
          )}

          {message.status === 'error' && (
            <>
              <button className="msg-btn primary" onClick={onProcess}>
                🔧 Исправить и обработать
              </button>
              <button className="msg-btn" onClick={handleCopy}>
                📋 Копировать
              </button>
            </>
          )}

          {message.status === 'processed' && (
            <button className="msg-btn success" onClick={handleViewInSheet}>
              👁 Посмотреть в таблице
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageCard;
```

---

### 8. BulkActionsBar.jsx (массовые действия)

```jsx
import React from 'react';

/**
 * Панель массовых действий (появляется когда выбраны сообщения)
 */
function BulkActionsBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onProcessSelected
}) {
  return (
    <div className="bulk-actions-bar">
      <div className="bulk-info">
        Выбрано: <strong>{selectedCount}</strong> из {totalCount}
      </div>
      
      <div className="bulk-actions">
        <button className="bulk-btn" onClick={onSelectAll}>
          {selectedCount === totalCount ? 'Снять выделение' : 'Выбрать все'}
        </button>
        <button className="bulk-btn primary" onClick={onProcessSelected}>
          ✓ Обработать выбранные ({selectedCount})
        </button>
      </div>
    </div>
  );
}

export default BulkActionsBar;
```

---

### 9. useUserbotChat.js (Custom Hook)

```javascript
import { useState, useEffect, useCallback } from 'react';
import { userbotChatService } from '../services/userbotChatService';

/**
 * Hook для работы с чатом userbot
 */
export function useUserbotChat(botId, filter = 'all') {
  const [bots, setBots] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Загрузить список ботов
  useEffect(() => {
    loadBots();
  }, []);

  // Загрузить сообщения при смене бота или фильтра
  useEffect(() => {
    if (botId) {
      setMessages([]);
      setOffset(0);
      setHasMore(true);
      loadMessages(botId, filter, 0);
    }
  }, [botId, filter]);

  // WebSocket подписка на новые сообщения
  useEffect(() => {
    if (!botId) return;

    const ws = new WebSocket(`${process.env.REACT_APP_WS_URL}/userbot/chat/${botId}`);

    ws.onmessage = (event) => {
      const newMessage = JSON.parse(event.data);
      
      // Добавить новое сообщение СНИЗУ (как в мессенджере)
      setMessages(prev => [...prev, newMessage]);
      
      // Обновить статистику бота
      updateBotStats(botId, newMessage.status);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => ws.close();
  }, [botId]);

  const loadBots = async () => {
    try {
      const data = await userbotChatService.getBots();
      setBots(data);
    } catch (err) {
      console.error('Ошибка загрузки ботов:', err);
      setError(err.message);
    }
  };

  const loadMessages = async (botId, filter, currentOffset) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await userbotChatService.getMessages(botId, {
        status: filter !== 'all' ? filter : undefined,
        limit: 50,
        offset: currentOffset
      });

      if (currentOffset === 0) {
        // Первая загрузка - заменить все
        setMessages(data.messages);
      } else {
        // Подгрузка - добавить СВЕРХУ
        setMessages(prev => [...data.messages, ...prev]);
      }

      setHasMore(data.hasMore);
      setOffset(currentOffset + data.messages.length);
    } catch (err) {
      console.error('Ошибка загрузки сообщений:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(() => {
    if (!loading && hasMore && botId) {
      loadMessages(botId, filter, offset);
    }
  }, [loading, hasMore, botId, filter, offset]);

  const loadFullHistory = async () => {
    if (!botId) return;
    
    const confirmed = window.confirm(
      'Загрузить всю историю сообщений от этого бота? ' +
      'Это может занять некоторое время.'
    );
    
    if (!confirmed) return;

    try {
      setLoading(true);
      const data = await userbotChatService.getFullHistory(botId);
      setMessages(data.messages);
      setHasMore(false);
    } catch (err) {
      console.error('Ошибка загрузки истории:', err);
      alert('Ошибка загрузки истории: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processMessage = async (messageId) => {
    try {
      const result = await userbotChatService.processMessage(messageId);
      
      // Обновить сообщение в списке
      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, ...result.message } : msg
        )
      );
      
      // Обновить статистику
      updateBotStats(botId, result.message.status);
    } catch (err) {
      console.error('Ошибка обработки:', err);
      alert('Ошибка обработки: ' + err.message);
    }
  };

  const processMultiple = async (messageIds) => {
    try {
      const result = await userbotChatService.processMultiple(messageIds);
      
      // Обновить все обработанные сообщения
      setMessages(prev =>
        prev.map(msg => {
          const updated = result.messages.find(m => m.id === msg.id);
          return updated ? { ...msg, ...updated } : msg;
        })
      );
      
      // Обновить статистику
      result.messages.forEach(msg => {
        updateBotStats(botId, msg.status);
      });
    } catch (err) {
      console.error('Ошибка массовой обработки:', err);
      throw err;
    }
  };

  const retryMessage = async (messageId) => {
    try {
      const result = await userbotChatService.retryMessage(messageId);
      
      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, ...result.message } : msg
        )
      );
    } catch (err) {
      console.error('Ошибка повтора:', err);
      alert('Ошибка повтора: ' + err.message);
    }
  };

  const updateBotStats = (botId, status) => {
    setBots(prev =>
      prev.map(bot => {
        if (bot.id !== botId) return bot;

        const newStats = { ...bot.stats };
        
        if (status === 'processed') {
          newStats.processed++;
          newStats.unprocessed = Math.max(0, newStats.unprocessed - 1);
        } else if (status === 'pending') {
          newStats.pending++;
        } else if (status === 'error') {
          newStats.errors++;
          newStats.unprocessed = Math.max(0, newStats.unprocessed - 1);
        }

        return { ...bot, stats: newStats };
      })
    );
  };

  return {
    bots,
    messages,
    loading,
    error,
    hasMore,
    loadMore,
    loadFullHistory,
    processMessage,
    processMultiple,
    retryMessage
  };
}
```

---

### 10. userbotChatService.js (API Service)

```javascript
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

class UserbotChatService {
  /**
   * Получить список ботов со статистикой
   */
  async getBots() {
    const response = await axios.get(`${API_URL}/userbot/bots`);
    return response.data;
  }

  /**
   * Получить сообщения от бота
   */
  async getMessages(botId, params = {}) {
    const response = await axios.get(`${API_URL}/userbot/messages/${botId}`, {
      params: {
        status: params.status,
        limit: params.limit || 50,
        offset: params.offset || 0
      }
    });
    return response.data;
  }

  /**
   * Загрузить всю историю сообщений от бота
   */
  async getFullHistory(botId) {
    const response = await axios.get(`${API_URL}/userbot/history/${botId}`);
    return response.data;
  }

  /**
   * Обработать сообщение
   */
  async processMessage(messageId) {
    const response = await axios.post(`${API_URL}/userbot/process`, {
      messageId
    });
    return response.data;
  }

  /**
   * Обработать несколько сообщений
   */
  async processMultiple(messageIds) {
    const response = await axios.post(`${API_URL}/userbot/process-multiple`, {
      messageIds
    });
    return response.data;
  }

  /**
   * Повторить обработку сообщения
   */
  async retryMessage(messageId) {
    const response = await axios.post(`${API_URL}/userbot/retry`, {
      messageId
    });
    return response.data;
  }
}

export const userbotChatService = new UserbotChatService();
```

---

### 11. messageHelpers.js (вспомогательные функции)

```javascript
/**
 * Форматировать timestamp в читаемое время
 */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  if (isYesterday) {
    return 'Вчера ' + date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Получить информацию о статусе
 */
export function getStatusInfo(status) {
  const statusMap = {
    processed: {
      label: 'Обработано',
      icon: '✓',
      color: '#4caf50'
    },
    pending: {
      label: 'В очереди',
      icon: '⏱',
      color: '#ff9800'
    },
    error: {
      label: 'Ошибка',
      icon: '✕',
      color: '#f44336'
    },
    unprocessed: {
      label: 'Не обработано',
      icon: '📝',
      color: '#4a9eff'
    }
  };

  return statusMap[status] || {
    label: status,
    icon: '?',
    color: '#888'
  };
}

/**
 * Проверить можно ли обработать сообщение
 */
export function canProcess(message) {
  return ['unprocessed', 'error'].includes(message.status);
}

/**
 * Проверить можно ли повторить обработку
 */
export function canRetry(message) {
  return ['pending', 'error'].includes(message.status);
}
```

---

## 🎨 СТИЛИ (адаптировать под ваш дизайн!)

**ВАЖНО:** Эти стили нужно адаптировать под ваш существующий дизайн!

```css
/* styles.css - БАЗОВЫЕ стили, адаптируйте под ваш дизайн! */

.userbot-chat-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  height: 100%;
  overflow: hidden;
}

/* Список ботов (левая панель) */
.bots-list-container {
  display: flex;
  flex-direction: column;
  background: var(--panel-bg, #2a2a2a);
  border-radius: var(--border-radius, 12px);
  border: 1px solid var(--border-color, #3a3a3a);
  overflow: hidden;
}

.bot-item {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 12px;
}

.bot-item:hover {
  background: rgba(74, 158, 255, 0.05);
}

.bot-item.active {
  background: rgba(74, 158, 255, 0.1);
  border-left: 3px solid var(--primary-color, #4a9eff);
}

/* Чат панель (правая часть) */
.chat-panel {
  display: flex;
  flex-direction: column;
  background: var(--panel-bg, #2a2a2a);
  border-radius: var(--border-radius, 12px);
  border: 1px solid var(--border-color, #3a3a3a);
  overflow: hidden;
}

.chat-header {
  padding: 20px 25px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filters-bar {
  padding: 15px 25px;
  border-bottom: 1px solid var(--border-color, #3a3a3a);
  display: flex;
  gap: 10px;
}

.filter-btn {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--border-color, #3a3a3a);
  color: var(--text-secondary, #888);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn.active {
  background: var(--primary-color, #4a9eff);
  color: white;
  border-color: var(--primary-color, #4a9eff);
}

/* Сообщения */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 25px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-card {
  background: var(--message-bg, #1a1a1a);
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  gap: 12px;
  transition: all 0.2s;
}

.message-card:hover {
  border-color: var(--primary-color, #4a9eff);
  box-shadow: 0 2px 8px rgba(74, 158, 255, 0.1);
}

.message-card.selected {
  border-color: var(--primary-color, #4a9eff);
  background: rgba(74, 158, 255, 0.05);
}

.message-text {
  background: var(--code-bg, #2a2a2a);
  padding: 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
  border-left: 3px solid var(--border-color, #3a3a3a);
}

.message-data {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin: 12px 0;
}

/* Статусы */
.message-status.processed { color: #4caf50; }
.message-status.pending { color: #ff9800; }
.message-status.error { color: #f44336; }
.message-status.unprocessed { color: #4a9eff; }

/* Массовые действия */
.bulk-actions-bar {
  padding: 15px 25px;
  border-top: 1px solid var(--border-color, #3a3a3a);
  background: rgba(74, 158, 255, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* АДАПТИРУЙТЕ ВСЕ ОСТАЛЬНЫЕ СТИЛИ ПОД ВАШ ДИЗАЙН! */
```

---

## ✅ Чек-лист для разработчика

### Frontend (4-6 часов)

- [ ] **Шаг 1:** Создать папку `src/components/UserbotChat/`
- [ ] **Шаг 2:** Скопировать все компоненты из этого ТЗ
- [ ] **Шаг 3:** Создать `hooks/useUserbotChat.js`
- [ ] **Шаг 4:** Создать `services/userbotChatService.js`
- [ ] **Шаг 5:** Создать `utils/messageHelpers.js`
- [ ] **Шаг 6:** Интегрировать `UserbotChatLayout` на вкладку "Telegram userbot"
- [ ] **Шаг 7:** **АДАПТИРОВАТЬ стили под существующий дизайн**
- [ ] **Шаг 8:** Настроить WebSocket подключение
- [ ] **Шаг 9:** Протестировать все функции

### Backend (см. следующий файл)

- [ ] Реализовать все endpoints из Backend API ТЗ

---

## 🎨 ВАЖНО: Адаптация дизайна

**Разработчику:**

1. **НЕ используйте прямо эти стили!**
2. **Посмотрите на существующие компоненты** вашего приложения
3. **Используйте те же:**
   - CSS переменные (`--primary-color`, `--panel-bg`, и т.д.)
   - Классы кнопок (`.btn-primary`, `.btn-secondary`)
   - Классы карточек (`.card`, `.card-header`)
   - Отступы и border-radius
   - Шрифты и размеры текста
4. **Цель:** Чтобы новый функционал выглядел как родной, а не как вставка!

**Примеры адаптации:**

```css
/* Вместо хардкода цветов */
background: #4a9eff; /* ❌ Плохо */

/* Используйте ваши переменные */
background: var(--primary-color); /* ✅ Хорошо */
```

```jsx
/* Вместо новых классов */
<button className="filter-btn primary"> /* ❌ Плохо */

/* Используйте существующие */
<button className="btn btn-sm btn-primary"> /* ✅ Хорошо */
```

---

**Готово!** Это ТЗ с готовым кодом всех компонентов! 🎉

Следующий файл: Backend API endpoints
