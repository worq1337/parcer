/**
 * patch-017 §5: Event Bus для OS уведомлений
 *
 * Используется для отправки событий от различных частей приложения
 * к SSE endpoint для push-уведомлений клиенту
 */

const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Увеличиваем лимит для множественных SSE подключений
  }

  /**
   * Отправить уведомление о новом чеке
   */
  emitCheckAdded(check, source) {
    this.emit('check:added', {
      type: 'check:added',
      timestamp: new Date().toISOString(),
      data: {
        id: check.id,
        row_num: check.row_num,
        amount: check.amount,
        currency: check.currency,
        operator: check.operator,
        card_last4: check.card_last4,
        date_display: check.date_display,
        time_display: check.time_display,
        source: source || check.source
      }
    });
  }

  /**
   * Отправить минутную сводку
   */
  emitMinuteSummary(summary) {
    this.emit('minute:summary', {
      type: 'minute:summary',
      timestamp: new Date().toISOString(),
      data: summary
    });
  }

  /**
   * Отправить уведомление об ошибке
   */
  emitError(error, context) {
    this.emit('error:occurred', {
      type: 'error:occurred',
      timestamp: new Date().toISOString(),
      data: {
        message: error.message,
        context
      }
    });
  }
}

// Singleton instance
const eventBus = new EventBus();

module.exports = eventBus;
