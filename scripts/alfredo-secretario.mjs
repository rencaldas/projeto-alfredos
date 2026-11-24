import { loadHistory, markSent, saveHistory, wasSent } from './history.mjs';
import { optionalEnv, requireEnv, sendTelegramMessage } from './telegram.mjs';
import { generateStructuredReport } from './gemini.mjs';
import { searchGupyJobs } from './gupy.mjs';
import { filterJobs, hashJobId, loadVagasConfig, trimAtSentence, workplaceLabel } from './vagas.mjs';
import { sleep, withRetry } from './retry.mjs';

const CONFIG_PATH = 'config/vagas.json';
const HISTORY_PATH = '.github/state/secretario-vagas-history.json';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const TIMEZONE = 'America/Sao_Paulo';
const TELEGRAM_SAFE_LIMIT = 3900;
const SOBRE_VOCE_LIMIT = 1500;
const DESCRIPTION_CHARS_FOR_SCORING = 1200;
const DESCRIPTION_CHARS_FOR_TEXTS = 8000;
const PAUSE_BETWEEN_GEMINI_CALLS_MS = 4000;

const botToken = optionalEnv('ALFREDO_SECRETARIO_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const chatId = optionalEnv('ALFREDO_SECRETARIO_BOT_CHAT_ID', process.env.TELEGRAM_CHAT_ID);
const geminiApiKey = optionalEnv('ALFREDO_SECRETARIO_GEMINI_API_KEY', process.env.GEMINI_API_KEY);
const geminiModel = optionalEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL);
const perfil = optionalEnv('ALFREDO_SECRETARIO_PERFIL', '');
const dryRun = boolEnv('ALFREDO_SECRETARIO_DRY_RUN', false);

if (!botToken) requireEnv('ALFREDO_SECRETARIO_BOT_TOKEN');
if (!chatId) requireEnv('ALFREDO_SECRETARIO_BOT_CHAT_ID');
if (!geminiApiKey) requireEnv('ALFREDO_SECRETARIO_GEMINI_API_KEY');
if (!perfil) requireEnv('ALFREDO_SECRETARIO_PERFIL');

// O repositório é público: os logs mostram só contagens, nunca títulos, empresas ou textos gerados.
console.log(`[Alfredo Secretário] Iniciando busca de vagas. Modelo Gemini: ${geminiModel}.${dryRun ? ' (modo teste)' : ''}`);

const config = await loadVagasConfig(CONFIG_PATH);
const history = await loadHistory(HISTORY_PATH);
const historyKey = (job) => hashJobId(job.id, botToken);

try {
  await run();
} finally {
  if (!dryRun) {
    await saveHistory(history);
  }
}

// ---------- Fluxo principal ----------

async function run() {
  const found = await collectJobs();
  const unseen = filterJobs(found, config).filter((job) => !wasSent(history, historyKey(job)));
  const toEvaluate = unseen.slice(0, config.maxVagasParaAvaliar ?? 40);

  console.log(
    `[Alfredo Secretário] ${found.length} resultado(s) na busca, ${unseen.length} vaga(s) nova(s) após os filtros, ${toEvaluate.length} enviada(s) para avaliação.`
  );

  if (toEvaluate.length === 0) {
    await sendTelegram(buildIntroMessage({ evaluated: 0, good: [], detailed: [] }));
    return;
  }

  const scores = await scoreJobs(toEvaluate);
  const notaMinima = config.notaMinima ?? 7;
  const good = toEvaluate
    .map((job) => ({ job, ...(scores.get(job.id) ?? { nota: 0, motivo: 'Sem avaliação.' }) }))
    .filter((item) => item.nota >= notaMinima)
    .sort((a, b) => b.nota - a.nota);
  const detailed = good.slice(0, config.maxVagasComTextos ?? 5);
  const extras = good.slice(detailed.length);

  console.log(`[Alfredo Secretário] ${good.length} vaga(s) com nota >= ${notaMinima}. ${detailed.length} receberão textos.`);

  // Vagas avaliadas e descartadas não precisam ser avaliadas de novo amanhã.
  // As boas só entram no histórico depois que forem enviadas ao Telegram.
  const goodIds = new Set(good.map((item) => item.job.id));
  for (const job of toEvaluate) {
    if (!goodIds.has(job.id)) {
      markSent(history, historyKey(job));
    }
  }

  await sendTelegram(buildIntroMessage({ evaluated: toEvaluate.length, good, detailed }));

  for (const item of detailed) {
    const texts = await generateTextsSafely(item.job);
    await sendJobMessages(buildJobSections({ ...item, texts }));
    markSent(history, historyKey(item.job));
  }

  if (extras.length > 0) {
    await sendTelegram(buildExtrasMessage(extras));
    for (const item of extras) {
      markSent(history, historyKey(item.job));
    }
  }

  console.log('[Alfredo Secretário] Execução concluída.');
}

