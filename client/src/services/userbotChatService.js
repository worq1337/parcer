/**
 * Userbot Chat API Service
 * Handles all API calls for bot messages
 */

import axios from 'axios';

const rawBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const API_BASE_URL = rawBaseUrl.replace(/\/$/, '');

const api = axios.create({
  baseURL: `${API_BASE_URL}/userbot-chat`,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  response => response,
  error => {
    const detail = error?.response?.data || error?.message;
    console.error('Userbot Chat API Error:', detail);
    return Promise.reject(error);
  }
);

/**
 * Get list of monitored bots with statistics
 * @returns {Promise<Array>} Array of bots with stats
 */
export const getBots = async () => {
  const response = await api.get('/bots');
  return response.data.data;
};

/**
 * Get messages from specific bot
 * @param {number} botId - Bot ID
 * @param {object} options - Filter options
 * @param {string} options.status - Message status filter
 * @param {number} options.limit - Pagination limit
 * @param {number} options.offset - Pagination offset
 * @returns {Promise<object>} Messages with pagination info
 */
export const getMessages = async (botId, options = {}) => {
  const { status = 'all', limit = 50, offset = 0 } = options;

  const params = new URLSearchParams({
    status,
    limit: limit.toString(),
    offset: offset.toString()
  });

  const response = await api.get(`/messages/${botId}?${params.toString()}`);
  return response.data.data;
};

/**
 * Get full history of messages from bot (no pagination limit)
 * @param {number} botId - Bot ID
 * @param {string} status - Status filter
 * @returns {Promise<object>} All messages
 */
export const getHistory = async (botId, status = 'all') => {
  const params = new URLSearchParams({ status });
  const response = await api.get(`/history/${botId}?${params.toString()}`);
  return response.data.data;
};

/**
 * Process single message manually
 * @param {object} payload
 * @returns {Promise<object>} Processing result
 */
export const processMessage = async (payload) => {
  const body = {
    record_id: payload?.recordId || payload?.id || null,
    chat_id: payload?.chatId != null ? String(payload.chatId) : null,
    message_id: payload?.messageId != null ? String(payload.messageId) : null,
    raw_text: payload?.rawText ?? ''
  };

  const response = await api.post('/process', body);
  return response.data;
};

/**
 * Process multiple messages in bulk
 * @param {Array<object>} messages
 * @returns {Promise<object>} Bulk processing result
 */
export const processMultiple = async (messages) => {
  const payload = messages.map((message) => ({
    record_id: message?.recordId || message?.id || null,
    chat_id: message?.chatId != null ? String(message.chatId) : null,
    message_id: message?.messageId != null ? String(message.messageId) : null,
    raw_text: message?.rawText ?? ''
  }));

  const response = await api.post('/process-multiple', { messages: payload });
  return response.data;
};

/**
 * Retry failed message
 * @param {string} messageId - Message UUID
 * @returns {Promise<object>} Retry result
 */
export const retryMessage = async (messageId) => {
  const response = await api.post('/retry', { messageId });
  return response.data;
};

/**
 * Load message history from Telegram for specific bot
 * @param {number} botId - Bot ID
 * @param {number|null} days - Number of days to load (null = all history)
 * @returns {Promise<object>} Loading result: {success, loaded, saved, skipped, errors}
 */
export const loadHistory = async (botId, days = null) => {
  const response = await api.post(`/load-history/${botId}`, { days });
  return response.data;
};

// Export default service object
const userbotChatService = {
  getBots,
  getMessages,
  getHistory,
  processMessage,
  processMultiple,
  retryMessage,
  loadHistory
};

export default userbotChatService;
