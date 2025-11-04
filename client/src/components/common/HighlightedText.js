import React from 'react';
import { getHighlightedParts } from '../../utils/searchNormalization';

/**
 * Компонент для отображения текста с подсветкой совпадений
 *
 * @param {string} text - Текст для отображения
 * @param {string} searchQuery - Поисковый запрос для подсветки
 * @param {string} className - Дополнительные CSS классы
 */
const HighlightedText = ({ text, searchQuery, className = '' }) => {
  if (!searchQuery || !text) {
    return <span className={className}>{text}</span>;
  }

  const parts = getHighlightedParts(text, searchQuery);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.highlight) {
          return (
            <mark
              key={index}
              style={{
                backgroundColor: 'var(--color-accent-primary, #1976d2)',
                color: 'var(--color-text-inverse, #ffffff)',
                padding: '2px 4px',
                borderRadius: '2px',
                fontWeight: 600,
              }}
            >
              {part.text}
            </mark>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </span>
  );
};

export default HighlightedText;
