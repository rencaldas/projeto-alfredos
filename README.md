# Projeto Alfredos

Automações que enviam ao Telegram notícias de tecnologia, jogos grátis, alertas de segurança e vagas de emprego com os textos da candidatura já prontos. O projeto nasceu em n8n self-hosted com Docker e foi migrado para GitHub Actions, sem servidor ligado 24/7.
   
## O que roda hoje  

[![Alfredo Jornalista](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-jornalista.yml)
[![Alfredo Gamer](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-gamer.yml)
[![Alfredo Sentinela](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-sentinela.yml)
[![Alfredo Secretario](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-secretario.yml/badge.svg)](https://github.com/rencaldas/projeto-alfredos/actions/workflows/alfredo-secretario.yml)

1. **Alfredo Jornalista**: de hora em hora, busca notícias para devs em fontes oficiais e técnicas (PHP.net, GitHub Changelog, Node.js, TypeScript, OpenAI, Google AI, AWS, Docker, Kubernetes, InfoQ, Hacker News e outras), usa o Google Gemini para descartar o que não importa e envia ao Telegram só as relevantes, resumidas em português e com o motivo pelo qual importam (ver [detalhes abaixo](#alfredo-jornalista--curadoria-de-notícias)).
2. **Alfredo Gamer**: consulta diariamente a API da GamerPower para jogos gratuitos inéditos da Epic Games Store e envia imagem, link de resgate e detalhes ao Telegram. Quando a promoção de um jogo já enviado encerra, o bot volta na mensagem original e avisa que não está mais disponível (ver [detalhes abaixo](#alfredo-gamer--jogos-encerrados)).
3. **Alfredo Sentinela**: audita periodicamente os repositórios do GitHub, detecta dependências por lockfiles/manifestos, consulta vulnerabilidades públicas e avisa sobre riscos ou atualizações relevantes.
4. **Alfredo Secretário**: de segunda a sexta às 08:40 (horário de Brasília), busca vagas na Gupy, usa o Google Gemini para avaliar a aderência de cada uma ao perfil do candidato e envia as melhores ao Telegram com resumo profissional, áreas de interesse e o texto "sobre você" prontos para colar (ver [detalhes abaixo](#alfredo-secretário--vagas-com-candidatura-pronta)).

## Estrutura

```text
.github/workflows/alfredo-jornalista.yml
.github/workflows/alfredo-gamer.yml
.github/workflows/alfredo-sentinela.yml
.github/workflows/alfredo-secretario.yml
.github/state/news-history.json
.github/state/games-history.json
.github/state/games-messages.json
.github/state/sentinela-history.json
.github/state/daily-log.json
.github/state/secretario-vagas-history.json
config/vagas.json
config/noticias.json
scripts/alfredo-jornalista.mjs
scripts/alfredo-gamer.mjs
scripts/alfredo-sentinela.mjs
scripts/alfredo-secretario.mjs
scripts/history.mjs
scripts/games-messages.mjs
scripts/daily-log.mjs
scripts/telegram.mjs
scripts/gemini.mjs
scripts/feeds.mjs
scripts/noticias.mjs
scripts/gupy.mjs
scripts/vagas.mjs
scripts/retry.mjs
tests/vagas.test.mjs
tests/noticias.test.mjs
package.json
package-lock.json
.env.example
imgs/
```

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
| `ALFREDO_SECRETARIO_GEMINI_API_KEY` | Chave da API oficial do Google Gemini. Também usada pelo Alfredo Jornalista quando `ALFREDO_NEWS_GEMINI_API_KEY` não existe |
| `ALFREDO_SECRETARIO_PERFIL` | Perfil do candidato em texto livre, usado pela IA para avaliar as vagas e escrever os textos (ver [O perfil do candidato](#o-perfil-do-candidato)) |

Para repositórios privados, use um Personal Access Token com permissão de leitura nos repositórios que serão auditados. Em tokens fine-grained, conceda acesso aos repositórios desejados com permissão **Contents: Read**. Para auditar organizações, o token também precisa ter acesso aos repositórios da organização.

Os nomes `TELEGRAM_*` antigos continuam aceitos como fallback para os bots do Telegram, incluindo para o Alfredo Secretário (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`).

#### Como gerar a chave do Gemini

1. Acesse [aistudio.google.com/apikey](https://aistudio.google.com/apikey) com a conta Google desejada.
2. Clique em **Create API key** e copie o valor gerado.
3. Cole esse valor no secret `ALFREDO_SECRETARIO_GEMINI_API_KEY`.

## Variáveis opcionais

Também em **Settings > Secrets and variables > Actions**, aba **Variables**, você pode ajustar:

| Nome | Padrão | Uso |
| --- | --- | --- |
| `NEWS_MAX_ITEMS` | `maxNoticiasPorExecucao` de `config/noticias.json` | Máximo de notícias enviadas por execução do Alfredo Jornalista |
| `GAMERPOWER_URL` | API da GamerPower para Epic Games Store | Endpoint do Alfredo Gamer |
| `GAMES_MAX_ITEMS` | `10` | Máximo de jogos inéditos por execução |
| `SENTINELA_TARGETS` | vazio | Alvos do Sentinela. Vazio lista repositórios acessíveis pelo token. Aceita `org:minha-org`, `user:meu-user` ou `owner/repo`, separados por vírgula |
| `SENTINELA_MAX_REPOS` | `100` | Limite de repositórios por execução |
| `SENTINELA_MAX_ALERTS` | `25` | Limite de alertas inéditos detalhados no Telegram |
| `SENTINELA_MAX_DEPENDENCIES_PER_REPO` | `800` | Limite de dependências analisadas por repositório |
| `SENTINELA_INCLUDE_ARCHIVED` | `false` | Inclui repositórios arquivados na auditoria |
| `SENTINELA_UPDATE_MAJOR_GAP` | `1` | Quantos majors de diferença tornam uma atualização relevante |
| `GEMINI_MODEL` | `gemini-3.5-flash` | Modelo do Gemini usado pelo Alfredo Secretário e pelo Alfredo Jornalista |

Os termos de busca, a cidade, a nota mínima e os limites do Alfredo Secretário ficam em `config/vagas.json`, versionado junto com o código. As fontes, os interesses e a nota mínima do Alfredo Jornalista ficam em `config/noticias.json`.

Exemplo de `SENTINELA_TARGETS`:

```text
org:minha-empresa,rencaldas/projeto-alfredos,user:rencaldas
```

## Persistência

Os bots registram automaticamente o que já foi enviado em arquivos versionados:

```text
.github/state/news-history.json
.github/state/games-history.json
.github/state/games-messages.json
.github/state/sentinela-history.json
.github/state/daily-log.json
.github/state/secretario-vagas-history.json
```

Nas próximas execuções, itens já registrados não são reenviados. Os workflows fazem commit e push desses arquivos somente quando houver alteração.

- `daily-log.json`: log leve alimentado pelo Jornalista, Gamer e Sentinela sempre que enviam algo (título, resumo, link e data/hora). Era a fonte do antigo relatório diário do Secretário e hoje não tem consumidor; foi mantido para o dashboard público planejado. Entradas com mais de 30 dias são removidas automaticamente a cada gravação.
- `games-messages.json`: guarda, por jogo já enviado pelo Alfredo Gamer, o `chatId`/`messageId` de cada mensagem no Telegram e o `end_date` da promoção — é o que permite ao bot voltar numa mensagem antiga quando o jogo deixa de estar disponível (ver [detalhes abaixo](#alfredo-gamer--jogos-encerrados)). Entradas já notificadas são removidas automaticamente 60 dias depois.
- `secretario-vagas-history.json`: guarda um hash (HMAC-SHA256) de cada vaga já avaliada ou enviada pelo Alfredo Secretário, para que ela não seja avaliada nem enviada de novo. O id da vaga nunca é gravado em texto puro (ver [Privacidade](#privacidade)).

## Agendamentos

| Workflow | Arquivo | Cron | Horário esperado |
| --- | --- | --- | --- |
| Alfredo Jornalista | `.github/workflows/alfredo-jornalista.yml` | `7 * * * *` | De hora em hora, no minuto 7 |
| Alfredo Gamer | `.github/workflows/alfredo-gamer.yml` | `0 2 * * *` | 23:00 em America/Sao_Paulo |
| Alfredo Sentinela | `.github/workflows/alfredo-sentinela.yml` | `0 9 * * *` | 06:00 em America/Sao_Paulo |
| Alfredo Secretário | `.github/workflows/alfredo-secretario.yml` | `40 11 * * 1-5` | 08:40 em America/Sao_Paulo, de segunda a sexta |

O cron do GitHub Actions usa UTC. Como Brasília está em UTC-3, `40 11 * * 1-5` dispara às 08:40 no horário de Brasília (11:40 - 3:00 = 08:40).

Observação: workflows agendados no GitHub Actions podem atrasar alguns minutos em horários de alta demanda. Isso é normal da plataforma.

### Como alterar o horário do Alfredo Secretário

Edite a linha `cron` em `.github/workflows/alfredo-secretario.yml`. O valor é sempre em UTC; para converter de America/Sao_Paulo (UTC-3) para UTC, some 3 horas ao horário desejado. Exemplo: para rodar às 07:50 em Brasília de segunda a sexta, use `cron: '50 10 * * 1-5'`.

## Alfredo Jornalista — curadoria de notícias

A cada execução, o Jornalista:

1. Busca as notícias das últimas 48 horas em todas as fontes de `config/noticias.json`. Do Hacker News, só entram histórias com 150 pontos ou mais. Uma fonte fora do ar não impede as outras.
2. Descarta as que já foram enviadas ou avaliadas antes e as que têm palavras de `palavrasExcluidas` no título ou no link (promoção, cupom etc.). A mesma matéria vinda de duas fontes conta uma vez só, porque o histórico usa o link normalizado.
3. Manda as até 40 mais recentes ao Gemini numa única chamada. O Gemini dá uma nota de 0 a 10 de "o quanto um dev precisa saber disso", considerando o campo `interesses`, e escreve título, resumo e "por que importa" em português para as que passam de `notaMinima` (7).
4. Envia as melhores ao Telegram (até `maxNoticiasPorExecucao`, 5), da maior nota para a menor. As reprovadas entram no histórico e não são avaliadas de novo. As aprovadas que passarem do limite ficam para a próxima execução.

Para ajustar o que chega, edite `config/noticias.json`:

- `interesses`: sua stack e seus temas, em texto livre. É o que mais muda o resultado.
- `fontes`: adicione qualquer feed RSS ou Atom com `{ "nome": "...", "tipo": "rss", "url": "..." }`. Para desligar uma fonte sem apagá-la, use `"ativa": false`.
- `notaMinima`: suba para 8 se chegar notícia demais; desça para 6 se chegar pouca.

Sem chave do Gemini (`ALFREDO_NEWS_GEMINI_API_KEY` ou `ALFREDO_SECRETARIO_GEMINI_API_KEY`), o bot continua funcionando, mas sem curadoria: envia as mais recentes das fontes oficiais, sem o Hacker News, e avisa no log.

Para testar localmente sem enviar nada nem gravar histórico, use `ALFREDO_NEWS_DRY_RUN=true npm run alfredo:jornalista`.

## Alfredo Gamer — jogos encerrados

Além de enviar jogos gratuitos inéditos, o Gamer avisa quando um jogo já enviado deixa de estar disponível, pra você não abrir uma mensagem antiga achando que ainda dá pra resgatar.

1. **Registro no envio**: ao mandar um jogo, o bot guarda em `.github/state/games-messages.json` o `chatId`/`messageId` de cada mensagem enviada (um por destinatário) e o `end_date` da promoção informado pela GamerPower.
2. **Checagem a cada execução**: antes de buscar jogos novos, o bot varre esse registro atrás de jogos cujo `end_date` já passou e que ainda não foram notificados.
3. **Apagar ou editar**: para cada mensagem encontrada, o bot tenta apagá-la (`deleteMessage`). Isso só funciona se a mensagem tiver menos de 48h — limite do próprio Telegram, sem exceção para mensagens do bot. Como as promoções da Epic costumam durar vários dias, na prática a mensagem quase sempre já passou desse prazo; nesse caso o bot cai no plano B e edita a legenda (`editMessageCaption`) deixando só o nome do jogo e um aviso curto de que a promoção encerrou.
4. **Idempotência**: cada jogo só é notificado uma vez (`expiredNotifiedAt` em `games-messages.json`); entradas já notificadas somem do arquivo depois de 60 dias, pra ele não crescer indefinidamente.

### Limitações conhecidas

- Jogos enviados antes desta funcionalidade existir não têm `chatId`/`messageId` registrados, então não são retroativamente marcados como encerrados.
- Se a GamerPower informar `end_date` como `N/A` ou em formato que o `Date` do Node não reconheça, esse jogo nunca é marcado como encerrado automaticamente.
- Falha ao apagar/editar uma mensagem específica (por exemplo, se ela já tiver sido apagada manualmente) só gera um aviso no log; não interrompe a execução nem o envio dos jogos novos do dia.

## Alfredo Secretário — vagas com candidatura pronta

De segunda a sexta, o Secretário procura vagas, faz uma triagem com IA e manda as melhores para o Telegram já com os textos da candidatura prontos para colar. A inscrição continua manual: o bot prepara tudo, e o clique em "enviar" fica com o candidato.

1. **Busca**: para cada termo de `config/vagas.json`, faz duas buscas (no estado configurado e só remotas, porque a busca sem filtro devolve no máximo 100 vagas do Brasil inteiro) e consulta a API pública do portal da Gupy (`portal.gupy.io/api/job-search/jobs`, a mesma usada pela página de busca do portal) via `scripts/gupy.mjs`, que normaliza cada vaga (título, empresa, descrição em texto puro, cidade, modelo de trabalho, tipo de contrato e link).
2. **Filtros sem IA** (`scripts/vagas.mjs`): vagas remotas valem de qualquer lugar; presenciais e híbridas só na cidade configurada. Também são descartados os tipos listados em `tiposExcluidos` (banco de talentos, jovem aprendiz), títulos com palavras de senioridade (`palavrasExcluidasNoTitulo`), vagas publicadas há mais de `diasMaximosDesdePublicacao` dias e as que já estão no histórico. Esses filtros rodam antes da IA para economizar cota do Gemini.
3. **Triagem (Gemini)**: uma única chamada avalia até `maxVagasParaAvaliar` vagas e devolve, em JSON estruturado, uma nota de 0 a 10 e o motivo, comparando cada vaga com o perfil do candidato (requisitos obrigatórios, nível e relação com a carreira).
4. **Textos (Gemini)**: para as `maxVagasComTextos` melhores vagas com nota maior ou igual a `notaMinima`, uma chamada por vaga gera o resumo profissional, as áreas de interesse, a resposta para "fale sobre você" (até 1.500 caracteres, o limite usual da Gupy) e até três pontos de atenção. Antes de escrever, o modelo analisa a vaga (desafio principal, requisitos atendidos e palavras-chave) e então segue uma estrutura fixa para cada texto, pensada para o recrutador (primeira frase conectada à vaga, qualidades provadas com fatos) e para a triagem automática da Gupy (termos exatos da vaga). O prompt proíbe inventar experiências: o que a vaga pede e o perfil não cobre vai para os pontos de atenção, nunca para os textos.
5. **Envio**: uma mensagem de abertura com o resumo do dia e depois uma mensagem por vaga, com nota, motivo, link e cada texto num bloco `<pre>`, que o Telegram copia com um toque. Se a mensagem passar do limite do Telegram, cada seção vai separada, para nunca quebrar um bloco no meio. As vagas boas que excedem o limite diário chegam numa lista final, só com nota e link.
6. **Histórico**: vagas descartadas entram no histórico logo após a triagem, para não serem reavaliadas. As boas só entram depois de enviadas ao Telegram. O passo que versiona o histórico roda mesmo se o script falhar no meio, para que as vagas já enviadas não cheguem de novo.

### O perfil do candidato

O perfil fica no secret `ALFREDO_SECRETARIO_PERFIL`, e não num arquivo, porque o repositório é público. É texto livre (Markdown funciona bem) e é a única fonte de fatos que a IA pode usar. Quanto mais completo, menos pontos de atenção aparecem e melhores ficam os textos. Vale incluir:

- formação, período e turno;
- cada experiência com o que você realmente fazia e resultados com número;
- as ferramentas que você usa de verdade, com o nível;
- projetos pessoais;
- o que você **não** tem (para a IA não "cobrir" esses requisitos);
- o objetivo de carreira.

### Privacidade

Como o repositório e os logs do Actions são públicos, o Secretário foi pensado para não expor a busca de emprego:

- os logs mostram só contagens, nunca títulos, empresas ou textos gerados;
- o histórico guarda um HMAC-SHA256 do id da vaga (chave: o token do bot), não o id;
- o modo `ALFREDO_SECRETARIO_DRY_RUN`, que imprime as mensagens no terminal, deve ser usado só localmente.

### Limitações conhecidas

- A API da Gupy não é oficial nem documentada. Se o formato mudar, a execução falha com uma mensagem que lista as chaves recebidas, o que facilita ajustar `normalizeGupyJob`.
- As perguntas específicas de cada formulário de inscrição não aparecem na API, então precisam ser respondidas na hora da candidatura.
- Cada execução faz no máximo `1 + maxVagasComTextos` chamadas ao Gemini, para caber na cota gratuita.
- Trocar o token do bot do Secretário muda a chave do hash: vagas já vistas nos últimos dias podem reaparecer uma vez.

## Como executar manualmente

No GitHub, acesse **Actions**, escolha o workflow e clique em **Run workflow**.

Mesmo em execuções manuais, os bots continuam enviando somente itens inéditos quando usam histórico. No Alfredo Secretário, uma execução manual logo depois da agendada normalmente responde que não há vagas novas, porque as do dia já foram avaliadas.

## Como testar localmente

Com Node.js 24 ou superior:

```bash
npm test
npm run alfredo:jornalista
npm run alfredo:gamer
npm run alfredo:sentinela
npm run alfredo:secretario
```

O projeto não tem dependências externas: todos os bots usam apenas `fetch` nativo e módulos do Node.js. `npm test` roda os testes unitários dos filtros de vagas e de notícias com o test runner nativo (`node --test`).

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
export ALFREDO_SECRETARIO_PERFIL="$(cat ~/perfil-candidato.md)"
# Opcional: imprime as mensagens no terminal em vez de enviar e não grava histórico.
export ALFREDO_SECRETARIO_DRY_RUN=true
```

No PowerShell:

```powershell
$env:ALFREDO_SECRETARIO_BOT_TOKEN="seu-token-telegram"
$env:ALFREDO_SECRETARIO_BOT_CHAT_ID="seu-chat-id"
$env:ALFREDO_SECRETARIO_GEMINI_API_KEY="sua-chave-gemini"
$env:ALFREDO_SECRETARIO_PERFIL = Get-Content "$HOME\perfil-candidato.md" -Raw
$env:ALFREDO_SECRETARIO_DRY_RUN="true"
```

Você também pode usar `.env.example` como referência para preencher as mesmas variáveis no seu terminal ou no GitHub Actions.

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
- O Alfredo Secretário reaproveita essa mesma infraestrutura (histórico versionado + GitHub Actions) para fazer triagem de vagas com IA, sem precisar de um servidor ou banco de dados externo.

## Segurança

Tokens de bot, Personal Access Tokens, a chave da API do Gemini e o perfil do candidato nunca devem ser commitados no repositório. Configure-os apenas como GitHub Actions Secrets.

Se algum token/chave/senha for exposto fora do GitHub Secrets, gere um novo no BotFather, no GitHub ou no Google AI Studio (conforme o caso) e atualize o secret correspondente.

O projeto não tem dependências de terceiros em produção, o que elimina essa superfície de ataque. Se alguma for adicionada no futuro, audite com `npm audit` antes de cada atualização.
