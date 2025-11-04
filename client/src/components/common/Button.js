import React from 'react';
import '../../styles/Button.css';

/**
 * Unified Button Component
 * 
 * @param {string} variant - Button style variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'ghost'
 * @param {string} size - Button size: 'sm' | 'base' | 'lg'
 * @param {boolean} icon - Icon-only button (square shape)
 * @param {boolean} block - Full width button
 * @param {boolean} loading - Show loading spinner
 * @param {boolean} disabled - Disabled state
 * @param {React.ReactNode} children - Button content
 * @param {string} className - Additional CSS classes
 * @param {function} onClick - Click handler
 * @param {string} type - Button type: 'button' | 'submit' | 'reset'
 */
const Button = ({
  variant = 'secondary',
  size = 'base',
  icon = false,
  block = false,
  loading = false,
  disabled = false,
  children,
  className = '',
  onClick,
  type = 'button',
  ...rest
}) => {
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== 'base' ? `btn-${size}` : '';
  const iconClass = icon ? 'btn-icon' : '';
  const blockClass = block ? 'btn-block' : '';
  const loadingClass = loading ? 'btn-loading' : '';

  const classes = [
    'btn',
    variantClass,
    sizeClass,
    iconClass,
    blockClass,
    loadingClass,
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      {...rest}
    >
      {children}
    </button>
  );
};

/**
 * Button Group Component
 */
export const ButtonGroup = ({ attached = false, children, className = '' }) => {
  const classes = attached ? 'btn-group-attached' : 'btn-group';
  return (
    <div className={`${classes} ${className}`}>
      {children}
    </div>
  );
};

export default Button;
