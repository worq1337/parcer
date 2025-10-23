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

  // Обновляем ref при изменении callback
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 2000; // 2 секунды

  useEffect(() => {
    if (!enabled) {
      // Очистка при выключении
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setConnected(false);
      return;
    }

    // Закрываем предыдущее подключение если есть
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const connect = () => {
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
            if (onEventRef.current) {
              onEventRef.current(data);
            }
          } catch (parseError) {
            console.error('[SSE] Error parsing event data:', parseError);
          }
        };

        eventSource.onerror = (err) => {
          console.error('[SSE] Connection error:', err);
          setConnected(false);
          setError('Connection lost');

          // Закрываем подключение
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }

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
          }
        };
      } catch (err) {
        console.error('[SSE] Failed to create EventSource:', err);
        setError(err.message);
        setConnected(false);
      }
    };

    // Начинаем подключение
    connect();

    // Очистка при размонтировании
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, apiUrl]); // Только enabled и apiUrl в зависимостях

  // Ручной реконнект
  const reconnect = () => {
    console.log('[SSE] Manual reconnect triggered');
    reconnectAttemptsRef.current = 0;
    setError(null);

    // Перезапускаем подключение
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    // Переключаем enabled чтобы перезапустить useEffect
    setConnected(false);
  };

  return {
    connected,
    error,
    reconnect
  };
};

export default useQueueStream;