// A busca sem filtro devolve no máximo 100 vagas do Brasil inteiro, e as do Rio se perdem
// no meio. Por isso cada termo é buscado duas vezes: no estado configurado (presencial e
// híbrido, refinado por cidade nos filtros locais) e só remotas (qualquer lugar).
function searchScopes() {
  return [{ state: config.local.estado }, { workplaceType: 'remote' }];
}

async function collectJobs() {
  const results = [];
  let failures = 0;

  for (const term of config.termosDeBusca) {
    try {
      for (const filters of searchScopes()) {
        results.push(...(await searchGupyJobs({ term, limit: config.resultadosPorTermo ?? 50, filters })));
      }
    } catch (error) {
      failures += 1;
      console.warn(`[Alfredo Secretário] Busca de um termo falhou: ${error.message}`);
    }
  }

  if (failures === config.termosDeBusca.length) {
    throw new Error('Todas as buscas na Gupy falharam. Verifique se a API mudou ou está fora do ar.');
  }

  return results;
}

// ---------- Gemini: triagem ----------

async function scoreJobs(jobs) {
  const listing = jobs
    .map((job, index) =>
      [
        `### Vaga ${index + 1}`,
        `id: ${job.id}`,
        `Título: ${job.title}`,
        `Empresa: ${job.company}`,
        `Tipo: ${job.typeLabel}`,
        `Modelo/local: ${workplaceLabel(job)}`,
        `Descrição (trecho): ${job.description.slice(0, DESCRIPTION_CHARS_FOR_SCORING)}`
      ].join('\n')
    )
    .join('\n\n');

  const prompt = [
    'Você é um recrutador técnico experiente ajudando o candidato abaixo a decidir em quais vagas vale a pena se candidatar.',
    'Dê uma nota inteira de 0 a 10 de aderência para cada vaga, considerando nesta ordem:',
    '1. Se o candidato cumpre os requisitos obrigatórios com experiência que ESTÁ no perfil. Ferramenta ou tecnologia exigida como central (ex.: em nível avançado) que o perfil não cita derruba a nota para 4 ou menos.',
    '2. Se o nível é compatível com o momento do candidato. Vagas para profissionais experientes, pleno com muitos anos exigidos ou sênior recebem nota baixa.',
    '3. Se a vaga tem relação com o trabalho atual do candidato e com o objetivo de carreira descrito no perfil.',
    'Use apenas o que está escrito no perfil. Não presuma experiências que não estão lá.',
    'O "motivo" deve ter uma frase curta e direta, citando o principal ponto a favor ou contra.',
    'Responda exclusivamente no formato JSON do schema, avaliando todas as vagas, usando o mesmo "id" recebido.',
    '',
    '## Perfil do candidato',
    perfil,
    '',
    '## Vagas',
    listing
  ].join('\n');

  const schema = {
    type: 'OBJECT',
    properties: {
      avaliacoes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            nota: { type: 'INTEGER' },
            motivo: { type: 'STRING' }
          },
          required: ['id', 'nota', 'motivo']
        }
      }
    },
    required: ['avaliacoes']
  };

  const result = await generateStructuredReport({ apiKey: geminiApiKey, model: geminiModel, prompt, schema });
  const scores = new Map();

  for (const avaliacao of result.avaliacoes ?? []) {
    const nota = Math.max(0, Math.min(10, Number(avaliacao.nota) || 0));
    scores.set(String(avaliacao.id), { nota, motivo: String(avaliacao.motivo || '').trim() });
  }

  return scores;
}

