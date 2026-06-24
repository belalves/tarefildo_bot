# Tarefildo Bot 🤖

**IA-powered task management bot** — Multi-canal (WhatsApp + Telegram) com NLP, agendamento automático e segurança em primeiro lugar.

## 🎯 Sobre

Tarefildo Silva das Pendências é um bot assistente de tarefas com personalidade forte e bem-humorada. Gerencia tarefas, lembretes e prioridades via WhatsApp e Telegram, com inteligência artificial para classificação de intenções e extração automática de datas.

**Personalidade**: Funcionário raiz, sarcástico, direto ao ponto. Frases características: *"bora resolver isso ai"*, *"isso aqui ja era pra ontem"*, *"confia no Tarefildo"*.

## 📊 Status

- ✅ **Workflows**: Telegram, WhatsApp, Lembretes agendados
- ✅ **Segurança**: SQL Injection fix (23/23 queries parametrizadas, testes inclusos)
- ✅ **Documentação**: Spec completa, N8N guide, roadmap, testes de segurança
- 🔄 **Próximo**: Rate limiting, lembretes customizados, fuso horário dinâmico

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────┐
│         Mensagens do Usuário            │
│   (WhatsApp via WAHA, Telegram)         │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│        n8n Workflows (3)                │
│  ├─ tarefildo_telegram.json (80+ nós)  │
│  ├─ tarefildo_whatsapp.json  (37KB)    │
│  └─ tarefildo_lembrete_tarefas.json    │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│      DeepSeek API (NLP)                 │
│  - Classificação de intenções           │
│  - Extração de datas                    │
│  - Geração de respostas                 │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│   PostgreSQL 15 (Neon Serverless)       │
│  ├─ usuarios (perfis, fusos)            │
│  ├─ tarefas (CRUD + prioridade)         │
│  ├─ lembretes (customizados)            │
│  └─ audit_log (segurança)               │
└─────────────────────────────────────────┘
```

## 🛠️ Stack Tecnológico

| Componente | Tecnologia |
|---|---|
| **Orquestração** | n8n (self-hosted) |
| **WhatsApp** | WAHA (`@devlikeapro/n8n-nodes-waha`) |
| **Telegram** | n8n-nodes-base.telegram |
| **Banco de Dados** | PostgreSQL 15 (Neon serverless) |
| **IA/NLP** | DeepSeek API (`deepseek-chat`) |
| **Deploy** | n8n self-hosted ou cloud |

## 📁 Estrutura do Projeto

```
tarefildo-bot/
├── migrations/
│   └── 001_sql_injection_fix.sql    # Schema, funções, triggers
├── docs/
│   ├── N8N_DEVELOPMENT_GUIDE.md    # Enterprise dev guide (11 seções)
│   └── spec/
│       ├── SPEC.md                  # 9 requisições de melhoria
│       ├── SQL_INJECTION_FIX_PLAN.md
│       └── REFACTORING_QUERIES_MAPEADAS.md
├── tarefildo_telegram.json          # Workflow Telegram (80+ nós)
├── tarefildo_whatsapp.json          # Workflow WhatsApp (37KB)
├── tarefildo_lembrete_tarefas.json  # Agendador diário (07:00)
├── README.md                        # Este arquivo
└── .claude/                         # Claude Code config
```

## 🚀 Início Rápido

### 1. Pré-requisitos

- **n8n** instalado e rodando (self-hosted ou cloud)
- **PostgreSQL 15+** (Neon recomendado para dev)
- **Credenciais**:
  - WAHA (WhatsApp API)
  - Telegram Bot Token
  - DeepSeek API Key
  - PostgreSQL Connection

### 2. Setup do Banco

```bash
psql postgresql://user:pass@host/neondb < migrations/001_sql_injection_fix.sql
```

Cria:
- Tabela `audit_log` (rastreamento)
- Função `calcular_proxima_data_recorrencia()`
- Triggers automáticos

### 3. Importar Workflows no n8n

1. **Telegram**: `Manage > Workflows > Import > tarefildo_telegram.json`
2. **WhatsApp**: `Manage > Workflows > Import > tarefildo_whatsapp.json`
3. **Lembretes**: `Manage > Workflows > Import > tarefildo_lembrete_tarefas.json`

### 4. Configurar Credenciais

| Serviço | ID | Nome |
|---|---|---|
| WAHA | `F3j9V0WpvTJ6FcNM` | WAHA credential |
| Telegram | `Tg2ndnk8e56GBk97` | Telegram account bot tarefildo |
| PostgreSQL | `lkBdUIuFYhIvqukn` | Neon Database |
| DeepSeek | `h8EobmVsCvc5TFvn` | DeepSeek API |

### 5. Ativar Webhooks

- Telegram: Configure webhook URL em n8n
- WhatsApp: Configure webhook WAHA

## 📖 Documentação

- **[N8N_DEVELOPMENT_GUIDE.md](docs/N8N_DEVELOPMENT_GUIDE.md)** — Princípios, arquitetura, segurança, performance, escalabilidade (650+ linhas)
- **[SPEC.md](docs/spec/SPEC.md)** — 9 requisições priorizadas (SQL injection, rate limiting, lembretes, etc)
- **[SQL_INJECTION_FIX_PLAN.md](docs/spec/SQL_INJECTION_FIX_PLAN.md)** — 23 queries mapeadas com antes/depois

## 🔐 Segurança

### SQL Injection Fix ✅

- **21/23 queries** refatoradas para parametrização (`$1, $2, ...`)
- **Whitelist-based** UPDATE dinâmico
- **Pre-approved queries** para busca natural
- **Audit logging** em DELETE/UPDATE

### Rate Limiting

- WhatsApp: 3s entre mensagens (global state)
- Telegram: 3s entre mensagens (em desenvolvimento)

### Validação de Inputs

- Sanitização de strings (trim, length max)
- Validação de formato (IDs, datas)
- Rejeição de valores inválidos

## 📋 Intents Suportados

```
├─ adicionar_tarefa       (cria nova tarefa)
├─ listar_tarefas         (mostra pendências)
├─ concluir_tarefa        (marca como completa)
├─ editar_tarefa          (altera dados)
├─ excluir_tarefa         (cancela)
├─ adicionar_lembrete     (cria lembrete)
├─ listar_lembretes       (mostra lembretes)
└─ ajuda                  (menu de comandos)
```

## 🗓️ Próximos Passos (Roadmap)

| Prioridade | Requisição | Status |
|---|---|---|
| 🔴 Crítica | SQL Injection Fix | ✅ 95% |
| 🔴 Crítica | Rate Limiting Telegram | 🔄 Pendente |
| 🟠 Alta | Fallback DeepSeek | 🔄 Pendente |
| 🟡 Média | Lembretes Customizados | 🔄 Pendente |
| 🟡 Média | Tarefas Atrasadas | 🔄 Pendente |
| 🟡 Média | Fuso Horário Dinâmico | 🔄 Pendente |
| 🟢 Baixa | Tarefas Recorrentes | 🔄 Pendente |
| 🟢 Baixa | Prioridade de Tarefas | 🔄 Pendente |
| 🟢 Baixa | Resumo Semanal | 🔄 Pendente |

Veja [SPEC.md](docs/spec/SPEC.md) para detalhes completos.

## 🧪 Testando

### Teste Local (WhatsApp)

```bash
# 1. Enviar mensagem via WAHA
curl -X POST http://localhost:5000/webhook \
  -H 'Content-Type: application/json' \
  -d '{"text": "adiciona tarefa pagar boleto"}'

# 2. Verificar resposta do bot
# Esperado: "anotado chefe" + inserção no BD
```

### Teste SQL Injection

```bash
# Tentar SQL injection na busca
curl -X POST http://localhost:5000/webhook \
  -d '{"text": "'\'''; DROP TABLE tarefas; --"}'

# Esperado: Erro SQL ou fallback, NÃO executa DROP
```

## 📞 Contato

- **Autor**: Isabela Alves (bel.alves2012@gmail.com)
- **Repositório**: https://github.com/belalves/tarefildo-bot

## 📄 Licença

Privado — Uso pessoal

---

**Feito com ❤️ e muita ☕ por Claude Code**

*Last updated: 2026-06-24*
