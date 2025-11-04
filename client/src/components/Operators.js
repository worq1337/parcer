import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useOperatorsStore } from '../state/operatorsStore';
import Icon from './icons/Icon';
import HighlightedText from './common/HighlightedText';
import StatusIndicator from './common/StatusIndicator';
import '../styles/Operators.css';

/**
 * Экран управления операторами
 * patch-008 §11: Операторы - структура и логика
 * patch-016 §6: ESC для закрытия
 */
const Operators = ({ onClose }) => {
  // patch-016 §6: Обработка ESC для закрытия
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const {
    loadOperators,
    operatorsLoaded,
    getFilteredOperators,
    getGroupedOperators,
    getUniqueApps,
    getP2PStats,
    getOperatorStatus,
    selectedOperator,
    editMode,
    searchQuery,
    filterByApp,
    filterByP2P,
    showUnknownOnly,
    groupByApp,
    expandedApps,
    setSearchQuery,
    setFilterByApp,
    setFilterByP2P,
    setShowUnknownOnly,
    setGroupByApp,
    toggleAppGroup,
    expandAllApps,
    collapseAllApps,
    clearFilters,
    selectOperator,
    startAddOperator,
    cancelEdit,
    saveOperator,
    deleteOperator,
    addSynonym,
    removeSynonym,
    exportDictionary,
    importDictionary,
  } = useOperatorsStore();

  // Загрузить операторов с сервера при монтировании компонента
  useEffect(() => {
    if (!operatorsLoaded) {
      loadOperators();
    }
  }, [operatorsLoaded, loadOperators]);

  const filteredOperators = useMemo(() => getFilteredOperators(), [
    getFilteredOperators,
    searchQuery,
    filterByApp,
    filterByP2P,
    showUnknownOnly,
  ]);

  const groupedOperators = useMemo(() => getGroupedOperators(), [
    getGroupedOperators,
    searchQuery,
    filterByApp,
    filterByP2P,
    showUnknownOnly,
  ]);

  const uniqueApps = useMemo(() => getUniqueApps(), [getUniqueApps]);

  const p2pStats = useMemo(() => getP2PStats(), [getP2PStats]);

  // Локальное состояние для редактирования
  const [formData, setFormData] = useState({
    canonicalName: '',
    appName: '',
    synonyms: [],
    isP2P: false,
  });

  const [newSynonym, setNewSynonym] = useState('');
  const [bulkSynonyms, setBulkSynonyms] = useState('');
  const [testText, setTestText] = useState('');
  const [matchedOperator, setMatchedOperator] = useState(null);

  // Когда выбирается оператор, обновляем форму
  React.useEffect(() => {
    if (selectedOperator) {
      setFormData({
        canonicalName: selectedOperator.canonicalName,
        appName: selectedOperator.appName,
        synonyms: selectedOperator.synonyms,
        isP2P: selectedOperator.isP2P,
      });
    } else {
      setFormData({
        canonicalName: '',
        appName: '',
        synonyms: [],
        isP2P: false,
      });
    }
  }, [selectedOperator]);

  const handleSave = async () => {
    if (!formData.canonicalName.trim()) {
      toast.error('Укажите основное название оператора');
      return;
    }

    if (!formData.appName.trim()) {
      toast.error('Укажите приложение');
      return;
    }

    try {
      await saveOperator({
        ...selectedOperator,
        ...formData,
      });

      toast.success(
        editMode === 'add' ? 'Оператор добавлен' : 'Оператор обновлён'
      );
    } catch (error) {
      toast.error(`Ошибка сохранения: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedOperator?.id) return;

    const confirmed = window.confirm(
      `Удалить оператора "${selectedOperator.canonicalName}"?`
    );

    if (!confirmed) return;

    try {
      await deleteOperator(selectedOperator.id);
      toast.success('Оператор удалён');
    } catch (error) {
      toast.error(`Ошибка удаления: ${error.message}`);
    }
  };

  const handleAddSynonym = () => {
    const synonym = newSynonym.trim();
    if (!synonym) return;

    if (formData.synonyms.includes(synonym)) {
      toast.warning('Такой синоним уже есть');
      return;
    }

    setFormData({
      ...formData,
      synonyms: [...formData.synonyms, synonym],
    });
    setNewSynonym('');
  };

  // patch-019 §5.2: Пакетное добавление синонимов
  const handleBulkAddSynonyms = () => {
    if (!bulkSynonyms.trim()) return;

    const newSynonyms = bulkSynonyms
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(syn => !formData.synonyms.includes(syn));

    if (newSynonyms.length === 0) {
      toast.warning('Все синонимы уже добавлены');
      return;
    }

    setFormData({
      ...formData,
      synonyms: [...formData.synonyms, ...newSynonyms],
    });
    setBulkSynonyms('');
    toast.success(`Добавлено синонимов: ${newSynonyms.length}`);
  };

  // patch-019 §5.2: Тест-бокс для проверки матчинга
  const handleTestMatch = () => {
    if (!testText.trim()) {
      setMatchedOperator(null);
      return;
    }

    const normalize = (str) => str.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedText = normalize(testText);

    // Ищем во всех операторах
    const allOperators = getFilteredOperators().length > 0
      ? getFilteredOperators()
      : filteredOperators;

    for (const operator of allOperators) {
      // Проверяем каноническое имя
      if (operator.canonicalName && normalizedText.includes(normalize(operator.canonicalName))) {
        setMatchedOperator(operator);
        return;
      }

      // Проверяем синонимы
      if (operator.synonyms && Array.isArray(operator.synonyms)) {
        for (const syn of operator.synonyms) {
          if (normalizedText.includes(normalize(syn))) {
            setMatchedOperator(operator);
            return;
          }
        }
      }
    }

    setMatchedOperator(null);
  };

  const handleRemoveSynonym = (synonym) => {
    setFormData({
      ...formData,
      synonyms: formData.synonyms.filter((s) => s !== synonym),
    });
  };

  const handleExport = () => {
    exportDictionary();
    toast.success('Словарь экспортирован');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const result = await importDictionary(file);
        toast.success(`Импортировано операторов: ${result.count}`);
      } catch (error) {
        toast.error(`Ошибка импорта: ${error.message}`);
      }
    };

    input.click();
  };

  return (
    <div className="operators-container">
      {/* Заголовок */}
      <div className="operators-header">
        <h2>Операторы</h2>
        <div className="operators-header-actions">
          <button className="btn-secondary" onClick={handleImport}>
            <Icon name="upload" size={18} />
            <span>Импорт</span>
          </button>
          <button className="btn-secondary" onClick={handleExport}>
            <Icon name="download" size={18} />
            <span>Экспорт</span>
          </button>
          <button className="btn-close" onClick={onClose}>
            <Icon name="close" size={24} />
          </button>
        </div>
      </div>

      <div className="operators-content">
        {/* Левая часть: поиск, фильтры, таблица */}
        <div className="operators-left">
          {/* Поиск и фильтры */}
          <div className="operators-search-bar">
            <div className="search-box">
              <Icon name="search" size={18} />
              <input
                type="text"
                className="search-input"
                placeholder="Поиск по названию или синониму..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery('')}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            <button className="btn-primary" onClick={startAddOperator}>
              <Icon name="add" size={18} />
              <span>Добавить оператора</span>
            </button>
          </div>

          {/* Фильтры */}
          <div className="operators-filters">
            {/* Переключатель режима группировки */}
            <button
              className={`btn-toggle ${groupByApp ? 'active' : ''}`}
              onClick={() => setGroupByApp(!groupByApp)}
              title={groupByApp ? 'Отключить группировку' : 'Включить группировку по приложениям'}
            >
              <Icon name={groupByApp ? 'view_list' : 'view_module'} size={18} />
              <span>{groupByApp ? 'Группировка' : 'Таблица'}</span>
            </button>

            {/* Кнопки развернуть/свернуть все (только в режиме группировки) */}
            {groupByApp && (
              <>
                <button
                  className="btn-text"
                  onClick={expandAllApps}
                  title="Развернуть все группы"
                >
                  <Icon name="unfold_more" size={18} />
                  <span>Развернуть все</span>
                </button>
                <button
                  className="btn-text"
                  onClick={collapseAllApps}
                  title="Свернуть все группы"
                >
                  <Icon name="unfold_less" size={18} />
                  <span>Свернуть все</span>
                </button>
              </>
            )}

            <div className="filters-divider" />

            <select
              className="filter-select"
              value={filterByApp || ''}
              onChange={(e) => setFilterByApp(e.target.value || null)}
            >
              <option value="">Все приложения</option>
              {uniqueApps.map((app) => (
                <option key={app} value={app}>
                  {app}
                </option>
              ))}
            </select>

            {/* Pill-кнопки для фильтра P2P */}
            <div className="pill-button-group">
              <button
                className={`pill-button ${filterByP2P === null ? 'active' : ''}`}
                onClick={() => setFilterByP2P(null)}
                title="Показать все операторы"
              >
                <span>Все</span>
                <span className="pill-count">{p2pStats.all}</span>
              </button>
              <button
                className={`pill-button ${filterByP2P === true ? 'active' : ''}`}
                onClick={() => setFilterByP2P(true)}
                title="Только P2P операторы"
              >
                <span>P2P</span>
                <span className="pill-count">{p2pStats.p2p}</span>
              </button>
              <button
                className={`pill-button ${filterByP2P === false ? 'active' : ''}`}
                onClick={() => setFilterByP2P(false)}
                title="Не P2P операторы"
              >
                <span>Не P2P</span>
                <span className="pill-count">{p2pStats.nonP2p}</span>
              </button>
            </div>

            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={showUnknownOnly}
                onChange={(e) => setShowUnknownOnly(e.target.checked)}
              />
              <span>Есть неизвестные синонимы</span>
            </label>

            {(searchQuery || filterByApp || filterByP2P !== null || showUnknownOnly) && (
              <button className="btn-text" onClick={clearFilters}>
                <Icon name="close" size={16} />
                <span>Очистить фильтры</span>
              </button>
            )}
          </div>

          {/* Таблица операторов или Accordion с группировкой */}
          <div className="operators-table-container">
            {!groupByApp ? (
              // Обычный режим - таблица
              <table className="operators-table">
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: '40px' }}>
                      <Icon name="info" size={16} title="Статус сопоставления" />
                    </th>
                    <th>Основное имя</th>
                    <th>Приложение</th>
                    <th className="text-center">P2P</th>
                    <th>Синонимы</th>
                    <th className="text-center">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOperators.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center text-muted">
                        Операторы не найдены
                      </td>
                    </tr>
                  ) : (
                    filteredOperators.map((operator) => (
                      <tr
                        key={operator.id}
                        className={
                          selectedOperator?.id === operator.id ? 'selected' : ''
                        }
                        onClick={() => selectOperator(operator)}
                      >
                        <td className="text-center">
                          <StatusIndicator status={getOperatorStatus(operator)} />
                        </td>
                        <td className="font-medium">
                          <HighlightedText text={operator.canonicalName} searchQuery={searchQuery} />
                        </td>
                        <td>{operator.appName}</td>
                        <td className="text-center">
                          {operator.isP2P ? (
                            <span className="badge badge-p2p">P2P</span>
                          ) : (
                            <span className="badge badge-regular">—</span>
                          )}
                        </td>
                        <td>
                          <div className="synonyms-chips">
                            {operator.synonyms.slice(0, 3).map((syn) => (
                              <span key={syn} className="chip">
                                {syn}
                              </span>
                            ))}
                            {operator.synonyms.length > 3 && (
                              <span className="chip chip-more">
                                +{operator.synonyms.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectOperator(operator);
                            }}
                            title="Редактировать"
                          >
                            <Icon name="edit" size={18} />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectOperator(operator);
                              handleDelete();
                            }}
                            title="Удалить"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              // Режим группировки - Accordion
              <div className="operators-accordion">
                {Object.keys(groupedOperators).length === 0 ? (
                  <div className="text-center text-muted" style={{ padding: '24px' }}>
                    Операторы не найдены
                  </div>
                ) : (
                  Object.keys(groupedOperators)
                    .sort()
                    .map((appName) => {
                      const operators = groupedOperators[appName];
                      const isExpanded = expandedApps[appName];

                      return (
                        <div key={appName} className="accordion-group">
                          {/* Заголовок группы */}
                          <div
                            className="accordion-header"
                            onClick={() => toggleAppGroup(appName)}
                          >
                            <Icon
                              name={isExpanded ? 'expand_more' : 'chevron_right'}
                              size={20}
                              className="accordion-icon"
                            />
                            <span className="accordion-title">{appName}</span>
                            <span className="accordion-count">({operators.length})</span>
                          </div>

                          {/* Содержимое группы */}
                          {isExpanded && (
                            <div className="accordion-content">
                              {operators.map((operator) => (
                                <div
                                  key={operator.id}
                                  className={`operator-card ${
                                    selectedOperator?.id === operator.id ? 'selected' : ''
                                  }`}
                                  onClick={() => selectOperator(operator)}
                                >
                                  <div className="operator-card-header">
                                    <StatusIndicator status={getOperatorStatus(operator)} />
                                    <span className="operator-name">
                                      <HighlightedText text={operator.canonicalName} searchQuery={searchQuery} />
                                    </span>
                                    {operator.isP2P && (
                                      <span className="badge badge-p2p">P2P</span>
                                    )}
                                  </div>

                                  <div className="operator-card-body">
                                    <div className="synonyms-chips">
                                      {operator.synonyms.slice(0, 5).map((syn) => (
                                        <span key={syn} className="chip">
                                          {syn}
                                        </span>
                                      ))}
                                      {operator.synonyms.length > 5 && (
                                        <span className="chip chip-more">
                                          +{operator.synonyms.length - 5}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="operator-card-actions">
                                    <button
                                      className="btn-icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectOperator(operator);
                                      }}
                                      title="Редактировать"
                                    >
                                      <Icon name="edit" size={16} />
                                    </button>
                                    <button
                                      className="btn-icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectOperator(operator);
                                        handleDelete();
                                      }}
                                      title="Удалить"
                                    >
                                      <Icon name="delete" size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </div>

          <div className="operators-footer">
            Всего операторов: {filteredOperators.length}
          </div>
        </div>

        {/* Правая часть: панель редактирования */}
        {editMode && (
          <div className="operators-right">
            <div className="edit-panel">
              <div className="edit-panel-header">
                <h3>
                  {editMode === 'add'
                    ? 'Добавить оператора'
                    : 'Редактировать оператора'}
                </h3>
                <button className="btn-icon" onClick={cancelEdit}>
                  <Icon name="close" size={20} />
                </button>
              </div>

              <div className="edit-panel-body">
                {/* Основное имя */}
                <div className="form-group">
                  <label>Основное название</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Например: SQB"
                    value={formData.canonicalName}
                    onChange={(e) =>
                      setFormData({ ...formData, canonicalName: e.target.value })
                    }
                  />
                </div>

                {/* Приложение */}
                <div className="form-group">
                  <label>Приложение</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Например: SQB Mobile"
                    list="apps-datalist"
                    value={formData.appName}
                    onChange={(e) =>
                      setFormData({ ...formData, appName: e.target.value })
                    }
                  />
                  <datalist id="apps-datalist">
                    {uniqueApps.map((app) => (
                      <option key={app} value={app} />
                    ))}
                  </datalist>
                </div>

                {/* P2P */}
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.isP2P}
                      onChange={(e) =>
                        setFormData({ ...formData, isP2P: e.target.checked })
                      }
                    />
                    <span>P2P оператор</span>
                  </label>
                </div>

                {/* Синонимы */}
                <div className="form-group">
                  <label>Синонимы</label>
                  <div className="synonyms-input">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Добавить синоним..."
                      value={newSynonym}
                      onChange={(e) => setNewSynonym(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSynonym();
                        }
                      }}
                    />
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleAddSynonym}
                    >
                      <Icon name="add" size={16} />
                    </button>
                  </div>

                  <div className="synonyms-list">
                    {formData.synonyms.map((syn) => (
                      <div key={syn} className="synonym-item">
                        <span>{syn}</span>
                        <button
                          className="btn-icon-sm"
                          onClick={() => handleRemoveSynonym(syn)}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* patch-019 §5.2: Пакетное добавление синонимов */}
                <div className="form-group">
                  <label>Пакетная вставка (по одному в строке)</label>
                  <textarea
                    className="form-textarea"
                    placeholder="UZUMBANK&#10;UZUM BANK&#10;VISAUZUM&#10;..."
                    rows={5}
                    value={bulkSynonyms}
                    onChange={(e) => setBulkSynonyms(e.target.value)}
                  />
                  <button
                    className="btn-secondary btn-sm"
                    onClick={handleBulkAddSynonyms}
                    disabled={!bulkSynonyms.trim()}
                  >
                    <Icon name="add" size={16} />
                    <span>Добавить все ({bulkSynonyms.split('\n').filter(Boolean).length})</span>
                  </button>
                </div>

                {/* patch-019 §5.2: Тест-бокс для проверки матчинга */}
                <div className="form-group">
                  <label>Тест матчинга</label>
                  <p className="text-muted text-sm">
                    Вставьте текст чека для проверки, какой оператор сработает:
                  </p>
                  <textarea
                    className="form-textarea"
                    placeholder="Вставьте текст чека...&#10;Например: Spisanie, karta ****1116: 3000000.00 UZS, UZUMBANK VISAUZUM to HUMO, UZ"
                    rows={4}
                    value={testText}
                    onChange={(e) => {
                      setTestText(e.target.value);
                      // Автоматический тест при вводе
                      if (e.target.value.trim().length > 3) {
                        handleTestMatch();
                      }
                    }}
                  />
                  {testText.trim() && (
                    <div className={`test-result ${matchedOperator ? 'match' : 'no-match'}`}>
                      {matchedOperator ? (
                        <>
                          <Icon name="check" size={18} />
                          <span>
                            <strong>Сработает:</strong> {matchedOperator.canonicalName} ({matchedOperator.appName})
                            {matchedOperator.isP2P && <span className="badge badge-p2p ml-2">P2P</span>}
                          </span>
                        </>
                      ) : (
                        <>
                          <Icon name="close" size={18} />
                          <span>Не распознан. Добавьте нужный синоним.</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="edit-panel-footer">
                <button className="btn-secondary" onClick={cancelEdit}>
                  Отмена
                </button>
                <button className="btn-primary" onClick={handleSave}>
                  <Icon name="save" size={18} />
                  <span>Сохранить</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Operators;
