# SPEC — Bug: Concluir Tarefa Não Encontra a Tarefa

**Data:** 2026-06-28  
**Status:** Concluido  
**Prioridade:** Alta (bug crítico — funcionalidade core quebrada)  
**Alinhamento:** [N8N_DEVELOPMENT_GUIDE.md](../../N8N_DEVELOPMENT_GUIDE.md)

---

## Resumo

O usuário lista tarefas com sucesso, mas ao tentar concluir uma delas (ex: "concluir tarefa pagar conta de luz"), o bot responde **"Nao achei"**. Três bugs distintos impediam a conclusão.

## Reprodução

```
Usuário: "listar tarefas"
Bot:     "1. Pagar conta de luz — 23/06/2026 ..."   ← ✅ encontrou

Usuário: "concluir tarefa pagar conta de luz"
Bot:     "Nao achei, Isabela. Me fala o nome."       ← ❌ não encontrou
```

---

## Problemas Identificados

### Bug 1: ILIKE usado com padrão regex (operador errado)

**Sintoma:** A busca por título nunca encontra a tarefa, mesmo com nome exato.

**Causa raiz:** O node **"Preparar Busca Conclusão"** monta um padrão regex com `|` (alternação), mas a query SQL usa `ILIKE`, que **não suporta regex** — apenas wildcards `%` e `_`.

**Fluxo do bug:**

```
Input do usuário: "concluir tarefa pagar conta de luz"

1. NLP extrai titulo: "pagar conta de luz"

2. Preparar Busca Conclusão (JS):
   - Remove stopwords ["de"] → palavras = ["pagar", "conta", "luz"]
   - Junta com "|" → busca = "pagar|conta|luz"

3. SQL executada:
   WHERE t.titulo ILIKE 'pagar|conta|luz'
   
   ❌ ILIKE interpreta isso como literal "pagar|conta|luz"
   ❌ Não faz match com "Pagar conta de luz"
```

**Correção:** Trocar `ILIKE $2` por `~* $2` (operador de regex case-insensitive do PostgreSQL).

**Node afetado:** `DB: Buscar para Concluir` (id: `61b56104-fe5a-4c7f-bb45-95184860f676`)

---

### Bug 2: CAST desnecessário no JOIN

**Causa raiz:** A query de conclusão usa `CAST(t.usuario_id AS uuid)` no JOIN, mas a query de listagem (que funciona) usa `u.id = t.usuario_id` sem CAST.

| Operação | JOIN | Funciona? |
|----------|------|-----------|
| Listar Tarefas | `u.id = t.usuario_id` | ✅ Sim |
| Buscar para Concluir | `u.id = CAST(t.usuario_id AS uuid)` | ❌ Risco |

**Correção:** Remover o `CAST` e usar JOIN direto.

---

### Bug 3: Roteamento — "Formatar Resposta" sobrescreve a resposta correta (BUG PRINCIPAL)

**Sintoma:** Mesmo com os Bugs 1 e 2 corrigidos, a tarefa é encontrada e concluída no banco, mas o bot ainda responde "Nao achei".

**Causa raiz:** O fluxo de conclusão estava:

```
DB: Concluir Tarefa → Resposta Concluiu Tarefa → Formatar Resposta → Route to Channel
```

O node **"Resposta Concluiu Tarefa"** já produzia a resposta correta:
```json
{ "chatId": "6628461206", "mensagem": "Ja era pra ontem, Isabela! Marca 'Pagar conta de luz' como concluida..." }
```

Mas depois passava por **"Formatar Resposta"**, que é um node genérico com switch/case por intent. Para `concluir_tarefa`, o código faz:

```javascript
case 'concluir_tarefa': {
  const t = items[0]?.json?.titulo;  // ← procura 'titulo' no input
  msg = t ? `Ai sim! '${t}' riscada` : `Nao achei, ${nome}. Me fala o nome.`;
}
```

O input vindo de "Resposta Concluiu Tarefa" tem `{ chatId, mensagem }` — **não tem campo `titulo`** → `t` é `undefined` → cai no "Nao achei" e sobrescreve a resposta correta.

O mesmo problema afetava "Tarefa Não Encontrada", que também já produzia sua própria resposta formatada.

**Correção:** Redirecionar ambos os nodes diretamente para "Route to Channel?", pulando "Formatar Resposta":

```
ANTES:  Resposta Concluiu Tarefa → Formatar Resposta → Route to Channel?
DEPOIS: Resposta Concluiu Tarefa → Route to Channel?

ANTES:  Tarefa Não Encontrada → Formatar Resposta → Route to Channel?
DEPOIS: Tarefa Não Encontrada → Route to Channel?
```

---

## Correções Aplicadas

### 1. Query SQL do "DB: Buscar para Concluir"

**De:**
```sql
SELECT t.id, t.titulo FROM tarefas t 
JOIN usuarios u ON u.id = CAST(t.usuario_id AS uuid)
WHERE u.whatsapp_id = $1 AND t.status IN ('PENDENTE', 'AGUARDANDO_DATA') 
AND t.titulo ILIKE $2 ORDER BY t.criado_em DESC LIMIT 1;
```

**Para:**
```sql
SELECT t.id, t.titulo FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id
WHERE u.whatsapp_id = $1 AND t.status IN ('PENDENTE', 'AGUARDANDO_DATA') 
AND t.titulo ~* $2 ORDER BY t.criado_em DESC LIMIT 1;
```

### 2. Conexões no workflow (seção `connections` do JSON)

**"Resposta Concluiu Tarefa"** e **"Tarefa Não Encontrada"**: destino alterado de `"Formatar Resposta"` para `"Route to Channel?"`.

---

## Casos de Teste

| # | Input usuário | Título no banco | Regex gerado | Resultado esperado |
|---|---------------|----------------|--------------|-------------------|
| 1 | "concluir tarefa pagar conta de luz" | "Pagar conta de luz" | `pagar\|conta\|luz` | ✅ Encontra e conclui |
| 2 | "concluir pagar luz" | "Pagar conta de luz" | `pagar\|luz` | ✅ Encontra (match parcial) |
| 3 | "concluir tarefa bolo" | "fazer bolo" | `bolo` | ✅ Encontra |
| 4 | "concluir limpar geladeira" | "limpar geladeira" | `limpar\|geladeira` | ✅ Encontra |
| 5 | "concluir tarefa aluguel" | "Pagar aluguel" | `aluguel` | ✅ Encontra |
| 6 | "concluir tarefa" (sem nome) | — | — | Bot pergunta: "Qual tarefa foi concluida?" |
| 7 | "concluir tarefa xyz inexistente" | — | `xyz\|inexistente` | Bot responde: "Nao achei" |
