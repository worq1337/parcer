import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import userbotChatService from '../services/userbotChatService';
import { useUserbotStore } from '../state/userbotStore';

const DEFAULT_LIMIT = 50;

// Стабильные селекторы вне компонента
const selectMessages = (state, botId) => {
  if (!botId) return [];
  return state.items[botId] || [];
};

const selectNextCursor = (state, botId) => {
  if (!botId) return null;
  return state.oldestId[botId] || null;
};

const selectHasMore = (state, botId) => {
  if (!botId) return false;
  return Boolean(state.hasMore[botId]);
};

export const useUserbotChat = () => {
  const [bots, setBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMessages, setSelectedMessages] = useState(new Set());

  // Используем стабильные селекторы
  const messages = useUserbotStore((state) => selectMessages(state, selectedBotId));
  const nextCursor = useUserbotStore((state) => selectNextCursor(state, selectedBotId));
  const chatHasMore = useUserbotStore((state) => selectHasMore(state, selectedBotId));

  const setMessagesForChat = useUserbotStore((state) => state.setMessagesForChat);
  const appendOlderForChat = useUserbotStore((state) => state.appendOlderForChat);
  const clearChat = useUserbotStore((state) => state.clearChat);

  // Refs для отслеживания монтирования компонента
  const isMounted = useRef(true);
  const abortControllerRef = useRef(null);

  // loadBots без зависимостей - использует refs для проверки состояния
  const loadBots = useCallback(async () => {
    // Создаем новый AbortController для этого запроса
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      const botsData = await userbotChatService.getBots();

      // Проверяем, что компонент еще смонтирован
      if (!isMounted.current || abortControllerRef.current?.signal.aborted) {
        return;
      }

      setBots(botsData || []);

      // Автовыбор первого бота только если ничего не выбрано
      setSelectedBotId((currentId) => {
        if (!currentId && botsData && botsData.length > 0) {
          return botsData[0].id;
        }
        return currentId;
      });
    } catch (error) {
      if (error.name === 'AbortError' || !isMounted.current) {
        return;
      }
      console.error('Error loading bots:', error);
      toast.error('Ошибка загрузки списка ботов');
    } finally {
      if (isMounted.current && !abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, []); // Пустой массив - loadBots стабильна!

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

        // Проверяем, что компонент еще смонтирован
        if (!isMounted.current) {
          return;
        }

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
        if (!isMounted.current) {
          return;
        }
        console.error('Error loading messages:', error);
        toast.error('Ошибка загрузки сообщений');
      } finally {
        if (!isMounted.current) {
          return;
        }
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

  // Загрузка ботов один раз при монтировании
  useEffect(() => {
    loadBots();
  }, []); // FIXED: Пустой массив - loadBots стабильна!

  // Загрузка сообщений при смене бота или фильтра
  // loadMessages стабильна благодаря useCallback с фиксированными зависимостями
  useEffect(() => {
    if (!selectedBotId) {
      return;
    }
    loadMessages();
  }, [selectedBotId, statusFilter]); // loadMessages не в deps - стабильна

  // Авто-обновление каждые 30 секунд
  // loadMessages и loadBots стабильны благодаря useCallback с пустыми/фиксированными deps
  useEffect(() => {
    if (!selectedBotId) {
      return undefined;
    }

    const interval = setInterval(() => {
      // Проверяем состояние внутри интервала, а не в зависимостях
      // loadMessages и loadBots стабильны, вызываем напрямую
      loadMessages({ silent: true });
      loadBots();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedBotId]); // Только selectedBotId - loadMessages и loadBots стабильны!

  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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
