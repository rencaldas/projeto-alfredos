# Projeto Alfredos

Automações para enviar notícias de tecnologia, jogos grátis e alertas de segurança ao Telegram. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor próprio ligado 24/7.

## O que roda hoje

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)
[![Alfredo Sentinela](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml)

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as notícias inéditas ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos inéditos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.
3. **Alfredo Sentinela**: audita periodicamente os repositórios do GitHub, detecta dependências por lockfiles/manifestos, consulta vulnerabilidades públicas e avisa sobre riscos ou atualizações relevantes.

## Estrutura

```text
.github/workflows/alfredo-jornalista.yml
.github/workflows/alfredo-gamer.yml
.github/workflows/alfredo-sentinela.yml
.github/state/news-history.json
.github/state/games-history.json
.github/state/sentinela-history.json
scripts/alfredo-jornalista.mjs
scripts/alfredo-gamer.mjs
scripts/alfredo-sentinela.mjs
scripts/history.mjs
scripts/telegram.mjs
package.json
.env.example
imgs/
```

## Alfredo Sentinela

O Sentinela funciona como um auditor de segurança sem servidor. Ele usa um token do GitHub para listar repositórios, ler a árvore de arquivos e baixar apenas os arquivos de dependências necessários. Quando existem locks, eles são priorizados porque representam as versões efetivamente instaladas.

Ecossistemas detectados nesta versão:

- Node.js: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- PHP/Composer: `composer.lock`
- Go: `go.sum`
- Python: `poetry.lock`, `Pipfile.lock`, `requirements.txt`
- Java: `pom.xml`, `build.gradle`, `build.gradle.kts`
- .NET: `packages.lock.json`, `*.csproj`
- Rust: `Cargo.lock`
- Docker: `Dockerfile`, `*.Dockerfile`

As vulnerabilidades são consultadas na OSV quando o ecossistema é suportado. Versões mais recentes são consultadas nos registros públicos de cada ecossistema quando possível: npm, PyPI, Packagist, Go proxy, Maven Central, NuGet e crates.io.

O relatório enviado ao Telegram inclui:

- quantidade de repositórios analisados;
- quantidade de dependências verificadas;
- ecossistemas detectados;
- projetos com vulnerabilidades críticas;
- projetos com vulnerabilidades;
- projetos com atualizações disponíveis;
- link direto para o repositório afetado;
- dependências afetadas, versão instalada, versão mais recente ou versão de correção quando disponível e recomendação.

As mensagens utilizam formatação HTML do Telegram (negrito, links e código) e são divididas automaticamente quando ultrapassam o limite de caracteres da plataforma, preservando todos os alertas.
Alertas já enviados ficam registrados em `.github/state/sentinela-history.json`, evitando notificações duplicadas para a mesma dependência, versão e vulnerabilidade.
-Um alerta só é reenviado quando houver uma alteração relevante, como uma nova vulnerabilidade, uma nova versão disponível ou uma mudança na versão instalada da dependência.

## Como configurar no GitHub

No repositório do GitHub, acesse **Settings > Secrets and variables > Actions**.

### Secrets obrigatórios

Crie estes Repository Secrets:

| Nome | Uso |
| --- | --- |
| `ALFREDO_NEWS_BOT_TOKEN` | Token do bot Alfredo Jornalista |
| `ALFREDO_NEWS_BOT_CHAT_ID` | Chat do Alfredo Jornalista |
| `ALFREDO_GAMER_BOT_TOKEN` | Token do bot Alfredo Gamer |
| `ALFREDO_GAMER_BOT_CHAT_ID` | Chat do Alfredo Gamer |
| `ALFREDO_SENTINELA_BOT_TOKEN` | Token do bot Alfredo Sentinela |
| `ALFREDO_SENTINELA_BOT_CHAT_ID` | Chat do Alfredo Sentinela |
| `ALFREDO_SENTINELA_GITHUB_TOKEN` | Personal Access Token para ler os repositórios auditados |

Para repositórios privados, use um Personal Access Token com permissão de leitura nos repositórios que serão auditados. Em tokens fine-grained, conceda acesso aos repositórios desejados com permissão **Contents: Read**. Para auditar organizações, o token também precisa ter acesso aos repositórios da organização.

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback para os bots do Telegram.

## Variáveis opcionais

Também em **Settings > Secrets and variables > Actions**, aba **Variables**, você pode ajustar:

| Nome | Padrão | Uso |
| --- | --- | --- |
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed RSS do Alfredo Jornalista |
| `NEWS_MAX_ITEMS` | `5` | Máximo de notícias inéditas por execução |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Máximo de jogos inéditos por execução |
| `SENTINELA_TARGETS` | vazio | Alvos do Sentinela. Vazio lista repositórios acessíveis pelo token. Aceita `org:minha-org`, `user:meu-user` ou `owner/repo`, separados por vírgula |
| `SENTINELA_MAX_REPOS` | `100` | Limite de repositórios por execução |
| `SENTINELA_MAX_ALERTS` | `25` | Limite de alertas inéditos detalhados no Telegram |
| `SENTINELA_MAX_DEPENDENCIES_PER_REPO` | `800` | Limite de dependências analisadas por repositório |
| `SENTINELA_INCLUDE_ARCHIVED` | `false` | Inclui repositórios arquivados na auditoria |
| `SENTINELA_UPDATE_MAJOR_GAP` | `1` | Quantos majors de diferença tornam uma atualização relevante |

Exemplo de `SENTINELA_TARGETS`:

```text
org:minha-empresa,rencaldas/projeto-alfredos,user:rencaldas
```

## Persistência

Os bots registram automaticamente o que já foi enviado em arquivos versionados:

```text
.github/state/news-history.json
.github/state/games-history.json
.github/state/sentinela-history.json
```

Nas próximas execuções, itens já registrados não são reenviados. Os workflows fazem commit e push desses arquivos somente quando houver alteração.

## Agendamentos

| Workflow | Arquivo | Cron | Horário esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |
| Alfredo Sentinela | `.github/workflows/alfredo-sentinela.yml` | `0 9 * * *` | 06:00 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasília está em UTC-3, `0 9 * * *` dispara às 06:00 no horário de Brasília.

Observação: workflows agendados no GitHub Actions podem atrasar alguns minutos em horários de alta demanda. Isso é normal da plataforma.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Mesmo em execuções manuais, os bots continuam enviando somente itens inéditos quando usam histórico.

## Como testar localmente

Com Node.js 24 ou superior:

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
npm run alfredo:sentinela
```

Antes de rodar localmente, exporte as variáveis de ambiente do bot desejado:

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

Você também pode usar `.env.example` como referência para preencher as mesmas variáveis no seu terminal ou no GitHub Actions.

## Diferenças em relação ao n8n

- Não há container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o código.
- Os tokens ficam em GitHub Actions Secrets, não no JSON exportado do n8n.
- Os Alfredos usam arquivos de histórico versionados para evitar repostagens mesmo em execuções efêmeras do GitHub Actions.

## Segurança

Tokens de bot e Personal Access Tokens nunca devem ser commitados no repositório. Configure-os apenas como GitHub Actions Secrets.

Se algum token for exposto fora do GitHub Secrets, gere um novo token no BotFather ou no GitHub e atualize o secret correspondente.
