import React from 'react';
import Icon from '../icons/Icon';
import './StatusIndicator.css';

/**
 * StatusIndicator - Индикатор статуса оператора
 *
 * @param {Object} props
 * @param {'mapped' | 'warning' | 'incomplete'} props.status - Статус оператора
 * @param {string} props.tooltip - Текст подсказки (опционально)
 * @param {string} props.className - Дополнительный CSS класс
 */
const StatusIndicator = ({ status, tooltip, className = '' }) => {
  // Определяем иконку и цвет в зависимости от статуса
  const getStatusConfig = () => {
    switch (status) {
      case 'mapped':
        return {
          icon: 'check_circle',
          color: 'var(--status-success, #4caf50)',
          defaultTooltip: 'Оператор сопоставлен с приложением',
        };
      case 'warning':
        return {
          icon: 'warning',
          color: 'var(--status-warning, #ff9800)',
          defaultTooltip: 'Отсутствуют синонимы',
        };
      case 'incomplete':
        return {
          icon: 'error',
          color: 'var(--status-error, #f44336)',
          defaultTooltip: 'Оператор не сопоставлен с приложением',
        };
      default:
        return {
          icon: 'help',
          color: 'var(--color-text-tertiary, #999999)',
          defaultTooltip: 'Неизвестный статус',
        };
    }
  };

  const config = getStatusConfig();
  const finalTooltip = tooltip || config.defaultTooltip;

  return (
    <span
      className={`status-indicator status-${status} ${className}`}
      title={finalTooltip}
      style={{ color: config.color }}
    >
      <Icon name={config.icon} size={16} />
    </span>
  );
};

export default StatusIndicator;
