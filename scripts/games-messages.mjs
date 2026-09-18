import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_RETENTION_DAYS = 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda, por jogo ja enviado pelo Alfredo Gamer, o(s) chatId/messageId da(s)
 * mensagem(ns) do Telegram e a data de termino da promocao (end_date da
 * GamerPower). O historico generico de deduplicacao (history.mjs) so guarda
 * um ID por item, o que basta para nao reenviar - mas nao da para voltar
 * numa mensagem ja mandada. Este modulo existe so para isso: permitir que,
 * quando a promocao de um jogo encerrar, o bot ache a(s) mensagem(ns)
 * correspondente(s) e apague ou edite a legenda.
 */

export async function loadGameMessages(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = raw.trim() === '' ? {} : JSON.parse(raw);
    const games = normalizeGames(parsed);

    return { filePath, games, needsSave: false };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Registro de mensagens invalido em ${filePath}; recriando arquivo.`);
    }

    return { filePath, games: {}, needsSave: false };
  }
}

export function recordGameMessages(store, gameId, { title, endDate, messages }) {
  if (!gameId || !Array.isArray(messages) || messages.length === 0) {
    return;
  }

  store.games[gameId] = {
    title: title || null,
    endDate: endDate || null,
    expiredNotifiedAt: null,
    messages: messages
      .filter((message) => message && message.chatId !== undefined && message.messageId !== undefined)
      .map((message) => ({ chatId: String(message.chatId), messageId: message.messageId }))
  };

  store.needsSave = true;
}

export function findNewlyExpiredGames(store, now = new Date()) {
  return Object.entries(store.games).filter(([, entry]) => {
    if (entry.expiredNotifiedAt) {
      return false;
    }

    const endDate = parseEndDate(entry.endDate);
    return endDate !== null && endDate.valueOf() <= now.valueOf();
  });
}

export function markExpiredNotified(store, gameId, now = new Date()) {
  const entry = store.games[gameId];
  if (!entry) {
    return;
  }

  entry.expiredNotifiedAt = now.toISOString();
  store.needsSave = true;
}

export async function saveGameMessages(store, retentionDays = DEFAULT_RETENTION_DAYS) {
  if (!store.needsSave) {
    return;
  }

  const cutoff = Date.now() - retentionDays * ONE_DAY_MS;
  for (const [gameId, entry] of Object.entries(store.games)) {
    if (entry.expiredNotifiedAt && Date.parse(entry.expiredNotifiedAt) < cutoff) {
      delete store.games[gameId];
    }
  }

  await mkdir(dirname(store.filePath), { recursive: true });
  await writeFile(store.filePath, `${JSON.stringify({ games: store.games }, null, 2)}\n`, 'utf8');
  store.needsSave = false;
}

function parseEndDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function normalizeGames(parsed) {
  const games = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.games : null;
  if (!games || typeof games !== 'object') {
    return {};
  }

  const normalized = {};
  for (const [gameId, entry] of Object.entries(games)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.messages)) {
      continue;
    }

    normalized[gameId] = {
      title: entry.title || null,
      endDate: entry.endDate || null,
      expiredNotifiedAt: entry.expiredNotifiedAt || null,
      messages: entry.messages
        .filter((message) => message && message.chatId !== undefined && message.messageId !== undefined)
        .map((message) => ({ chatId: String(message.chatId), messageId: message.messageId }))
    };
  }

  return normalized;
}
