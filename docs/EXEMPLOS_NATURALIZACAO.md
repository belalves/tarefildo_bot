# Exemplos Práticos: Naturalização de Mensagens

## Exemplo 1: Fluxo "Adicionar Tarefa"

### Atual (Sem Naturalização)
```javascript
// Resposta Tarefa (Code Node)
const db = $input.first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
let msg;
if (db.status === 'AGUARDANDO_DATA') { 
  msg = `Anotado, ${nome}: '${db.titulo}'. Me fala a data 👀`; 
} else { 
  let df=''; 
  if (db.data_vencimento) { 
    const p=db.data_vencimento.split('T')[0].split('-'); 
    df=`${p[2]}/${p[1]}/${p[0]}`; 
  } 
  msg = db.status === 'AGUARDANDO_DATA' 
    ? `Anotado, ${nome}: '${db.titulo}'. Me fala a data 👀`
    : `${nome}, '${db.titulo}' pro dia ${df}. Eu te lembro.`;
}
return [{ json: { chatId: state.chatId, mensagem: msg } }];
```

**Limitações:**
- Mensagens sempre iguais
- Sem contextualização
- Sem variação de tom

---

### Novo (Com Naturalização)

#### Passo 1: Preparar Prompt
```javascript
// Node: "Preparar Prompt - Nova Tarefa"
const input = $input.first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';

const prompt = `Você é o Tarefildo Silva das Pendências. Assistente de tarefas.
Personalidade: funcionário raiz, engraçado, sarcástico.
Usuário: ${nome}

Uma tarefa foi anotada no sistema:
- Título: "${input.titulo || ''}"
- Status: ${input.status || 'PENDENTE'}
${input.data_vencimento ? `- Data: ${new Date(input.data_vencimento).toLocaleDateString('pt-BR')}` : '- Data: não definida'}

Gere uma resposta natural e curta (máximo 2 frases) confirmando que a tarefa foi anotada.
Se não tem data, peça pela data de forma descontraída.
Use até 2 emojis. Responda apenas em texto puro, sem JSON.`;

const text = `tarefa: ${input.titulo}, status: ${input.status}`;

return [{ json: { 
  prompt, 
  text,
  chatId: input.chatId,
  nome,
  titulo: input.titulo,
  status: input.status,
  data: input.data_vencimento
} }];
```

#### Passo 2: Chamar DeepSeek
```javascript
// Conexão HTTP já existente
method: POST
url: https://api.deepseek.com/chat/completions
body: {
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "{{ $json.prompt }}"},
    {"role": "user", "content": "{{ $json.text }}"}
  ],
  "temperature": 0.5,
  "max_tokens": 150
}
```

