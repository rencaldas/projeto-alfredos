import { test } from 'node:test';
import assert from 'node:assert/strict';

import { htmlToText, normalizeGupyJob } from '../scripts/gupy.mjs';
import { filterJobs, hasExcludedTitleWord, hashJobId, matchesLocation, trimAtSentence } from '../scripts/vagas.mjs';

const LOCAL = { cidade: 'Rio de Janeiro', estado: 'Rio de Janeiro', siglaEstado: 'RJ' };
const NOW = new Date('2026-11-23T12:00:00Z');

function job(overrides = {}) {
  return {
    id: 'gupy:1',
    title: 'Estagiário de TI',
    workplace: 'presencial',
    city: 'Rio de Janeiro',
    state: 'Rio de Janeiro',
    type: 'vacancy_type_internship',
    publishedAt: '2026-11-22T10:00:00Z',
    ...overrides
  };
}

test('remoto vale de qualquer cidade', () => {
  assert.equal(matchesLocation(job({ workplace: 'remoto', city: 'Recife', state: 'Pernambuco' }), LOCAL), true);
});

test('presencial e híbrido só valem no Rio de Janeiro', () => {
  assert.equal(matchesLocation(job({ workplace: 'hibrido', city: 'Rio de Janeiro', state: 'RJ' }), LOCAL), true);
  assert.equal(matchesLocation(job({ workplace: 'presencial', city: 'Niterói', state: 'Rio de Janeiro' }), LOCAL), false);
  assert.equal(matchesLocation(job({ workplace: 'hibrido', city: 'São Paulo', state: 'São Paulo' }), LOCAL), false);
});

test('palavras de senioridade no título são detectadas como palavra inteira, sem acento', () => {
  const words = ['senior', 'sr', 'tech lead'];
  assert.equal(hasExcludedTitleWord('Analista de Suporte Sênior', words), true);
  assert.equal(hasExcludedTitleWord('Analista Sr. de Sistemas', words), true);
  assert.equal(hasExcludedTitleWord('Tech Lead Backend', words), true);
  assert.equal(hasExcludedTitleWord('Estágio em Suporte de Sistemas', words), false);
});

test('filterJobs aplica tipo, título, local, idade, deduplica e ordena pela mais recente', () => {
  const config = {
    local: LOCAL,
    tiposExcluidos: ['vacancy_type_talent_pool'],
    palavrasExcluidasNoTitulo: ['senior'],
    diasMaximosDesdePublicacao: 7
  };

  const result = filterJobs(
    [
      job({ id: 'gupy:1', publishedAt: '2026-11-20T10:00:00Z' }),
      job({ id: 'gupy:1', publishedAt: '2026-11-20T10:00:00Z' }),
      job({ id: 'gupy:2', publishedAt: '2026-11-22T10:00:00Z', workplace: 'remoto', city: '' }),
      job({ id: 'gupy:3', type: 'vacancy_type_talent_pool' }),
      job({ id: 'gupy:4', title: 'Analista Sênior' }),
      job({ id: 'gupy:5', city: 'São Paulo', state: 'São Paulo' }),
      job({ id: 'gupy:6', publishedAt: '2026-10-01T10:00:00Z' })
    ],
    config,
    NOW
  );

  assert.deepEqual(result.map((item) => item.id), ['gupy:2', 'gupy:1']);
});

test('hashJobId é determinístico e não expõe o id', () => {
  const hash = hashJobId('gupy:12345', 'segredo');
  assert.equal(hash, hashJobId('gupy:12345', 'segredo'));
  assert.notEqual(hash, hashJobId('gupy:12345', 'outro-segredo'));
  assert.equal(hash.includes('12345'), false);
  assert.equal(hash.length, 32);
});

test('trimAtSentence respeita o limite sem cortar frase no meio', () => {
  const text = 'Primeira frase completa. Segunda frase completa. Terceira frase que não cabe no limite.';
  assert.equal(trimAtSentence(text, 200), text);
  assert.equal(trimAtSentence(text, 60), 'Primeira frase completa. Segunda frase completa.');
});

test('normalizeGupyJob converte o formato da API e limpa o HTML da descrição', () => {
  const normalized = normalizeGupyJob({
    id: 987,
    name: ' Estágio em Suporte ',
    careerPageName: 'Empresa X',
    description: '<p>Atender chamados</p><ul><li>GLPI &amp; Office</li></ul>',
    city: 'Rio de Janeiro',
    state: 'Rio de Janeiro',
    workplaceType: 'hybrid',
    type: 'vacancy_type_internship',
    publishedDate: '2026-11-22T10:00:00.000Z',
    jobUrl: 'https://empresa.gupy.io/jobs/987'
  });

  assert.equal(normalized.id, 'gupy:987');
  assert.equal(normalized.title, 'Estágio em Suporte');
  assert.equal(normalized.workplace, 'hibrido');
  assert.equal(normalized.typeLabel, 'Estágio');
  assert.equal(normalized.description, 'Atender chamados\nGLPI & Office');
  assert.equal(normalizeGupyJob({ id: 1 }), null);
});

test('htmlToText converte quebras e entidades', () => {
  assert.equal(htmlToText('Linha 1<br>Linha&nbsp;2'), 'Linha 1\nLinha 2');
});
