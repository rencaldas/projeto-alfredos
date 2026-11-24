/**
 * Parser minimo de RSS 2.0 e Atom, sem dependencias.
 * Devolve itens normalizados: { id, title, link, publishedAt, summary, categories }.
 */
export function parseFeed(xmlText, { summaryLimit = 700 } = {}) {
  const isAtom = /<feed\b/i.test(xmlText) && !/<rss\b/i.test(xmlText);
  return isAtom ? parseAtom(xmlText, summaryLimit) : parseRss(xmlText, summaryLimit);
}

function parseRss(xmlText, summaryLimit) {
  return collectBlocks(xmlText, 'item').map((block) => {
    const link = cleanText(readTag(block, 'link'));
    const guid = cleanText(readTag(block, 'guid'));

    return {
      id: guid || link,
      title: cleanText(readTag(block, 'title')),
      link,
      publishedAt: parseDate(readTag(block, 'pubDate') || readTag(block, 'dc:date')),
      summary: summarizeHtml(readTag(block, 'description') || readTag(block, 'content:encoded'), summaryLimit),
      categories: readTags(block, 'category').map(cleanText).filter(Boolean)
    };
  });
}

function parseAtom(xmlText, summaryLimit) {
  return collectBlocks(xmlText, 'entry').map((block) => {
    const link = readAtomLink(block);

    return {
      id: cleanText(readTag(block, 'id')) || link,
      title: cleanText(readTag(block, 'title')),
      link,
      publishedAt: parseDate(readTag(block, 'published') || readTag(block, 'updated')),
      summary: summarizeHtml(readTag(block, 'summary') || readTag(block, 'content'), summaryLimit),
      categories: Array.from(block.matchAll(/<category\b[^>]*\bterm="([^"]*)"/gi), (match) => cleanText(match[1])).filter(Boolean)
    };
  });
}

function readAtomLink(block) {
  const links = Array.from(block.matchAll(/<link\b([^>]*)\/?>/gi), (match) => match[1]);
  const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1];
  const alternate = links.find((attrs) => !attr(attrs, 'rel') || attr(attrs, 'rel') === 'alternate');
  return cleanText(attr(alternate ?? links[0] ?? '', 'href') ?? '');
}

function parseDate(value) {
  const text = cleanText(value || '');
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date;
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

export function summarizeHtml(value, limit = 700) {
  // O conteudo vem escapado dentro do XML: decodifica uma vez para virar HTML, remove as tags
  // e decodifica de novo para resolver as entidades do proprio texto.
  const text = decodeXml(stripHtml(decodeXml(unwrapCdata(value || ''))))
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function cleanText(value) {
  return decodeXml(unwrapCdata(value || ''))
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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
