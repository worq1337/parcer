import axios from 'axios';

const rawBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const API_BASE_URL = rawBaseUrl.replace(/\/$/, '');
const ROOT_BASE_URL = API_BASE_URL.endsWith('/api')
  ? API_BASE_URL.replace(/\/api$/, '')
  : API_BASE_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000  // 30 seconds timeout for slow connections
});

// Interceptor для обработки ошибок
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// ============ CHECKS API ============

export const checksAPI = {
  // Получить все чеки (можно передать updated_after для дельты)
  getAll: async (filters = {}, options = {}) => {
    const params = {};
    Object.keys(filters).forEach((key) => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        params[key] = filters[key];
      }
    });
    const response = await api.get('/checks', {
      params,
      signal: options.signal,
    });
    return response.data;
  },

  // Получить чек по ID
  getById: async (id) => {
    const response = await api.get(`/checks/${id}`);
    return response.data;
  },

  // Создать чек
  create: async (checkData) => {
    const response = await api.post('/checks', checkData);
    return response.data;
  },

  // Парсинг чека из текста
  parse: async (text) => {
    const response = await api.post('/checks/parse', { text });
    return response.data;
  },

  // Обновить чек
  update: async (id, checkData) => {
    const response = await api.put(`/checks/${id}`, checkData);
    return response.data;
  },

  // Удалить чек
  delete: async (id) => {
    const response = await api.delete(`/checks/${id}`);
    return response.data;
  }
};

// ============ OPERATORS API ============

export const operatorsAPI = {
  // Получить всех операторов
  getAll: async () => {
    const response = await api.get('/operators');
    return response.data;
  },

  // Получить оператора по ID
  getById: async (id) => {
    const response = await api.get(`/operators/${id}`);
    return response.data;
  },

  // Создать оператора
  create: async (operatorData) => {
    const response = await api.post('/operators', operatorData);
    return response.data;
  },

  // Обновить оператора
  update: async (id, operatorData) => {
    const response = await api.put(`/operators/${id}`, operatorData);
    return response.data;
  },

  // Удалить оператора
  delete: async (id) => {
    const response = await api.delete(`/operators/${id}`);
    return response.data;
  }
};

// ============ HEALTH CHECK ============

export const healthCheck = async () => {
  const response = await axios.get(`${ROOT_BASE_URL}/health`, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return response.data;
};

// ============ ADMIN API ============

export const adminAPI = {
  getQueue: async (filters = {}) => {
    const params = {};

    if (typeof filters.only_errors === 'boolean') {
      params.only_errors = filters.only_errors;
    }

    if (filters.source && filters.source !== 'all') {
      params.source = filters.source;
    }

    if (filters.from) {
      params.from = filters.from;
    }

    if (filters.to) {
      params.to = filters.to;
    }

    if (filters.q) {
      params.q = filters.q;
    }

    if (typeof filters.limit === 'number') {
      params.limit = filters.limit;
    }

    if (typeof filters.offset === 'number') {
      params.offset = filters.offset;
    }

    const response = await api.get('/admin/queue', { params });
    return response.data;
  },

  getQueueEvents: async (checkId) => {
    const response = await api.get(`/admin/queue/${checkId}/events`);
    return response.data;
  },

  requeueCheck: async (checkId) => {
    const response = await api.post(`/admin/queue/${checkId}/requeue`);
    return response.data;
  },

  getBackups: async () => {
    const response = await api.get('/admin/backup');
    return response.data;
  },

  createBackup: async () => {
    const response = await api.post('/admin/backup', {});
    return response.data;
  },

  restoreBackup: async (file) => {
    const formData = new FormData();
    formData.append('backup', file);

    const response = await api.post(
      '/admin/restore',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return response.data;
  },

  // patch-016 §8: Очистить все checks с автоматическим бэкапом
  clearChecks: async () => {
    const response = await api.post('/admin/clear-checks', {});
    return response.data;
  },

  // Найти дубликаты чеков (предпросмотр)
  getDuplicates: async (limit = 300) => {
    const response = await api.get('/admin/duplicates', { params: { limit } });
    return response.data;
  },

  // Очистить дубликаты чеков (оставляя по одному экземпляру)
  cleanDuplicates: async () => {
    const response = await api.post('/admin/duplicates/clean', {});
    return response.data;
  }
};

// ============ USERBOT API (patch-017 §4) ============

const USERBOT_BASE_URL = process.env.REACT_APP_USERBOT_URL || 'http://localhost:5001';

export const userbotAPI = {
  // Healthcheck
  health: async () => {
    const response = await axios.get(`${USERBOT_BASE_URL}/health`);
    return response.data;
  },

  // Получить статус userbot
  getStatus: async () => {
    const response = await axios.get(`${USERBOT_BASE_URL}/status`);
    return response.data;
  },

  // Логин (шаг 1: отправить код)
  login: async (phoneNumber, code = null, password = null) => {
    const response = await axios.post(`${USERBOT_BASE_URL}/login`, {
      phone_number: phoneNumber,
      code,
      password
    });
    return response.data;
  },

  // Запуск userbot
  start: async () => {
    const response = await axios.post(`${USERBOT_BASE_URL}/start`);
    return response.data;
  },

  // Остановка userbot
  stop: async () => {
    const response = await axios.post(`${USERBOT_BASE_URL}/stop`);
    return response.data;
  },

  // Выход (удаление session)
  logout: async () => {
    const response = await axios.post(`${USERBOT_BASE_URL}/logout`);
    return response.data;
  }
};

export default api;
