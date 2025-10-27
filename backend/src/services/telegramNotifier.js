const https = require('https');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHANNEL_ID = process.env.TG_CHANNEL_ID || '-1003237421931';

function ensureToken() {
  if (!TG_TOKEN) {
    console.warn('[telegramNotifier] TELEGRAM_BOT_TOKEN is not configured. Notifications skipped.');
    return false;
  }
  return true;
}

function callTelegram(method, payload) {
  if (!ensureToken()) {
    return null;
  }
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(payload).toString();
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TG_TOKEN}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyReceived({
  txId,
  source,
  raw,
  operator,
  last4,
  amount,
  currency,
  datetime
}) {
  const rawTruncated = escapeHtml((raw || '').slice(0, 2000));
  const html =
    `🧾 <b>Получена транзакция</b>\n` +
    `Источник: <code>${escapeHtml(source || '—')}</code>\n` +
    `Оператор: <code>${escapeHtml(operator || '—')}</code>\n` +
    `Карта: <code>•••• ${escapeHtml(last4 || '—')}</code>\n` +
    `Сумма: <code>${amount ?? '—'} ${escapeHtml(currency || '')}</code>\n` +
    `Время: <code>${escapeHtml(datetime || new Date().toISOString())}</code>\n\n` +
    `<b>Исходное сообщение</b>:\n<pre>${rawTruncated}</pre>\n\n#${escapeHtml(txId || 'pending')}  #source:${escapeHtml(source || 'unknown')}`;

  const response = await callTelegram('sendMessage', {
    chat_id: TG_CHANNEL_ID,
    parse_mode: 'HTML',
    disable_web_page_preview: 'true',
    text: html
  });
  return response?.result?.message_id || null;
}

function fmtType(raw = '') {
  const map = {
    debit: 'Списание',
    credit: 'Зачисление',
    p2p: 'Перевод',
    fee: 'Комиссия',
    refund: 'Возврат'
  };
  const value = String(raw || '').toLowerCase();
  return map[value] || raw || '—';
}

function fmtAmount(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return '—';
  }
  return num.toFixed(2);
}

function fmtDate(iso) {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
  } catch (error) {
    return iso;
  }
}

async function notifyProcessed({ notifyMessageId, tx }) {
  if (!tx) {
    return;
  }

  const lines = [
    '✅ <b>Обработано</b>',
    `Сумма: <code>${fmtAmount(tx.amount)} ${escapeHtml(tx.currency || '')}</code>`,
    `Тип: <code>${escapeHtml(fmtType(tx.transaction_type || tx.type))}</code>`
  ];

  if (tx.operator) {
    lines.push(`Оператор: <code>${escapeHtml(tx.operator)}</code>`);
  }

  if (tx.card_last4 || tx.cardLast4) {
    const last4 = tx.card_last4 || tx.cardLast4;
    lines.push(`Карта: <code>•••• ${escapeHtml(last4)}</code>`);
  }

  const datetime = tx.datetime || tx.datetime_utc || tx.datetime_iso;
  if (datetime) {
    lines.push(`Время: <code>${escapeHtml(fmtDate(datetime))}</code>`);
  }

  if (tx.source || tx.source_app) {
    lines.push(`Источник: <code>${escapeHtml(tx.source || tx.source_app)}</code>`);
  }

  const botRef = tx.source_bot_username
    ? `@${tx.source_bot_username}`
    : (tx.source_chat_id || tx.sourceChatId);
  if (botRef) {
    lines.push(`Чат: <code>${escapeHtml(botRef)}</code>`);
  }

  lines.push('', `#${escapeHtml(tx.check_id || tx.id || 'pending')}`);

  const html = lines.join('\n');

  if (notifyMessageId) {
    await callTelegram('editMessageText', {
      chat_id: TG_CHANNEL_ID,
      message_id: notifyMessageId,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
      text: html
    });
  } else {
    await callTelegram('sendMessage', {
      chat_id: TG_CHANNEL_ID,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
      text: html
    });
  }
}

async function notifyError({ notifyMessageId, txId, code, detail }) {
  const html =
    `⚠️ <b>Ошибка обработки</b>\n` +
    `Код: <code>${escapeHtml(code || 'UNKNOWN')}</code>\n` +
    `Детали: <pre>${escapeHtml((detail || '').slice(0, 1500))}</pre>\n` +
    `#${escapeHtml(txId || 'pending')}`;

  if (notifyMessageId) {
    await callTelegram('editMessageText', {
      chat_id: TG_CHANNEL_ID,
      message_id: notifyMessageId,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
      text: html
    });
  } else {
    await callTelegram('sendMessage', {
      chat_id: TG_CHANNEL_ID,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
      text: html
    });
  }
}

module.exports = {
  notifyReceived,
  notifyProcessed,
  notifyError
};
