import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFeed } from '../scripts/feeds.mjs';
import { hasExcludedWord, normalizeUrl, stripFeedBoilerplate, stripTracking } from '../scripts/noticias.mjs';

test('lê itens de RSS 2.0 com CDATA e HTML escapado', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[PHP 8.5 &amp; você]]></title>
    <link>https://exemplo.com/post</link>
    <guid>https://exemplo.com/?p=1</guid>
    <pubDate>Mon, 23 Nov 2026 18:32:59 +0000</pubDate>
    <category>PHP</category>
    <description>&lt;p&gt;Nova &lt;b&gt;versão&lt;/b&gt; lançada&lt;/p&gt;</description>
  </item></channel></rss>`;

  const [item] = parseFeed(xml);
  assert.equal(item.title, 'PHP 8.5 & você');
  assert.equal(item.link, 'https://exemplo.com/post');
  assert.equal(item.id, 'https://exemplo.com/?p=1');
  assert.equal(item.summary, 'Nova versão lançada');
  assert.deepEqual(item.categories, ['PHP']);
  assert.equal(item.publishedAt.toISOString(), '2026-11-23T18:32:59.000Z');
});

test('lê entradas de Atom usando o link alternate', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>PHP 8.5.13 Released!</title>
    <id>http://php.net/releases/8_5_13</id>
    <updated>2026-11-19T14:00:00+00:00</updated>
    <link rel="enclosure" href="https://php.net/img.png"/>
    <link href="https://www.php.net/releases/8_5_13.php" rel="alternate" type="text/html"/>
    <category term="releases"/>
    <content type="html">Correções de segurança.</content>
  </entry></feed>`;

  const [item] = parseFeed(xml);
  assert.equal(item.title, 'PHP 8.5.13 Released!');
  assert.equal(item.link, 'https://www.php.net/releases/8_5_13.php');
  assert.deepEqual(item.categories, ['releases']);
  assert.equal(item.summary, 'Correções de segurança.');
});

test('a mesma matéria com e sem rastreamento vira o mesmo id', () => {
  assert.equal(
    normalizeUrl('https://www.infoq.com/news/2026/11/pando/?utm_source=feed&utm_medium=rss'),
    normalizeUrl('http://infoq.com/news/2026/11/pando')
  );
  assert.notEqual(normalizeUrl('https://site.com/a?id=1'), normalizeUrl('https://site.com/a?id=2'));
});

test('remove parâmetros de rastreamento sem mexer nos outros', () => {
  assert.equal(stripTracking('https://site.com/a?id=1&utm_source=x'), 'https://site.com/a?id=1');
});

test('remove o rodapé padrão do WordPress', () => {
  assert.equal(stripFeedBoilerplate('Resumo real. The post Título appeared first on The New Stack .'), 'Resumo real.');
});

test('palavras excluídas valem como palavra inteira, sem acento', () => {
  const words = ['promoção', 'cupom'];
  assert.equal(hasExcludedWord({ title: 'Promocao de notebook', link: '' }, words), true);
  assert.equal(hasExcludedWord({ title: 'Lista de cupons', link: '' }, words), false);
  assert.equal(hasExcludedWord({ title: 'Laravel 13 lançado', link: 'https://x.com/cupom/1' }, words), true);
});
