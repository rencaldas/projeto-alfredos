# Projeto Alfredos

Automacoes para enviar noticias de tecnologia, jogos gratis e alertas de seguranca ao Telegram. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor proprio ligado 24/7.

## O que roda hoje

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)
[![Alfredo Sentinela](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml)

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as noticias ineditas ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos ineditos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.
3. **Alfredo Sentinela**: audita periodicamente os repositorios do GitHub, detecta dependencias por lockfiles/manifestos, consulta vulnerabilidades publicas e avisa sobre riscos ou atualizacoes relevantes.

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

O Sentinela funciona como um auditor de seguranca sem servidor. Ele usa um token do GitHub para listar repositorios, ler a arvore de arquivos e baixar apenas os arquivos de dependencias necessarios. Quando existem locks, eles sao priorizados porque representam as versoes efetivamente instaladas.

Ecossistemas detectados nesta versao:

- Node.js: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- PHP/Composer: `composer.lock`
- Go: `go.sum`
- Python: `poetry.lock`, `Pipfile.lock`, `requirements.txt`
- Java: `pom.xml`, `build.gradle`, `build.gradle.kts`
- .NET: `packages.lock.json`, `*.csproj`
- Rust: `Cargo.lock`
- Docker: `Dockerfile`, `*.Dockerfile`

As vulnerabilidades sao consultadas na OSV quando o ecossistema e suportado. Versoes mais recentes sao consultadas nos registros publicos de cada ecossistema quando possivel: npm, PyPI, Packagist, Go proxy, Maven Central, NuGet e crates.io.

O relatorio enviado ao Telegram inclui:

- quantidade de repositorios analisados;
- quantidade de dependencias verificadas;
- ecossistemas detectados;
- projetos com vulnerabilidades criticas;
- projetos com vulnerabilidades;
- projetos com atualizacoes disponiveis;
- dependencias afetadas, versao instalada, versao de correcao quando disponivel e recomendacao.

Alertas ja enviados ficam registrados em `.github/state/sentinela-history.json`, evitando notificacoes duplicadas para a mesma dependencia, versao e vulnerabilidade.

## Como configurar no GitHub

No repositorio do GitHub, acesse **Settings > Secrets and variables > Actions**.

### Secrets obrigatorios

Crie estes Repository Secrets:

| Nome | Uso |
| --- | --- |
| `ALFREDO_NEWS_BOT_TOKEN` | Token do bot Alfredo Jornalista |
| `ALFREDO_NEWS_BOT_CHAT_ID` | Chat do Alfredo Jornalista |
| `ALFREDO_GAMER_BOT_TOKEN` | Token do bot Alfredo Gamer |
| `ALFREDO_GAMER_BOT_CHAT_ID` | Chat do Alfredo Gamer |
| `ALFREDO_SENTINELA_BOT_TOKEN` | Token do bot Alfredo Sentinela |
| `ALFREDO_SENTINELA_BOT_CHAT_ID` | Chat do Alfredo Sentinela |
| `ALFREDO_SENTINELA_GITHUB_TOKEN` | Personal Access Token para ler os repositorios auditados |

Para repositorios privados, use um Personal Access Token com permissao de leitura nos repositorios que serao auditados. Em tokens fine-grained, conceda acesso aos repositorios desejados com permissao **Contents: Read**. Para auditar organizacoes, o token tambem precisa ter acesso aos repositorios da organizacao.

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback para os bots do Telegram.

## Variaveis opcionais

Tambem em **Settings > Secrets and variables > Actions**, aba **Variables**, voce pode ajustar:

| Nome | Padrao | Uso |
| --- | --- | --- |
| `RSS_FEED_URL` | `https://tecnoblog.net/feed/` | Feed RSS do Alfredo Jornalista |
| `NEWS_MAX_ITEMS` | `5` | Maximo de noticias ineditas por execucao |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Maximo de jogos ineditos por execucao |
| `SENTINELA_TARGETS` | vazio | Alvos do Sentinela. Vazio lista repositorios acessiveis pelo token. Aceita `org:minha-org`, `user:meu-user` ou `owner/repo`, separados por virgula |
| `SENTINELA_MAX_REPOS` | `100` | Limite de repositorios por execucao |
| `SENTINELA_MAX_ALERTS` | `25` | Limite de alertas ineditos detalhados no Telegram |
| `SENTINELA_MAX_DEPENDENCIES_PER_REPO` | `800` | Limite de dependencias analisadas por repositorio |
| `SENTINELA_INCLUDE_ARCHIVED` | `false` | Inclui repositorios arquivados na auditoria |
| `SENTINELA_UPDATE_MAJOR_GAP` | `1` | Quantos majors de diferenca tornam uma atualizacao relevante |

Exemplo de `SENTINELA_TARGETS`:

```text
org:minha-empresa,rencaldas/projeto-alfredos,user:rencaldas
```

## Persistencia

Os bots registram automaticamente o que ja foi enviado em arquivos versionados:

```text
.github/state/news-history.json
.github/state/games-history.json
.github/state/sentinela-history.json
```

Nas proximas execucoes, itens ja registrados nao sao reenviados. Os workflows fazem commit e push desses arquivos somente quando houver alteracao.

## Agendamentos

| Workflow | Arquivo | Cron | Horario esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |
| Alfredo Sentinela | `.github/workflows/alfredo-sentinela.yml` | `0 9 * * *` | 06:00 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasilia esta em UTC-3, `0 9 * * *` dispara as 06:00 no horario de Brasilia.

Observacao: workflows agendados no GitHub Actions podem atrasar alguns minutos em horarios de alta demanda. Isso e normal da plataforma.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Mesmo em execucoes manuais, os bots continuam enviando somente itens ineditos quando usam historico.

## Como testar localmente

Com Node.js 24 ou superior:

```bash
npm run alfredo:jornalista
npm run alfredo:gamer
npm run alfredo:sentinela
```

Antes de rodar localmente, exporte as variaveis de ambiente do bot desejado:

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

Voce tambem pode usar `.env.example` como referencia para preencher as mesmas variaveis no seu terminal ou no GitHub Actions.

## Diferencas em relacao ao n8n

- Nao ha container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o codigo.
- Os tokens ficam em GitHub Actions Secrets, nao no JSON exportado do n8n.
- Os Alfredos usam arquivos de historico versionados para evitar repostagens mesmo em execucoes efemeras do GitHub Actions.

## Seguranca

Tokens de bot e Personal Access Tokens nunca devem ser commitados no repositorio. Configure-os apenas como GitHub Actions Secrets.

Se algum token for exposto fora do GitHub Secrets, gere um novo token no BotFather ou no GitHub e atualize o secret correspondente.
