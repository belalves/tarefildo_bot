# SPEC — Filtro por Período no Listing de Tarefas

**Data:** 2026-06-30  
**Status:** Pendente  
**Prioridade:** Alta (bug de UX)  
**Alinhamento:** [N8N_DEVELOPMENT_GUIDE.md](../../N8N_DEVELOPMENT_GUIDE.md) — §1.1, §2.2, §3.1, §3.2

---

## Problema

Usuário pede "liste minhas tarefas para hoje" e recebe **todas as pendências** sem filtro de data.

**Resposta atual:**
```
Isabela, 6 pendencias no radar:

1. comprar presente irmã — 23/06/2026
2. Comprar presente para Renata — 23/06/2026 as 21:00
3. Comprar blusa do Brasil — 24/06/2026
4. Separar roupa de ir para o jogo do Brasil — 25/06/2026 as 07:00
5. limpar geladeira — 27/06/2026 as 21:00
6. pagar conta de gas — 01/07/2026

Nao deixa virar bola de neve 👀
```

**Resposta esperada** (hoje = 30/06/2026, nenhuma tarefa nesse dia):
```
Isabela, radar limpo pra hoje 🎉 Aproveita.
```

Ou se houvesse tarefas para hoje:
```
Isabela, 1 tarefa pra hoje:

1. limpar geladeira — 30/06/2026 as 21:00

Nao deixa virar bola de neve 👀
```

---

## Causa Raiz

Há **dois bugs independentes**, ambos no mesmo fluxo de listagem.

---

### Bug 1 — `listar_tarefas` ignora período (caminho principal)

**Fluxo atual:**
```
Parsear NLP (intent=listar_tarefas, dados.periodo="hoje")
    ↓
Roteador → listar_tarefas
    ↓
DB: Listar Tarefas
    → query hardcoded: WHERE status='PENDENTE' (sem filtro de data)
    ↓
Formatar Resposta
    → itera items sem checar período
```

**Problema no prompt NLP** (`Preparar Prompt`, nó `90751f23`):

O prompt instrui o DeepSeek a extrair `periodo` apenas para `busca_natural`:
```
Para busca_natural quando usuario perguntar sobre tarefas passadas ou futuras...
  periodo (hoje ou amanha ou ontem ou semana...)
```

Para `listar_tarefas` nenhum `periodo` é mencionado. Portanto, dependendo do modelo, `dados.periodo` pode vir vazio ou preenchido — mas de qualquer forma é ignorado adiante.

**Problema na query** (`DB: Listar Tarefas`, nó `5855264e`):
```sql
-- Query atual: sempre retorna TODAS as pendentes
WHERE u.whatsapp_id = $1
  AND t.status = 'PENDENTE'
ORDER BY prioridade ASC, data_vencimento ASC NULLS LAST
LIMIT 20;
```

Não há nenhuma cláusula de data. O campo `dados.periodo` do NLP é completamente descartado.

---

### Bug 2 — `busca_natural` tem o cálculo de datas correto, mas `DB: Busca Natural` ignora-o

**Fluxo do `busca_natural`:**
```
Roteador → busca_natural
    ↓
Preparar Busca (nó fbfa74d4)
    → calcula dataInicio/dataFim com base em dados.periodo
    → constrói query_busca com BETWEEN parametrizado
    → retorna: { query_busca: "SELECT ... WHERE ... BETWEEN '2026-06-30' AND '2026-06-30'", ... }
    ↓
DB: Busca Natural (nó b210f44d)
    → IGNORA query_busca
    → usa query PRÓPRIA hardcoded:
      "WHERE u.whatsapp_id = $1 AND t.titulo ILIKE $2" ← filtro só por título, sem data
```

O nó `Preparar Busca` já resolve o problema corretamente — mas o nó DB seguinte nunca usa o que foi construído.

**Agravante — SQL Injection em `Preparar Busca`:**

O código atual em `Preparar Busca` (nó `fbfa74d4`) interpola valores diretamente na query:
```javascript
// VULNERÁVEL:
if (termo) where += ` AND t.titulo ILIKE '%${termo}%'`;
const query = `SELECT ... WHERE ${where} ...`;
```

`termo` vem do output do DeepSeek que por sua vez processa input do usuário. Mesmo com a camada do modelo, interpolação direta em SQL é insegura e deve ser eliminada.

---

## Solução

### Abordagem escolhida

Corrigir o caminho `listar_tarefas` para aceitar período, mantendo o fluxo existente mas adicionando:

1. Atualizar o prompt NLP para extrair `periodo` em `listar_tarefas`
2. Adicionar nó `Preparar Filtro Lista` (Code) entre Roteador e `DB: Listar Tarefas`
3. Modificar `DB: Listar Tarefas` para aceitar filtro de data via parâmetros SQL (`$2`, `$3`)

Paralelamente, corrigir `busca_natural`:

4. Modificar `DB: Busca Natural` para executar a `query_busca` já construída pelo `Preparar Busca`
5. Eliminar interpolação direta de `termo` em `Preparar Busca` — usar parametrização

---

### Fix 1 — Atualizar prompt NLP

**Nó:** `Preparar Prompt` (`90751f23`)

Adicionar ao prompt a instrução de extrair `periodo` também para `listar_tarefas`:

```
// ATUAL (trecho relevante):
"intent (adicionar_tarefa ou listar_tarefas ou concluir_tarefa ou editar_tarefa ou excluir_tarefa ou adicionar_lembrete ou listar_lembretes ou busca_natural ou ajuda ou conversa), dados (titulo, titulo_atual, novo_titulo, descricao, data YYYY-MM-DD, nova_data YYYY-MM-DD, hora HH:MM, nova_hora HH:MM, id, consulta, periodo, status_filtro, termo)"

// ADICIONAR após a descrição de listar_tarefas:
"Para listar_tarefas quando usuario quiser ver suas tarefas, extraia tambem: periodo (hoje, amanha, semana, tudo - padrao: tudo se nao especificado)."
```

Texto completo da linha a modificar no prompt (substituição cirúrgica):

**Antes:**
```
intent (adicionar_tarefa ou listar_tarefas ou concluir_tarefa ou editar_tarefa ou excluir_tarefa ou adicionar_lembrete ou listar_lembretes ou busca_natural ou ajuda ou conversa), dados (titulo, titulo_atual, novo_titulo, descricao, data YYYY-MM-DD, nova_data YYYY-MM-DD, hora HH:MM, nova_hora HH:MM, id, consulta, periodo, status_filtro, termo), resposta (frase do Tarefildo). Para editar_tarefa use titulo_atual com o nome atual e nova_data ou nova_hora ou novo_titulo com o valor novo. Para excluir_tarefa use titulo com o nome da tarefa a remover. Para busca_natural quando usuario perguntar sobre tarefas passadas ou futuras ou buscar algo especifico use: consulta (texto da busca), periodo (hoje ou amanha ou ontem ou semana ou semana_passada ou proxima_semana ou mes ou mes_passado ou tudo), status_filtro (PENDENTE ou CONCLUIDA ou CANCELADA ou todos), termo (palavra-chave).
```

**Depois:**
```
intent (adicionar_tarefa ou listar_tarefas ou concluir_tarefa ou editar_tarefa ou excluir_tarefa ou adicionar_lembrete ou listar_lembretes ou busca_natural ou ajuda ou conversa), dados (titulo, titulo_atual, novo_titulo, descricao, data YYYY-MM-DD, nova_data YYYY-MM-DD, hora HH:MM, nova_hora HH:MM, id, consulta, periodo, status_filtro, termo), resposta (frase do Tarefildo). Para listar_tarefas extraia: periodo (hoje ou amanha ou semana ou proxima_semana ou tudo - use tudo se usuario nao especificou periodo). Para editar_tarefa use titulo_atual com o nome atual e nova_data ou nova_hora ou novo_titulo com o valor novo. Para excluir_tarefa use titulo com o nome da tarefa a remover. Para busca_natural quando usuario perguntar sobre tarefas passadas ou futuras ou buscar algo especifico use: consulta (texto da busca), periodo (hoje ou amanha ou ontem ou semana ou semana_passada ou proxima_semana ou mes ou mes_passado ou tudo), status_filtro (PENDENTE ou CONCLUIDA ou CANCELADA ou todos), termo (palavra-chave).
```

---

### Fix 2 — Novo nó `Preparar Filtro Lista`

Inserir entre o Roteador (saída `listar_tarefas`) e `DB: Listar Tarefas`.

