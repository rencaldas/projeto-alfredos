import { loadHistory, markSent, saveHistory, wasSent } from './history.mjs';
import { loadDailyLog, selectEntriesForDate, todayKey } from './daily-log.mjs';
import { optionalEnv, requireEnv, sendTelegramMessage } from './telegram.mjs';
import { generateStructuredReport } from './gemini.mjs';
import { sendReportEmail } from './mailer.mjs';
import { withRetry } from './retry.mjs';

const DAILY_LOG_PATH = '.github/state/daily-log.json';
const SECRETARIO_HISTORY_PATH = '.github/state/secretario-history.json';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_EMAIL_TO = 'renato.deacaldas@gmail.com';
const MAX_ITEMS_PER_AGENT_IN_PROMPT = 40;
const TIMEZONE = 'America/Sao_Paulo';

const botToken = optionalEnv('ALFREDO_SECRETARIO_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const chatId = optionalEnv('ALFREDO_SECRETARIO_BOT_CHAT_ID', process.env.TELEGRAM_CHAT_ID);
const geminiApiKey = optionalEnv('ALFREDO_SECRETARIO_GEMINI_API_KEY', process.env.GEMINI_API_KEY);
const geminiModel = optionalEnv('GEMINI_MODEL', DEFAULT_GEMINI_MODEL);
const gmailUser = optionalEnv('ALFREDO_SECRETARIO_GMAIL_USER', '');
const gmailAppPassword = optionalEnv('ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD', '');
const emailTo = optionalEnv('ALFREDO_SECRETARIO_EMAIL_TO', DEFAULT_EMAIL_TO);
const forceResend = boolEnv('FORCE_SECRETARIO_RESEND', false);
const repoUrl = `${optionalEnv('GITHUB_SERVER_URL', 'https://github.com')}/${optionalEnv(
  'GITHUB_REPOSITORY',
  'rencaldas/projeto-alfredos'
)}`;

if (!botToken) requireEnv('ALFREDO_SECRETARIO_BOT_TOKEN');
if (!chatId) requireEnv('ALFREDO_SECRETARIO_BOT_CHAT_ID');
if (!geminiApiKey) requireEnv('ALFREDO_SECRETARIO_GEMINI_API_KEY');
if (!gmailUser) requireEnv('ALFREDO_SECRETARIO_GMAIL_USER');
if (!gmailAppPassword) requireEnv('ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD');

console.log(`[Alfredo Secretário] Iniciando execução. Modelo Gemini: ${geminiModel}. Destinatário: ${emailTo}.`);

const secretarioHistory = await loadHistory(SECRETARIO_HISTORY_PATH);
const reportDateKey = todayKey();

if (!forceResend && wasSent(secretarioHistory, reportDateKey)) {
  console.log(`[Alfredo Secretário] Relatório de ${reportDateKey} já foi enviado anteriormente nesta data. Encerrando sem reenviar.`);
  console.log('[Alfredo Secretário] Defina a variável FORCE_SECRETARIO_RESEND=true para forçar um novo envio manual.');
  process.exit(0);
}

const dailyLog = await loadDailyLog(DAILY_LOG_PATH);
const entries = selectEntriesForDate(dailyLog, reportDateKey);
const dateLabel = formatDateLabel(reportDateKey);

console.log(`[Alfredo Secretário] ${entries.length} item(ns) encontrados no log diário para ${reportDateKey}.`);

try {
  if (entries.length === 0) {
    await sendNoNewsReport({ dateLabel });
  } else {
    await sendFullReport({ entries, dateLabel });
  }
} catch (error) {
  console.error(`[Alfredo Secretário] Falha ao gerar/enviar o relatório de ${reportDateKey}: ${error.message}`);
  console.error('[Alfredo Secretário] O histórico não será marcado como enviado; a próxima execução tentará novamente.');
  throw error;
}

markSent(secretarioHistory, reportDateKey);
await saveHistory(secretarioHistory);
console.log(`[Alfredo Secretário] Execução concluída com sucesso para ${reportDateKey}.`);

// ---------- Fluxos principais ----------

async function sendNoNewsReport({ dateLabel }) {
  console.log('[Alfredo Secretário] Nenhuma novidade hoje. Preparando envio informativo.');

  const telegramText = buildNoNewsTelegramMessage({ dateLabel });
  const emailHtml = buildNoNewsEmailHtml({ dateLabel });

  await sendTelegramWithRetry(telegramText);
  await sendEmailWithRetry({
    subject: `Alfredo Secretário — Nenhuma novidade em ${dateLabel}`,
    html: emailHtml
  });
}

async function sendFullReport({ entries, dateLabel }) {
  const grouped = groupByAgent(entries);
  const stats = buildStats(grouped, entries);

  console.log(`[Alfredo Secretário] Agentes ativos hoje: ${stats.agentesAtivos}. Total de itens: ${stats.totalItens}.`);
  for (const [agent, count] of Object.entries(stats.contagemPorAgente)) {
    console.log(`[Alfredo Secretário]   - ${agent}: ${count} item(ns)`);
  }

  console.log('[Alfredo Secretário] Consultando Gemini para gerar o relatório executivo...');
  const report = await generateReportWithGemini(grouped);
  console.log('[Alfredo Secretário] Relatório executivo recebido do Gemini.');

  const telegramText = buildFullTelegramMessage({ dateLabel, stats, report });
  const emailHtml = buildFullEmailHtml({ dateLabel, stats, report });

  await sendTelegramWithRetry(telegramText);
  await sendEmailWithRetry({
    subject: `Alfredo Secretário — Relatório de ${dateLabel} (${stats.totalItens} novidade${stats.totalItens === 1 ? '' : 's'})`,
    html: emailHtml
  });
}

// ---------- Integração com Gemini ----------

async function generateReportWithGemini(grouped) {
  const prompt = buildGeminiPrompt(grouped);
  const schema = buildGeminiSchema();

  return generateStructuredReport({
    apiKey: geminiApiKey,
    model: geminiModel,
    prompt,
    schema
  });
}

function buildGeminiPrompt(grouped) {
  const sections = Object.entries(grouped).map(([agent, items]) => {
    const limited = items.slice(0, MAX_ITEMS_PER_AGENT_IN_PROMPT);
    const omitted = items.length - limited.length;
    const lines = limited.map((item, index) => {
      const parts = [`${index + 1}. ${item.title}`];
      if (item.summary) parts.push(`   Resumo: ${item.summary}`);
      if (item.link) parts.push(`   Link: ${item.link}`);
      return parts.join('\n');
    });

    if (omitted > 0) {
      lines.push(`   (+ ${omitted} item(ns) adicionais não detalhados nesta lista)`);
    }

    return `## ${agent} (${items.length} item(ns) no total)\n${lines.join('\n')}`;
  });

  return [
    'Você é o assistente executivo do "Projeto Alfredos", um conjunto de bots que monitoram notícias de tecnologia, jogos gratuitos e vulnerabilidades/atualizações de dependências de software.',
    'A seguir está a lista de tudo que os bots enviaram hoje, agrupada por agente. Produza um relatório executivo em português do Brasil, em tom profissional e direto, eliminando duplicações e destacando o que realmente importa.',
    'Responda exclusivamente no formato JSON definido pelo schema fornecido, sem markdown, sem crases e sem nenhum texto fora do JSON.',
    'Regras de conteúdo:',
    '- "resumoGeral": 2 a 4 frases resumindo o dia como um todo.',
    '- "destaques": lista com no máximo 6 acontecimentos mais importantes do dia, em frases curtas e objetivas.',
    '- "porAgente": um item para cada agente listado abaixo, com um resumo qualitativo (2 a 3 frases) e uma lista "itens" com no máximo 8 frases curtas descrevendo os itens mais relevantes enviados por aquele agente.',
    '- "conclusao": 1 a 2 frases de fechamento, mencionando riscos, tendências ou pontos de atenção quando fizer sentido (por exemplo, vulnerabilidades críticas do Alfredo Sentinela).',
    '- Nunca invente dados que não estejam listados abaixo. Não inclua contagens numéricas de itens nas frases: as quantidades já são calculadas separadamente.',
    '',
    'Dados de hoje:',
    sections.join('\n\n')
  ].join('\n');
}

function buildGeminiSchema() {
  return {
    type: 'OBJECT',
    properties: {
      resumoGeral: { type: 'STRING' },
      destaques: { type: 'ARRAY', items: { type: 'STRING' } },
      porAgente: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            agente: { type: 'STRING' },
            resumo: { type: 'STRING' },
            itens: { type: 'ARRAY', items: { type: 'STRING' } }
          },
          required: ['agente', 'resumo', 'itens']
        }
      },
      conclusao: { type: 'STRING' }
    },
    required: ['resumoGeral', 'destaques', 'porAgente', 'conclusao']
  };
}

