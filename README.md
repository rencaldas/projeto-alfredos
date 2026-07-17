# Projeto Alfredos

> Automações que rodam sozinhas no **GitHub Actions** e mandam notícias de tecnologia, jogos grátis da Epic Games e alertas de segurança de dependências direto pro **Telegram** — sem servidor próprio ligado 24/7.

![Node](https://img.shields.io/badge/Node.js-%3E%3D24-339933?logo=node.js&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-Automated-success?logo=github-actions&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)
![Runtime](https://img.shields.io/badge/Runtime-ESM%20(.mjs)-yellow?logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Status das automações agora

Os badges abaixo refletem a **última execução real** de cada workflow — verde quando rodou certinho, vermelho quando falhou. É a forma mais confiável de saber "tá rodando ou não" sem precisar entrar no GitHub.

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)
[![Alfredo Sentinela](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml)

Clique em qualquer badge para ver o histórico de execuções direto na aba **Actions**.

---

## Os três Alfredos

### 🗞️ Alfredo Jornalista
Consulta o feed RSS do Tecnoblog e envia ao Telegram só as notícias que ainda não foram mandadas.

### 🎮 Alfredo Gamer
Consulta diariamente a API da GamerPower atrás de jogos grátis inéditos da **Epic Games Store** e da **Steam** e manda imagem, link de resgate e detalhes no Telegram, identificando de qual plataforma veio cada oferta.

### 🛡️ Alfredo Sentinela
Audita periodicamente seus repositórios do GitHub, detecta dependências via lockfiles/manifestos, cruza com vulnerabilidades públicas e avisa sobre riscos ou atualizações relevantes.

---

## Agendamentos (cron)

| Workflow | Arquivo | Cron (UTC) | Horário esperado (Brasília) |
|---|---|---|---|
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 |
| Alfredo Sentinela | `.github/workflows/alfredo-sentinela.yml` | `0 9 * * *` | 06:00 |

> O cron do GitHub Actions sempre roda em UTC. Como Brasília está em UTC-3, os horários acima já vêm convertidos. Em horários de pico, o GitHub Actions pode atrasar alguns minutos — isso é normal da plataforma, não é falha do projeto.

Todos os workflows também podem ser disparados manualmente pela aba **Actions > (escolher o workflow) > Run workflow**, sem esperar o cron.

---

## Estrutura do projeto

```text
projeto-alfredos/
|-- .github/
|   |-- workflows/
|   |   |-- alfredo-jornalista.yml
|   |   |-- alfredo-gamer.yml
|   |   `-- alfredo-sentinela.yml
|   `-- state/
|       |-- news-history.json
|       |-- games-history.json
|       `-- sentinela-history.json
|-- scripts/
|   |-- alfredo-jornalista.mjs
|   |-- alfredo-gamer.mjs
|   |-- alfredo-sentinela.mjs
|   |-- history.mjs
|   `-- telegram.mjs
|-- imgs/
|-- package.json
|-- LICENSE
`-- .env.example
```

---

## Configuração no GitHub

Em **Settings > Secrets and variables > Actions**, crie os secrets abaixo.

### Secrets obrigatórios

| Secret | Uso |
|---|---|
| `ALFREDO_NEWS_BOT_TOKEN` | Token do bot do Alfredo Jornalista |
| `ALFREDO_NEWS_BOT_CHAT_ID` | Chat do Alfredo Jornalista |
| `ALFREDO_GAMER_BOT_TOKEN` | Token do bot do Alfredo Gamer |
| `ALFREDO_GAMER_BOT_CHAT_ID` | Chat do Alfredo Gamer |
| `ALFREDO_SENTINELA_BOT_TOKEN` | Token do bot do Alfredo Sentinela |
| `ALFREDO_SENTINELA_BOT_CHAT_ID` | Chat do Alfredo Sentinela |
| `ALFREDO_SENTINELA_GITHUB_TOKEN` | Personal Access Token para ler os repositórios auditados pelo Sentinela |

Para auditar repositórios privados, use um token fine-grained com permissão **Contents: Read** nos repositórios (ou na organização) desejados. Nomes antigos `TELEGRAM_*` continuam funcionando como fallback.

### Variáveis opcionais (aba **Variables**)

| Variável | Padrão | Uso |
|---|---|---|
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed do Alfredo Jornalista |
| `NEWS_MAX_ITEMS` | `5` | Máximo de notícias inéditas por execução |
| `GAMERPOWER_URL` | API da GamerPower (Epic Games Store) | Endpoint de jogos da Epic no Alfredo Gamer |
| `GAMERPOWER_STEAM_URL` | API da GamerPower (Steam) | Endpoint de jogos da Steam no Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Máximo de jogos inéditos por execução, somando as duas fontes |
| `SENTINELA_TARGETS` | vazio (lista tudo que o token acessa) | Aceita `org:minha-org`, `user:meu-user` ou `owner/repo`, separados por vírgula |
| `SENTINELA_MAX_REPOS` | `100` | Limite de repositórios por execução |
| `SENTINELA_MAX_ALERTS` | `25` | Limite de alertas detalhados enviados ao Telegram |
| `SENTINELA_MAX_DEPENDENCIES_PER_REPO` | `800` | Limite de dependências analisadas por repositório |
| `SENTINELA_INCLUDE_ARCHIVED` | `false` | Inclui repositórios arquivados na auditoria |
| `SENTINELA_UPDATE_MAJOR_GAP` | `1` | Diferença de majors que considera uma atualização relevante |

---

## Persistência (sem duplicar avisos)

Cada bot registra o que já foi enviado em arquivos versionados no próprio repositório:

```text
.github/state/news-history.json
.github/state/games-history.json
.github/state/sentinela-history.json
```

Nas próximas execuções, itens já registrados não são reenviados. Os workflows fazem commit desses arquivos só quando há mudança — mesmo em execuções manuais, o histórico é respeitado.

---

## Rodando localmente

Requer Node.js 24 ou superior.

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
npm run alfredo:sentinela
```

Antes de rodar, exporte as variáveis do bot desejado:

```bash
export ALFREDO_SENTINELA_GITHUB_TOKEN="seu-token-github"
export ALFREDO_SENTINELA_BOT_TOKEN="seu-token-telegram"
export ALFREDO_SENTINELA_BOT_CHAT_ID="seu-chat-id"
```

No PowerShell:

```powershell
$env:ALFREDO_SENTINELA_GITHUB_TOKEN="seu-token-github"
$env:ALFREDO_SENTINELA_BOT_TOKEN="seu-token-telegram"
$env:ALFREDO_SENTINELA_BOT_CHAT_ID="seu-chat-id"
```

Use o `.env.example` como referência para preencher as mesmas variáveis.

---

## Por que saiu do n8n

- Sem container Docker nem painel do n8n pra manter no ar.
- Workflows versionados junto com o código, não exportados em JSON.
- Tokens vivem só em GitHub Actions Secrets.
- Histórico versionado evita reenvios mesmo em execuções efêmeras do Actions.

---

## Segurança

Tokens de bot e Personal Access Tokens nunca são commitados no repositório — ficam só em GitHub Actions Secrets. Se algum token vazar, gere um novo no BotFather ou no GitHub e atualize o secret correspondente.

---

## Licença

Este projeto está licenciado sob os termos da [Licença MIT](./LICENSE).
