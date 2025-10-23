import React, { useState, useRef, useEffect } from 'react';
import Icon from '../icons/Icon';
import '../../styles/ColumnMenuButton.css';

/**
 * ColumnMenuButton - patch-010 §1
 * Кастомный компонент заголовка колонки с иконкой меню (три точки)
 * Иконка появляется только по ховеру
 */
const ColumnMenuButton = (props) => {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef(null);

  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setMenuOpen(!menuOpen);

    // Вызываем событие открытия меню колонки
    if (props.onMenuClick) {
      props.onMenuClick(props);
    }
  };

  const handleLabelClick = (event) => {
    if (!props?.column?.getColDef()?.sortable) {
      return;
    }

    const multiSort = event.shiftKey || event.ctrlKey || event.metaKey;
    if (typeof props.onSortRequested === 'function') {
      props.onSortRequested(null, multiSort);
    }
  };

  return (
    <div
      className="column-header-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="column-header-label"
        role="button"
        tabIndex={0}
        onClick={handleLabelClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleLabelClick(event);
          }
        }}
      >
        {props.displayName}
      </div>

      {/* Иконка меню - появляется только по ховеру */}
      {(isHovered || menuOpen) && (
        <button
          ref={buttonRef}
          className={`column-menu-button ${menuOpen ? 'active' : ''}`}
          onClick={handleMenuClick}
          title="Меню колонки"
        >
          <Icon name="more_vert" size={16} />
        </button>
      )}
    </div>
  );
};

export default ColumnMenuButton;
