import React, { useState } from 'react';
import '../styles/LicenseKeyModal.css';

const LicenseKeyModal = ({ onValidate }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!licenseKey.trim()) {
      setError('Введите лицензионный ключ');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/license/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ licenseKey: licenseKey.trim() })
      });

      const data = await response.json();

      if (data.success && data.valid) {
        // Сохраняем ключ в localStorage
        localStorage.setItem('licenseKey', licenseKey.trim());
        localStorage.setItem('licenseActivated', 'true');
        onValidate(true);
      } else {
        setError(data.error || 'Неверный лицензионный ключ');
      }
    } catch (error) {
      console.error('Ошибка проверки лицензии:', error);
      setError('Ошибка подключения к серверу. Проверьте интернет-соединение.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="license-modal-overlay">
      <div className="license-modal">
        <div className="license-modal-header">
          <h2>Активация программы</h2>
          <p>Введите лицензионный ключ для продолжения работы</p>
        </div>

        <form onSubmit={handleSubmit} className="license-form">
          <div className="license-input-group">
            <label htmlFor="licenseKey">Лицензионный ключ:</label>
            <input
              type="text"
              id="licenseKey"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="Введите ваш лицензионный ключ"
              className={error ? 'error' : ''}
              disabled={loading}
              autoFocus
            />
            {error && <div className="license-error">{error}</div>}
          </div>

          <button
            type="submit"
            className="license-submit-btn"
            disabled={loading}
          >
            {loading ? 'Проверка...' : 'Активировать'}
          </button>
        </form>

        <div className="license-footer">
          <p>Для получения лицензионного ключа обратитесь к администратору</p>
        </div>
      </div>
    </div>
  );
};

export default LicenseKeyModal;