// ---------- Envio com retry ----------

async function sendTelegramWithRetry(text) {
  await withRetry(() => sendTelegramMessage({ botToken, chatId, text }), {
    retries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    onRetry: ({ error, attempt, delay }) => {
      console.warn(
        `[Alfredo Secretário] Telegram: tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`
      );
    }
  });
  console.log('[Alfredo Secretário] Mensagem enviada ao Telegram.');
}

async function sendEmailWithRetry({ subject, html }) {
  await withRetry(
    () => sendReportEmail({ user: gmailUser, appPassword: gmailAppPassword, to: emailTo, subject, html }),
    {
      retries: 3,
      baseDelayMs: 3000,
      maxDelayMs: 20000,
      onRetry: ({ error, attempt, delay }) => {
        console.warn(
          `[Alfredo Secretário] E-mail: tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`
        );
      }
    }
  );
  console.log(`[Alfredo Secretário] E-mail enviado para ${emailTo}.`);
}

// ---------- Agrupamento e estatísticas ----------

function groupByAgent(entries) {
  const grouped = {};
  for (const entry of entries) {
    if (!grouped[entry.agent]) {
      grouped[entry.agent] = [];
    }
    grouped[entry.agent].push(entry);
  }
  return grouped;
}

function buildStats(grouped, entries) {
  const contagemPorAgente = {};
  for (const [agent, items] of Object.entries(grouped)) {
    contagemPorAgente[agent] = items.length;
  }

  return {
    totalItens: entries.length,
    agentesAtivos: Object.keys(grouped).length,
    contagemPorAgente
  };
}

