import { readFile } from 'node:fs/promises';
import { parseFeed, summarizeHtml } from './feeds.mjs';

const USER_AGENT = 'Projeto Alfredo GitHub Actions News Bot';
const FETCH_TIMEOUT_MS = 20000;
const HACKER_NEWS_API = 'https://hn.algolia.com/api/v1/search';

export async function loadNoticiasConfig(filePath) {
  const config = JSON.parse(await readFile(filePath, 'utf8'));

  if (!Array.isArray(config.fontes) || config.fontes.length === 0) {
    throw new Error(`${filePath} precisa ter ao menos uma fonte em "fontes".`);
  }

  return config;
}

/**
 * Busca todas as fontes em paralelo. Uma fonte fora do ar nao derruba as outras;
 * so falha se nenhuma responder.
 */
export async function collectNews(config, { now = new Date() } = {}) {
  const fontes = config.fontes.filter((fonte) => fonte.ativa !== false);
  const results = await Promise.allSettled(fontes.map((fonte) => fetchSource(fonte, config, now)));
  const items = [];
  let failures = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      failures += 1;
      console.warn(`[Alfredo Jornalista] Fonte "${fontes[index].nome}" falhou: ${result.reason?.message}`);
    }
  });

  if (failures === fontes.length) {
    throw new Error('Todas as fontes de notícias falharam.');
  }

  return items;
}

async function fetchSource(fonte, config, now) {
  const maxAgeMs = (config.horasMaximasDesdePublicacao ?? 48) * 60 * 60 * 1000;
  const since = new Date(now.valueOf() - maxAgeMs);
  const perSource = fonte.maxItens ?? config.maxItensPorFonte ?? 10;

  const items = fonte.tipo === 'hackernews'
    ? await fetchHackerNews(fonte, since)
    : await fetchFeed(fonte);

  return items
    .filter((item) => item.title && item.link && item.publishedAt && item.publishedAt >= since && item.publishedAt <= now)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, perSource)
    .map((item) => ({
      ...item,
      link: stripTracking(item.link),
      summary: stripFeedBoilerplate(item.summary),
      source: fonte.nome,
      id: newsId(item)
    }));
}

async function fetchFeed(fonte) {
  const xml = await fetchText(fonte.url);
  return parseFeed(xml, { summaryLimit: 600 });
}

async function fetchHackerNews(fonte, since) {
  const params = new URLSearchParams({
    tags: 'story',
    numericFilters: `points>=${fonte.pontosMinimos ?? 150},created_at_i>${Math.floor(since.valueOf() / 1000)}`,
    hitsPerPage: '50'
  });
  const payload = JSON.parse(await fetchText(`${HACKER_NEWS_API}?${params}`));
  const discussionUrl = (hit) => `https://news.ycombinator.com/item?id=${hit.objectID}`;

  return (payload.hits ?? [])
    .sort((a, b) => b.points - a.points)
    .map((hit) => ({
      title: hit.title,
      link: hit.url || discussionUrl(hit),
      discussionUrl: discussionUrl(hit),
      publishedAt: new Date(hit.created_at),
      summary: summarizeHtml(hit.story_text || '', 600),
      points: hit.points,
      comments: hit.num_comments,
      categories: []
    }));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Id usado no historico: o link normalizado. Assim a mesma materia vinda de duas fontes
 * (ex.: Hacker News e o blog oficial) e enviada uma vez so.
 */
export function newsId(item) {
  return normalizeUrl(item.link) || item.id;
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isTrackingParam(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.hostname.replace(/^www\./, '')}${path}${url.search}`.toLowerCase();
  } catch {
    return '';
  }
}

export function stripTracking(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (isTrackingParam(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

// Rodape padrao do WordPress ("The post X appeared first on Y."), que so repete o titulo.
export function stripFeedBoilerplate(value) {
  return String(value ?? '').replace(/\s*The post .+ appeared first on .+$/i, '').trim();
}

function isTrackingParam(key) {
  return /^(utm_|ref$|source$|fbclid$|gclid$)/i.test(key);
}

export function hasExcludedWord(item, words = []) {
  const text = normalizeText(`${item.title} ${item.link}`);
  return words.some((word) => new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizeText(word))}($|[^a-z0-9])`).test(text));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
