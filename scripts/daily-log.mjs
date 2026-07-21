import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_RETENTION_DAYS = 30;
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Registra, de forma leve e versionada, o que cada Alfredo efetivamente enviou.
 * Os arquivos de historico (history.mjs) guardam apenas IDs para deduplicacao;
 * este modulo guarda title/summary/link com timestamp, para permitir montar
 * relatorios de "o que aconteceu hoje" a partir de dados reais dos agentes,
 * sem duplicar a logica de deduplicacao que ja existe em history.mjs.
 */

export async function loadDailyLog(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = raw.trim() === '' ? {} : JSON.parse(raw);
    const entries = normalizeEntries(parsed);

    return { filePath, entries, needsSave: false };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Log diario invalido em ${filePath}; recriando arquivo.`);
    }

    return { filePath, entries: [], needsSave: false };
  }
}

export function recordActivity(dailyLog, { agent, title, summary = '', link = '', meta = {} }) {
  if (!agent || !title) {
    return;
  }

  dailyLog.entries.push({
    agent,
    title: String(title).trim(),
    summary: String(summary || '').trim(),
    link: String(link || '').trim(),
    meta: meta || {},
    timestamp: new Date().toISOString()
  });

  dailyLog.needsSave = true;
}

export async function saveDailyLog(dailyLog, retentionDays = DEFAULT_RETENTION_DAYS) {
  if (!dailyLog.needsSave) {
    return;
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  dailyLog.entries = dailyLog.entries.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });

  await mkdir(dirname(dailyLog.filePath), { recursive: true });
  await writeFile(
    dailyLog.filePath,
    `${JSON.stringify({ entries: dailyLog.entries }, null, 2)}\n`,
    'utf8'
  );
  dailyLog.needsSave = false;
}

/** Retorna a data (America/Sao_Paulo) no formato YYYY-MM-DD. */
export function todayKey(date = new Date()) {
  return dateKeyInTimezone(date);
}

export function selectEntriesForDate(dailyLog, dateKey) {
  return dailyLog.entries.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp);
    if (!Number.isFinite(timestamp)) {
      return false;
    }

    return dateKeyInTimezone(new Date(timestamp)) === dateKey;
  });
}

function dateKeyInTimezone(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function normalizeEntries(parsed) {
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter(
    (entry) => entry && typeof entry === 'object' && entry.agent && entry.title && entry.timestamp
  );
}