#### Passo 3: Extrair Resposta
```javascript
// Node: "Extrair Resposta - Nova Tarefa"
const input = $input.first().json;

// Fallback se erro
if (input.error || !input.choices) {
  const titulo = $('Preparar Prompt - Nova Tarefa').first().json.titulo;
  const nome = $('Preparar Prompt - Nova Tarefa').first().json.nome;
  const status = $('Preparar Prompt - Nova Tarefa').first().json.status;
  
  let fallback;
  if (status === 'AGUARDANDO_DATA') {
    fallback = `Anotado, ${nome}: '${titulo}'. Me fala a data 👀`;
  } else {
    fallback = `${nome}, '${titulo}' anotado. Confia no Tarefildo ☕`;
  }
  
  return [{ json: {
    chatId: $('Preparar Prompt - Nova Tarefa').first().json.chatId,
    mensagem: fallback
  }}];
}

// Parse resposta do DeepSeek
let resposta = input.choices[0].message.content.trim();
resposta = resposta.replace(/```json/g, '').replace(/```/g, '').trim();

return [{ json: {
  chatId: $('Preparar Prompt - Nova Tarefa').first().json.chatId,
  mensagem: resposta
} }];
```

**Possíveis respostas do DeepSeek:**
- Sem data: "Anotei 'pagar boleto', João. Cê me passa a data aí pra gente não esquecer? 📅"
- Com data: "Beleza João, 'pagar boleto' pro dia 25/07 tá na lista. Eu te lembro quando chegar 💪"
- Duplicata: "Opa, já tem 'pagar boleto' aqui... Quer eu atualizar ou criar outra? 🤔"

---

## Exemplo 2: Fluxo "Editar Tarefa"

### Sequência Completa

```
Input: { intent: 'editar_tarefa', titulo_atual: 'pagar boleto', nova_data: '2026-07-25' }
                                            ↓
[Preparar Prompt - Editar Tarefa]
  input: { titulo_atual, nova_data, nome }
  output: { prompt: "...", text: "..." }
                                            ↓
[DeepSeek: Naturalizar Resposta]
  → POST api.deepseek.com/chat/completions
  ← "Pronto João, 'pagar boleto' agora é pro dia 25/07. Confia ☕"
                                            ↓
[Extrair Resposta - Editar Tarefa]
  input: { choices[0].message.content }
  output: { chatId, mensagem: "Pronto João..." }
                                            ↓
[Route to Channel?]
  → Telegram OU WhatsApp
```

---

## Exemplo 3: Fluxo "Listar Tarefas" (Atual - Padrão)

Este é o padrão que já está funcionando:

```javascript
// Preparar Prompt Lista
const prompt = `Você eh o Tarefildo Silva das Pendencias, bot assistente sarcastico.
O usuario se chama ${nome}. 
Contexto: Usuario pediu para listar tarefas ${periodoLabel}. 
Total de tarefas encontradas: ${tarefasCount}. 
${tarefasCount > 0 ? `Tarefas: ${listaFormatada}` : 'Nenhuma tarefa nesse periodo.'} 
Gere uma resposta NATURAL. Responda APENAS em texto puro.`;

return [{ json: { prompt, text, tarefasCount, periodo: periodoLabel } }];
```

**Respostas esperadas:**
- 0 tarefas: "Radar limpo essa semana, João 🎉"
- 3 tarefas: "Você tem 3 pendências essa semana: pagar boleto, ligar pro banco e reunião com gerente. Não deixa virar bola de neve 💪"
- Muitas: "Opa, isso aqui ficou com 7 tarefas... já era pra ontem! Bora resolver, João? 😅"

---

## Exemplo 4: Fluxo "Novo Cadastro"

### Código Completo

```javascript
// ===== NODE 1: Preparar Prompt =====
// Name: "Preparar Prompt - Novo Cadastro"
// Type: Code

const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const canal = $('Filtrar Mensagem').first().json.canal || 'unknown';

const prompt = `Você é Tarefildo Silva das Pendências. Bot assistente de tarefas.
Personalidade: funcionário raiz, engraçado, sarcástico, motivador.
Locuções: "bora resolver", "já era pra ontem", "confia no Tarefildo", "menos bagunça".

Um novo usuário acabou de se cadastrar:
- Nome: ${nome}
- Canal: ${canal}
- Primeira vez no bot

Gere uma resposta calorosa de boas-vindas (máximo 3 frases).
Convide para adicionar tarefas. Use 2-3 emojis.
Responda APENAS em texto puro, sem JSON ou markdown.`;

const text = `novo_usuario: ${nome}, canal: ${canal}`;

return [{ json: {
  prompt,
  text,
  chatId: $('Filtrar Mensagem').first().json.chatId,
  nome,
  canal
}}];

// ===== NODE 2: DeepSeek =====
// Usar nó HTTP existente com config acima

// ===== NODE 3: Extrair Resposta =====
// Name: "Extrair Resposta - Novo Cadastro"
// Type: Code

const input = $input.first().json;
const prep = $('Preparar Prompt - Novo Cadastro').first().json;

if (input.error || !input.choices) {
  return [{ json: {
    chatId: prep.chatId,
    mensagem: `Beleza ${prep.nome}, bem-vindo ao Tarefildo! 🎉 Bora organizar suas tarefas? Manda aí!`
  }}];
}

let resposta = input.choices[0].message.content.trim();
resposta = resposta.replace(/```json/g, '').replace(/```/g, '').trim();

return [{ json: {
  chatId: prep.chatId,
  mensagem: resposta
} }];
```

**Respostas esperadas:**
- "Opa João, bem-vindo ao time das pendências! 👋 Aqui é o Tarefildo, seu assistente pra ninguém ficar pra trás. Bora anotar suas tarefas? 💪"
- "Fala Maria! Parabéns por dar esse passo. Agora sim vamos organizar essa bagunça toda 📋 Me manda suas tarefas que eu cuido do resto ☕"

---

## Exemplo 5: Fluxo "Duplicata Detectada"

```javascript
// ===== NODE 1: Preparar Prompt =====

const input = $('Avaliar Duplicata').first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';

const prompt = `Você é Tarefildo. 
Um usuário tentou adicionar uma tarefa que já existe no sistema:
- Tarefa Duplicada: "${input.duplicata_titulo}"
- Data Anterior: ${input.duplicata_info}
- Usuário: ${nome}

Gere uma resposta natural (máximo 2 frases) que:
1. Aponte a duplicata
2. Pergunte se quer criar mesmo assim, editar a existente ou cancelar
3. Use tom sarcástico mas útil

Use até 2 emojis. Responda apenas em texto puro.`;

const text = `usuario: ${nome}, duplicata: ${input.duplicata_titulo}`;

return [{ json: {
  prompt,
  text,
  chatId: input.chatId,
  nome,
  titulo_duplicado: input.duplicata_titulo
}}];

// ===== NODE 3: Extrair Resposta =====

const input = $input.first().json;
const prep = $('Preparar Prompt - Duplicata').first().json;

if (input.error || !input.choices) {
  const titulo = prep.titulo_duplicado;
  return [{ json: {
    chatId: prep.chatId,
    mensagem: `${prep.nome}, já tem '${titulo}' aqui. Quer criar outra mesmo, editar ou cancelar?`
  }}];
}

let resposta = input.choices[0].message.content.trim();
resposta = resposta.replace(/```/g, '').trim();

