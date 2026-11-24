import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadVagasConfig(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const config = JSON.parse(raw);

  if (!Array.isArray(config.termosDeBusca) || config.termosDeBusca.length === 0) {
    throw new Error(`${filePath}: "termosDeBusca" precisa ser uma lista não vazia.`);
  }

  return config;
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Remoto vale de qualquer lugar; presencial e híbrido só na cidade configurada.
 * Vagas com modelo de trabalho desconhecido entram só se forem da cidade configurada.
 */
export function matchesLocation(job, local) {
  if (job.workplace === 'remoto') {
    return true;
  }

  const city = normalizeText(job.city);
  const state = normalizeText(job.state);
  const sameCity = city === normalizeText(local.cidade);
  const sameState = [normalizeText(local.estado), normalizeText(local.siglaEstado)].includes(state);

  return sameCity && (sameState || state === '');
}

export function hasExcludedTitleWord(title, excludedWords) {
  const words = new Set(normalizeText(title).split(/[^a-z0-9]+/).filter(Boolean));
  const normalizedTitle = ` ${normalizeText(title).replace(/[^a-z0-9]+/g, ' ')} `;

  return excludedWords.some((entry) => {
    const normalized = normalizeText(entry);
    return normalized.includes(' ') ? normalizedTitle.includes(` ${normalized} `) : words.has(normalized);
  });
}

export function isRecent(job, maxAgeDays, now = new Date()) {
  if (!job.publishedAt) {
    return true;
  }

  const published = new Date(job.publishedAt);
  if (Number.isNaN(published.getTime())) {
    return true;
  }

  return now.getTime() - published.getTime() <= maxAgeDays * DAY_MS;
}

export function dedupeById(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

/**
 * Aplica os filtros baratos (sem IA) e ordena da vaga mais recente para a mais antiga.
 */
export function filterJobs(jobs, config, now = new Date()) {
  const excludedTypes = new Set(config.tiposExcluidos ?? []);
  const excludedWords = config.palavrasExcluidasNoTitulo ?? [];

  return dedupeById(jobs)
    .filter((job) => !excludedTypes.has(job.type))
    .filter((job) => !hasExcludedTitleWord(job.title, excludedWords))
    .filter((job) => matchesLocation(job, config.local))
    .filter((job) => isRecent(job, config.diasMaximosDesdePublicacao ?? 7, now))
    .sort((a, b) => timestamp(b.publishedAt) - timestamp(a.publishedAt));
}

/**
 * O repositório é público: o histórico guarda um HMAC do id da vaga, e não o id em si,
 * para não expor em quais vagas o candidato está interessado.
 */
export function hashJobId(id, secret) {
  return createHmac('sha256', secret).update(id).digest('hex').slice(0, 32);
}

/**
 * Corta o texto no fim da última frase que cabe no limite, sem deixar frase pela metade.
 */
export function trimAtSentence(text, limit) {
  const clean = String(text ?? '').trim();
  if (clean.length <= limit) {
    return clean;
  }

  const slice = clean.slice(0, limit);
  const lastEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'), slice.endsWith('.') ? slice.length - 1 : -1);

  return lastEnd > limit * 0.5 ? slice.slice(0, lastEnd + 1).trim() : `${slice.slice(0, limit - 1).trimEnd()}…`;
}

export function workplaceLabel(job) {
  const sameName = normalizeText(job.city) === normalizeText(job.state);
  const place = (sameName ? [job.city] : [job.city, job.state]).filter(Boolean).join(' - ');

  switch (job.workplace) {
    case 'remoto':
      return 'Remoto';
    case 'hibrido':
      return place ? `Híbrido · ${place}` : 'Híbrido';
    case 'presencial':
      return place ? `Presencial · ${place}` : 'Presencial';
    default:
      return place || 'Local não informado';
  }
}

function timestamp(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}
