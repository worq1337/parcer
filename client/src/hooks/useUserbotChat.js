import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import userbotChatService from '../services/userbotChatService';
import { useUserbotStore } from '../state/userbotStore';

const DEFAULT_LIMIT = 50;

export const useUserbotChat = () => {
  const [bots, setBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMessages, setSelectedMessages] = useState(new Set());

  const messages = useUserbotStore(
    useCallback((state) => {
      if (!selectedBotId) {
        return [];
      }
      return state.items[selectedBotId] || [];
    }, [selectedBotId])
  );

  const nextCursor = useUserbotStore(
    useCallback((state) => {
      if (!selectedBotId) {
        return null;
      }
      return state.oldestId[selectedBotId] || null;
    }, [selectedBotId])
  );

  const chatHasMore = useUserbotStore(
    useCallback((state) => {
      if (!selectedBotId) {
        return false;
      }
      return Boolean(state.hasMore[selectedBotId]);
    }, [selectedBotId])
  );

  const setMessagesForChat = useUserbotStore((state) => state.setMessagesForChat);
  const appendOlderForChat = useUserbotStore((state) => state.appendOlderForChat);
  const clearChat = useUserbotStore((state) => state.clearChat);

  const loadBots = useCallback(async () => {
    try {
      setLoading(true);
      const botsData = await userbotChatService.getBots();
      setBots(botsData || []);

      if (!selectedBotId && botsData && botsData.length > 0) {
        setSelectedBotId(botsData[0].id);
      }
    } catch (error) {
      console.error('Error loading bots:', error);
      toast.error('Ошибка загрузки списка ботов');
    } finally {
      setLoading(false);
    }
  }, [selectedBotId]);

  const loadMessages = useCallback(
    async ({ cursor, silent } = {}) => {
      if (!selectedBotId) {
        return;
      }

      const append = Boolean(cursor);

      if (append) {
        setLoadingMore(true);
      } else if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await userbotChatService.getMessages(selectedBotId, {
          status: statusFilter,
          limit: DEFAULT_LIMIT,
          before: cursor
        });

        const fetchedMessages = Array.isArray(result.messages) ? result.messages : [];
        const options = {
          nextCursor: result.nextCursor || null,
          hasMore: Boolean(result.hasMore)
        };

        if (append) {
          appendOlderForChat(selectedBotId, fetchedMessages, options);
        } else {
          setMessagesForChat(selectedBotId, fetchedMessages, options);
          setSelectedMessages(new Set());
        }
      } catch (error) {
        console.error('Error loading messages:', error);
        toast.error('Ошибка загрузки сообщений');
      } finally {
        if (append) {
          setLoadingMore(false);
        } else if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [selectedBotId, statusFilter, appendOlderForChat, setMessagesForChat]
  );

  const refresh = useCallback(() => {
    if (!selectedBotId) {
      return;
    }
    loadMessages({ silent: true });
  }, [selectedBotId, loadMessages]);

  const loadOlder = useCallback(() => {
    if (!selectedBotId || !nextCursor) {
      return Promise.resolve();
    }
    return loadMessages({ cursor: nextCursor, silent: true });
  }, [selectedBotId, nextCursor, loadMessages]);

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
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Error processing message:', error);
      const detail = error.response?.data?.detail || error.response?.data?.error || error.message;
      const requestId = error.response?.data?.requestId;
      const composed = requestId ? `${detail} (requestId: ${requestId})` : detail;
      toast.error(composed || 'Ошибка обработки');
    }
  }, [refresh, loadBots, selectedBotId]);

  const processMultiple = useCallback(async (messageIds) => {
    try {
      if (!messageIds || messageIds.length === 0) {
        toast.info('Выберите сообщения для обработки');
        return;
      }

      const payloadMessages = messages
        .filter((msg) => messageIds.includes(msg.id))
        .map((msg) => ({
          id: msg.id,
          recordId: msg.id,
          chatId: msg.bot_id || selectedBotId,
          messageId: msg.telegram_message_id,
          rawText: msg.text
        }));

      const result = await userbotChatService.processMultiple(payloadMessages);

      if (result.data?.success > 0) {
        toast.success(`Обработано ${result.data.success} из ${messageIds.length}`);
      }

      if (result.data?.failed > 0) {
        toast.warning(`Не удалось обработать ${result.data.failed} сообщений`);
      }

      setSelectedMessages(new Set());
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Error bulk processing:', error);
      toast.error('Ошибка массовой обработки');
    }
  }, [messages, refresh, loadBots, selectedBotId]);

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

  const toggleMessageSelection = useCallback((messageId) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = messages.map((m) => m.id);
    setSelectedMessages(new Set(allIds));
  }, [messages]);

  const clearSelection = useCallback(() => {
    setSelectedMessages(new Set());
  }, []);

  const selectBot = useCallback((botId) => {
    setSelectedBotId(botId);
    setSelectedMessages(new Set());
    if (botId != null) {
      clearChat(botId);
    }
  }, [clearChat]);

  const changeStatusFilter = useCallback((status) => {
    setStatusFilter(status);
    setSelectedMessages(new Set());
    if (selectedBotId != null) {
      clearChat(selectedBotId);
    }
  }, [selectedBotId, clearChat]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  useEffect(() => {
    if (!selectedBotId) {
      return;
    }
    loadMessages();
  }, [selectedBotId, statusFilter, loadMessages]);

  useEffect(() => {
    if (!selectedBotId) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (selectedBotId && !loading && !refreshing) {
        loadMessages({ silent: true });
        loadBots();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedBotId, loading, refreshing, loadMessages, loadBots]);

  return {
    bots,
    selectedBotId,
    messages,
    loading,
    refreshing,
    loadingMore,
    statusFilter,
    selectedMessages,
    hasMore: chatHasMore,
    selectBot,
    changeStatusFilter,
    refresh,
    loadOlder,
    processMessage,
    processMultiple,
    retryMessage,
    toggleMessageSelection,
    selectAll,
    clearSelection,
    loadMessages
  };
};

export default useUserbotChat;
