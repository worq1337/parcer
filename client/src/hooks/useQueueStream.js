import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Hook для подключения к SSE stream событий очереди
 * patch-016 §7: Real-time мониторинг очереди обработки чеков
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

  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 2000; // 2 секунды

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    // Закрываем предыдущее подключение если есть
    cleanup();

    try {
      const streamUrl = `${apiUrl}/admin/queue/stream`;
      console.log('[SSE] Connecting to:', streamUrl);

      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connected successfully');
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE] Event received:', data);

          if (data.type === 'connected') {
            // Начальное подключение
            return;
          }

          // Вызываем callback с данными события
          if (onEvent) {
            onEvent(data);
          }
        } catch (parseError) {
          console.error('[SSE] Error parsing event data:', parseError);
        }
      };

      eventSource.onerror = (err) => {
        console.error('[SSE] Connection error:', err);
        setConnected(false);
        setError('Connection lost');

        // Автореконнект с экспоненциальной задержкой
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else {
          setError(`Failed to connect after ${maxReconnectAttempts} attempts`);
          cleanup();
        }
      };
    } catch (err) {
      console.error('[SSE] Failed to create EventSource:', err);
      setError(err.message);
      setConnected(false);
    }
  }, [enabled, apiUrl, onEvent, cleanup]);

  // Ручной реконнект
  const reconnect = useCallback(() => {
    console.log('[SSE] Manual reconnect triggered');
    reconnectAttemptsRef.current = 0;
    setError(null);
    connect();
  }, [connect]);

  // Подключение при включении
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return {
    connected,
    error,
    reconnect
  };
};

export default useQueueStream;