// ---------- Formatação: Telegram ----------

function buildNoNewsTelegramMessage({ dateLabel }) {
  return [
    '🗂️ <b>Alfredo Secretário</b>',
    `<i>Relatório Diário — ${dateLabel}</i>`,
    '',
    'Nenhuma novidade foi enviada pelos Alfredos hoje. Nenhum item novo de notícias, jogos gratuitos ou alertas de segurança foi registrado no período.',
    '',
    `🔗 <a href="${repoUrl}">Repositório do projeto</a>`,
    '📧 Um e-mail informativo também foi enviado.'
  ].join('\n');
}

function buildFullTelegramMessage({ dateLabel, stats, report }) {
  const lines = [
    '🗂️ <b>Alfredo Secretário</b>',
    `<i>Relatório Diário — ${dateLabel}</i>`,
    '',
    report.resumoGeral,
    '',
    `📊 <b>Novidades de hoje:</b> ${stats.totalItens} item(ns) de ${stats.agentesAtivos} agente(s)`
  ];

  for (const [agent, count] of Object.entries(stats.contagemPorAgente)) {
    lines.push(`   • ${agent}: ${count}`);
  }

  if (report.destaques.length > 0) {
    lines.push('', '✨ <b>Destaques do dia:</b>');
    for (const destaque of report.destaques) {
      lines.push(`- ${destaque}`);
    }
  }

  lines.push('', `🔗 <a href="${repoUrl}">Repositório do projeto</a>`, '📧 O relatório completo foi enviado por e-mail.');

  return lines.join('\n');
}

// ---------- Formatação: E-mail ----------

