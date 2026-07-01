# Templates Reutilizáveis: Naturalização de Mensagens

## Template 1: Preparar Prompt - Estrutura Padrão

```javascript
// Node Type: Code
// Name: "Preparar Prompt - [INTENT]"
// Input: Payload com { titulo, data, nome, status, etc }
// Output: { prompt, text, chatId, nome, source, whatsapp_id, ... }

const input = $input.first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const chatId = input.chatId || $('Filtrar Mensagem').first().json.chatId;
const source = input.source || $('Filtrar Mensagem').first().json.source;
const whatsapp_id = input.whatsapp_id || $('Filtrar Mensagem').first().json.whatsapp_id;

// ===== CUSTOMIZAR APENAS ESTE PROMPT =====
const prompt = `Você é o Tarefildo Silva das Pendências. Bot assistente de tarefas.
Personalidade: funcionário raiz, engraçado, sarcástico, motivador.
Locuções: "bora resolver", "já era pra ontem", "confia no Tarefildo", "menos bagunça".

CONTEXTO:
- Usuário: ${nome}
- Ação: [DESCREVER AÇÃO]
- Dados: [LISTAR DADOS RELEVANTES]

Gere uma resposta natural e curta (máximo 2-3 frases).
[ADICIONAR INSTRUÇÕES ESPECÍFICAS DO INTENT]
Use até 2 emojis. Responda APENAS em texto puro, sem JSON ou markdown.`;

const text = `[RESUMO DA AÇÃO: descricao breve]`;

// ===== NÃO ALTERAR ABAIXO =====
return [{ json: {
  prompt,
  text,
  chatId,
  nome,
  source,
  whatsapp_id,
  // Copiar dados relevantes do input
  ...input
}}];
```

---

## Template 2: Extrair Resposta - Padrão Universal

