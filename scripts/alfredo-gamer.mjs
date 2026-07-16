import { loadHistory, markSent, saveHistory, uniqueUnsent } from './history.mjs';
import { optionalEnv, requireEnv, sendTelegramMessage, sendTelegramPhoto } from './telegram.mjs';

const DEFAULT_EPIC_URL = 'https://www.gamerpower.com/api/giveaways?platform=epic-games-store&type=game';
const DEFAULT_STEAM_URL = 'https://www.gamerpower.com/api/giveaways?platform=steam&type=game';
const DEFAULT_MAX_ITEMS = 10;
const HISTORY_PATH = '.github/state/games-history.json';
const TIMEZONE = 'America/Sao_Paulo';

const SOURCES = [
  {
    key: 'epic',
    label: 'Epic Games',
    url: optionalEnv('GAMERPOWER_URL', DEFAULT_EPIC_URL)
  },
  {
    key: 'steam',
    label: 'Steam',
    url: optionalEnv('GAMERPOWER_STEAM_URL', DEFAULT_STEAM_URL)
  }
];

const botToken = optionalEnv(
  'ALFREDO_GAMER_BOT_TOKEN',
  optionalEnv('TELEGRAM_GAMER_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)
);
const chatId = optionalEnv(
  'ALFREDO_GAMER_BOT_CHAT_ID',
  optionalEnv('TELEGRAM_GAMER_CHAT_ID', process.env.TELEGRAM_CHAT_ID)
);
const maxItems = Number(optionalEnv('GAMES_MAX_ITEMS', String(DEFAULT_MAX_ITEMS)));

if (!botToken) {
  requireEnv('ALFREDO_GAMER_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('ALFREDO_GAMER_BOT_CHAT_ID');
}

await main().catch(async (error) => {
  console.error('Alfredo Gamer falhou:', error);
  await notifyFailure(error);
  process.exitCode = 1;
});

async function main() {
  const fetchedGiveaways = (
    await Promise.all(SOURCES.map((source) => fetchGiveaways(source)))
  ).flat();

  const history = await loadHistory(HISTORY_PATH);
  const sortedActiveGiveaways = fetchedGiveaways
    .map((game) => ({
      ...game,
      historyId: getGiveawayId(game),
      publishedAt: parseGiveawayDate(game.published_date)
    }))
    .filter((game) => game.historyId && game.title && game.thumbnail && game.open_giveaway)
    .filter((game) => !game.status || String(game.status).toLowerCase() === 'active')
    .sort((a, b) => a.publishedAt - b.publishedAt);

  const activeGiveaways = uniqueUnsent(sortedActiveGiveaways, history, (game) => game.historyId).slice(0, maxItems);

  if (activeGiveaways.length === 0) {
    await saveHistory(history);
    console.log('Nenhum jogo gratuito inedito encontrado na GamerPower.');
    return;
  }

  for (const game of activeGiveaways) {
    const caption = `Resgatar jogo GRATUITO na ${game.sourceLabel}
${game.title}

Resgatar: ${game.open_giveaway}

Plataformas: ${game.platforms || 'Nao informado'}
Status: ${game.status || 'Nao informado'}!

Data de envio: ${formatDateForDisplay(game.published_date)}
Termina em: ${formatDateForDisplay(game.end_date)}`;

    await sendTelegramPhoto({
      botToken,
      chatId,
      photoUrl: game.thumbnail,
      caption
    });

    markSent(history, game.historyId);
    await saveHistory(history);
    console.log(`Jogo enviado (${game.sourceLabel}): ${game.title}`);
  }
}

async function notifyFailure(error) {
  const message = error && error.message ? error.message : String(error);
  const text = `Alfredo Gamer falhou nesta execucao.\n\nErro: ${message}\n\nVerifique os logs em Actions para mais detalhes.`;

  try {
    await sendTelegramMessage({ botToken, chatId, text });
  } catch (alertError) {
    console.error('Nao foi possivel enviar o alerta de falha ao Telegram:', alertError);
  }
}

async function fetchGiveaways(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        'user-agent': 'Projeto Alfredo GitHub Actions Gamer Bot'
      },
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      console.warn(`Falha ao buscar GamerPower (${source.label}, ${response.status}): ${response.statusText}`);
      return [];
    }

    const payload = await response.json();
    const giveaways = Array.isArray(payload) ? payload : [];

    return giveaways.map((game) => ({
      ...game,
      sourceKey: source.key,
      sourceLabel: source.label
    }));
  } catch (error) {
    console.warn(`Erro ao buscar GamerPower (${source.label}): ${error.message}`);
    return [];
  }
}

function getGiveawayId(game) {
  const rawId = game.id !== undefined && game.id !== null && String(game.id).trim() !== ''
    ? String(game.id).trim()
    : (typeof game.open_giveaway === 'string' ? game.open_giveaway.trim() : '');

  if (!rawId) {
    return '';
  }

  // Mantem compatibilidade com o historico existente: IDs da Epic continuam
  // sem prefixo (a GamerPower ja usa um ID global unico por giveaway).
  // Steam ganha namespace so por seguranca extra contra colisao futura.
  return game.sourceKey === 'epic' ? rawId : `${game.sourceKey}:${rawId}`;
}

function parseGiveawayDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : new Date(0);
}

function formatDateForDisplay(value) {
  if (!value) {
    return 'Nao informado';
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return String(value);
  }

  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);

  return `${formatted} (horario de Brasilia)`;
}
