import { create } from 'zustand';

function getMessageKey(message) {
  if (!message) {
    return null;
  }
  return message.message_id || message.id || null;
}

export const useUserbotStore = create((set) => ({
  items: {},
  oldestId: {},
  hasMore: {},

  setMessagesForChat: (chatId, messages = [], options = {}) => {
    const safeChatId = String(chatId);
    const nextCursor = options.nextCursor || (messages.length ? getMessageKey(messages[messages.length - 1]) : null);
    set((state) => ({
      items: { ...state.items, [safeChatId]: messages },
      oldestId: { ...state.oldestId, [safeChatId]: nextCursor },
      hasMore: {
        ...state.hasMore,
        [safeChatId]: Boolean(options.hasMore)
      }
    }));
  },

  appendOlderForChat: (chatId, older = [], options = {}) => {
    const safeChatId = String(chatId);
    set((state) => {
      const current = state.items[safeChatId] || [];
      if (!Array.isArray(older) || older.length === 0) {
        return state;
      }

      const seen = new Set();
      const merged = [];
      const pushUnique = (message) => {
        const key = getMessageKey(message);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        merged.push(message);
      };

      current.forEach(pushUnique);
      older.forEach(pushUnique);

      const nextCursor = options.nextCursor || (merged.length ? getMessageKey(merged[merged.length - 1]) : null);

      return {
        ...state,
        items: { ...state.items, [safeChatId]: merged },
        oldestId: { ...state.oldestId, [safeChatId]: nextCursor },
        hasMore: {
          ...state.hasMore,
          [safeChatId]: options.hasMore !== undefined ? Boolean(options.hasMore) : state.hasMore[safeChatId]
        }
      };
    });
  },

  clearChat: (chatId) => {
    const safeChatId = String(chatId);
    set((state) => {
      const nextItems = { ...state.items };
      const nextOldest = { ...state.oldestId };
      const nextHasMore = { ...state.hasMore };
      delete nextItems[safeChatId];
      delete nextOldest[safeChatId];
      delete nextHasMore[safeChatId];
      return {
        ...state,
        items: nextItems,
        oldestId: nextOldest,
        hasMore: nextHasMore
      };
    });
  },

  reset: () => set({ items: {}, oldestId: {}, hasMore: {} })
}));

export default useUserbotStore;