return [{ json: {
  chatId: prep.chatId,
  mensagem: resposta
} }];
```

**Resposta esperada:**
"João, já tem 'pagar boleto' pro dia 25/07 aqui... Quer criar outra cópia, editar a que já existe ou cancelar? 🤔"

---

## Exemplo 6: Tratamento de Erro com Fallback

```javascript
// Node universal: "Extrair Resposta - Genérico"

const deepseekResponse = $input.first().json;
const context = $('Preparar Prompt').first().json;

// Fallback messages por intent
const fallbacks = {
  'nova_tarefa': `${context.nome}, '${context.titulo}' anotado!`,
  'editar_tarefa': `${context.nome}, '${context.titulo}' atualizado!`,
  'excluir_tarefa': `${context.nome}, '${context.titulo}' removido!`,
  'concluir_tarefa': `${context.nome}, '${context.titulo}' concluída!`,
  'novo_cadastro': `Bem-vindo, ${context.nome}!`,
  'novo_lembrete': `${context.nome}, lembrete '${context.titulo}' anotado!`,
  'default': `Tudo certo, ${context.nome}! 😊`
};

// Se DeepSeek falhou, usar fallback
if (deepseekResponse.error || !deepseekResponse.choices) {
  console.warn(`[FALLBACK] DeepSeek falhou. Intent: ${context.intent}`);
  
  return [{ json: {
    chatId: context.chatId,
    mensagem: fallbacks[context.intent] || fallbacks['default'],
    source: context.source
  }}];
}

// Parse resposta
let mensagem = deepseekResponse.choices[0].message.content.trim();
mensagem = mensagem.replace(/```json/g, '').replace(/```/g, '').trim();

return [{ json: {
  chatId: context.chatId,
  mensagem: mensagem,
  source: context.source
} }];
```

---

## Checklist de Testes

Para cada fluxo naturalizado, testar:

```
Teste: Nova Tarefa - COM DATA
Input: "adiciona pagar boleto dia 25"
✓ Resposta contém nome do usuário
✓ Resposta contém a data (25/07)
✓ Resposta contém emojis (máx 2)
✓ Resposta é breve (até 3 frases)
✓ Funciona em Telegram
✓ Funciona em WhatsApp

Teste: Nova Tarefa - SEM DATA
Input: "adiciona ligar pro chefe"
✓ Resposta pede a data
✓ Usa tom descontraído
✓ Mantém contexto

Teste: Duplicata Detectada
Input: "adiciona pagar boleto" (já existe)
✓ Detecta e avisa
✓ Oferece opções (criar, editar, cancelar)
✓ Não cria duplicata automaticamente

Teste: Fallback (DeepSeek Offline)
Setup: Desligar internet
✓ Retorna fallback automático
✓ Usuário recebe resposta mesmo assim
✓ Log registra fallback
```

---

## Performance e Custos

| Métrica | Valor | Nota |
|---|---|---|
| Tempo médio DeepSeek | 800ms | Com retry (2x) |
| Tokens por resposta | ~100 | Prompt + resposta |
| Custo por msg | ~$0.00005 | Extremamente baixo |
| Throughput | 100+ msg/min | Sem problema |
| Timeout | 15s | Com retry automático |

---

## Troubleshooting

### Problema: Resposta do DeepSeek muito longa
**Solução:** Reduzir `max_tokens` de 200 para 150

### Problema: Resposta muito formal
**Solução:** Ajustar prompt com frases mais diretas ("bora resolver!", "já era pra ontem")

### Problema: Sem emojis
**Solução:** Adicionar no prompt: "Use 2-3 emojis naturalmente"

### Problema: Fallback muito genérico
**Solução:** Criar fallbacks específicos por intent (como no Exemplo 6)

### Problema: Erros de parsing JSON
**Solução:** Sempre remover `` ```json `` e `` ``` `` da resposta antes de usar

---