```javascript
// Node Type: Code
// Name: "Extrair Resposta - [INTENT]"
// Input: Response do DeepSeek
// Output: { chatId, mensagem, source }

const deepseekResponse = $input.first().json;
const prep = $('Preparar Prompt - [INTENT]').first().json;

// ===== CUSTOMIZAR FALLBACK POR INTENT =====
const fallback = `${prep.nome}, [MENSAGEM DE FALLBACK ESPECÍFICA DO INTENT]`;

// ===== NÃO ALTERAR ABAIXO =====
if (deepseekResponse.error || !deepseekResponse.choices) {
  console.warn(`[FALLBACK-INTENT] DeepSeek falhou`);
  return [{ json: {
    chatId: prep.chatId,
    mensagem: fallback,
    source: prep.source,
    whatsapp_id: prep.whatsapp_id
  }}];
}

let resposta = deepseekResponse.choices[0].message.content.trim();
resposta = resposta.replace(/```json/gi, '').replace(/```/g, '').trim();

return [{ json: {
  chatId: prep.chatId,
  mensagem: resposta,
  source: prep.source,
  whatsapp_id: prep.whatsapp_id
} }];
```

---

## Template 3: HTTP Request ao DeepSeek

```javascript
// Node Type: HTTP Request
// Name: "DeepSeek: [INTENT]"
// Method: POST
// URL: https://api.deepseek.com/chat/completions
// Auth: Header Auth (DeepSeek API)
// Headers: Content-Type: application/json

// Body (JSON):
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "{{ $json.prompt }}"
    },
    {
      "role": "user",
      "content": "{{ $json.text }}"
    }
  ],
  "temperature": 0.5,
  "max_tokens": 150
}

// Options:
// - Retry on Fail: true
// - Max Tries: 2
// - Wait Between Tries: 2000ms
// - Timeout: 15000ms
```

---

## Template 4: Prompt Específicos por Intent

### Adicionar Tarefa
```javascript
const prompt = `Você é o Tarefildo Silva das Pendências.
Uma tarefa foi anotada:
- Título: "${input.titulo || ''}"
- Data: ${input.data ? new Date(input.data).toLocaleDateString('pt-BR') : 'não definida'}
- Status: ${input.status || 'PENDENTE'}
- Usuário: ${nome}

Confirme naturalmente que a tarefa foi anotada.
${input.status === 'AGUARDANDO_DATA' ? `Peça pela data de forma descontraída.` : `Confirme a data.`}
Máximo 2 frases. 2 emojis. Texto puro.`;

const text = `tarefa: ${input.titulo}, status: ${input.status}`;
```

### Editar Tarefa
```javascript
const prompt = `Você é Tarefildo.
Uma tarefa foi editada:
- Tarefa: "${input.titulo || ''}"
- Alterações: ${input.nova_data ? `nova data ${new Date(input.nova_data).toLocaleDateString('pt-BR')}` : 'outras alterações'}
- Usuário: ${nome}

Confirme naturalmente a edição.
Máximo 2 frases. 1-2 emojis. Texto puro.`;

const text = `edicao: ${input.titulo}`;
```

### Excluir Tarefa
```javascript
const prompt = `Você é Tarefildo.
Uma tarefa foi removida da lista:
- Tarefa: "${input.titulo || ''}"
- Usuário: ${nome}

Confirme naturalmente que removeu. Use tom de alívio/comemoração.
Máximo 2 frases. 1-2 emojis. Texto puro.`;

const text = `exclusao: ${input.titulo}`;
```

### Concluir Tarefa
```javascript
const prompt = `Você é Tarefildo.
Uma tarefa foi marcada como concluída:
- Tarefa: "${input.titulo || ''}"
- Usuário: ${nome}

Comemorem! Use tom celebratório e motivador.
Máximo 2 frases. 2-3 emojis. Texto puro.`;

const text = `conclusao: ${input.titulo}`;
```

### Novo Cadastro
```javascript
const prompt = `Você é Tarefildo.
Um novo usuário se cadastrou:
- Nome: ${nome}
- Canal: ${input.canal || 'unknown'}

Dê boas-vindas de forma calorosa. Convide a adicionar tarefas.
Máximo 3 frases. 2-3 emojis. Texto puro.`;

const text = `novo_usuario: ${nome}, canal: ${input.canal}`;
```

### Duplicata Detectada
```javascript
const prompt = `Você é Tarefildo.
Um usuário tentou adicionar uma tarefa que já existe:
- Tarefa: "${input.duplicata_titulo || ''}"
- Data Anterior: ${input.duplicata_info || 'sem data'}
- Usuário: ${nome}

Aponte a duplicata e pergunte: quer criar mesmo assim, editar a existente ou cancelar?
Máximo 2 frases. 1-2 emojis. Texto puro.`;

const text = `duplicata: ${input.duplicata_titulo}`;
```

### Novo Lembrete
```javascript
const prompt = `Você é Tarefildo.
Um lembrete foi criado:
- Descrição: "${input.titulo || ''}"
- Hora: ${input.hora || 'sem hora'}
- Usuário: ${nome}

Confirme naturalmente que o lembrete foi salvo.
Máximo 2 frases. 1-2 emojis. Texto puro.`;

const text = `lembrete: ${input.titulo}, hora: ${input.hora}`;
```

### Listar Tarefas
```javascript
const prompt = `Você é Tarefildo.
Um usuário pediu para listar tarefas.
- Período: ${input.periodo || 'tudo'}
- Total: ${input.tarefas_count || 0}
- Usuário: ${nome}
${input.tarefas_count > 0 ? `Tarefas: ${input.lista_formatada}` : 'Nenhuma tarefa.'}

Gere uma resposta natural listando as tarefas ou celebrando se estiver vazio.
Máximo 3 frases. 1-2 emojis. Texto puro.`;

const text = `listagem: ${input.tarefas_count} tarefas no período ${input.periodo}`;
```

### Erro / Não Encontrado
```javascript
const prompt = `Você é Tarefildo.
Um usuário tentou fazer uma ação mas não encontramos o recurso:
- O que procurava: "${input.termo || ''}"
- Usuário: ${nome}

Peça para tentar novamente de forma amigável.
Máximo 2 frases. 1 emoji. Texto puro.`;

const text = `nao_encontrado: ${input.termo}`;
```

---

## Template 5: Fluxo Completo (Copy & Paste)

```javascript
// ============================================
// PREPARAR PROMPT
// ============================================
// Node: Code
const input = $input.first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const chatId = input.chatId || $('Filtrar Mensagem').first().json.chatId;
const source = input.source || $('Filtrar Mensagem').first().json.source;

const prompt = `Você é Tarefildo...
[CUSTOMIZAR PROMPT AQUI]`;

const text = `[CUSTOMIZAR TEXT AQUI]`;

return [{ json: { prompt, text, chatId, nome, source, ...input }}];

// ============================================
// DeepSeek HTTP Request
// ============================================
// POST https://api.deepseek.com/chat/completions
// Headers: Content-Type: application/json
// Body:
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "{{ $json.prompt }}"},
    {"role": "user", "content": "{{ $json.text }}"}
  ],
  "temperature": 0.5,
  "max_tokens": 150
}

// ============================================
// EXTRAIR RESPOSTA
// ============================================
// Node: Code
const response = $input.first().json;
const prep = $('Preparar Prompt').first().json;

const fallback = `${prep.nome}, [FALLBACK ESPECÍFICO DO INTENT]`;

if (response.error || !response.choices) {
  return [{ json: { chatId: prep.chatId, mensagem: fallback } }];
}

let mensagem = response.choices[0].message.content.trim();
mensagem = mensagem.replace(/```json/gi, '').replace(/```/g, '').trim();

return [{ json: { chatId: prep.chatId, mensagem } }];

// ============================================
// CONEXÃO
// ============================================
// Route to Channel? (Switch)
```

---

## Template 6: Dados Esperados em Cada Nó

```javascript
// Após "Filtrar Mensagem" - dados base
{
  phone: "123456789",
  canal: "telegram",
  whatsapp_id: "123456789@telegram",
  chatId: "123456789",
  text: "adiciona pagar boleto dia 25",
  nome: "João",
  source: "TELEGRAM"
}

// Após "Preparar Prompt - [INTENT]" - adicionar:
{
  ...anterior,
  prompt: "Você é Tarefildo...",
  text: "tarefa: pagar boleto, data: 2026-07-25"
}

// Após "DeepSeek: [INTENT]" - adicionar:
{
  ...anterior,
  choices: [{
    message: {
      content: "João, anotei 'pagar boleto' pro dia 25/07..."
    }
  }]
}

// Após "Extrair Resposta - [INTENT]" - simplificar para:
{
  chatId: "123456789",
  mensagem: "João, anotei 'pagar boleto' pro dia 25/07...",
  source: "TELEGRAM"
}

// Para "Route to Channel?" (Switch):
{
  chatId: "123456789",
  mensagem: "João, anotei 'pagar boleto' pro dia 25/07...",
  source: "TELEGRAM"
}
```

---

## Template 7: Variações de Fallback por Contexto

```javascript
// Generic Fallback System
const intent = $('Preparar Prompt').first().json.intent;
const nome = $('Preparar Prompt').first().json.nome;
const dado = $('Preparar Prompt').first().json.dado || '';

const fallbacks = {
  'nova_tarefa': `${nome}, '${dado}' anotado!`,
  'editar_tarefa': `${nome}, '${dado}' atualizado!`,
  'excluir_tarefa': `${nome}, '${dado}' removido! Menos bagunça 💪`,
  'concluir_tarefa': `${nome}, '${dado}' concluída! Já era pra ontem 🎉`,
  'novo_cadastro': `Beleza ${nome}, bem-vindo ao Tarefildo! ☕`,
  'novo_lembrete': `${nome}, lembrete '${dado}' salvo!`,
  'listar_tarefas': `${nome}, tá tudo aqui pra você resolver 📋`,
  'duplicata': `${nome}, achei essa tarefa duplicada aqui...`,
  'erro': `${nome}, não achei isso aí. Me tenta de novo?`,
  'default': `Tudo certo, ${nome}! 😊`
};

const fallback = fallbacks[intent] || fallbacks['default'];
```

---

## Checklist de Implementação

Para cada novo fluxo naturalizado:

- [ ] **Node 1**: Preparar Prompt - Code
  - [ ] Customizar prompt com descrição clara
  - [ ] Incluir contexto (nome, dados relevantes)
  - [ ] Output inclui: prompt, text, chatId, nome, source

- [ ] **Node 2**: DeepSeek HTTP Request
  - [ ] URL: https://api.deepseek.com/chat/completions
  - [ ] Method: POST
  - [ ] Auth: DeepSeek API Header
  - [ ] Temperature: 0.5
  - [ ] Max Tokens: 150-200
  - [ ] Retry: 2x com wait 2000ms
  - [ ] Timeout: 15000ms

- [ ] **Node 3**: Extrair Resposta - Code
  - [ ] Tratamento de erro com fallback
  - [ ] Remove `` ```json `` e `` ``` `` da resposta
  - [ ] Output: { chatId, mensagem, source }

- [ ] **Conexões**: Verificar fluxo
  - [ ] Prep → DeepSeek
  - [ ] DeepSeek → Extrair
  - [ ] Extrair → Route to Channel?

- [ ] **Teste Manual**:
  - [ ] Funciona em Telegram
  - [ ] Funciona em WhatsApp
  - [ ] Fallback funciona (desligar internet)
  - [ ] Resposta contém emojis
  - [ ] Resposta usa nome do usuário

---

## Quick Copy Commands

Para copiar um Node existente:
1. `Preparar Prompt Lista` → Renomear → Customizar
2. `DeepSeek: Gerar Resposta Lista` → Duplicar (mesma config)
3. `Extrair Resposta Lista` → Renomear → Customizar fallback

---
