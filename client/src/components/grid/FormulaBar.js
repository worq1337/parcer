import React, { useState, useEffect } from 'react';
import Icon from '../icons/Icon';
import '../../styles/FormulaBar.css';

/**
 * Строка формул над таблицей
 * Согласно patch.md §5.2
 */
const FormulaBar = ({ activeCell, onFormulaChange, onFormulaSubmit }) => {
  const [formula, setFormula] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Обновляем формулу при изменении активной ячейки
  useEffect(() => {
    if (activeCell) {
      const cellFormula = activeCell.formula || activeCell.value || '';
      setFormula(cellFormula);
    } else {
      setFormula('');
    }
  }, [activeCell]);

  const handleFormulaChange = (e) => {
    const value = e.target.value;
    setFormula(value);
    if (onFormulaChange) {
      onFormulaChange(value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsEditing(false);
    if (onFormulaSubmit) {
      onFormulaSubmit(formula);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      // Восстановить исходное значение
      if (activeCell) {
        setFormula(activeCell.formula || activeCell.value || '');
      }
    }
  };

  const cellReference = activeCell
    ? `${activeCell.column}${activeCell.row}`
    : '';

  return (
    <div className="formula-bar">
      <div className="formula-bar-cell-ref">
        <span className="cell-reference">{cellReference || '—'}</span>
      </div>

      <div className="formula-bar-divider" />

      <div className="formula-bar-input-container">
        {formula && formula.startsWith('=') && (
          <Icon
            name="functions"
            size={16}
            color="var(--color-accent-primary)"
            className="formula-icon"
          />
        )}
        <input
          type="text"
          className="formula-input"
          value={formula}
          onChange={handleFormulaChange}
          onFocus={() => setIsEditing(true)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          placeholder={activeCell ? 'Введите значение или формулу (начиная с =)' : 'Выберите ячейку'}
          disabled={!activeCell}
        />
      </div>

      {isEditing && (
        <div className="formula-bar-actions">
          <button
            className="formula-action-button"
            onClick={handleSubmit}
            title="Применить (Enter)"
          >
            <Icon name="success" size={18} color="var(--status-success)" />
          </button>
          <button
            className="formula-action-button"
            onClick={() => {
              setIsEditing(false);
              if (activeCell) {
                setFormula(activeCell.formula || activeCell.value || '');
              }
            }}
            title="Отменить (Esc)"
          >
            <Icon name="cancel" size={18} color="var(--status-error)" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FormulaBar;
