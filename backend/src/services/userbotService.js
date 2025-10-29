const USERBOT_SERVICE_URL = process.env.USERBOT_SERVICE_URL || 'http://userbot:5001';

async function fetchJson(path, options = {}) {
  const url = `${USERBOT_SERVICE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Userbot service error ${response.status}: ${text}`);
  }

  return response.json();
}

async function getMessageText(chatId, messageId) {
  if (!chatId || !messageId) {
    throw new Error('chatId and messageId are required');
  }

  const result = await fetchJson('/message-text', {
    method: 'POST',
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId
    })
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to load message text');
  }

  return result.text;
}

async function getChatMeta(chatId) {
  if (!chatId) {
    throw new Error('chatId is required');
  }

  const result = await fetchJson('/chat-meta', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chatId })
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to load chat meta');
  }

  return result.meta || {};
}

async function getStatus() {
  try {
    return await fetchJson('/status');
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  getMessageText,
  getChatMeta,
  getStatus
};
