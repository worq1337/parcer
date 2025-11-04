import React, { useState, useEffect } from 'react';
import Icon from '../icons/Icon';
import './ImportPreviewModal.css';

/**
 * ImportPreviewModal - Модальное окно предпросмотра импорта операторов
 *
 * @param {Object} props
 * @param {File} props.file - Файл для импорта
 * @param {Array} props.currentOperators - Текущий список операторов
 * @param {Function} props.onConfirm - Callback при подтверждении импорта (importedOperators)
 * @param {Function} props.onCancel - Callback при отмене
 */
const ImportPreviewModal = ({ file, currentOperators, onConfirm, onCancel }) => {
  const [importedData, setImportedData] = useState(null);
  const [diff, setDiff] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);

        // Валидация структуры
        if (!Array.isArray(parsed)) {
          throw new Error('Файл должен содержать массив операторов');
        }

        // Проверка каждого оператора
        const invalidOps = parsed.filter(op =>
          !op.canonicalName || typeof op.canonicalName !== 'string'
        );

        if (invalidOps.length > 0) {
          throw new Error(`Найдены невалидные операторы (${invalidOps.length}). Каждый оператор должен иметь поле canonicalName.`);
        }

        setImportedData(parsed);

        // Вычисляем diff
        const computedDiff = computeDiff(currentOperators, parsed);
        setDiff(computedDiff);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Ошибка чтения файла');
      setLoading(false);
    };

    reader.readAsText(file);
  }, [file, currentOperators]);

  /**
   * Вычисляет diff между текущими и импортируемыми операторами
   */
  const computeDiff = (current, imported) => {
    const currentMap = new Map(current.map(op => [op.canonicalName.toLowerCase(), op]));
    const importedMap = new Map(imported.map(op => [op.canonicalName.toLowerCase(), op]));

    const added = [];
    const updated = [];
    const unchanged = [];

    // Проверяем импортируемые операторы
    imported.forEach(impOp => {
      const key = impOp.canonicalName.toLowerCase();
      const existing = currentMap.get(key);

      if (!existing) {
        added.push(impOp);
      } else {
        // Проверяем, изменился ли оператор
        const hasChanges =
          existing.appName !== impOp.appName ||
          existing.isP2P !== impOp.isP2P ||
          JSON.stringify(existing.synonyms) !== JSON.stringify(impOp.synonyms);

        if (hasChanges) {
          updated.push({ old: existing, new: impOp });
        } else {
          unchanged.push(impOp);
        }
      }
    });

    // Операторы, которые будут удалены (есть в current, но нет в imported)
    const deleted = current.filter(op =>
      !importedMap.has(op.canonicalName.toLowerCase())
    );

    return { added, updated, deleted, unchanged };
  };

  const handleConfirm = () => {
    if (importedData) {
      onConfirm(importedData);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="import-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Предпросмотр импорта</h2>
          <button className="btn-icon" onClick={onCancel} title="Закрыть (ESC)">
            <Icon name="close" size={24} />
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="import-loading">
              <Icon name="sync" size={32} className="spinning" />
              <p>Загрузка файла...</p>
            </div>
          )}

          {error && (
            <div className="import-error">
              <Icon name="error" size={32} />
              <p>{error}</p>
              <div className="format-hint">
                <h4>Ожидаемый формат:</h4>
                <pre>{`[
  {
    "canonicalName": "UZCARD",
    "appName": "UZCARD",
    "isP2P": false,
    "synonyms": ["uzcard", "uzc"]
  },
  ...
]`}</pre>
              </div>
            </div>
          )}

          {!loading && !error && diff && (
            <div className="import-diff">
              <div className="diff-stats">
                <div className="stat-item stat-added">
                  <Icon name="add_circle" size={20} />
                  <span className="stat-label">Добавлено:</span>
                  <span className="stat-value">{diff.added.length}</span>
                </div>
                <div className="stat-item stat-updated">
                  <Icon name="update" size={20} />
                  <span className="stat-label">Обновлено:</span>
                  <span className="stat-value">{diff.updated.length}</span>
                </div>
                <div className="stat-item stat-deleted">
                  <Icon name="remove_circle" size={20} />
                  <span className="stat-label">Удалено:</span>
                  <span className="stat-value">{diff.deleted.length}</span>
                </div>
                <div className="stat-item stat-unchanged">
                  <Icon name="check_circle" size={20} />
                  <span className="stat-label">Без изменений:</span>
                  <span className="stat-value">{diff.unchanged.length}</span>
                </div>
              </div>

              <div className="diff-details">
                {diff.added.length > 0 && (
                  <div className="diff-section">
                    <h4 className="diff-section-title">
                      <Icon name="add_circle" size={18} />
                      Будут добавлены ({diff.added.length})
                    </h4>
                    <div className="diff-list">
                      {diff.added.slice(0, 10).map((op, idx) => (
                        <div key={idx} className="diff-item diff-item-added">
                          <span className="operator-name">{op.canonicalName}</span>
                          <span className="operator-app">{op.appName}</span>
                          {op.isP2P && <span className="badge badge-p2p">P2P</span>}
                        </div>
                      ))}
                      {diff.added.length > 10 && (
                        <div className="diff-item-more">
                          ... и ещё {diff.added.length - 10}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {diff.updated.length > 0 && (
                  <div className="diff-section">
                    <h4 className="diff-section-title">
                      <Icon name="update" size={18} />
                      Будут обновлены ({diff.updated.length})
                    </h4>
                    <div className="diff-list">
                      {diff.updated.slice(0, 10).map((item, idx) => (
                        <div key={idx} className="diff-item diff-item-updated">
                          <div className="diff-change">
                            <span className="operator-name">{item.new.canonicalName}</span>
                            <div className="change-details">
                              {item.old.appName !== item.new.appName && (
                                <div className="change-field">
                                  <span className="field-label">App:</span>
                                  <span className="field-old">{item.old.appName}</span>
                                  <Icon name="arrow_forward" size={12} />
                                  <span className="field-new">{item.new.appName}</span>
                                </div>
                              )}
                              {item.old.isP2P !== item.new.isP2P && (
                                <div className="change-field">
                                  <span className="field-label">P2P:</span>
                                  <span className="field-old">{item.old.isP2P ? 'Да' : 'Нет'}</span>
                                  <Icon name="arrow_forward" size={12} />
                                  <span className="field-new">{item.new.isP2P ? 'Да' : 'Нет'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {diff.updated.length > 10 && (
                        <div className="diff-item-more">
                          ... и ещё {diff.updated.length - 10}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {diff.deleted.length > 0 && (
                  <div className="diff-section">
                    <h4 className="diff-section-title diff-warning">
                      <Icon name="warning" size={18} />
                      Будут удалены ({diff.deleted.length})
                    </h4>
                    <div className="diff-list">
                      {diff.deleted.slice(0, 10).map((op, idx) => (
                        <div key={idx} className="diff-item diff-item-deleted">
                          <span className="operator-name">{op.canonicalName}</span>
                          <span className="operator-app">{op.appName}</span>
                        </div>
                      ))}
                      {diff.deleted.length > 10 && (
                        <div className="diff-item-more">
                          ... и ещё {diff.deleted.length - 10}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            <Icon name="close" size={18} />
            <span>Отмена</span>
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={loading || error || !importedData}
          >
            <Icon name="check" size={18} />
            <span>Применить импорт</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal;