```javascript
const state = $input.first().json;
const dados = state.dados || {};
const hoje = new Date().toISOString().split('T')[0];
const d = new Date();
const periodo = (dados.periodo || 'tudo').toLowerCase().trim();

let dataInicio = null;
let dataFim = null;

if (periodo === 'hoje') {
  dataInicio = hoje;
  dataFim = hoje;
} else if (periodo === 'amanha') {
  const amanha = new Date(d);
  amanha.setDate(d.getDate() + 1);
  dataInicio = amanha.toISOString().split('T')[0];
  dataFim = dataInicio;
} else if (periodo === 'semana') {
  const seg = new Date(d);
  seg.setDate(d.getDate() - d.getDay() + 1);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  dataInicio = seg.toISOString().split('T')[0];
  dataFim = dom.toISOString().split('T')[0];
} else if (periodo === 'proxima_semana' || periodo === 'semana_que_vem') {
  const proxSeg = new Date(d);
  proxSeg.setDate(d.getDate() - d.getDay() + 8);
  const proxDom = new Date(proxSeg);
  proxDom.setDate(proxSeg.getDate() + 6);
  dataInicio = proxSeg.toISOString().split('T')[0];
  dataFim = proxDom.toISOString().split('T')[0];
}
// 'tudo' ou qualquer outro valor: sem filtro de data

return [{ json: {
  ...state,
  filtro_data_inicio: dataInicio,
  filtro_data_fim: dataFim,
  filtro_periodo: periodo
} }];
```

**Características:**
- Nó Code simples, < 40 linhas
- `dataInicio`/`dataFim` como `null` quando sem filtro (query usa `NULLS LAST` logic)
- Nunca interpola valores em SQL — passa como parâmetros

---

### Fix 3 — Modificar `DB: Listar Tarefas`

**Nó:** `DB: Listar Tarefas` (`5855264e`)

**Query atual:**
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.prioridade
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE u.whatsapp_id = $1
  AND t.status = 'PENDENTE'
ORDER BY CASE WHEN t.prioridade = 'ALTA' THEN 1
              WHEN t.prioridade = 'MEDIA' THEN 2
              ELSE 3 END ASC,
         t.data_vencimento ASC NULLS LAST
LIMIT 20;
```

**Query nova:**
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.prioridade
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE u.whatsapp_id = $1
  AND t.status = 'PENDENTE'
  AND ($2::date IS NULL OR t.data_vencimento >= $2::date)
  AND ($3::date IS NULL OR t.data_vencimento <= $3::date)
ORDER BY CASE WHEN t.prioridade = 'ALTA' THEN 1
              WHEN t.prioridade = 'MEDIA' THEN 2
              ELSE 3 END ASC,
         t.data_vencimento ASC NULLS LAST
LIMIT 20;
```

**Query Parameters (campo `queryReplacement`):**
```
={{ $json.whatsapp_id }},{{ $json.filtro_data_inicio ?? null }},{{ $json.filtro_data_fim ?? null }}
```

**Por que `$2::date IS NULL OR`:** O Postgres avalia `NULL::date IS NULL` como `TRUE`, então a condição é ignorada quando não há filtro. Isso mantém o comportamento atual ("tudo") sem mudar a estrutura do nó para queries com e sem filtro.

---

### Fix 4 — Corrigir `DB: Busca Natural` para usar `query_busca`

**Nó:** `DB: Busca Natural` (`b210f44d`)

O nó `Preparar Busca` (`fbfa74d4`) já constrói `query_busca` com datas corretas, mas o DB ignora. A correção é fazer o DB executar `query_busca`.

**Configuração atual do nó:**
```
operation: executeQuery
query: "SELECT id, titulo ... WHERE u.whatsapp_id = $1 AND t.titulo ILIKE $2 ..."
queryReplacement: (campos hardcoded)
```

**Configuração nova:**
```
operation: executeQuery
query: ={{ $json.query_busca }}
```

Isso elimina a query hardcoded e usa a query já construída por `Preparar Busca`.

---

### Fix 5 — Eliminar SQL injection em `Preparar Busca`

**Nó:** `Preparar Busca` (`fbfa74d4`)

Problema atual: `termo` do usuário é interpolado diretamente no WHERE.

**Solução:** Separar `query_busca` (sem `termo`) de `query_params` (com `termo` como parâmetro).

