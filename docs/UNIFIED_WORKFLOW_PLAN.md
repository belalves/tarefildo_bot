# Plano de Unificação de Workflows

**Data**: 2026-06-25  
**Objetivo**: Consolidar Telegram + WhatsApp em um único workflow  
**Benefício**: Single source of truth, manutenção 2x menor

---

## Arquitetura Atual (Separado)

```
TELEGRAM:
Telegram Trigger → Filtrar Mensagem → DeepSeek NLP → Parsear → Processar → Enviar Telegram

WHATSAPP:
WAHA Trigger → Filtrar Mensagem → DeepSeek NLP → Parsear → Processar → Enviar WhatsApp
```

**Problema**: Código duplicado, bugs replicam em ambos, features requerem 2x implementação

---

## Arquitetura Nova (Unificado)

```
┌─────────────────────────────────────┐
│  Webhook Trigger (genérico)         │
│  ├─ body.message (Telegram)         │
│  └─ body.payload (WhatsApp/WAHA)    │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Detect Source                      │
│  ├─ if message.from.id → TELEGRAM   │
│  └─ if payload.from → WHATSAPP      │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Parse Input (Unificado)            │
│  ├─ Extract: text, user_id, nome    │
│  ├─ Normalize: whatsapp_id, chatId  │
│  └─ Return: estado unificado        │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  DB: Preparar Estado (único)        │
│  ├─ Upsert usuario                  │
│  ├─ Verificar pendência             │
│  └─ Return: estado + context        │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  [FLUXO ÚNICO DE PROCESSAMENTO]     │
│  ├─ Preparar Prompt                 │
│  ├─ Tentar Fallback                 │
│  ├─ DeepSeek NLP                    │
│  ├─ Parsear NLP                     │
│  ├─ Processar Intent                │
│  │  ├─ Listar Tarefas               │
│  │  ├─ Adicionar Tarefa             │
│  │  ├─ Concluir Tarefa              │
│  │  └─ ... (todas as actions)       │
│  └─ Return: mensagem + intent       │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│  Route to Correct Channel           │
│  ├─ if source === TELEGRAM          │
│  │   └─ Enviar Telegram             │
│  └─ if source === WHATSAPP          │
│      └─ Enviar WhatsApp             │
└─────────────────────────────────────┘
```

---

## Nós Novos/Modificados

### 1. **Webhook Trigger**
- Antes: Telegram Trigger (específico) + WAHA Trigger (específico)
- Depois: Webhook genérico que aceita ambos
- Função: Receber JSON de qualquer origem

### 2. **Detect Source** (Nó novo)
```javascript
const body = $input.first().json;

// Detectar origem
if (body.message?.from?.id) {
  return [{ json: { source: 'TELEGRAM', raw: body } }];
}
if (body.payload?.from) {
  return [{ json: { source: 'WHATSAPP', raw: body } }];
}
return []; // Ignorar
```

### 3. **Parse Telegram** (Nó novo - condicional)
- Apenas se `source === TELEGRAM`
- Extrai: `message.text`, `from.id`, `chat.id`, `from.first_name`
- Retorna: unificado `{ text, phone, chatId, nome, source }`

### 4. **Parse WhatsApp** (Nó novo - condicional)
- Apenas se `source === WHATSAPP`
- Extrai: `payload.body`, `from`, `pushName`
- Retorna: unificado `{ text, phone, chatId, nome, source }`

### 5. **Merge Estados** (Nó novo)
- Combina saída dos 2 parsers
- Garante formato único

### 6. **DB: Preparar Estado** (Modificado)
- Recebe estado unificado
- Upsert funcionário igual para ambas as plataformas

### 7. **[Fluxo Central]**
- Preparar Prompt
- Tentar Fallback
- DeepSeek NLP
- Parsear NLP
- **[Processar Intent - único para ambos]**
  - Listar Tarefas (usa estado unificado)
  - Adicionar Tarefa (usa estado unificado)
  - Concluir (usa estado unificado)
  - ... etc

### 8. **Enviar Telegram** (Condicional)
- Apenas se `source === TELEGRAM`

### 9. **Enviar WhatsApp** (Condicional)
- Apenas se `source === WHATSAPP`

---

## Mapeamento de Campos

| Campo | Telegram | WhatsApp | Unificado |
|---|---|---|---|
| **Texto** | `message.text` | `payload.body` | `text` |
| **ID de Usuário** | `from.id` | `from` (number part) | `phone` |
| **Chat ID** | `chat.id` | `remoteJid` | `chatId` |
| **Nome** | `from.first_name` | `pushName` | `nome` |
| **Timestamp** | `message.message_id` | `payload.timestamp` | `msg_id` |
| **Origem** | — | — | `source` |

---

## Fluxo de Dados

```
INPUT:
  Telegram: { message: { text, from: { id, first_name }, chat: { id } } }
  WhatsApp: { payload: { body, from, timestamp, pushName } }
            ↓
DETECT SOURCE: { source: 'TELEGRAM'|'WHATSAPP', raw: {...} }
            ↓
PARSE (IF source=TELEGRAM):
  { text, phone, chatId, nome, source: 'TELEGRAM' }
            ↓
PARSE (IF source=WHATSAPP):
  { text, phone, chatId, nome, source: 'WHATSAPP' }
            ↓
MERGE: { text, phone, chatId, nome, source }
            ↓
[PROCESSAMENTO ÚNICO]
            ↓
ROUTE (IF source=TELEGRAM): Enviar Telegram
ROUTE (IF source=WHATSAPP): Enviar WhatsApp
```

---

## Vantagens

| Aspecto | Antes | Depois |
|---|---|---|
| **Manutenção** | 2 workflows | 1 workflow |
| **Features novas** | 2x implementação | 1x implementação |
| **Bugs** | Fix 2x | Fix 1x |
| **Deploy** | 2 arquivos | 1 arquivo |
| **Documentação** | Duplicada | Única |
| **Testes** | 2x | 1x |

---

## Timeline

- [ ] 1h: Estruturar novo workflow (criar arquivo base)
- [ ] 1.5h: Implementar Detect Source + Parsers
- [ ] 1h: Modificar nós de processamento (Preparar Estado, etc)
- [ ] 0.5h: Rotas de saída (Telegram + WhatsApp)
- [ ] 1h: Testes com ambas as plataformas
- **Total: ~5h**

---

## Próximos Passos

1. ✅ Criar plano (este documento)
2. ⏳ Gerar arquivo `tarefildo_unified.json`
3. ⏳ Importar no n8n e testar
4. ⏳ Validar funcionamento em ambas as plataformas
5. ⏳ Deprecar `tarefildo_telegram.json` e `tarefildo_whatsapp.json`
6. ⏳ Atualizar documentação

---

*Plano criado: 2026-06-25*
