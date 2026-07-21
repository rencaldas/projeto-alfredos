const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_CAPTION_LIMIT = 1024;

export function requireEnv(name) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`A variavel de ambiente ${name} precisa estar configurada.`);
  }

  return value.trim();
}

export function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export function truncateText(text, limit = TELEGRAM_CAPTION_LIMIT) {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1)}…`;
}

function splitMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  const parts = [];
  let remaining = text;

  while (remaining.length > limit) {
    // Tenta quebrar na última quebra de linha
    let index = remaining.lastIndexOf('\n', limit);

    // Se não encontrar, tenta quebrar no último espaço
    if (index === -1) {
      index = remaining.lastIndexOf(' ', limit);
    }

    // Se ainda não encontrar, corta exatamente no limite
    if (index === -1) {
      index = limit;
    }

    parts.push(remaining.slice(0, index));
    remaining = remaining.slice(index).trimStart();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

async function telegramRequest(botToken, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.ok === false) {
    const description = result.description || response.statusText;
    throw new Error(`Telegram ${method} falhou: ${description}`);
  }

  return result;
}

export async function sendTelegramMessage({ botToken, chatId, text }) {
  const messages = splitMessage(text);

  for (const message of messages) {
    await telegramRequest(botToken, 'sendMessage', {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });
  }
}

export async function sendTelegramPhoto({ botToken, chatId, photoUrl, caption }) {
  return telegramRequest(botToken, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption: truncateText(caption, TELEGRAM_CAPTION_LIMIT),
    parse_mode: 'HTML'
  });
}
