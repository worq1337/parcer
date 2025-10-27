/**
 * Custom hook for Userbot Chat functionality
 * Manages state and API calls for bot messages
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import userbotChatService from '../services/userbotChatService';

export const useUserbotChat = () => {
  // State
  const [bots, setBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [pagination, setPagination] = useState({
    total: 0,
    hasMore: false,
    limit: 50,
    offset: 0
  });

  /**
   * Load list of bots with statistics
   */
  const loadBots = useCallback(async () => {
    try {
      setLoading(true);
      const botsData = await userbotChatService.getBots();
      setBots(botsData);

      // Auto-select first bot if none selected
      if (!selectedBotId && botsData.length > 0) {
        setSelectedBotId(botsData[0].id);
      }
    } catch (error) {
      console.error('Error loading bots:', error);
      toast.error('Ошибка загрузки списка ботов');
    } finally {
      setLoading(false);
    }
  }, [selectedBotId]);

  /**
   * Load messages for selected bot
   */
  const loadMessages = useCallback(async (resetOffset = false) => {
    if (!selectedBotId) return;

    try {
      const offset = resetOffset ? 0 : pagination.offset;
      setRefreshing(true);

      const result = await userbotChatService.getMessages(selectedBotId, {
        status: statusFilter,
        limit: pagination.limit,
        offset
      });

      if (resetOffset) {
        setMessages(result.messages);
      } else {
        // Append for infinite scroll
        setMessages(prev => [...prev, ...result.messages]);
      }

      setPagination({
        ...pagination,
        total: result.total,
        hasMore: result.hasMore,
        offset: resetOffset ? pagination.limit : offset + pagination.limit
      });

      // Clear selection when changing filters
      if (resetOffset) {
        setSelectedMessages(new Set());
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Ошибка загрузки сообщений');
    } finally {
      setRefreshing(false);
    }
  }, [selectedBotId, statusFilter, pagination]);

  /**
   * Refresh current view
   */
  const refresh = useCallback(() => {
    loadMessages(true);
  }, [loadMessages]);

  /**
   * Process single message
   */
  const processMessage = useCallback(async (message) => {
    try {
      if (!message) {
        toast.error('Сообщение не выбрано');
        return;
      }

      const payload = {
        recordId: message.id,
        chatId: message.bot_id || selectedBotId,
        messageId: message.telegram_message_id,
        rawText: message.text
      };

      const response = await userbotChatService.processMessage(payload);
      toast.success(response.message || 'Сообщение обработано');

      // Refresh messages after processing
      await refresh();

      // Reload bots to update statistics
      await loadBots();
    } catch (error) {
      console.error('Error processing message:', error);
      const detail = error.response?.data?.detail || error.response?.data?.error || error.message;
      const requestId = error.response?.data?.requestId;
      const composed = requestId ? `${detail} (requestId: ${requestId})` : detail;
      toast.error(composed || 'Ошибка обработки');
    }
  }, [refresh, loadBots, selectedBotId]);

  /**
   * Process multiple messages in bulk
   */
  const processMultiple = useCallback(async (messageIds) => {
    try {
      if (!messageIds || messageIds.length === 0) {
        toast.info('Выберите сообщения для обработки');
        return;
      }

      const payloadMessages = messages
        .filter(msg => messageIds.includes(msg.id))
        .map(msg => ({
          id: msg.id,
          recordId: msg.id,
          chatId: msg.bot_id || selectedBotId,
          messageId: msg.telegram_message_id,
          rawText: msg.text
        }));

      const result = await userbotChatService.processMultiple(payloadMessages);

      if (result.data.success > 0) {
        toast.success(`Обработано ${result.data.success} из ${messageIds.length}`);
      }

      if (result.data.failed > 0) {
        toast.warning(`Не удалось обработать ${result.data.failed} сообщений`);
      }

      // Clear selection
      setSelectedMessages(new Set());

      // Refresh view
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Error bulk processing:', error);
      toast.error('Ошибка массовой обработки');
    }
  }, [refresh, loadBots, messages, selectedBotId]);

  /**
   * Retry failed message
   */
  const retryMessage = useCallback(async (messageId) => {
    try {
      await userbotChatService.retryMessage(messageId);
      toast.success('Сообщение готово к повторной обработке');
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Error retrying message:', error);
      toast.error('Ошибка повтора обработки');
    }
  }, [refresh, loadBots]);

  /**
   * Toggle message selection
   */
  const toggleMessageSelection = useCallback((messageId) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  /**
   * Select all visible messages
   */
  const selectAll = useCallback(() => {
    const allIds = messages.map(m => m.id);
    setSelectedMessages(new Set(allIds));
  }, [messages]);

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    setSelectedMessages(new Set());
  }, []);

  /**
   * Change selected bot
   */
  const selectBot = useCallback((botId) => {
    setSelectedBotId(botId);
    setPagination(prev => ({ ...prev, offset: 0 }));
    setSelectedMessages(new Set());
  }, []);

  /**
   * Change status filter
   */
  const changeStatusFilter = useCallback((status) => {
    setStatusFilter(status);
    setPagination(prev => ({ ...prev, offset: 0 }));
  }, []);

  // Load bots on mount
  useEffect(() => {
    loadBots();
  }, [loadBots]);

  // Load messages when bot or filter changes
  useEffect(() => {
    if (selectedBotId) {
      loadMessages(true);
    }
  }, [selectedBotId, statusFilter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedBotId && !refreshing) {
        loadMessages(true);
        loadBots();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedBotId, refreshing, loadMessages, loadBots]);

  return {
    // State
    bots,
    selectedBotId,
    messages,
    loading,
    refreshing,
    statusFilter,
    selectedMessages,
    pagination,

    // Actions
    selectBot,
    changeStatusFilter,
    refresh,
    processMessage,
    processMultiple,
    retryMessage,
    toggleMessageSelection,
    selectAll,
    clearSelection,
    loadMessages // For infinite scroll
  };
};

export default useUserbotChat;
