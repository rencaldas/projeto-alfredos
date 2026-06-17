# Projeto Alfredos: Automação Self-Hosted com n8n, Docker e Telegram

O **Projeto Alfredos** é um ecossistema de assistentes virtuais automatizados e hospedados em infraestrutura própria (*self-hosted*). O objetivo principal é centralizar e otimizar o consumo de dados diários, enviando notificações filtradas em tempo real diretamente para canais e bots do Telegram.

*(Curiosidade: a ideia original era chamar o projeto de "Alfred", inspirado no mordomo do Batman. Como o nome já estava em uso no Telegram, a solução foi adotar a versão brasileira: **Alfredo**!).*

---

## Funcionalidades Atuais

O ecossistema gerencia dois fluxos de automação independentes e assíncronos que rodam em paralelo:

1. **📰 Alfredo Jornalista:** Realiza varreduras automáticas em feeds RSS de tecnologia a cada 15 minutos, processa os metadados e envia as atualizações mais recentes formatadas no padrão brasileiro de data/hora (24h).
2. **🎮 Alfredo Gamer:** Consome a API do GamerPower diariamente para buscar novos jogos gratuitos disponibilizados na Epic Games Store. O robô extrai a imagem promocional, as plataformas compatíveis e gera o link direto de resgate.

---

## Tecnologias e Ferramentas Utilizadas

* **[Docker](https://www.docker.com/):** Isolamento de ambiente e portabilidade da aplicação por meio de contêineres.
* **[n8n (Self-Hosted)](https://n8n.io/):** Orquestrador de fluxo de trabalho baseado em nós para integração assíncrona de APIs.
* **JavaScript (ES6):** Manipulação dinâmica de strings e formatação localizada de datas (`toLocaleDateString`).
* **Telegram Bot API:** Interface de entrega de mensagens via Webhooks ativos.

---

## Como Rodar o Projeto

### 1. Requisitos Prévios
* Ter o Docker instalado na sua máquina.
* Ter criado os tokens dos seus Bots via [@BotFather](https://t.me/BotFather) no Telegram.

### 2. Inicializar o n8n via Docker
Execute o comando abaixo no seu terminal para subir o container do n8n mantendo a persistência de dados local:

```bash
docker run -d --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
Após rodar o comando, acesse a interface gráfica do n8n pelo seu navegador em: http://localhost:5678.

## Como Importar o Workflow no n8n
Para clonar exatamente a estrutura de nós do Alfredo Jornalista e Alfredo Gamer para o seu ambiente:

Crie um novo workflow vazio no seu n8n.

Copie o código JSON completo do bloco abaixo.

Clique dentro da área de trabalho do seu n8n e use o atalho Ctrl + V (ou Cmd + V no Mac).

Insira as suas credenciais do Telegram nos nós correspondentes.

JSON
{
  "name": "My workflow",
  "nodes": [
    {
      "parameters": {
        "url": "[https://tecnoblog.net/feed/](https://tecnoblog.net/feed/)",
        "options": {}
      },
      "type": "n8n-nodes-base.rssFeedRead",
      "typeVersion": 1.2,
      "position": [208, 0],
      "id": "a8572cc8-4fb2-4092-8c00-f3eda92d2ad0",
      "name": "Tecnoblog: Software",
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "chatId": "7829764630",
        "text": "={{ $json.pubDate }}\n\nCategoria: {{ $json.categories }}\n\n{{ $json.title }}\n\n\n{{ $json.contentSnippet }}\n\n\nLink para saber mais:\n{{ $json.link }}",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [416, 0],
      "id": "4912a7ca-3b8e-4c7e-b58a-cd3c68934c7c",
      "name": "Envio automático (Sem Resumo de IA)",
      "webhookId": "f7baac6c-85a0-4e2c-9f69-58cdda2694a1",
      "credentials": {
        "telegramApi": {
          "id": "Apk1SKVwQj9EfYa4",
          "name": "Telegram account"
        }
      },
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 15
            }
          ]
        }
      },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.3,
      "position": [0, 0],
      "id": "14bf3a4b-8962-4a3f-b8e0-10819408ad88",
      "name": "Notícias de Tecnologia"
    },
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "triggerAtHour": 23
            }
          ]
        }
      },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.3,
      "position": [0, 176],
      "id": "2f688ea8-717f-4050-8bb8-252eff749620",
      "name": "Jogos grátis"
    },
    {
      "parameters": {
        "operation": "sendPhoto",
        "chatId": "7829764630",
        "file": "={{ $json.thumbnail }}",
        "additionalFields": {
          "caption": "=Resgatar jogo GRATUITO na Epic Games\n{{ $json.title }}\n\n\nResgatar: {{ $json.open_giveaway }}\n\nPlataformas: {{ $json.platforms }}\nStatus: {{ $json.status }}!\n\nData de envio: {{ $json.published_date }}\nTermina em: {{ $json.end_date }}"
        }
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [416, 176],
      "id": "e3d4ab53-64c4-4504-a204-fba8e1cf1934",
      "name": "Image + Caption",
      "webhookId": "3e01e5e5-32d9-4868-8552-8aa15e056163",
      "credentials": {
        "telegramApi": {
          "id": "zEHEwQPAerCTPOUE",
          "name": "Telegram account 2"
        }
      }
    },
    {
      "parameters": {
        "url": "[https://www.gamerpower.com/api/giveaways?platform=epic-games-store&type=game](https://www.gamerpower.com/api/giveaways?platform=epic-games-store&type=game)",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpBasicAuth",
        "options": {
          "timeout": 60000
        }
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [208, 176],
      "id": "7d7891e1-1ba0-47a1-bac0-1128bf96df9f",
      "name": "Busca API GamerPower",
      "notesInFlow": true,
      "onError": "continueErrorOutput",
      "notes": "HTTP Request para API GamerPower"
    }
  ],
  "pinData": {},
  "connections": {
    "Tecnoblog: Software": {
      "main": [
        [
          {
            "node": "Envio automático (Sem Resumo de IA)",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Notícias de Tecnologia": {
      "main": [
        [
          {
            "node": "Tecnoblog: Software",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Jogos grátis": {
      "main": [
        [
          {
            "node": "Busca API GamerPower",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Busca API GamerPower": {
      "main": [
        [
          {
            "node": "Image + Caption",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1",
    "binaryMode": "separate",
    "availableInMCP": false
  },
  "versionId": "a772d143-1508-4731-961a-41ac19ce6455",
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "2c446768898ee84fe37bfe13f4bbd149b250416041a9f9f90e2673337d69c603"
  },
  "nodeGroups": [],
  "id": "DNz3Z5g8vbnhEzkG",
  "tags": []
}

Próximos Passos
O ecossistema foi projetado para ser modular. Futuras implementações incluem novos robôs utilitários focados em produtividade, monitoramento de servidores e integrações com novas APIs de dados.