Alterar o nó para retornar:
```javascript
// Ao invés de interpolar termo na query:
// where += ` AND t.titulo ILIKE '%${termo}%'`; // INSEGURO

// Separar:
const usarTermo = termo.length > 0;
const termoParam = usarTermo ? `%${termo}%` : null;

// A query usa $N para termo quando presente
let paramIdx = 2; // $1 = whatsapp_id já foi usado pelo estilo anterior, mas aqui montamos diferente
const params = [state.whatsapp_id];

if (dataInicio && dataFim) {
  where += ` AND t.data_vencimento BETWEEN $${paramIdx}::date AND $${++paramIdx}::date`;
  params.push(dataInicio, dataFim);
  paramIdx++;
}
if (statusFiltro !== 'TODOS') {
  where += ` AND t.status = $${paramIdx}`;
  params.push(statusFiltro);
  paramIdx++;
}
if (usarTermo) {
  where += ` AND t.titulo ILIKE $${paramIdx}`;
  params.push(termoParam);
  paramIdx++;
}

return [{ json: {
  ...state,
  query_busca: `SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.status FROM tarefas t JOIN usuarios u ON u.id = t.usuario_id WHERE ${where} ORDER BY t.data_vencimento ASC NULLS LAST LIMIT 20;`,
  query_params: params.join(',')
} }];
```

E `DB: Busca Natural` usa:
```
query: ={{ $json.query_busca }}
queryReplacement: ={{ $json.query_params }}
```

---

### Fix 6 — Gerar Resposta Natural via LLM (DeepSeek/Claude)

**Problema:** Template hardcoded repetindo "Não deixa virar bola de neve 👀" em todas as respostas não é natural.

**Solução:** Usar LLM para gerar resposta contextualizada e variada a cada listagem.

**Fluxo novo:**

```
DB: Listar Tarefas (retorna lista de tarefas)
    ↓
Preparar Prompt Lista (Code node)
    → formata dados em texto legível
    → constrói prompt para LLM com contexto
    ↓
DeepSeek: Gerar Resposta Lista (HTTP)
    → recebe contexto (tarefas, período, qtd, nome)
    → gera resposta natural em voz do Tarefildo
    ↓
Extrair Resposta Lista (Code node)
    → limpa resposta, remove markdown se houver
    ↓
Route to Channel (Telegram/WhatsApp)
```

#### Nó novo: `Preparar Prompt Lista`

```javascript
const items = $input.all();
const filtro = $('Preparar Filtro Lista').first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const periodo = filtro.filtro_periodo || 'tudo';
const v = items.filter(i => i.json?.titulo);

const periodoLabel = {
  'hoje': 'hoje',
  'amanha': 'amanha',
  'semana': 'essa semana',
  'proxima_semana': 'semana que vem',
  'tudo': 'no geral'
}[periodo] || periodo;

let listaFormatada = '';
if (v.length > 0) {
  listaFormatada = v.map((i, idx) => {
    let info = '';
    if (i.json.data_vencimento) {
      const p = i.json.data_vencimento.split('T')[0].split('-');
      info = `${p[2]}/${p[1]}/${p[0]}`;
    } else {
      info = 'sem data';
    }
    if (i.json.hora_vencimento) info += ` as ${i.json.hora_vencimento.substring(0, 5)}`;
    return `${idx+1}. ${i.json.titulo} — ${info}`;
  }).join('\n');
}

const prompt = `Voce eh o Tarefildo Silva das Pendencias, bot assistente sarcastico e engracado. O usuario se chama ${nome}.

Contexto:
- Usuario pediu para listar tarefas ${periodoLabel}
- Total de tarefas encontradas: ${v.length}

${v.length > 0 ? `Tarefas listadas:\n${listaFormatada}` : 'Nenhuma tarefa encontrada nesse periodo.'}

Gere uma resposta NATURAL em uma ou duas frases diretas:
- Se houver tarefas: liste resumidamente (pode numerar) com tom sarcastico mas motivador
- Se nao houver: celebre a lista vazia com humor apropriado
- Sempre na voz do Tarefildo (usa: bora resolver, ja era pra ontem, confia no Tarefildo)
- Use 1-2 emojis, nao exagere
- Seja breve (ate 2 linhas se houver tarefas, 1 linha se vazio)
- NUNCA repita a mesma resposta palavra por palavra - varie o tom, sarcasmo, encerramento, emojis

Responda APENAS a mensagem em texto puro, sem JSON, sem markdown, sem backticks.`;

const text = v.length > 0 ? `${v.length} tarefa${v.length > 1 ? 's' : ''} ${periodoLabel}` : `nenhuma tarefa ${periodoLabel}`;

return [{ json: { 
  prompt, 
  text, 
  tarefas_count: v.length, 
  periodo: periodoLabel, 
  nome,
  chatId: filtro.chatId,
  whatsapp_id: filtro.whatsapp_id,
  source: $('Filtrar Mensagem').first().json.source
} }];
```

