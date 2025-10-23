import React, { useRef, useEffect } from 'react';
import '../../styles/ColorPicker.css';
import { getCellColorOptions } from '../../constants/cellColors';

const ColorPicker = ({ selectedKey, onColorSelect, onClose, theme = 'light' }) => {
  const pickerRef = useRef(null);
  const palette = getCellColorOptions(theme);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        onClose && onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose && onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleColorClick = (colorOption) => {
    onColorSelect(colorOption.id);
    onClose && onClose();
  };

  return (
    <div className="color-picker" ref={pickerRef}>
      <div className="color-picker-title">Цвет фона ячейки</div>
      <div className="color-picker-grid">
        {palette.map((colorOption, index) => (
          <button
            key={index}
            className={`color-picker-swatch ${
              selectedKey === colorOption.id ? 'selected' : ''
            }`}
            style={{ backgroundColor: colorOption.preview }}
            onClick={() => handleColorClick(colorOption)}
            title={colorOption.name}
          >
            {selectedKey === colorOption.id && (
              <span className="color-picker-checkmark">✓</span>
            )}
            {colorOption.id === null && (
              <span className="color-picker-none-icon">∅</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ColorPicker;