// ---------- Gemini: textos da candidatura ----------

async function generateTextsSafely(job) {
  await sleep(PAUSE_BETWEEN_GEMINI_CALLS_MS);

  try {
    return await generateTexts(job);
  } catch (error) {
    console.warn(`[Alfredo Secretário] Não foi possível gerar os textos de uma vaga: ${error.message}`);
    return null;
  }
}

async function generateTexts(job) {
  const prompt = [
    'Você escreve textos de candidatura para o candidato abaixo, prontos para colar no formulário da vaga.',
    '',
    'Regras obrigatórias:',
    '- NUNCA invente. Use apenas fatos, ferramentas, números e experiências que estão no perfil. Não atribua ao candidato experiência com ferramentas que o perfil não cita, nem para "cobrir" um requisito da vaga.',
    '- Requisitos da vaga que o perfil não cobre ficam FORA dos textos e entram em "pontosDeAtencao".',
    '- Ajuste a ênfase à vaga: priorize as experiências do perfil que batem com as atribuições e omita o que não ajuda (ex.: detalhes de desenvolvimento numa vaga de suporte).',
    '- Não mencione o desejo de mudar de área se isso destoar da vaga.',
    '- Português do Brasil, registro profissional mas natural, sem clichês ("apaixonado por desafios", "sinergia") e sem exageros.',
    '- Prefira verbos que mostrem iniciativa ("criei", "assumi", "resolvi") quando o perfil sustentar isso.',
    '',
    'Campos:',
    '- "resumoProfissional": resumo para o currículo, entre 450 e 750 caracteres, em primeira pessoa sem usar "eu".',
    '- "areasDeInteresse": de 4 a 6 áreas separadas por vírgula, usando os termos da vaga quando forem compatíveis com o perfil.',
    `- "sobreVoce": resposta para "Fale sobre você e sua trajetória profissional, contando como pode ajudar a empresa no desafio descrito na vaga", em primeira pessoa, com no máximo 1400 caracteres contando espaços. Cite a empresa e o desafio da vaga e traga pelo menos um exemplo concreto do perfil, com número quando houver.`,
    '- "pontosDeAtencao": até 3 frases curtas sobre requisitos da vaga que o perfil não cobre (para estudar antes da entrevista) ou trechos dos textos que dependem de confirmação do candidato. Lista vazia se não houver nada.',
    '',
    'Responda exclusivamente no formato JSON do schema.',
    '',
    '## Perfil do candidato',
    perfil,
    '',
    '## Vaga',
    `Título: ${job.title}`,
    `Empresa: ${job.company}`,
    `Tipo: ${job.typeLabel}`,
    `Modelo/local: ${workplaceLabel(job)}`,
    'Descrição:',
    job.description.slice(0, DESCRIPTION_CHARS_FOR_TEXTS)
  ].join('\n');

  const schema = {
    type: 'OBJECT',
    properties: {
      resumoProfissional: { type: 'STRING' },
      areasDeInteresse: { type: 'STRING' },
      sobreVoce: { type: 'STRING' },
      pontosDeAtencao: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['resumoProfissional', 'areasDeInteresse', 'sobreVoce', 'pontosDeAtencao']
  };

  const result = await generateStructuredReport({ apiKey: geminiApiKey, model: geminiModel, prompt, schema });

  return {
    resumoProfissional: String(result.resumoProfissional || '').trim(),
    areasDeInteresse: String(result.areasDeInteresse || '').trim(),
    sobreVoce: trimAtSentence(result.sobreVoce, SOBRE_VOCE_LIMIT),
    pontosDeAtencao: (result.pontosDeAtencao ?? []).map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
  };
}

// ---------- Telegram ----------

function buildIntroMessage({ evaluated, good, detailed }) {
  const lines = ['🗂️ <b>Alfredo Secretário</b>', `<i>Vagas de ${formatDate(new Date())}</i>`, ''];

  if (evaluated === 0) {
    lines.push('Nenhuma vaga nova dentro dos filtros hoje.');
  } else if (good.length === 0) {
    lines.push(`Avaliei ${evaluated} vaga(s) nova(s), mas nenhuma atingiu a nota mínima de aderência hoje.`);
  } else {
    lines.push(
      `Avaliei ${evaluated} vaga(s) nova(s) e ${good.length} têm boa aderência com o seu perfil.`,
      `Seguem as ${detailed.length} melhores com os textos prontos. Toque no bloco para copiar.`
    );
  }

  return lines.join('\n');
}

function buildJobSections({ job, nota, motivo, texts }) {
  const header = [
    `💼 <b>${escapeHtml(job.title)}</b>`,
    `🏢 ${escapeHtml(job.company)}`,
    `📍 ${escapeHtml(workplaceLabel(job))}`,
    `🧾 ${escapeHtml(job.typeLabel)}${job.publishedAt ? ` · publicada em ${formatDate(new Date(job.publishedAt))}` : ''}`,
    `⭐ Aderência ${nota}/10: ${escapeHtml(motivo)}`,
    job.url ? `🔗 <a href="${escapeHtml(job.url)}">Abrir vaga</a>` : ''
  ]
    .filter(Boolean)
    .join('\n');

  if (!texts) {
    return [`${header}\n\n⚠️ Não consegui gerar os textos desta vaga hoje. Me mande o link para ajustar manualmente.`];
  }

  const sections = [header];

  if (texts.pontosDeAtencao.length > 0) {
    sections.push(['⚠️ <b>Antes de enviar</b>', ...texts.pontosDeAtencao.map((item) => `- ${escapeHtml(item)}`)].join('\n'));
  }

  sections.push(
    copyBlock('Resumo profissional', texts.resumoProfissional),
    copyBlock('Áreas de interesse', texts.areasDeInteresse),
    copyBlock(`Sobre você (${texts.sobreVoce.length} caracteres)`, texts.sobreVoce)
  );

  return sections;
}

function buildExtrasMessage(extras) {
  const lines = ['📌 <b>Outras vagas com boa aderência</b> (sem textos, para não estourar a cota do Gemini):', ''];

  for (const { job, nota } of extras) {
    const title = `${escapeHtml(job.title)} · ${escapeHtml(job.company)}`;
    lines.push(job.url ? `- ${nota}/10 <a href="${escapeHtml(job.url)}">${title}</a>` : `- ${nota}/10 ${title}`);
  }

  return lines.join('\n');
}

function copyBlock(title, text) {
  return `<b>${escapeHtml(title)}</b>\n<pre>${escapeHtml(text)}</pre>`;
}

/**
 * Manda a vaga numa mensagem só quando cabe; senão, uma mensagem por seção,
 * para nunca quebrar um bloco <pre> no meio (o que invalidaria o HTML do Telegram).
 */
async function sendJobMessages(sections) {
  const joined = sections.join('\n\n');

  if (joined.length <= TELEGRAM_SAFE_LIMIT) {
    await sendTelegram(joined);
    return;
  }

  for (const section of sections) {
    await sendTelegram(section);
  }
}

async function sendTelegram(text) {
  if (dryRun) {
    console.log(`\n----- [modo teste] mensagem do Telegram -----\n${text}\n`);
    return;
  }

  await withRetry(() => sendTelegramMessage({ botToken, chatId, text }), {
    retries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    // Token inválido, chat errado ou HTML malformado não se resolvem tentando de novo.
    shouldRetry: (error) => !/unauthorized|forbidden|bad request|chat not found/i.test(error.message),
    onRetry: ({ error, attempt, delay }) => {
      console.warn(`[Alfredo Secretário] Telegram: tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`);
    }
  });
}

// ---------- Utilitários ----------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TIMEZONE }).format(date);
}

function boolEnv(name, fallback) {
  const value = optionalEnv(name, '');
  if (!value) return fallback;
  return ['1', 'true', 'sim', 'yes'].includes(value.toLowerCase());
}
