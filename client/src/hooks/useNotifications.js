/**
 * patch-017 §5: React hook для SSE push-уведомлений
 *
 * Подписывается на Server-Sent Events от backend
 * и показывает OS уведомления через Electron API
 */

import { useEffect, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export function useNotifications(enabled = true) {
  const eventSourceRef = useRef(null);
  const checksCountRef = useRef(0);

  useEffect(() => {
    if (!enabled || !window.electron) {
      console.log('Notifications disabled or not in Electron');
      return;
    }

    console.log('🔔 Subscribing to SSE notifications...');

    // Подключаемся к SSE endpoint
    const eventSource = new EventSource(`${API_BASE_URL}/notifications/stream`);
    eventSourceRef.current = eventSource;

    // Обработчик подключения
    eventSource.addEventListener('open', () => {
      console.log('✅ SSE connection established');
    });

    const handleTx = (event) => {
      try {
        const data = JSON.parse(event.data);
        checksCountRef.current++;
        showCheckNotification(data);
      } catch (error) {
        console.error('Error parsing tx event:', error);
      }
    };

    const handleLegacy = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'minute:summary') {
          showMinuteSummary(payload.data);
          checksCountRef.current = 0;
        }
      } catch (error) {
        console.error('Error parsing legacy event:', error);
      }
    };

    eventSource.addEventListener('tx', handleTx);
    eventSource.addEventListener('legacy', handleLegacy);

    // Обработчик ошибок
    eventSource.addEventListener('error', (error) => {
      console.error('SSE connection error:', error);
      // EventSource автоматически переподключается
    });

    // Cleanup при размонтировании
    return () => {
      console.log('🔌 Closing SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.removeEventListener('tx', handleTx);
        eventSourceRef.current.removeEventListener('legacy', handleLegacy);
        eventSourceRef.current.close();
      }
    };
  }, [enabled]);

  return {
    checksCount: checksCountRef.current
  };
}

/**
 * Показать уведомление о новом чеке
 */
function showCheckNotification(check) {
  if (!window.electron?.notifications) {
    return;
  }

  const sign = parseFloat(check.amount) < 0 ? '-' : '+';
  const amount = Math.abs(parseFloat(check.amount)).toFixed(2);
  const formattedAmount = new Intl.NumberFormat('ru-RU').format(amount);

  window.electron.notifications.show(
    '🧾 Новый чек добавлен',
    `${sign} ${formattedAmount} ${check.currency} · ${check.operator}\nКарта: *${check.card_last4} · ${check.date_display} ${check.time_display}`,
    { checkId: check.id, source: check.source }
  );
}

/**
 * Показать минутную сводку
 */
function showMinuteSummary(summary) {
  if (!window.electron?.notifications || summary.count === 0) {
    return;
  }

  const formattedAmount = new Intl.NumberFormat('ru-RU').format(summary.totalAmount);
  const plural = summary.count === 1 ? 'чек' : summary.count < 5 ? 'чека' : 'чеков';

  window.electron.notifications.show(
    `📊 Минутная сводка: ${summary.count} ${plural}`,
    `Всего: ${formattedAmount} ${summary.currency}\n${new Date(summary.period.start).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} - ${new Date(summary.period.end).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
    { type: 'summary', count: summary.count }
  );
}
