import { loadHistory, markSent, saveHistory, uniqueUnsent } from './history.mjs';
import { optionalEnv, requireEnv, sendTelegramPhoto } from './telegram.mjs';

const DEFAULT_GAMERPOWER_URL = 'https://www.gamerpower.com/api/giveaways?platform=epic-games-store&type=game';
const DEFAULT_MAX_ITEMS = 10;
const HISTORY_PATH = '.github/state/games-history.json';

const botToken = optionalEnv(
  'ALFREDO_GAMER_BOT_TOKEN',
  optionalEnv('TELEGRAM_GAMER_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN)
);
const chatId = optionalEnv(
  'ALFREDO_GAMER_BOT_CHAT_ID',
  optionalEnv('TELEGRAM_GAMER_CHAT_ID', process.env.TELEGRAM_CHAT_ID)
);
const gamerPowerUrl = optionalEnv('GAMERPOWER_URL', DEFAULT_GAMERPOWER_URL);
const maxItems = Number(optionalEnv('GAMES_MAX_ITEMS', String(DEFAULT_MAX_ITEMS)));

if (!botToken) {
  requireEnv('ALFREDO_GAMER_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('ALFREDO_GAMER_BOT_CHAT_ID');
}

const response = await fetch(gamerPowerUrl, {
  headers: {
    'user-agent': 'Projeto Alfredo GitHub Actions Gamer Bot'
  },
  signal: AbortSignal.timeout(60000)
});

if (!response.ok) {
  throw new Error(`Falha ao buscar GamerPower (${response.status}): ${response.statusText}`);
}

const payload = await response.json();
const history = await loadHistory(HISTORY_PATH);
const giveaways = Array.isArray(payload) ? payload : [];
const sortedActiveGiveaways = giveaways
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
  process.exit(0);
}

for (const game of activeGiveaways) {
  const caption = `Resgatar jogo GRATUITO na Epic Games
${game.title}

Resgatar: ${game.open_giveaway}

Plataformas: ${game.platforms || 'Nao informado'}
Status: ${game.status || 'Nao informado'}!

Data de envio: ${game.published_date || 'Nao informado'}
Termina em: ${game.end_date || 'Nao informado'}`;

  await sendTelegramPhoto({
    botToken,
    chatId,
    photoUrl: game.thumbnail,
    caption
  });

  markSent(history, game.historyId);
  await saveHistory(history);
  console.log(`Jogo enviado: ${game.title}`);
}

function getGiveawayId(game) {
  if (game.id !== undefined && game.id !== null && String(game.id).trim() !== '') {
    return String(game.id).trim();
  }

  return typeof game.open_giveaway === 'string' ? game.open_giveaway.trim() : '';
}

function parseGiveawayDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : new Date(0);
}
