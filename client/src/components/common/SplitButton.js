import React, { useState, useRef, useEffect } from 'react';
import './SplitButton.css';

/**
 * Split Button Component
 * Кнопка с двумя зонами: основная (слева) и стрелка (справа) для раскрытия меню
 *
 * @param {string} variant - Button style variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
 * @param {string} size - Button size: 'sm' | 'base' | 'lg'
 * @param {boolean} active - Active state (для toggle-кнопок)
 * @param {boolean} disabled - Disabled state
 * @param {React.ReactNode} children - Основное содержимое кнопки (левая часть)
 * @param {React.ReactNode} dropdownContent - Содержимое выпадающего меню
 * @param {function} onClick - Click handler для основной части кнопки
 * @param {function} onDropdownToggle - Callback при открытии/закрытии dropdown (опционально)
 * @param {string} className - Additional CSS classes
 * @param {string} title - Tooltip для основной части
 * @param {string} dropdownTitle - Tooltip для стрелки dropdown
 */
const SplitButton = ({
  variant = 'secondary',
  size = 'base',
  active = false,
  disabled = false,
  children,
  dropdownContent,
  onClick,
  onDropdownToggle,
  className = '',
  title,
  dropdownTitle,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Закрытие dropdown при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  // Закрытие dropdown при нажатии Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isDropdownOpen) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isDropdownOpen]);

  const handleDropdownToggle = (e) => {
    e.stopPropagation();
    const newState = !isDropdownOpen;
    setIsDropdownOpen(newState);
    if (onDropdownToggle) {
      onDropdownToggle(newState);
    }
  };

  const handleMainClick = (e) => {
    if (onClick && !disabled) {
      onClick(e);
    }
  };

  const variantClass = `split-btn-${variant}`;
  const sizeClass = size !== 'base' ? `split-btn-${size}` : '';
  const activeClass = active ? 'active' : '';
  const disabledClass = disabled ? 'disabled' : '';

  const classes = [
    'split-button',
    variantClass,
    sizeClass,
    activeClass,
    disabledClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} ref={buttonRef}>
      {/* Основная часть кнопки */}
      <button
        className="split-button-main"
        onClick={handleMainClick}
        disabled={disabled}
        title={title}
        type="button"
      >
        {children}
      </button>

      {/* Стрелка для dropdown */}
      <button
        className="split-button-dropdown"
        onClick={handleDropdownToggle}
        disabled={disabled}
        title={dropdownTitle || 'Показать меню'}
        type="button"
        aria-expanded={isDropdownOpen}
        aria-haspopup="true"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="split-button-arrow"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen && dropdownContent && (
        <div className="split-button-menu" ref={dropdownRef}>
          {dropdownContent}
        </div>
      )}
    </div>
  );
};

export default SplitButton;
