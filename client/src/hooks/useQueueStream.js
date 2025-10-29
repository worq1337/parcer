import { useEffect, useRef, useState } from 'react';

/**
 * Hook для подключения к SSE stream событий очереди
 * patch-016 §7: Real-time мониторинг очереди обработки чеков
 * patch-024: Исправлена проблема с бесконечным ре-рендером
 *
 * @param {boolean} enabled - Включить/выключить подключение
 * @param {function} onEvent - Callback для обработки событий
 * @returns {object} { connected, error, reconnect }
 */
export const useQueueStream = (enabled = false, onEvent) => {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const eventQueueRef = useRef([]);
  const pumpTimerRef = useRef(null);
  const connectRef = useRef(null);
  const teardownRef = useRef(null);

  // Обновляем ref при изменении callback
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 2000; // 2 секунды
  const MAX_BUFFER = 2000;
  const FLUSH_INTERVAL = 250;

  const ensurePump = () => {
    if (pumpTimerRef.current !== null) {
      return;
    }

    const pump = () => {
      if (eventQueueRef.current.length > 0) {
        const chunk = eventQueueRef.current.splice(0, eventQueueRef.current.length);
        chunk.forEach((payload) => {
          try {
            if (onEventRef.current) {
              onEventRef.current(payload);
            }
          } catch (callbackError) {
            console.error('[SSE] onEvent handler failed', callbackError);
          }
        });
      }
      pumpTimerRef.current = window.setTimeout(pump, FLUSH_INTERVAL);
    };

    pump();
  };

  const stopPump = () => {
    if (pumpTimerRef.current !== null) {
      clearTimeout(pumpTimerRef.current);
      pumpTimerRef.current = null;
    }
    eventQueueRef.current = [];
  };

  useEffect(() => {
    if (!enabled) {
      // Очистка при выключении
      if (eventSourceRef.current) {
        if (teardownRef.current) {
          teardownRef.current();
          teardownRef.current = null;
        }
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopPump();
      setConnected(false);
      return;
    }

    // Закрываем предыдущее подключение если есть
    if (eventSourceRef.current) {
      if (teardownRef.current) {
        teardownRef.current();
        teardownRef.current = null;
      }
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const connect = () => {
      try {
        teardownRef.current = null;
        const streamUrl = `${apiUrl}/admin/queue/stream`;
        const eventSource = new EventSource(streamUrl);
        eventSourceRef.current = eventSource;

        const enqueue = (event, fallbackType) => {
          if (!event || !event.data) {
            return;
          }
          try {
            const parsed = JSON.parse(event.data);
            if (fallbackType && !parsed.type) {
              parsed.type = fallbackType;
            }
            eventQueueRef.current.push(parsed);
            if (eventQueueRef.current.length > MAX_BUFFER) {
              eventQueueRef.current.splice(0, eventQueueRef.current.length - MAX_BUFFER);
            }
          } catch (parseError) {
            console.error('[SSE] Failed to parse event payload', parseError);
          }
        };

        const handleOpen = () => {
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
        };

        const handleTx = (event) => enqueue(event, 'tx');
        const handleLegacy = (event) => enqueue(event, 'legacy');
        const handleMessage = (event) => enqueue(event, null);
        const handleReady = () => {
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0;
        };

        const handleError = (err) => {
          setConnected(false);
          setError('Connection lost');

          // Закрываем подключение
          if (teardownRef.current) {
            teardownRef.current();
            teardownRef.current = null;
          }
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

          // Автореконнект с экспоненциальной задержкой
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current += 1;
              connect();
            }, delay);
          } else {
            setError(`Failed to connect after ${maxReconnectAttempts} attempts`);
          }
        };

        eventSource.onopen = handleOpen;
        eventSource.addEventListener('tx', handleTx);
        eventSource.addEventListener('legacy', handleLegacy);
        eventSource.addEventListener('ready', handleReady);
        eventSource.addEventListener('message', handleMessage);
        eventSource.onerror = handleError;

        ensurePump();

        teardownRef.current = () => {
          eventSource.onopen = null;
          eventSource.removeEventListener('tx', handleTx);
          eventSource.removeEventListener('legacy', handleLegacy);
          eventSource.removeEventListener('ready', handleReady);
          eventSource.removeEventListener('message', handleMessage);
          eventSource.onerror = null;
        };
      } catch (err) {
        console.error('[SSE] Failed to create EventSource:', err);
        setError(err.message);
        setConnected(false);
      }
    };

    // Начинаем подключение
    connect();
    connectRef.current = connect;

    // Очистка при размонтировании
    return () => {
      if (eventSourceRef.current) {
        if (teardownRef.current) {
          teardownRef.current();
          teardownRef.current = null;
        }
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      stopPump();
    };
  }, [enabled, apiUrl]); // Только enabled и apiUrl в зависимостях

  // Ручной реконнект
  const reconnect = () => {
    reconnectAttemptsRef.current = 0;
    setError(null);

    // Перезапускаем подключение
    if (eventSourceRef.current) {
      if (teardownRef.current) {
        teardownRef.current();
        teardownRef.current = null;
      }
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (connectRef.current) {
      connectRef.current();
    } else {
      setConnected(false);
    }
  };

  return {
    connected,
    error,
    reconnect
  };
};

export default useQueueStream;
