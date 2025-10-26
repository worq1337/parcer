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
    console.error('Userbot Chat API Error:', error);
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
 * @param {string} messageId - Message UUID
 * @returns {Promise<object>} Processing result
 */
export const processMessage = async (messageId) => {
  const response = await api.post('/process', { messageId });
  return response.data;
};

/**
 * Process multiple messages in bulk
 * @param {Array<string>} messageIds - Array of message UUIDs
 * @returns {Promise<object>} Bulk processing result
 */
export const processMultiple = async (messageIds) => {
  const response = await api.post('/process-multiple', { messageIds });
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

// Export default service object
const userbotChatService = {
  getBots,
  getMessages,
  getHistory,
  processMessage,
  processMultiple,
  retryMessage
};

export default userbotChatService;
