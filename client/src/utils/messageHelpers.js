/**
 * Helper functions for working with bot messages
 * Adapted to current design system
 */

/**
 * Format timestamp to readable format
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted date and time
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Сегодня - показываем только время
  if (diffDays === 0) {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Вчера
  if (diffDays === 1) {
    return `Вчера ${date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  }

  // Больше недели - полная дата
  if (diffDays > 7) {
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Меньше недели - показываем день недели
  return date.toLocaleDateString('ru-RU', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Get status badge info (color, text, icon)
 * @param {string} status - Message status
 * @returns {object} Badge configuration
 */
export const getStatusBadge = (status) => {
  const badges = {
    new: {
      text: 'Новые',
      className: 'badge-info',
      icon: '🆕',
      color: 'var(--status-info)'
    },
    processing: {
      text: 'В обработке',
      className: 'badge-info',
      icon: '🔄',
      color: 'var(--status-warning)'
    },
    processed: {
      text: 'Обработано',
      className: 'badge-success',
      icon: '✓',
      color: 'var(--status-success)'
    },
    error: {
      text: 'Ошибка',
      className: 'badge-error',
      icon: '✗',
      color: 'var(--status-error)'
    }
  };

  return badges[status] || badges.new;
};

/**
 * Extract transaction data from message text (simple parser)
 * @param {string} text - Message text
 * @returns {object|null} Extracted data or null
 */
export const extractDataFromText = (text) => {
  if (!text) return null;

  const data = {};

  // Сумма (ищем число с запятой/точкой и валюту)
  const amountMatch = text.match(/(-?\d[\d\s,.']*)\s?(UZS|сум|руб|USD|EUR)/i);
  if (amountMatch) {
    data.amount = amountMatch[1].replace(/\s/g, '').replace(',', '.');
    data.currency = amountMatch[2];
  }

  // Карта (последние 4 цифры)
  const cardMatch = text.match(/\*(\d{4})/);
  if (cardMatch) {
    data.card = cardMatch[1];
  }

  // Дата и время
  const dateMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateMatch) {
    data.date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }

  const timeMatch = text.match(/(\d{2}):(\d{2})/);
  if (timeMatch) {
    data.time = `${timeMatch[1]}:${timeMatch[2]}`;
  }

  return Object.keys(data).length > 0 ? data : null;
};

/**
 * Truncate long text
 * @param {string} text - Original text
 * @param {number} maxLength - Max length
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Group messages by date
 * @param {Array} messages - Array of messages
 * @returns {object} Grouped messages by date
 */
export const groupMessagesByDate = (messages) => {
  if (!messages || messages.length === 0) return {};

  const groups = {};

  messages.forEach(message => {
    const date = new Date(message.timestamp);
    const dateKey = date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }

    groups[dateKey].push(message);
  });

  return groups;
};

/**
 * Filter messages by search query
 * @param {Array} messages - Array of messages
 * @param {string} query - Search query
 * @returns {Array} Filtered messages
 */
export const filterMessagesByQuery = (messages, query) => {
  if (!query || query.trim() === '') return messages;

  const lowerQuery = query.toLowerCase();

  return messages.filter(message => {
    return (
      message.text.toLowerCase().includes(lowerQuery) ||
      (message.data?.amount && message.data.amount.toString().includes(lowerQuery)) ||
      (message.data?.merchant && message.data.merchant.toLowerCase().includes(lowerQuery))
    );
  });
};

/**
 * Calculate statistics for messages
 * @param {Array} messages - Array of messages
 * @returns {object} Statistics
 */
export const calculateStats = (messages) => {
  if (!messages || messages.length === 0) {
    return {
      total: 0,
      new: 0,
      processed: 0,
      processing: 0,
      error: 0
    };
  }

  return {
    total: messages.length,
    new: messages.filter(m => m.status === 'new').length,
    processed: messages.filter(m => m.status === 'processed').length,
    processing: messages.filter(m => m.status === 'processing').length,
    error: messages.filter(m => m.status === 'error').length
  };
};
