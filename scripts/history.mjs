import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_HISTORY_LIMIT = 5000;

export async function loadHistory(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = raw.trim() === '' ? [] : JSON.parse(raw);
    const sent = normalizeSent(parsed);

    return {
      filePath,
      sent,
      sentSet: new Set(sent),
      needsSave: !isCanonicalHistory(parsed, sent)
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Historico invalido em ${filePath}; recriando arquivo.`);
    }

    return {
      filePath,
      sent: [],
      sentSet: new Set(),
      needsSave: true
    };
  }
}

export function wasSent(history, id) {
  return history.sentSet.has(id);
}

export function uniqueUnsent(items, history, getId) {
  const seen = new Set();

  return items.filter((item) => {
    const id = getId(item);

    if (!id || seen.has(id) || wasSent(history, id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

export function markSent(history, id, limit = DEFAULT_HISTORY_LIMIT) {
  if (history.sentSet.has(id)) {
    return;
  }

  history.sent.push(id);
  history.sentSet.add(id);

  while (history.sent.length > limit) {
    const removed = history.sent.shift();
    history.sentSet.delete(removed);
  }

  history.needsSave = true;
}

export async function saveHistory(history) {
  if (!history.needsSave) {
    return;
  }

  await mkdir(dirname(history.filePath), { recursive: true });
  await writeFile(
    history.filePath,
    `${JSON.stringify({ sent: history.sent }, null, 2)}\n`,
    'utf8'
  );
  history.needsSave = false;
}

function normalizeSent(value) {
  const entries = Array.isArray(value) ? value : value?.sent;
  const sent = Array.isArray(entries) ? entries : [];
  const normalized = [];
  const seen = new Set();

  for (const entry of sent) {
    if (typeof entry !== 'string') {
      continue;
    }

    const id = entry.trim();
    if (!id || seen.has(id)) {
      continue;
    }

    normalized.push(id);
    seen.add(id);
  }

  return normalized.slice(-DEFAULT_HISTORY_LIMIT);
}

function isCanonicalHistory(value, sent) {
  return (
    value &&
    !Array.isArray(value) &&
    Array.isArray(value.sent) &&
    value.sent.length === sent.length &&
    value.sent.every((entry, index) => entry === sent[index])
  );
}
