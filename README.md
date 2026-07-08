# Projeto Alfredos

Automações para enviar notícias de tecnologia e jogos grátis ao Telegram. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor próprio ligado 24/7.

## O que roda hoje

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as notícias inéditas ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos inéditos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.

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

No repositório do GitHub, acesse **Settings > Secrets and variables > Actions**.

### Secrets obrigatórios

Crie estes quatro Repository Secrets:

| Nome | Uso |
| --- | --- |
| `ALFREDO_NEWS_BOT_TOKEN` | Token do bot Alfredo Jornalista |
| `ALFREDO_NEWS_BOT_CHAT_ID` | Chat do Alfredo Jornalista |
| `ALFREDO_GAMER_BOT_TOKEN` | Token do bot Alfredo Gamer |
| `ALFREDO_GAMER_BOT_CHAT_ID` | Chat do Alfredo Gamer |

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback, mas os workflows usam `ALFREDO_*` como padrão.

## Variáveis opcionais

Também em **Settings > Secrets and variables > Actions**, aba **Variables**, você pode ajustar:

| Nome | Padrão | Uso |
| --- | --- | --- |
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed RSS do Alfredo Jornalista |
| `NEWS_MAX_ITEMS` | `5` | Máximo de notícias inéditas por execução |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Máximo de jogos inéditos por execução |

## Persistência

Os bots registram automaticamente o que já foi enviado em arquivos versionados:

```text
.github/state/news-history.json
.github/state/games-history.json
```

Nas próximas execuções, itens já registrados não são reenviados. Os workflows fazem commit e push desses arquivos somente quando houver alteração.

## Agendamentos

| Workflow | Arquivo | Cron | Horário esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasília está em UTC-3, `0 2 * * *` dispara às 23:00 no horário de Brasília.

Observação: workflows agendados no GitHub Actions podem atrasar alguns minutos em horários de alta demanda. Isso é normal da plataforma.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Mesmo em execuções manuais, os bots continuam enviando somente itens inéditos.

## Como testar localmente

Com Node.js 20 ou superior:

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
```

Antes de rodar localmente, exporte as variáveis de ambiente:

```bash
export ALFREDO_NEWS_BOT_TOKEN="seu-token"
export ALFREDO_NEWS_BOT_CHAT_ID="seu-chat-id"
```

No PowerShell:

```powershell
$env:ALFREDO_NEWS_BOT_TOKEN="seu-token"
$env:ALFREDO_NEWS_BOT_CHAT_ID="seu-chat-id"
```

Você também pode usar `.env.example` como referência para preencher as mesmas variáveis no seu terminal ou no GitHub Actions.

## Diferenças em relação ao n8n

- Não há container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o código.
- Os tokens ficam em GitHub Actions Secrets, não no JSON exportado do n8n.
- Os Alfredos usam arquivos de histórico versionados para evitar repostagens mesmo em execuções efêmeras do GitHub Actions.

## Segurança

Tokens de bot nunca devem ser commitados no repositório. Configure-os apenas como GitHub Actions Secrets.

Se algum token for exposto fora do GitHub Secrets, gere um novo token no BotFather e atualize o secret correspondente.
