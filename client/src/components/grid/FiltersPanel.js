import React, { useState } from 'react';
import { useFiltersStore } from '../../state/filtersStore';
import Icon from '../icons/Icon';
import SearchableDropdown from '../common/SearchableDropdown';
import { operatorsAPI } from '../../services/api';
import '../../styles/FiltersPanel.css';

/**
 * Единая панель фильтров
 * Согласно patch-003 §1 и patch-004 §1
 */
const FiltersPanel = ({ isOpen, onClose, scrollToSection }) => {
  const {
    p2pFilter,
    setP2PFilter,
    currencyFilter,
    setCurrencyFilter,
    dateFilter,
    setDateFilter,
    textFilters,
    updateTextFilter,
    numericFilters,
    updateNumericFilter,
    clearAllFilters,
    getActiveFiltersCount,
    saveFilterSet,
    savedFilterSets,
    loadFilterSet,
    deleteFilterSet,
  } = useFiltersStore();

  const [saveSetName, setSaveSetName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const contentRef = React.useRef(null);
  const [operatorsList, setOperatorsList] = React.useState([]);
  const [operatorsLoaded, setOperatorsLoaded] = React.useState(false);
  const [operatorsLoading, setOperatorsLoading] = React.useState(false);
  const [operatorsError, setOperatorsError] = React.useState(null);

  // Якорная навигация (patch-004)
  React.useEffect(() => {
    if (isOpen && scrollToSection && contentRef.current) {
      const section = contentRef.current.querySelector(`#filter-section-${scrollToSection}`);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [scrollToSection, isOpen]);

  // Лениво загружаем список операторов при первом открытии панели
  React.useEffect(() => {
    if (!isOpen || operatorsLoaded || operatorsLoading) {
      return;
    }

    let cancelled = false;

    const loadOperators = async () => {
      setOperatorsLoading(true);
      setOperatorsError(null);
      try {
        const response = await operatorsAPI.getAll();
        if (cancelled) return;
        const list = response?.data || [];
        setOperatorsList(list);
        setOperatorsLoaded(true);
      } catch (error) {
        if (cancelled) return;
        console.error('Ошибка загрузки операторов для фильтров:', error);
        setOperatorsError('Не удалось загрузить операторов');
      } finally {
        if (!cancelled) {
          setOperatorsLoading(false);
        }
      }
    };

    loadOperators();

    return () => {
      cancelled = true;
    };
  }, [isOpen, operatorsLoaded, operatorsLoading]);

  const operatorOptions = React.useMemo(() => {
    if (!operatorsList.length) {
      return [];
    }
    const uniquePatterns = Array.from(
      new Set(
        operatorsList
          .map((operator) => (operator.pattern || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

    return uniquePatterns.map((pattern) => ({
      value: pattern,
      label: pattern,
    }));
  }, [operatorsList]);

  const appOptions = React.useMemo(() => {
    if (!operatorsList.length) {
      return [];
    }
    const uniqueApps = Array.from(
      new Set(
        operatorsList
          .map((operator) => (operator.app_name || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

    return uniqueApps.map((app) => ({
      value: app,
      label: app,
    }));
  }, [operatorsList]);

  const operatorOptionsWithCurrent = React.useMemo(() => {
    const currentValue = textFilters?.operator || '';
    if (currentValue && !operatorOptions.some((option) => option.value === currentValue)) {
      return [{ value: currentValue, label: currentValue }, ...operatorOptions];
    }
    return operatorOptions;
  }, [operatorOptions, textFilters?.operator]);

  const appOptionsWithCurrent = React.useMemo(() => {
    const currentValue = textFilters?.app || '';
    if (currentValue && !appOptions.some((option) => option.value === currentValue)) {
      return [{ value: currentValue, label: currentValue }, ...appOptions];
    }
    return appOptions;
  }, [appOptions, textFilters?.app]);

  if (!isOpen) return null;

  // Обработчики для дней недели (patch-004 §1.3)
  const toggleWeekday = (day) => {
    const currentWeekdays = dateFilter?.weekdays || [];
    const newWeekdays = currentWeekdays.includes(day)
      ? currentWeekdays.filter(d => d !== day)
      : [...currentWeekdays, day].sort();
    setDateFilter({
      ...dateFilter,
      weekdays: newWeekdays.length > 0 ? newWeekdays : undefined
    });
  };


  const handleApply = () => {
    onClose();
  };

  const handleReset = () => {
    clearAllFilters();
  };

  const handleSaveSet = () => {
    if (saveSetName.trim()) {
      saveFilterSet(saveSetName, {
        p2pFilter,
        currencyFilter,
        dateFilter,
        textFilters,
        numericFilters,
      });
      setSaveSetName('');
      setShowSaveDialog(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleApply();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="filters-panel-overlay" onClick={onClose}>
      <div
        className="filters-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Заголовок с счётчиком активных фильтров (patch-004 §1.1) */}
        <div className="filters-panel-header">
          <div className="header-title">
            <h3>Фильтры</h3>
            {getActiveFiltersCount() > 0 && (
              <span className="active-count-badge">{getActiveFiltersCount()}</span>
            )}
          </div>
          <button
            className="filters-panel-close"
            onClick={onClose}
            title="Закрыть (Esc)"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Содержимое панели */}
        <div className="filters-panel-content" ref={contentRef}>
          {/* Сохранённые представления */}
          {savedFilterSets && savedFilterSets.length > 0 && (
            <section className="filter-section" id="filter-section-saved">
              <h4 className="filter-section-title">Мои представления</h4>
              <div className="saved-filter-sets">
                {savedFilterSets.map((set, index) => (
                  <div key={index} className="saved-filter-set-item">
                    <button
                      className="saved-filter-set-button"
                      onClick={() => {
                        loadFilterSet(index);
                        onClose();
                      }}
                      title={`Загрузить: ${set.name}`}
                    >
                      <Icon name="bookmark" size={16} />
                      <span>{set.name}</span>
                    </button>
                    <button
                      className="saved-filter-set-delete"
                      onClick={() => deleteFilterSet(index)}
                      title="Удалить"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 1. Быстрые переключатели */}
          <section className="filter-section" id="filter-section-quick">
            <h4 className="filter-section-title">Быстрые переключатели</h4>

            {/* P2P */}
            <div className="filter-group">
              <label className="filter-label">P2P:</label>
              <div className="button-group">
                <button
                  className={`filter-button ${p2pFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setP2PFilter('all')}
                >
                  Все
                </button>
                <button
                  className={`filter-button ${p2pFilter === 'p2p' ? 'active' : ''}`}
                  onClick={() => setP2PFilter('p2p')}
                >
                  Только P2P
                </button>
                <button
                  className={`filter-button ${p2pFilter === 'non_p2p' ? 'active' : ''}`}
                  onClick={() => setP2PFilter('non_p2p')}
                >
                  Без P2P
                </button>
              </div>
            </div>

            {/* Валюта */}
            <div className="filter-group">
              <label className="filter-label">Валюта:</label>
              <div className="button-group">
                <button
                  className={`filter-button ${currencyFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCurrencyFilter('all')}
                >
                  Все
                </button>
                <button
                  className={`filter-button ${currencyFilter === 'UZS' ? 'active' : ''}`}
                  onClick={() => setCurrencyFilter('UZS')}
                >
                  UZS
                </button>
                <button
                  className={`filter-button ${currencyFilter === 'USD' ? 'active' : ''}`}
                  onClick={() => setCurrencyFilter('USD')}
                >
                  USD
                </button>
              </div>
            </div>
          </section>

          {/* 2. Дата и время */}
          <section className="filter-section" id="filter-section-date">
            <h4 className="filter-section-title">Дата и время</h4>

            <div className="filter-group">
              <label className="filter-label">Период:</label>
              <div className="date-presets">
                <button
                  className={`filter-button ${dateFilter?.preset === 'today' ? 'active' : ''}`}
                  onClick={() => setDateFilter({ preset: 'today' })}
                >
                  Сегодня
                </button>
                <button
                  className={`filter-button ${dateFilter?.preset === 'yesterday' ? 'active' : ''}`}
                  onClick={() => setDateFilter({ preset: 'yesterday' })}
                >
                  Вчера
                </button>
                <button
                  className={`filter-button ${dateFilter?.preset === 'thisWeek' ? 'active' : ''}`}
                  onClick={() => setDateFilter({ preset: 'thisWeek' })}
                >
                  Эта неделя
                </button>
                <button
                  className={`filter-button ${dateFilter?.preset === 'thisMonth' ? 'active' : ''}`}
                  onClick={() => setDateFilter({ preset: 'thisMonth' })}
                >
                  Этот месяц
                </button>
                <button
                  className={`filter-button ${dateFilter?.preset === 'lastMonth' ? 'active' : ''}`}
                  onClick={() => setDateFilter({ preset: 'lastMonth' })}
                >
                  Прошлый месяц
                </button>
              </div>

              <div className="date-custom">
                <label className="filter-label-small">Произвольный:</label>
                <div className="date-inputs">
                  <input
                    type="date"
                    className="date-input"
                    value={dateFilter?.from || ''}
                    onChange={(e) =>
                      setDateFilter({
                        ...dateFilter,
                        preset: 'custom',
                        from: e.target.value,
                      })
                    }
                  />
                  <span>—</span>
                  <input
                    type="date"
                    className="date-input"
                    value={dateFilter?.to || ''}
                    onChange={(e) =>
                      setDateFilter({
                        ...dateFilter,
                        preset: 'custom',
                        to: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* patch-008 §5: Время */}
            <div className="filter-group">
              <label className="filter-label">Время:</label>
              <div className="time-filter">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={dateFilter?.ignoreTime || false}
                    onChange={(e) =>
                      setDateFilter({
                        ...dateFilter,
                        ignoreTime: e.target.checked,
                        timeFrom: e.target.checked ? undefined : dateFilter?.timeFrom,
                        timeTo: e.target.checked ? undefined : dateFilter?.timeTo,
                      })
                    }
                  />
                  <span>Игнорировать время</span>
                </label>
                {!dateFilter?.ignoreTime && (
                  <div className="time-inputs">
                    <select
                      className="time-select"
                      value={dateFilter?.timeFrom || ''}
                      onChange={(e) =>
                        setDateFilter({
                          ...dateFilter,
                          timeFrom: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">С:</option>
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                        <option key={hour} value={`${hour.toString().padStart(2, '0')}:00`}>
                          {hour.toString().padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                    <span>—</span>
                    <select
                      className="time-select"
                      value={dateFilter?.timeTo || ''}
                      onChange={(e) =>
                        setDateFilter({
                          ...dateFilter,
                          timeTo: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">До:</option>
                      {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                        <option key={hour} value={`${hour.toString().padStart(2, '0')}:00`}>
                          {hour.toString().padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* patch-008 §5: Дополнительно - Дни недели */}
            <details className="filter-advanced">
              <summary className="filter-label">Дополнительно</summary>
              <div className="filter-group">
                <label className="filter-label-small">Дни недели:</label>
                <div className="weekdays-selector">
                  {[
                    { day: 1, label: 'Пн' },
                    { day: 2, label: 'Вт' },
                    { day: 3, label: 'Ср' },
                    { day: 4, label: 'Чт' },
                    { day: 5, label: 'Пт' },
                    { day: 6, label: 'Сб' },
                    { day: 0, label: 'Вс' },
                  ].map(({ day, label }) => (
                    <button
                      key={day}
                      className={`weekday-button ${dateFilter?.weekdays?.includes(day) ? 'active' : ''}`}
                      onClick={() => toggleWeekday(day)}
                      title={label}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </details>

          </section>

          {/* 3. Текстовые фильтры */}
          <section className="filter-section" id="filter-section-text">
            <h4 className="filter-section-title">Текстовые поля</h4>

            <div className="filter-group">
              <label className="filter-label">Оператор:</label>
              <SearchableDropdown
                value={textFilters?.operator || ''}
                onChange={(value) => updateTextFilter('operator', value)}
                options={operatorOptionsWithCurrent}
                placeholder={operatorsLoading && operatorOptionsWithCurrent.length === 0
                  ? 'Загрузка...'
                  : 'Выберите оператора'}
                disabled={operatorsLoading && operatorOptionsWithCurrent.length === 0}
              />
              {operatorsError && (
                <span className="filter-hint filter-hint-error">{operatorsError}</span>
              )}
            </div>

            <div className="filter-group">
              <label className="filter-label">Приложение:</label>
              <SearchableDropdown
                value={textFilters?.app || ''}
                onChange={(value) => updateTextFilter('app', value)}
                options={appOptionsWithCurrent}
                placeholder={operatorsLoading && appOptionsWithCurrent.length === 0
                  ? 'Загрузка...'
                  : 'Выберите приложение'}
                disabled={operatorsLoading && appOptionsWithCurrent.length === 0}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Тип:</label>
              <select
                className="filter-select"
                value={textFilters?.transaction_type || 'all'}
                onChange={(e) =>
                  updateTextFilter('transaction_type', e.target.value)
                }
              >
                <option value="all">Все</option>
                <option value="Оплата">Оплата</option>
                <option value="Пополнение">Пополнение</option>
                <option value="Конверсия">Конверсия</option>
                <option value="E-Com">E-Com</option>
                <option value="Списание">Списание</option>
                <option value="Платёж">Платёж</option>
                <option value="Возврат">Возврат</option>
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Источник:</label>
              <select
                className="filter-select"
                value={textFilters?.source || 'all'}
                onChange={(e) =>
                  updateTextFilter('source', e.target.value)
                }
              >
                <option value="all">Все</option>
                <option value="Telegram">Telegram</option>
                <option value="SMS">SMS</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
          </section>

        </div>

        {/* Футер с кнопками */}
        <div className="filters-panel-footer">
          <div className="footer-left">
            {getActiveFiltersCount() > 0 && (
              <span className="active-filters-count">
                Активно фильтров: {getActiveFiltersCount()}
              </span>
            )}
          </div>
          <div className="footer-right">
            <button
              className="filter-action-button secondary"
              onClick={handleReset}
              title="Сбросить все фильтры"
            >
              Сбросить
            </button>
            <button
              className="filter-action-button secondary"
              onClick={() => setShowSaveDialog(true)}
              title="Сохранить набор фильтров"
            >
              Сохранить представление...
            </button>
            <button
              className="filter-action-button primary"
              onClick={handleApply}
              title="Применить фильтры (Enter)"
            >
              Применить
            </button>
          </div>
        </div>

        {/* Диалог сохранения представления */}
        {showSaveDialog && (
          <div className="save-dialog-overlay">
            <div className="save-dialog">
              <h4>Сохранить представление</h4>
              <input
                type="text"
                className="save-dialog-input"
                placeholder="Название представления"
                value={saveSetName}
                onChange={(e) => setSaveSetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveSet();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
                autoFocus
              />
              <div className="save-dialog-actions">
                <button
                  className="filter-action-button secondary"
                  onClick={() => setShowSaveDialog(false)}
                >
                  Отмена
                </button>
                <button
                  className="filter-action-button primary"
                  onClick={handleSaveSet}
                  disabled={!saveSetName.trim()}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FiltersPanel;