function buildNoNewsEmailHtml({ dateLabel }) {
  return renderEmailShell({
    title: 'Nenhuma novidade hoje',
    dateLabel,
    bodyHtml: `
      <p style="font-size:15px;line-height:1.6;color:#333;">
        Nenhuma novidade foi enviada pelos agentes do Projeto Alfredos em ${escapeHtml(dateLabel)}.
        Nenhum item novo de notícias, jogos gratuitos ou alertas de segurança foi registrado no período.
      </p>
    `
  });
}

function buildFullEmailHtml({ dateLabel, stats, report }) {
  const statCards = [
    { label: 'Total de novidades', value: stats.totalItens },
    { label: 'Agentes ativos', value: stats.agentesAtivos }
  ];

  const statCardsHtml = statCards
    .map(
      (card) => `
    <td style="padding:14px 22px;background:#f4f6fb;border-radius:10px;text-align:center;">
      <div style="font-size:26px;font-weight:700;color:#1f2937;">${card.value}</div>
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(card.label)}</div>
    </td>`
    )
    .join('<td style="width:16px;"></td>');

  const contagemHtml = Object.entries(stats.contagemPorAgente)
    .map(
      ([agent, count]) => `
    <tr>
      <td style="padding:8px 0;color:#374151;font-size:14px;border-bottom:1px solid #f1f2f6;">${escapeHtml(agent)}</td>
      <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f1f2f6;">${count}</td>
    </tr>`
    )
    .join('');

  const destaquesHtml = report.destaques
    .map((item) => `<li style="margin-bottom:6px;color:#374151;">${escapeHtml(item)}</li>`)
    .join('');

  const porAgenteHtml = report.porAgente
    .map(
      (bloco) => `
    <div style="margin-bottom:22px;padding:18px 20px;border:1px solid #e5e7eb;border-radius:10px;">
      <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;">${escapeHtml(bloco.agente)}</h3>
      <p style="margin:0 0 10px;font-size:14px;color:#4b5563;line-height:1.6;">${escapeHtml(bloco.resumo)}</p>
      <ul style="margin:0;padding-left:18px;">
        ${bloco.itens.map((item) => `<li style="margin-bottom:4px;font-size:13px;color:#4b5563;">${escapeHtml(item)}</li>`).join('')}
      </ul>
    </div>`
    )
    .join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${statCardsHtml}</tr>
    </table>

    <p style="font-size:15px;line-height:1.7;color:#333;margin:24px 0;">${escapeHtml(report.resumoGeral)}</p>

    <h2 style="font-size:16px;color:#1f2937;border-bottom:2px solid #eef2ff;padding-bottom:8px;">Itens por agente</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${contagemHtml}
    </table>

    <h2 style="font-size:16px;color:#1f2937;border-bottom:2px solid #eef2ff;padding-bottom:8px;">Principais acontecimentos</h2>
    <ul style="padding-left:18px;margin-bottom:24px;">${destaquesHtml}</ul>

    <h2 style="font-size:16px;color:#1f2937;border-bottom:2px solid #eef2ff;padding-bottom:8px;">Resumo por agente</h2>
    ${porAgenteHtml}

    <h2 style="font-size:16px;color:#1f2937;border-bottom:2px solid #eef2ff;padding-bottom:8px;">Conclusão</h2>
    <p style="font-size:14px;line-height:1.7;color:#4b5563;">${escapeHtml(report.conclusao)}</p>
  `;

  return renderEmailShell({ title: `Relatório de ${dateLabel}`, dateLabel, bodyHtml });
}

function renderEmailShell({ title, dateLabel, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef1f7;font-family:'Segoe UI', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#1f2937,#111827);padding:28px 32px;">
                <div style="color:#ffffff;font-size:20px;font-weight:700;">🗂️ Alfredo Secretário</div>
                <div style="color:#cbd5f5;font-size:13px;margin-top:4px;">Relatório diário — ${escapeHtml(dateLabel)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef2f7;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">
                  Gerado automaticamente pelo Projeto Alfredos • <a href="${repoUrl}" style="color:#6366f1;">${repoUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeZone: TIMEZONE
  }).format(date);
}

function boolEnv(name, fallback) {
  const value = optionalEnv(name, '');
  if (!value) return fallback;
  return ['1', 'true', 'sim', 'yes'].includes(value.toLowerCase());
}
