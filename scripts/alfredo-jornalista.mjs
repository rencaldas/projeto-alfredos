import { optionalEnv, requireEnv, sendTelegramMessage } from './telegram.mjs';

const DEFAULT_FEED_URL = 'https://tecnoblog.net/feed/';
const DEFAULT_LOOKBACK_MINUTES = 20;
const DEFAULT_MAX_ITEMS = 5;

const botToken = optionalEnv('TELEGRAM_NEWS_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const chatId = optionalEnv('TELEGRAM_NEWS_CHAT_ID', process.env.TELEGRAM_CHAT_ID);
const feedUrl = optionalEnv('RSS_FEED_URL', DEFAULT_FEED_URL);
const lookbackMinutes = Number(optionalEnv('NEWS_LOOKBACK_MINUTES', String(DEFAULT_LOOKBACK_MINUTES)));
const maxItems = Number(optionalEnv('NEWS_MAX_ITEMS', String(DEFAULT_MAX_ITEMS)));
const forceLatest = optionalEnv('FORCE_SEND_LATEST', 'false').toLowerCase() === 'true';

if (!botToken) {
  requireEnv('TELEGRAM_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('TELEGRAM_CHAT_ID');
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
const items = parseRssItems(xml)
  .map((item) => ({
    ...item,
    publishedAt: item.pubDate ? new Date(item.pubDate) : null
  }))
  .filter((item) => item.title && item.link && item.publishedAt && !Number.isNaN(item.publishedAt.valueOf()))
  .sort((a, b) => a.publishedAt - b.publishedAt);

const cutoff = Date.now() - lookbackMinutes * 60 * 1000;
const selectedItems = (forceLatest ? items.slice(-maxItems) : items.filter((item) => item.publishedAt.valueOf() >= cutoff).slice(-maxItems));

if (selectedItems.length === 0) {
  console.log(`Nenhuma noticia nova encontrada nos ultimos ${lookbackMinutes} minutos.`);
  process.exit(0);
}

for (const item of selectedItems) {
  const categories = item.categories.length > 0 ? item.categories.join(', ') : 'Sem categoria';
  const publishedDate = formatBrazilDateTime(item.publishedAt);
  const text = `${publishedDate}

Categoria: ${categories}

${item.title}

${item.contentSnippet}

Link para saber mais:
${item.link}`;

  await sendTelegramMessage({
    botToken,
    chatId,
    text
  });

  console.log(`Noticia enviada: ${item.title}`);
}

function parseRssItems(xmlText) {
  return collectBlocks(xmlText, 'item').map((block) => ({
    title: cleanText(readTag(block, 'title')),
    link: cleanText(readTag(block, 'link')),
    pubDate: cleanText(readTag(block, 'pubDate')),
    categories: readTags(block, 'category').map(cleanText).filter(Boolean),
    contentSnippet: summarizeHtml(readTag(block, 'description') || readTag(block, 'content:encoded'))
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
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
    hour12: false
  }).format(date);
}
