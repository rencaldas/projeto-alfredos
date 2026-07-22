import { loadHistory, markSent, saveHistory, uniqueUnsent } from './history.mjs';
import { optionalEnv, requireEnv, sendTelegramMessage } from './telegram.mjs';

const DEFAULT_FEED_URL = 'https://tecnoblog.net/feed/';
const DEFAULT_MAX_ITEMS = 5;
const HISTORY_PATH = '.github/state/news-history.json';

const botToken = optionalEnv(
  'ALFREDO_NEWS_BOT_TOKEN',
  optionalEnv('TELEGRAM_NEWS_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)
);
const chatId = optionalEnv(
  'ALFREDO_NEWS_BOT_CHAT_ID',
  optionalEnv('TELEGRAM_NEWS_CHAT_ID', process.env.TELEGRAM_CHAT_ID)
);
const feedUrl = optionalEnv('RSS_FEED_URL', DEFAULT_FEED_URL);
const maxItems = Number(optionalEnv('NEWS_MAX_ITEMS', String(DEFAULT_MAX_ITEMS)));

if (!botToken) {
  requireEnv('ALFREDO_NEWS_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('ALFREDO_NEWS_BOT_CHAT_ID');
}

const response = await fetch(feedUrl, {
  headers: {
    'user-agent': 'Projeto Alfredo GitHub Actions RSS Bot'
  }
});

if (!response.ok) {
  throw new Error(`Falha ao buscar RSS (${response.status}): ${response.statusText}`);
}

const xml = await response.text();
const history = await loadHistory(HISTORY_PATH);
const items = parseRssItems(xml)
  .map((item) => ({
    ...item,
    publishedAt: item.pubDate ? new Date(item.pubDate) : null
  }))
  .filter((item) => item.id && item.title && item.link && item.publishedAt && !Number.isNaN(item.publishedAt.valueOf()))
  .sort((a, b) => a.publishedAt - b.publishedAt);

const selectedItems = uniqueUnsent(items, history, (item) => item.id).slice(0, maxItems);

if (selectedItems.length === 0) {
  await saveHistory(history);
  console.log('Nenhuma noticia inedita encontrada no RSS.');
  process.exit(0);
}

for (const item of selectedItems) {
  const publishedDate = formatBrazilDateTime(item.publishedAt);
  const text = `${item.title}

${item.contentSnippet}

${publishedDate}
Link para saber mais:
${item.link}`;

  await sendTelegramMessage({
    botToken,
    chatId,
    text
  });

  markSent(history, item.id);
  await saveHistory(history);
  console.log(`Noticia enviada: ${item.title}`);
}

function parseRssItems(xmlText) {
  return collectBlocks(xmlText, 'item').map((block) => ({
    title: cleanText(readTag(block, 'title')),
    link: cleanText(readTag(block, 'link')),
    guid: cleanText(readTag(block, 'guid')),
    pubDate: cleanText(readTag(block, 'pubDate')),
    categories: readTags(block, 'category').map(cleanText).filter(Boolean),
    contentSnippet: summarizeHtml(readTag(block, 'description') || readTag(block, 'content:encoded')),
    id: cleanText(readTag(block, 'guid')) || cleanText(readTag(block, 'link'))
  }));
}

function collectBlocks(xmlText, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  return Array.from(xmlText.matchAll(pattern), (match) => match[1]);
}

function readTag(block, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, 'i');
  return block.match(pattern)?.[1] || '';
}

function readTags(block, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, 'gi');
  return Array.from(block.matchAll(pattern), (match) => match[1]);
}

function summarizeHtml(value) {
  const text = stripHtml(decodeXml(unwrapCdata(value)))
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > 700 ? `${text.slice(0, 697)}...` : text;
}

function cleanText(value) {
  return decodeXml(unwrapCdata(value))
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBrazilDateTime(date) {
  const datePart = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(date);

  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
    hour12: false
  }).format(date);

  return `${datePart} às ${timePart}`;
}
