# Projeto Alfredo

Automacoes para enviar noticias de tecnologia e jogos gratis ao Telegram. O projeto nasceu em n8n self-hosted com Docker e agora roda em GitHub Actions, sem servidor proprio ligado 24/7.

## O que roda hoje

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as noticias recentes ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.

## Estrutura

```text
.github/workflows/alfredo-jornalista.yml
.github/workflows/alfredo-gamer.yml
scripts/alfredo-jornalista.mjs
scripts/alfredo-gamer.mjs
scripts/telegram.mjs
package.json
.env.example
```

## Como configurar no GitHub

No repositorio do GitHub, acesse **Settings > Secrets and variables > Actions**.

### Secrets obrigatorios

Use estes secrets se os dois fluxos usam o mesmo bot e chat:

| Nome | Exemplo | Uso |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | Token criado no BotFather |
| `TELEGRAM_CHAT_ID` | `7829764630` | Chat, grupo ou canal que recebera as mensagens |

### Secrets opcionais por fluxo

Use estes secrets se cada automacao tiver um bot ou destino diferente:

| Nome | Uso |
| --- | --- |
| `TELEGRAM_NEWS_BOT_TOKEN` | Token especifico do Alfredo Jornalista |
| `TELEGRAM_NEWS_CHAT_ID` | Chat especifico do Alfredo Jornalista |
| `TELEGRAM_GAMER_BOT_TOKEN` | Token especifico do Alfredo Gamer |
| `TELEGRAM_GAMER_CHAT_ID` | Chat especifico do Alfredo Gamer |

Quando os secrets especificos nao existem, os scripts usam `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

## Variaveis opcionais

Tambem em **Settings > Secrets and variables > Actions**, aba **Variables**, voce pode ajustar:

| Nome | Padrao | Uso |
| --- | --- | --- |
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed RSS do Alfredo Jornalista |
| `NEWS_LOOKBACK_MINUTES` | `20` | Janela usada para evitar repostar noticias antigas |
| `NEWS_MAX_ITEMS` | `5` | Maximo de noticias por execucao |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Maximo de jogos por execucao |

## Agendamentos

| Workflow | Arquivo | Cron | Horario esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasilia esta em UTC-3, `0 2 * * *` dispara as 23:00 no horario de Brasilia.

Observacao: workflows agendados no GitHub Actions podem atrasar alguns minutos em horarios de alta demanda. Isso e normal da plataforma.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Para o **Alfredo Jornalista**, a opcao `force_latest=true` envia as noticias mais recentes mesmo que estejam fora da janela configurada. Ela e util para validar o bot logo depois de configurar os secrets.

## Como testar localmente

Com Node.js 20 ou superior:

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
```

Antes de rodar localmente, exporte as variaveis de ambiente:

```bash
export TELEGRAM_BOT_TOKEN="seu-token"
export TELEGRAM_CHAT_ID="seu-chat-id"
```

No PowerShell:

```powershell
$env:TELEGRAM_BOT_TOKEN="seu-token"
$env:TELEGRAM_CHAT_ID="seu-chat-id"
```

Voce tambem pode usar `.env.example` como referencia para preencher as mesmas variaveis no seu terminal ou no GitHub Actions.

## Diferencas em relacao ao n8n

- Nao ha container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o codigo.
- Os tokens ficam em GitHub Actions Secrets, nao no JSON exportado do n8n.
- O Alfredo Jornalista usa uma janela de tempo para reduzir repostagens, ja que o GitHub Actions nao mantem estado persistente entre execucoes como uma instancia self-hosted poderia manter.

## Proximos passos recomendados

- Inicializar este diretorio como repositorio Git, caso ainda nao tenha sido feito.
- Publicar no GitHub.
- Configurar os secrets e variables.
- Rodar os dois workflows manualmente uma vez pela aba **Actions**.
- Depois de validar, remover o container antigo do n8n se ele nao for mais usado.
