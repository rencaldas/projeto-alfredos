# Projeto Alfredos

Automações para enviar notícias de tecnologia, jogos grátis, alertas de segurança e um relatório executivo diário ao Telegram e por e-mail. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor próprio ligado 24/7.

## O que roda hoje

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)
[![Alfredo Sentinela](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml)
[![Alfredo Secretario](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-secretario.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-secretario.yml)

1. **Alfredo Jornalista**: consulta o feed RSS do Tecnoblog a cada 15 minutos e envia as notícias inéditas ao Telegram.
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos inéditos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram.
3. **Alfredo Sentinela**: audita periodicamente os repositórios do GitHub, detecta dependências por lockfiles/manifestos, consulta vulnerabilidades públicas e avisa sobre riscos ou atualizações relevantes.
4. **Alfredo Secretário**: todos os dias às 23:59 (horário de Brasília), consolida tudo que os outros Alfredos enviaram no dia, pede para o Google Gemini gerar um relatório executivo e envia um resumo ao Telegram e o relatório completo por e-mail.

## Estrutura

```text
.github/workflows/alfredo-jornalista.yml
.github/workflows/alfredo-gamer.yml
.github/workflows/alfredo-sentinela.yml
.github/workflows/alfredo-secretario.yml
.github/state/news-history.json
.github/state/games-history.json
.github/state/sentinela-history.json
.github/state/daily-log.json
.github/state/secretario-history.json
scripts/alfredo-jornalista.mjs
scripts/alfredo-gamer.mjs
scripts/alfredo-sentinela.mjs
scripts/alfredo-secretario.mjs
scripts/history.mjs
scripts/daily-log.mjs
scripts/telegram.mjs
scripts/gemini.mjs
scripts/mailer.mjs
scripts/retry.mjs
package.json
package-lock.json
.env.example
docs/exemplo-relatorio-email.html
imgs/
```

> `docs/exemplo-relatorio-email.html` é um exemplo real (gerado localmente durante o desenvolvimento, com dados fictícios) do e-mail que o Alfredo Secretário envia. Abra esse arquivo em um navegador para ver o layout antes de configurar os secrets.

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
| `ALFREDO_SECRETARIO_BOT_TOKEN` | Token do bot Alfredo Secretário no Telegram |
| `ALFREDO_SECRETARIO_BOT_CHAT_ID` | Chat do Alfredo Secretário no Telegram |
| `ALFREDO_SECRETARIO_GEMINI_API_KEY` | Chave da API oficial do Google Gemini |
| `ALFREDO_SECRETARIO_GMAIL_USER` | Endereço Gmail usado para enviar o e-mail (remetente) |
| `ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD` | Senha de app do Gmail (não é a senha normal da conta) |

Para repositórios privados, use um Personal Access Token com permissão de leitura nos repositórios que serão auditados. Em tokens fine-grained, conceda acesso aos repositórios desejados com permissão **Contents: Read**. Para auditar organizações, o token também precisa ter acesso aos repositórios da organização.

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback para os bots do Telegram, incluindo para o Alfredo Secretário (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).

#### Como gerar a chave do Gemini

1. Acesse [aistudio.google.com/apikey](https://aistudio.google.com/apikey) com a conta Google desejada.
2. Clique em **Create API key** e copie o valor gerado.
3. Cole esse valor no secret `ALFREDO_SECRETARIO_GEMINI_API_KEY`.

#### Como gerar a senha de app do Gmail

O envio de e-mail usa SMTP do Gmail, que exige uma **senha de app** (não a senha normal da conta), e só está disponível com a verificação em duas etapas ativada:

1. Ative a verificação em duas etapas em [myaccount.google.com/security](https://myaccount.google.com/security).
2. Acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Crie uma senha de app (ex.: nome "Alfredo Secretario") e copie o valor gerado (16 caracteres, sem espaços).
4. Use esse endereço de e-mail em `ALFREDO_SECRETARIO_GMAIL_USER` e a senha de app em `ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD`.

O e-mail é enviado **a partir** dessa conta Gmail (`ALFREDO_SECRETARIO_GMAIL_USER`) e recebido pelo destinatário configurado em `ALFREDO_SECRETARIO_EMAIL_TO` (por padrão, `renato.deacaldas@gmail.com`). Pode ser a mesma conta ou contas diferentes.

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
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modelo do Gemini usado para gerar o relatório executivo |
| `ALFREDO_SECRETARIO_EMAIL_TO` | `renato.deacaldas@gmail.com` | Destinatário do relatório diário por e-mail |
| `FORCE_SECRETARIO_RESEND` | `false` | Se `true`, reenvia o relatório do dia mesmo se já tiver sido enviado (útil para testar via `workflow_dispatch`) |

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
.github/state/daily-log.json
.github/state/secretario-history.json
```

Nas próximas execuções, itens já registrados não são reenviados. Os workflows fazem commit e push desses arquivos somente quando houver alteração.

- `daily-log.json`: log leve alimentado pelo Jornalista, Gamer e Sentinela sempre que enviam algo (título, resumo, link e data/hora). É a fonte de dados real que o Secretário usa para montar o relatório do dia. Entradas com mais de 30 dias são removidas automaticamente a cada gravação.
- `secretario-history.json`: guarda as datas (`YYYY-MM-DD`, fuso America/Sao_Paulo) cujo relatório diário já foi enviado, para não duplicar o e-mail/Telegram em reexecuções manuais no mesmo dia (a menos que `FORCE_SECRETARIO_RESEND=true`).

## Agendamentos

| Workflow | Arquivo | Cron | Horário esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `*/15 * * * *` | A cada 15 minutos |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |
| Alfredo Sentinela | `.github/workflows/alfredo-sentinela.yml` | `0 9 * * *` | 06:00 em America/Sao_Paulo |
| Alfredo Secretário | `.github/workflows/alfredo-secretario.yml` | `59 2 * * *` | 23:59 em America/Sao_Paulo |

O cron do GitHub Actions usa UTC. Como Brasília está em UTC-3, `59 2 * * *` dispara às 23:59 do dia anterior no horário de Brasília (2:59 - 3:00 = 23:59 do dia anterior em UTC).

Observação: workflows agendados no GitHub Actions podem atrasar alguns minutos em horários de alta demanda. Isso é normal da plataforma.

### Como alterar o horário do Alfredo Secretário

Edite a linha `cron` em `.github/workflows/alfredo-secretario.yml`. O valor é sempre em UTC; para converter de America/Sao_Paulo (UTC-3) para UTC, some 3 horas ao horário desejado. Exemplo: para rodar às 22:30 em Brasília, use `cron: '30 1 * * *'`.

## Alfredo Secretário — como funciona

O Secretário não duplica a lógica dos outros bots: ele **lê** o que eles já enviaram.

1. **Coleta**: o Jornalista, o Gamer e o Sentinela, imediatamente após cada envio bem-sucedido ao Telegram, também registram uma entrada em `.github/state/daily-log.json` (via `scripts/daily-log.mjs`) com agente, título, resumo, link e timestamp. Isso reaproveita o mesmo padrão de persistência versionada já usado pelo `history.mjs`, só que guardando conteúdo em vez de apenas IDs de deduplicação.
2. **Seleção do dia**: o Secretário filtra as entradas de `daily-log.json` cujo timestamp caia no dia atual (fuso America/Sao_Paulo) e agrupa por agente.
3. **Estatísticas**: quantidade de itens por agente e total do dia são calculados diretamente em código (não pelo modelo de IA), para garantir que os números do relatório sejam sempre exatos.
4. **Relatório executivo (Gemini)**: se houver itens no dia, o conteúdo agrupado é enviado à API oficial do Gemini (`generateContent`, endpoint `https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent`) pedindo saída estruturada em JSON (`responseMimeType: application/json` + `responseSchema`), com resumo geral, destaques, resumo por agente e conclusão. Isso evita depender de parsing de texto livre.
5. **Envio**:
   - **Telegram**: usa `sendTelegramMessage` (o mesmo módulo `telegram.mjs` dos outros bots), que já quebra automaticamente mensagens acima de 4096 caracteres em várias mensagens.
   - **E-mail**: HTML profissional gerado localmente (sem depender do Gemini para formatação/HTML), enviado via Gmail SMTP (`scripts/mailer.mjs`, usando `nodemailer`).
6. **Sem novidades**: se não houver nenhuma entrada no dia, o Secretário pula a chamada ao Gemini e envia diretamente um Telegram e um e-mail informando que não houve novidades.
7. **Idempotência**: ao final, a data do relatório é marcada em `secretario-history.json` (reaproveitando `history.mjs`). Se o workflow rodar de novo no mesmo dia (ex.: `workflow_dispatch` manual), o Secretário não reenvia — a menos que `FORCE_SECRETARIO_RESEND=true`.
8. **Resiliência**: chamadas ao Gemini, ao Telegram e ao Gmail passam por `scripts/retry.mjs` (retry com backoff exponencial + jitter). O cliente do Gemini trata especificamente respostas `429` (rate limit), respeitando o `retryDelay`/`Retry-After` informado pela API quando presente. Se, mesmo com as tentativas, o envio falhar, o histórico **não** é marcado como enviado, então a próxima execução tenta de novo.

### Limitações conhecidas

- Se o Telegram falhar no meio do envio de uma mensagem já dividida em várias partes (por causa do limite de 4096 caracteres), o retry reenvia a mensagem inteira, podendo duplicar partes já entregues. Para o uso pessoal deste projeto isso é preferível a perder o relatório.
- O prompt enviado ao Gemini limita a 40 itens detalhados por agente (contabilizando os demais apenas como "+N itens adicionais") para manter o tamanho do prompt sob controle em dias muito movimentados. As contagens exibidas no relatório continuam exatas, pois são calculadas em código.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Mesmo em execuções manuais, os bots continuam enviando somente itens inéditos quando usam histórico. Para o Alfredo Secretário, se o relatório do dia já tiver sido enviado, a execução manual não reenvia a menos que a variável `FORCE_SECRETARIO_RESEND` esteja `true`.

## Como testar localmente

Com Node.js 24 ou superior:

```bash
npm install
npm run alfredo:jornalista
npm run alfredo:gamer
npm run alfredo:sentinela
npm run alfredo:secretario
```

`npm install` só é necessário por causa do Alfredo Secretário (dependência `nodemailer`); os outros três bots continuam usando apenas `fetch` nativo, sem dependências.

Antes de rodar localmente, exporte as variáveis de ambiente do bot desejado. Exemplo para o Sentinela:

```bash
export ALFREDO_SENTINELA_GITHUB_TOKEN="seu-token-github"
export ALFREDO_SENTINELA_BOT_TOKEN="seu-token-telegram"
export ALFREDO_SENTINELA_BOT_CHAT_ID="seu-chat-id"
```

Exemplo para o Secretário:

```bash
export ALFREDO_SECRETARIO_BOT_TOKEN="seu-token-telegram"
export ALFREDO_SECRETARIO_BOT_CHAT_ID="seu-chat-id"
export ALFREDO_SECRETARIO_GEMINI_API_KEY="sua-chave-gemini"
export ALFREDO_SECRETARIO_GMAIL_USER="seu-email@gmail.com"
export ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD="sua-senha-de-app"
# Opcional, só se quiser forçar reenvio no mesmo dia:
export FORCE_SECRETARIO_RESEND=true
```

No PowerShell:

```powershell
$env:ALFREDO_SECRETARIO_BOT_TOKEN="seu-token-telegram"
$env:ALFREDO_SECRETARIO_BOT_CHAT_ID="seu-chat-id"
$env:ALFREDO_SECRETARIO_GEMINI_API_KEY="sua-chave-gemini"
$env:ALFREDO_SECRETARIO_GMAIL_USER="seu-email@gmail.com"
$env:ALFREDO_SECRETARIO_GMAIL_APP_PASSWORD="sua-senha-de-app"
```

Você também pode usar `.env.example` como referência para preencher as mesmas variáveis no seu terminal ou no GitHub Actions.

### Como alterar o destinatário do e-mail

Padrão: `renato.deacaldas@gmail.com`, definido em `DEFAULT_EMAIL_TO` dentro de `scripts/alfredo-secretario.mjs`. Para trocar sem editar código, defina a variável `ALFREDO_SECRETARIO_EMAIL_TO` (Settings > Secrets and variables > Actions > Variables, ou como variável de ambiente local). Para trocar o padrão definitivamente, edite a constante `DEFAULT_EMAIL_TO` no script.

### Como alterar o chat do Telegram

Cada bot tem seu próprio chat configurável de forma independente:

- Jornalista: secret `ALFREDO_NEWS_BOT_CHAT_ID`
- Gamer: secret `ALFREDO_GAMER_BOT_CHAT_ID`
- Sentinela: secret `ALFREDO_SENTINELA_BOT_CHAT_ID`
- Secretário: secret `ALFREDO_SECRETARIO_BOT_CHAT_ID`

Basta atualizar o valor do secret correspondente em **Settings > Secrets and variables > Actions**; não é necessário alterar código. Você pode inclusive usar o mesmo bot/chat do Telegram para todos os Alfredos configurando apenas `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (fallback aceito por todos).

## Diferenças em relação ao n8n

- Não há container Docker nem painel do n8n para manter.
- Os workflows ficam versionados junto com o código.
- Os tokens ficam em GitHub Actions Secrets, não no JSON exportado do n8n.
- Os Alfredos usam arquivos de histórico versionados para evitar repostagens mesmo em execuções efêmeras do GitHub Actions.
- O Alfredo Secretário reaproveita essa mesma infraestrutura (histórico versionado + GitHub Actions) para gerar um relatório diário com IA, sem precisar de um servidor ou banco de dados externo.

## Segurança

Tokens de bot, Personal Access Tokens, a chave da API do Gemini e a senha de app do Gmail nunca devem ser commitados no repositório. Configure-os apenas como GitHub Actions Secrets.

Se algum token/chave/senha for exposto fora do GitHub Secrets, gere um novo no BotFather, no GitHub, no Google AI Studio ou nas configurações de senhas de app do Google (conforme o caso) e atualize o secret correspondente.

As dependências do projeto (atualmente apenas `nodemailer`, usado pelo Alfredo Secretário) são auditadas com `npm audit` antes de cada atualização de versão neste README; nenhuma vulnerabilidade conhecida está presente na versão fixada em `package-lock.json`.
