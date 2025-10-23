/**
 * patch-017 §5: Notification Service
 * Handles OS notifications for check additions via Electron API
 */

class NotificationService {
  constructor() {
    this.isElectron = window.electron && window.electron.notifications;
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchInterval = 60000; // 1 minute
    this.lastNotificationTime = 0;
    this.minNotificationInterval = 5000; // Минимум 5 секунд между уведомлениями
  }

  /**
   * Показать уведомление о новом чеке
   */
  notifyCheckAdded(check) {
    if (!this.isElectron) {
      console.log('[Notifications] Not in Electron, skipping');
      return;
    }

    // Проверяем настройки
    const settings = this.getNotificationSettings();
    if (!settings.enabled) {
      return;
    }

    // Проверяем тихие часы
    if (this.isQuietHours(settings)) {
      console.log('[Notifications] Quiet hours active');
      return;
    }

    // Добавляем в батч для минутной сводки
    if (settings.mode === 'batch') {
      this.addToBatch(check);
      return;
    }

    // Мгновенное уведомление (с троттлингом)
    if (settings.mode === 'instant') {
      const now = Date.now();
      if (now - this.lastNotificationTime < this.minNotificationInterval) {
        // Слишком частые уведомления - добавляем в батч
        this.addToBatch(check);
        return;
      }

      this.showInstantNotification(check);
      this.lastNotificationTime = now;
    }
  }

  /**
   * Мгновенное уведомление
   */
  showInstantNotification(check) {
    const title = '✅ Новый чек добавлен';
    const amount = Math.abs(check.amount || 0);
    const amountStr = amount.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const body = `${check.operator || 'Н/Д'} · ${amountStr} ${check.currency || 'UZS'}`;

    window.electron.notifications.show(title, body, {
      checkId: check.check_id || check.id,
      type: 'instant'
    });
  }

  /**
   * Добавить чек в батч для минутной сводки
   */
  addToBatch(check) {
    this.batchQueue.push(check);

    // Запускаем таймер если ещё не запущен
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchInterval);
    }
  }

  /**
   * Отправить батч-уведомление
   */
  flushBatch() {
    if (this.batchQueue.length === 0) {
      this.batchTimer = null;
      return;
    }

    const count = this.batchQueue.length;
    const totalAmount = this.batchQueue.reduce((sum, check) => {
      return sum + Math.abs(check.amount || 0);
    }, 0);

    const amountStr = totalAmount.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const title = `📊 Добавлено чеков: ${count}`;
    const body = `Общая сумма: ${amountStr} UZS\nНажмите для просмотра`;

    window.electron.notifications.show(title, body, {
      type: 'batch',
      count,
      totalAmount
    });

    // Очищаем батч
    this.batchQueue = [];
    this.batchTimer = null;
  }

  /**
   * Проверка тихих часов
   */
  isQuietHours(settings) {
    if (!settings.quietHoursEnabled) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = currentHour * 60 + now.getMinutes();

    const [startHour, startMin] = (settings.quietHoursStart || '23:00').split(':').map(Number);
    const [endHour, endMin] = (settings.quietHoursEnd || '07:00').split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Если диапазон переходит через полночь
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  /**
   * Получить настройки уведомлений из localStorage
   */
  getNotificationSettings() {
    try {
      const stored = localStorage.getItem('notification-settings');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }

    // Defaults
    return {
      enabled: true,
      mode: 'batch', // instant, batch, disabled
      quietHoursEnabled: false,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00'
    };
  }

  /**
   * Сохранить настройки уведомлений
   */
  saveNotificationSettings(settings) {
    try {
      localStorage.setItem('notification-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }

  /**
   * Инициализация (настройка обработчиков)
   */
  init(onNotificationClick) {
    if (!this.isElectron) {
      console.log('[Notifications] Not in Electron environment');
      return;
    }

    // Обработчик клика по уведомлению
    window.electron.notifications.onClick((data) => {
      console.log('[Notifications] Clicked:', data);
      if (onNotificationClick) {
        onNotificationClick(data);
      }
    });

    console.log('[Notifications] Service initialized');
  }

  /**
   * Очистка при размонтировании
   */
  cleanup() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.isElectron) {
      window.electron.notifications.removeClickListener();
    }
  }
}

// Singleton instance
const notificationService = new NotificationService();

export default notificationService;
