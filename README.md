# Projeto Alfredos

Automacoes para enviar noticias de tecnologia e jogos gratis ao Telegram. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor proprio ligado 24/7.

## O que roda hoje

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as noticias recentes ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.

## Estrutura

```text
.github/workflows/alfredo-jornalista.yml
.github/workflows/alfredo-gamer.yml
.github/state/news-history.json
.github/state/games-history.json
scripts/alfredo-jornalista.mjs
scripts/alfredo-gamer.mjs
scripts/history.mjs
scripts/telegram.mjs
package.json
.env.example
imgs/
```

## Como configurar no GitHub

No repositorio do GitHub, acesse **Settings > Secrets and variables > Actions**.

### Secrets obrigatorios

Crie estes quatro Repository Secrets:

| Nome | Uso |
| --- | --- |
| `ALFREDO_NEWS_BOT_TOKEN` | Token do bot Alfredo Jornalista |
| `ALFREDO_NEWS_BOT_CHAT_ID` | Chat do Alfredo Jornalista |
| `ALFREDO_GAMER_BOT_TOKEN` | Token do bot Alfredo Gamer |
| `ALFREDO_GAMER_BOT_CHAT_ID` | Chat do Alfredo Gamer |

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback, mas os workflows usam `ALFREDO_*` como padrao.

## Variaveis opcionais

Tambem em **Settings > Secrets and variables > Actions**, aba **Variables**, voce pode ajustar:

| Nome | Padrao | Uso |
| --- | --- | --- |
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed RSS do Alfredo Jornalista |
| `NEWS_MAX_ITEMS` | `5` | Maximo de noticias ineditas por execucao |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Maximo de jogos ineditos por execucao |

## Agendamentos

| Workflow | Arquivo | Cron | Horario esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasilia esta em UTC-3, `0 2 * * *` dispara as 23:00 no horario de Brasilia.

Observacao: workflows agendados no GitHub Actions podem atrasar alguns minutos em horarios de alta demanda. Isso e normal da plataforma.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Os bots registram automaticamente o que ja foi enviado em `.github/state/news-history.json` e `.github/state/games-history.json`. Em execucoes manuais, eles continuam enviando somente itens ineditos.

## Como testar localmente

Com Node.js 20 ou superior:

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
```

Antes de rodar localmente, exporte as variaveis de ambiente:

```bash
export ALFREDO_NEWS_BOT_TOKEN="seu-token"
export ALFREDO_NEWS_BOT_CHAT_ID="seu-chat-id"
```

No PowerShell:

```powershell
$env:ALFREDO_NEWS_BOT_TOKEN="seu-token"
$env:ALFREDO_NEWS_BOT_CHAT_ID="seu-chat-id"
```

Voce tambem pode usar `.env.example` como referencia para preencher as mesmas variaveis no seu terminal ou no GitHub Actions.

## Diferencas em relacao ao n8n

- Nao ha container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o codigo.
- Os tokens ficam em GitHub Actions Secrets, nao no JSON exportado do n8n.
- Os Alfredos usam arquivos de historico versionados para evitar repostagens mesmo em execucoes efemeras do GitHub Actions.

## Seguranca

Tokens de bot nunca devem ser commitados no repositorio. Configure-os apenas como GitHub Actions Secrets.

Se algum token for exposto fora do GitHub Secrets, gere um novo token no BotFather e atualize o secret correspondente.
