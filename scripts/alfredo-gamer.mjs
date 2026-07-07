import { optionalEnv, requireEnv, sendTelegramPhoto } from './telegram.mjs';

const DEFAULT_GAMERPOWER_URL = 'https://www.gamerpower.com/api/giveaways?platform=epic-games-store&type=game';
const DEFAULT_MAX_ITEMS = 10;

const botToken = optionalEnv('TELEGRAM_GAMER_BOT_TOKEN', process.env.TELEGRAM_BOT_TOKEN);
const chatId = optionalEnv('TELEGRAM_GAMER_CHAT_ID', process.env.TELEGRAM_CHAT_ID);
const gamerPowerUrl = optionalEnv('GAMERPOWER_URL', DEFAULT_GAMERPOWER_URL);
const maxItems = Number(optionalEnv('GAMES_MAX_ITEMS', String(DEFAULT_MAX_ITEMS)));

if (!botToken) {
  requireEnv('TELEGRAM_BOT_TOKEN');
}

if (!chatId) {
  requireEnv('TELEGRAM_CHAT_ID');
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
const giveaways = Array.isArray(payload) ? payload : [];
const activeGiveaways = giveaways
  .filter((game) => game.title && game.thumbnail && game.open_giveaway)
  .filter((game) => !game.status || String(game.status).toLowerCase() === 'active')
  .slice(0, maxItems);

if (activeGiveaways.length === 0) {
  console.log('Nenhum jogo gratuito ativo encontrado na GamerPower.');
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

  console.log(`Jogo enviado: ${game.title}`);
}
