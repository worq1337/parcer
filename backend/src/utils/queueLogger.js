const QueueEvent = require('../models/QueueEvent');

const NORMALIZED_SOURCES = new Set(['telegram', 'sms', 'manual', 'import', 'api', 'ui', 'bot']);

const normalizeQueueSource = (source) => {
  if (!source) {
    return 'manual';
  }

  const asString = String(source).trim();
  if (!asString) {
    return 'manual';
  }

  const normalized = asString.toLowerCase();
  if (NORMALIZED_SOURCES.has(normalized)) {
    return normalized;
  }

  return 'manual';
};

const logQueueEvent = async (checkId, stage, source, options = {}) => {
  if (!checkId || !stage) {
    return;
  }

  try {
    await QueueEvent.create(
      checkId,
      stage,
      normalizeQueueSource(source),
      options
    );
  } catch (error) {
    console.error('Failed to log queue event:', error);
  }
};

module.exports = {
  logQueueEvent,
  normalizeQueueSource,
};