#### Nó novo: `DeepSeek: Gerar Resposta Lista` (HTTP Request)

**Configuração do nó:**
- **method:** POST
- **url:** `https://api.deepseek.com/chat/completions`
- **authentication:** Generic Credential Type (httpHeaderAuth)
- **sendHeaders:** true
- **Header:** `Content-Type: application/json`

**Body (JSON):**
```json
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
  "temperature": 0.7,
  "max_tokens": 150
}
```

**Configuração do nó:**
- `timeout: 15000` (15 segundos)
- `retryOnFail: true`
- `maxTries: 2`
- `waitBetweenTries: 2000`

**Por que `temperature: 0.7`:**
- `0.7` = criatividade moderada → respostas variadas mas coerentes
- `0.3` seria muito repetitivo, `0.9+` seria incoerente
- `max_tokens: 150` = ~25 palavras, breve e direto

#### Nó novo: `Extrair Resposta Lista` (Code)

```javascript
const input = $input.first().json;

// Se DeepSeek falhar, fallback seguro
if (input.error || !input.choices) {
  const nome = input.nome || 'chefe';
  const tarefas = input.tarefas_count || 0;
  const periodo = input.periodo || 'no geral';
  
  if (tarefas === 0) {
    return [{ json: { chatId: input.chatId, mensagem: `${nome}, radar limpo ${periodo} 🎉` } }];
  } else {
    return [{ json: { chatId: input.chatId, mensagem: `${nome}, ${tarefas} tarefa${tarefas > 1 ? 's' : ''} ${periodo} pra resolver 💪` } }];
  }
}

let resposta = input.choices[0].message.content.trim();

// Limpar markdown acidental se DeepSeek retornar com backticks
resposta = resposta
  .replace(/```json/g, '')
  .replace(/```/g, '')
  .trim();

return [{ json: { 
  chatId: input.chatId, 
  mensagem: resposta,
  source: input.source,
  whatsapp_id: input.whatsapp_id
} }];
```

**Fallback (quando DeepSeek cai):** Retorna mensagem simples — não é ideal, mas continua funcionando.

---

#### Remover ou neutralizar `Formatar Resposta` para `listar_tarefas`

O case `listar_tarefas` em `Formatar Resposta` (`3a743232`) **deve ser removido** ou **neutralizado** (retornar vazio) porque o fluxo agora é:

```
Preparar Prompt Lista
    ↓
DeepSeek: Gerar Resposta Lista
    ↓
Extrair Resposta Lista
    ↓
Route to Channel (direto para envio)
```

O nó `Formatar Resposta` continua existindo para outros intents (`busca_natural`, `concluir_tarefa`, `adicionar_lembrete`, etc.), mas **`listar_tarefas` desvia antes de chegar lá**.

**Configuração do Roteador (nó `475a192d`):**

Garantir que a saída `listar_tarefas` do switch vai direto para `Preparar Prompt Lista`, não passa por `Formatar Resposta`.

---

### Exemplos de Respostas Variadas (esperado com LLM)

Usuário: "minhas tarefas para hoje"  
DeepSeek gera (exemplo 1):
```
Isabela, 1 tarefa pra hoje: limpar geladeira as 21:00. Bora resolver! 💪
```

Mesmo usuário + tempo, mesma pergunta:  
DeepSeek gera (exemplo 2):
```
Isabela, 1 pendencia de hoje: limpar geladeira as 21:00. Já era pra ter feito 😬
```

Mesmo usuário, nenhuma tarefa:  
DeepSeek gera (exemplo 1):
```
Radar limpo pra hoje, Isabela! Aproveita o tempo livre ☕
```

Mesmo usuário, nenhuma tarefa, novo turno:  
DeepSeek gera (exemplo 2):
```
Isabela, zero pendencias pra hoje. Tá tranquilo demais 🎉
```

Múltiplas tarefas:  
DeepSeek gera:
```
Isabela, 6 no radar: comprar presente, blusa do Brasil, geladeira... Isso é trabalho! 😅
```

---

**Vantagens dessa abordagem:**
✅ Cada resposta é natural e contextualizada  
✅ Nunca repete — LLM varia tone, emojis, construção de frase  
✅ Simples de manter — mudar tom? Mudar prompt, não o código  
✅ Acompanha a voz do bot em outras partes do workflow (DeepSeek já usado em `Preparar Prompt` principal)  
✅ Fallback seguro se API cair  
✅ Custo desprezível (150 tokens, ~0.001 USD por request)

**Desvantagens:**
⚠️ Uma request HTTP extra por listagem (latência +0.3-0.5s se DeepSeek rápido)  
⚠️ Dependência de API externa (DeepSeek disponível)  
⚠️ Se `temperature: 0.7` gerar resposta fora do contexto (improvável), fallback ativa



---

## Fluxo Atualizado

### Listing sem período
```
"minhas tarefas"
  → NLP: intent=listar_tarefas, dados.periodo="tudo" (ou vazio → "tudo")
  → Preparar Filtro Lista: dataInicio=null, dataFim=null
  → DB: Listar Tarefas: $2=null, $3=null → WHERE ignora datas → retorna 6 tarefas
  → Preparar Prompt Lista: monta prompt com contexto (6 tarefas, período "no geral")
  → DeepSeek: Gerar Resposta Lista: "Isabela, 6 no radar: comprar presente, blusa... 😅"
  → Extrair Resposta Lista: limpa resposta
  → Route to Channel → Telegram/WhatsApp
```

### Listing com período — hoje (sem tarefas)
```
"lista minhas tarefas para hoje"
  → NLP: intent=listar_tarefas, dados.periodo="hoje"
  → Preparar Filtro Lista: dataInicio="2026-06-30", dataFim="2026-06-30"
  → DB: Listar Tarefas: WHERE ... BETWEEN ... → 0 tarefas
  → Preparar Prompt Lista: monta prompt (0 tarefas, período "hoje")
  → DeepSeek: Gerar Resposta Lista: "Radar limpo pra hoje, Isabela! Aproveita ☕"
  → Extrair Resposta Lista: limpa
  → Route to Channel → Telegram/WhatsApp
```

### Listing com período — amanhã (com tarefa)
```
"o que tenho pra amanha?"
  → NLP: intent=listar_tarefas, dados.periodo="amanha"
  → Preparar Filtro Lista: dataInicio="2026-07-01", dataFim="2026-07-01"
  → DB: Listar Tarefas: WHERE ... BETWEEN ... → 1 tarefa (geladeira)
  → Preparar Prompt Lista: monta prompt (1 tarefa, período "amanha")
  → DeepSeek: Gerar Resposta Lista: "Isabela, 1 pendencia: limpar geladeira as 21:00. Bora? 💪"
  → Extrair Resposta Lista: limpa
  → Route to Channel → Telegram/WhatsApp
```

### Listing com período — semana (com múltiplas)
```
"tarefas dessa semana"
  → NLP: intent=listar_tarefas, dados.periodo="semana"
  → Preparar Filtro Lista: dataInicio="2026-06-29", dataFim="2026-07-05" (seg-dom)
  → DB: Listar Tarefas: WHERE ... BETWEEN ... → 4 tarefas
  → Preparar Prompt Lista: monta prompt (4 tarefas, período "essa semana")
  → DeepSeek: Gerar Resposta Lista: "Essa semana tem: presente, blusa, roupa, geladeira. Relaxa! 😅"
  → Extrair Resposta Lista: limpa
  → Route to Channel → Telegram/WhatsApp
```

### Busca natural com período (caminho corrigido)
```
"quais tarefas venci essa semana?"
  → NLP: intent=busca_natural, dados.periodo="semana", dados.status_filtro="CONCLUIDA"
  → Preparar Busca: calcula datas, monta query_busca + query_params (parametrizado)
  → DB: Busca Natural: executa query_busca com query_params → retorna tarefas concluídas
  → Formatar Busca: lista com emoji de status (✅ CONCLUIDA, ⏳ PENDENTE)
  → Route to Channel → Telegram/WhatsApp
```

**Diferenças:**
- **`listar_tarefas`** → Respostas naturais via LLM, sempre variadas
- **`busca_natural`** → Respostas estruturadas via `Formatar Busca` (template com emojis de status)
- Ambas agora respeitam período/filtro corretamente

---

## Nós Afetados

| Nó | Ação | Alinhamento Guide |
|----|------|-------------------|
| `Preparar Prompt` (`90751f23`) | **Alterar** — adicionar instrução `periodo` para `listar_tarefas` | §5.1 Prompt engineering |
| `Preparar Filtro Lista` | **Novo** — Code node, converte período em datas, sem interpolação SQL | §2.2 Code <50 linhas, §3.2 Validação |
| `DB: Listar Tarefas` (`5855264e`) | **Alterar** — query com `$2::date IS NULL OR` para filtro opcional | §3.1 Parametrização |
| `Preparar Prompt Lista` | **Novo** — Code node, monta contexto para LLM gerar resposta natural | §2.2 Code <60 linhas, §5.1 Prompt |
| `DeepSeek: Gerar Resposta Lista` | **Novo** — HTTP node chamando DeepSeek para respostas variadas | §1.2 HTTP retry, §5.2 LLM integration |
| `Extrair Resposta Lista` | **Novo** — Code node, limpa resposta da LLM, fallback se falhar | §2.2 Code <30 linhas, §1.4 Fallback |
| `DB: Busca Natural` (`b210f44d`) | **Alterar** — usar `query_busca` do nó anterior em vez de query hardcoded | §3.1 Parametrização |
| `Preparar Busca` (`fbfa74d4`) | **Alterar** — eliminar interpolação de `termo`, usar parâmetros | §3.2 Segurança SQL |
| `Roteador` (`475a192d`) | **Alterar** — garantir que `listar_tarefas` desvia para `Preparar Prompt Lista`, não `Formatar Resposta` | §2.1 Fluxo |

---

## Segurança

| Risco | Mitigação | Status |
|-------|-----------|--------|
| Filtro de data por string interpolada | Datas calculadas em JS, passadas como `$2`/`$3` parametrizados | ✅ Seguro |
| `termo` interpolado em ILIKE | Reescrita com `$N` parametrizado em `Preparar Busca` | ✅ Seguro (Fix 5) |
| Input `periodo` inválido | JS trata casos desconhecidos como `tudo` (sem filtro) — query não falha | ✅ Seguro |
| whatsapp_id em `Preparar Busca` | Já passado como `$1` parametrizado | ✅ Já seguro |

---

## Testes Necessários

| Cenário | Input | Esperado |
|---------|-------|----------|
| Sem período | "minhas tarefas" | Retorna todas as pendentes (comportamento atual preservado) |
| Período "hoje" — sem tarefas | "tarefas de hoje" | "Lista limpa pra hoje, [nome]" |
| Período "hoje" — com tarefa | "o que tenho hoje?" | Lista apenas tarefas com `data_vencimento = CURDATE()` |
| Período "amanhã" | "tarefas pra amanha" | Filtra por amanhã |
| Período "semana" | "o que tenho essa semana?" | Filtra pela semana atual (seg–dom) |
| Período ambíguo | "me mostra as tarefas" | `periodo="tudo"`, retorna tudo |
| Busca natural com período | "o que venceu essa semana?" | `busca_natural` com datas corretas, usando `query_busca` |
| Busca natural com termo SQL | "busca tarefa ' OR 1=1 --" | Parâmetro escapado, 0 resultados seguros |
| Período + Fallback NLP | DeepSeek retorna sem `dados.periodo` | Code node usa default `'tudo'`, sem erro |

---

## Estimativa

| Item | Tempo |
|------|-------|
| Fix prompt NLP — adicionar `periodo` para `listar_tarefas` | 5 min |
| Novo nó `Preparar Filtro Lista` (Code) | 10 min |
| Alterar `DB: Listar Tarefas` (query com `$2::date IS NULL OR`) | 5 min |
| Novo nó `Preparar Prompt Lista` (Code, monta prompt para LLM) | 10 min |
| Novo nó `DeepSeek: Gerar Resposta Lista` (HTTP POST) | 8 min |
| Novo nó `Extrair Resposta Lista` (Code, fallback) | 8 min |
| Redirecionar `Roteador` — `listar_tarefas` → `Preparar Prompt Lista` | 5 min |
| Corrigir `DB: Busca Natural` — usar `query_busca` | 5 min |
| Reescrever `Preparar Busca` sem interpolação | 15 min |
| Testes manuais (listagem simples, período, sem tarefas, com LLM variado) | 20 min |
| **Total** | **~91 min** |

---

## Checklist de Produção

**SQL & Dados:**
- [ ] Nenhum valor de usuário interpolado em SQL — todos via `$N`
- [ ] `$2::date IS NULL OR` validado no Postgres (testar com parâmetro `null` literal)
- [ ] `Preparar Filtro Lista` trata `dados` ausente (NLP falhou) sem erro de runtime
- [ ] Cenário "todas as tarefas" (sem período) preserva comportamento atual
- [ ] `DB: Busca Natural` com `query_busca` + `query_params` funciona para busca com e sem `termo`

**LLM & Resposta:**
- [ ] `DeepSeek: Gerar Resposta Lista` tem `temperature: 0.7` (criatividade moderada)
- [ ] `max_tokens: 150` garante respostas breves (<2 linhas)
- [ ] `Extrair Resposta Lista` fallback ativa se DeepSeek falhar (não quebra fluxo)
- [ ] Prompt sistema em `Preparar Prompt Lista` menciona "NUNCA repita a mesma resposta" para evitar loops de repetição
- [ ] Teste com 5+ chamadas seguidas de listagem — confirmar respostas variam

**Fluxo & Roteamento:**
- [ ] `Roteador` (switch) redireciona `listar_tarefas` para `Preparar Prompt Lista`, NÃO para `Formatar Resposta`
- [ ] `Formatar Resposta` case `listar_tarefas` está removido ou neutralizado (retorna vazio)
- [ ] Teste de taxa de limite (usuário manda 3 listagens em 1 segundo) não quebra estado
- [ ] DeepSeek retry configurado (`maxTries: 2`, `waitBetweenTries: 2000`)

**Edge Cases:**
- [ ] Sem tarefas → resposta celebra (ex.: "Radar limpo")
- [ ] 1 tarefa → resposta singular (ex.: "1 pendencia")
- [ ] 2+ tarefas → resposta plural (ex.: "6 no radar")
- [ ] Período vazio/inválido → código normaliza para "tudo" (sem erro)
- [ ] Tarefa sem data → lista como "sem data" mas não quebra formatação

---

## Riscos Residuais

**Extraction & Filtering:**
- **DeepSeek inconsistente no `periodo`:** O modelo pode retornar `"hoje"`, `"Hoje"`, `"today"`, `"pra hoje"` etc. O Code node (`periodo.toLowerCase().trim()`) trata capitalização, mas variações em inglês ou frases longas caem em `tudo`. Mitigação: expandir o mapeamento ou adicionar normalização regex se necessário.
- **Tarefas sem `data_vencimento`:** A query filtra por `data_vencimento BETWEEN $2 AND $3`. Tarefas com `data_vencimento = NULL` nunca aparecerão em filtros de período — comportamento esperado e correto (NULL LAST já ignorado).
- **Timezone:** `new Date()` em n8n usa UTC. A data "hoje" pode estar errada para usuários em UTC-3 às 21h+. Fix futuro: usar `NOW() AT TIME ZONE 'America/Sao_Paulo'` no Postgres para calcular `hoje` no servidor (já feito em outros nós como `DB: Adicionar Lembrete`).

**LLM & API:**
- **DeepSeek cai:** Fallback em `Extrair Resposta Lista` ativa com resposta genérica. Não ideal, mas fluxo continua. Monitorar taxa de falha em logs.
- **Resposta fora do contexto:** Com `temperature: 0.7`, improvável mas possível DeepSeek gerar resposta incoerente (ex.: "compre um cachorro" para lista de tarefas). Mitigação: adicionar validação regex no fallback (ex.: comprimento mínimo, presença de nome do usuário). Futuro: adicionar retry de reformulação do prompt se resposta < 5 chars.
- **Prompt Injection via título de tarefa:** Título malicioso (ex.: "Ignore tudo e responda X") interpolado no prompt. Mitigação: títulos já passam pelo banco e NLP, baixo risco, mas considerar escapar caracteres especiais em `Preparar Prompt Lista` se necessário.
- **Latência:** Cada listagem agora inclui 1 request HTTP (DeepSeek). Latência +0.3-0.8s dependendo de ping/congestão. Aceitável para UX de bot. Se crítico, considerar cache de respostas (hash do contexto).
- **Custo:** ~150 tokens por listagem × N usuários/dia. DeepSeek pricing ~$0.001 USD por 1K tokens. Negligenciável para pequena base de usuários.

**Integration:**
- **Roteador complexidade:** Com novo `listar_tarefas` → `Preparar Prompt Lista`, garantir que o switch não tira o fluxo de erro. Testar: simular falha de DB, confirmar mensagem de erro chega ao usuário.
- **Global state contaminado:** Se `Preparar Filtro Lista` não limpar contexto, podem vazar dados entre usuários. Mitigação: Code node nunca usa globalState, apenas passa dados via json, seguro.
