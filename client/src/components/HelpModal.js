import React, { useState, useEffect } from 'react';
import Icon from './icons/Icon';
import '../styles/HelpModal.css';

/**
 * Модальное окно справки по горячим клавишам (patch-006 §9)
 */
const HelpModal = ({ isOpen, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Закрытие по Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    {
      category: 'Навигация',
      items: [
        { keys: ['Enter'], description: 'Переход вниз' },
        { keys: ['Shift', 'Enter'], description: 'Переход вверх' },
        { keys: ['Tab'], description: 'Переход вправо' },
        { keys: ['Shift', 'Tab'], description: 'Переход влево' },
        { keys: ['Home'], description: 'Начало строки' },
        { keys: ['End'], description: 'Конец строки' },
        { keys: ['PgUp'], description: 'Страница вверх' },
        { keys: ['PgDn'], description: 'Страница вниз' },
        { keys: [cmdKey, 'Home'], description: 'Начало таблицы' },
        { keys: [cmdKey, 'End'], description: 'Конец таблицы' },
      ],
    },
    {
      category: 'Редактирование',
      items: [
        { keys: ['F2'], description: 'Редактировать ячейку' },
        { keys: ['Enter'], description: 'Сохранить и перейти вниз' },
        { keys: ['Esc'], description: 'Отменить редактирование' },
        { keys: [cmdKey, 'Z'], description: 'Отменить' },
        { keys: [cmdKey, 'Y'], description: 'Повторить' },
        { keys: [cmdKey, 'C'], description: 'Копировать' },
        { keys: [cmdKey, 'X'], description: 'Вырезать' },
        { keys: [cmdKey, 'V'], description: 'Вставить' },
        { keys: ['Del'], description: 'Удалить содержимое' },
      ],
    },
    {
      category: 'Выделение',
      items: [
        { keys: ['Shift', '↑↓←→'], description: 'Расширить выделение' },
        { keys: [cmdKey, 'Click'], description: 'Множественное выделение' },
        { keys: [cmdKey, 'A'], description: 'Выделить всё' },
        { keys: ['Shift', 'Space'], description: 'Выделить строку' },
        { keys: [cmdKey, 'Space'], description: 'Выделить столбец' },
      ],
    },
    {
      category: 'Формат и вид',
      items: [
        { keys: [cmdKey, 'Shift', 'F'], description: 'Открыть фильтры' },
        { keys: [cmdKey, 'Shift', 'D'], description: 'Переключить плотность' },
        { keys: [cmdKey, 'Alt', 'M'], description: 'Объединить ячейки' },
        { keys: [cmdKey, 'Alt', 'U'], description: 'Разъединить ячейки' },
        { keys: ['Alt', 'Dbl Click'], description: 'Авто-ширина всех колонок' },
        { keys: ['Dbl Click'], description: 'Авто-ширина колонки' },
      ],
    },
    {
      category: 'Файл и приложение',
      items: [
        { keys: [cmdKey, 'R'], description: 'Обновить данные' },
        { keys: [cmdKey, 'S'], description: 'Сохранить (автосохранение)' },
        { keys: [cmdKey, '/'], description: 'Эта справка' },
      ],
    },
  ];

  const filteredShortcuts = shortcuts.map(category => ({
    ...category,
    items: category.items.filter(item =>
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.keys.some(key => key.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
  })).filter(category => category.items.length > 0);

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h2>Горячие клавиши</h2>
          <button className="help-modal-close" onClick={onClose} title="Закрыть (Esc)">
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="help-modal-search">
          <Icon
            name="search"
            size={18}
            color="var(--color-text-secondary)"
          />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="help-modal-content">
          {filteredShortcuts.length === 0 ? (
            <div className="help-modal-empty">
              <Icon
                name="search"
                size={48}
                color="var(--color-border-primary)"
              />
              <p>Ничего не найдено</p>
            </div>
          ) : (
            filteredShortcuts.map((category, idx) => (
              <div key={idx} className="help-category">
                <h3>{category.category}</h3>
                <div className="help-shortcuts">
                  {category.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="help-shortcut">
                      <div className="help-keys">
                        {item.keys.map((key, keyIdx) => (
                          <React.Fragment key={keyIdx}>
                            <kbd>{key}</kbd>
                            {keyIdx < item.keys.length - 1 && <span className="help-plus">+</span>}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="help-description">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="help-modal-footer">
          <p>Совет: нажмите <kbd>{cmdKey}</kbd> + <kbd>/</kbd> для быстрого доступа к справке</p>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
