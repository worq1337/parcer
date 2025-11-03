import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import userbotChatService from '../services/userbotChatService';

const DEFAULT_LIMIT = 50;
const EMPTY_MESSAGES = Object.freeze([]);

const getMessageKey = (message) => {
  if (!message) {
    return null;
  }
  return message.message_id || message.id || null;
};

export const useUserbotChat = () => {
  const [bots, setBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [botsLoading, setBotsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [chatState, setChatState] = useState({
    items: {},
    nextCursor: {},
    hasMore: {}
  });

  const messages = selectedBotId ? chatState.items[selectedBotId] || EMPTY_MESSAGES : EMPTY_MESSAGES;
  const nextCursor = selectedBotId ? chatState.nextCursor[selectedBotId] || null : null;
  const chatHasMore = selectedBotId ? Boolean(chatState.hasMore[selectedBotId]) : false;

  // Refs для отслеживания монтирования компонента
  const isMounted = useRef(true);
  const botsRequestTokenRef = useRef(null);

  const clearChat = useCallback((chatId) => {
    if (chatId == null) {
      return;
    }

    const safeChatId = String(chatId);

    setChatState((prev) => {
      if (!prev.items[safeChatId] && !prev.nextCursor[safeChatId] && !prev.hasMore[safeChatId]) {
        return prev;
      }

      const nextItems = { ...prev.items };
      const nextCursorMap = { ...prev.nextCursor };
      const nextHasMoreMap = { ...prev.hasMore };
      delete nextItems[safeChatId];
      delete nextCursorMap[safeChatId];
      delete nextHasMoreMap[safeChatId];

      return {
        items: nextItems,
        nextCursor: nextCursorMap,
        hasMore: nextHasMoreMap
      };
    });
  }, []);

  // loadBots без зависимостей - использует refs для проверки состояния
  const loadBots = useCallback(async () => {
    const requestToken = Symbol('botsRequest');
    botsRequestTokenRef.current = requestToken;

    console.log('[useUserbotChat] loadBots called');

    try {
      setBotsLoading(true);
      console.log('[useUserbotChat] Fetching bots from API...');
      const botsData = await userbotChatService.getBots();
      console.log('[useUserbotChat] Received botsData:', botsData);

      // Only check if component is still mounted, allow concurrent requests to complete
      if (!isMounted.current) {
        console.log('[useUserbotChat] Component unmounted, aborting');
        return;
      }

      const normalizedBots = Array.isArray(botsData)
        ? botsData
            .map((bot) => {
              const primaryId = bot?.id ?? bot?.bot_id ?? bot?.chat_id ?? bot?.telegram_id ?? bot?.uuid;
              if (primaryId == null) {
                return null;
              }
              return {
                ...bot,
                id: String(primaryId)
              };
            })
            .filter(Boolean)
        : [];

      console.log('[useUserbotChat] Normalized bots:', normalizedBots);
      setBots(normalizedBots);

    setSelectedBotId((currentId) => {
      if (!currentId && normalizedBots.length > 0) {
        return normalizedBots[0].id;
      }
      return currentId;
    });
    } catch (error) {
      if (!isMounted.current) {
        return;
      }
      console.error('Ошибка загрузки списка ботов:', error);
      toast.error('Ошибка загрузки списка ботов');
    } finally {
      if (isMounted.current) {
        setBotsLoading(false);
      }
    }
  }, []);

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
        setMessagesLoading(true);
      }

      try {
        const result = await userbotChatService.getMessages(selectedBotId, {
          status: statusFilter,
          limit: DEFAULT_LIMIT,
          before: cursor
        });

        if (!isMounted.current) {
          return;
        }

        const fetchedMessagesRaw = Array.isArray(result.messages) ? result.messages : [];
        const fetchedMessages = fetchedMessagesRaw.map((message) => {
          const primaryId = message?.id ?? message?.message_id ?? message?.telegram_message_id ?? message?.uuid;
          return primaryId == null
            ? message
            : {
                ...message,
                id: String(primaryId)
              };
        });
        const options = {
          nextCursor: result.nextCursor || null,
          hasMore: Boolean(result.hasMore)
        };

        if (append) {
          setChatState((prev) => {
            const safeChatId = String(selectedBotId);
            const existing = prev.items[safeChatId] || EMPTY_MESSAGES;
            const seen = new Set();
            const merged = [];

            for (const message of existing) {
              const key = getMessageKey(message);
              if (key) {
                seen.add(key);
              }
              merged.push(message);
            }

            for (const message of fetchedMessages) {
              const key = getMessageKey(message);
              if (key && seen.has(key)) {
                continue;
              }
              if (key) {
                seen.add(key);
              }
              merged.push(message);
            }

            const hasMoreValue = options.hasMore !== undefined
              ? Boolean(options.hasMore)
              : Boolean(prev.hasMore[safeChatId]);

            return {
              items: { ...prev.items, [safeChatId]: merged },
              nextCursor: { ...prev.nextCursor, [safeChatId]: options.nextCursor },
              hasMore: { ...prev.hasMore, [safeChatId]: hasMoreValue }
            };
          });
        } else {
          setChatState((prev) => {
            const safeChatId = String(selectedBotId);
            const unique = [];
            const seen = new Set();

            for (const message of fetchedMessages) {
              const key = getMessageKey(message);
              if (key && seen.has(key)) {
                continue;
              }
              if (key) {
                seen.add(key);
              }
              unique.push(message);
            }

            const hasMoreValue = options.hasMore !== undefined
              ? Boolean(options.hasMore)
              : Boolean(prev.hasMore[safeChatId]);

            return {
              items: { ...prev.items, [safeChatId]: unique },
              nextCursor: { ...prev.nextCursor, [safeChatId]: options.nextCursor },
              hasMore: { ...prev.hasMore, [safeChatId]: hasMoreValue }
            };
          });
          setSelectedMessages((prev) => (prev.size === 0 ? prev : new Set()));
        }
      } catch (error) {
        if (!isMounted.current) {
          return;
        }
        console.error('Ошибка загрузки сообщений:', error);
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
          setMessagesLoading(false);
        }
      }
    },
    [selectedBotId, statusFilter]
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
        chatId: message.bot_id != null ? String(message.bot_id) : selectedBotId,
        messageId: message.telegram_message_id,
        rawText: message.text
      };

      const response = await userbotChatService.processMessage(payload);
      toast.success(response.message || 'Сообщение обработано');
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
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
          chatId: msg.bot_id != null ? String(msg.bot_id) : selectedBotId,
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

      setSelectedMessages((prev) => (prev.size === 0 ? prev : new Set()));
      await refresh();
      await loadBots();
    } catch (error) {
      console.error('Ошибка массовой обработки:', error);
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
      console.error('Ошибка повтора обработки:', error);
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
    setSelectedMessages((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const selectBot = useCallback((botId) => {
    if (botId == null) {
      setSelectedBotId(null);
    } else {
      setSelectedBotId(String(botId));
    }
    setSelectedMessages((prev) => (prev.size === 0 ? prev : new Set()));
    if (botId != null) {
      clearChat(botId);
    }
  }, [clearChat]);

  const changeStatusFilter = useCallback((status) => {
    setStatusFilter(status);
    setSelectedMessages((prev) => (prev.size === 0 ? prev : new Set()));
    if (selectedBotId != null) {
      clearChat(selectedBotId);
    }
  }, [selectedBotId, clearChat]);

  // Загрузка ботов один раз при монтировании
  useEffect(() => {
    loadBots();
  }, []); // CRITICAL: loadBots НЕ в deps - иначе бесконечный цикл!

  // Загрузка сообщений при смене бота или фильтра
  // loadMessages стабильна благодаря useCallback с фиксированными зависимостями
  useEffect(() => {
    if (!selectedBotId) {
      return;
    }
    loadMessages();
  }, [selectedBotId, statusFilter]); // CRITICAL: loadMessages НЕ в deps!

  // Авто-обновление каждые 30 секунд
  // loadMessages и loadBots стабильны благодаря useCallback с пустыми/фиксированными deps
  useEffect(() => {
    if (!selectedBotId) {
      return undefined;
    }

    const interval = setInterval(() => {
      loadMessages({ silent: true });
      loadBots();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedBotId]); // CRITICAL: loadMessages/loadBots НЕ в deps!

  // Cleanup при размонтировании и установка isMounted при монтировании
  useEffect(() => {
    isMounted.current = true; // Reset to true on every mount (for StrictMode double-render)
    return () => {
      isMounted.current = false;
      botsRequestTokenRef.current = null;
    };
  }, []);

  return {
    bots,
    selectedBotId,
    messages,
    botsLoading,
    messagesLoading,
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
