# SPEC — Edição Inteligente de Tarefas

**Data:** 2026-06-24  
**Status:** Pendente  
**Prioridade:** Alta (bug + feature)  
**Alinhamento:** [N8N_DEVELOPMENT_GUIDE.md](../../N8N_DEVELOPMENT_GUIDE.md) — Seções 1.1, 2.2, 3.1, 3.2, 6.1

---

## Problemas Identificados

### Bug 1: Busca ILIKE não encontra tarefas

**Sintoma:** Usuário pede "editar dia do hamburguer" mas o bot responde "não achei essa tarefa".

**Causa raiz:** O parâmetro passado ao `ILIKE` não contém wildcards `%`. O DeepSeek extrai `titulo_atual: "hamburguer"` e a query busca match exato `ILIKE 'hamburguer'` em vez de `ILIKE '%hamburguer%'`.

**Evidência:**
```
Input DB: Buscar para Editar:
  titulo_atual: "hamburguer"
  
Título no banco: "dia do hamburguer"

Query executada: WHERE t.titulo ILIKE 'hamburguer'  → 0 resultados
Query correta:   WHERE t.titulo ILIKE '%hamburguer%' → 1 resultado
```

**Impacto:** Afeta edição E exclusão — ambos usam ILIKE sem wildcard.

### Bug 2: "Editar tarefa" sem nome não funciona

**Sintoma:** Usuário cria tarefa e logo em seguida diz "editar tarefa" — o bot não sabe qual tarefa editar.

**Causa raiz:** Não há memória de contexto — o bot não guarda qual foi a última tarefa mencionada pelo usuário.

**Fluxo atual:**
```
Usuário: "adiciona tarefa dia do hamburguer amanhã"
Bot: "Anotado! dia do hamburguer pro dia 27/06"
Usuário: "editar tarefa"
Bot: "Não achei essa tarefa" ← deveria saber qual
```

**Fluxo esperado:**
```
Usuário: "adiciona tarefa dia do hamburguer amanhã"
Bot: "Anotado! dia do hamburguer pro dia 27/06"
Usuário: "editar tarefa"
Bot: "Quer editar 'dia do hamburguer'? Me diz o que mudar."
```

---

## Solução Proposta

### Arquitetura (alinhada com Guide §2.1)

Segue o padrão **Trigger → Filter → Enrich → Process → Store → Respond**:

```
Roteador (intent=editar_tarefa)
    ↓
[Enrich] Preparar Busca Edição
    - Recuperar contexto (globalState)
    - Adicionar wildcards ao título
    - Validar/sanitizar input
    ↓
[Process] DB: Buscar para Editar ($1, $2 parametrizado)
    ↓
[Process] Avaliar Edição (tratar 0, 1, N resultados)
    ↓
[Store] DB: Editar Tarefa ($1, $2 parametrizado)
    ↓
[Respond] Resposta → Route to Channel
```

---

### Fix 1: Wildcards no ILIKE

**Onde:** Nós `DB: Buscar para Editar` e `DB: Buscar para Excluir`

**Como:** Adicionar um nó Code antes de cada DB que prepara o parâmetro de busca com `%` ao redor.

#### Novo nó: `Preparar Busca Edição`

Alinhado com Guide §3.2 (Validação de Inputs):
```javascript
const item = $input.first().json;
let titulo = (item.dados?.titulo_atual || item.dados?.titulo || '').trim();
const whatsapp_id = (item.whatsapp_id || '').trim();

// Validação (Guide §3.2)
if (titulo.length > 500) titulo = titulo.substring(0, 500);
if (!whatsapp_id.match(/^\d+@(c\.us|telegram|s\.whatsapp\.net)$/)) {
  return [{ json: { error: 'ID inválido', sem_titulo: true } }];
}

// Se não tem título, buscar última tarefa do contexto (Fix 2)
if (!titulo) {
  const globalState = $getWorkflowStaticData('global');
  const lastTask = globalState['last_task_' + whatsapp_id];
  if (lastTask) {
    try {
      const parsed = JSON.parse(lastTask);
      titulo = parsed.titulo || '';
    } catch(e) {}
  }
}

if (!titulo) {
  return [{ json: { ...item, sem_titulo: true } }];
}

return [{ json: { 
  ...item, 
  busca_titulo: '%' + titulo + '%',
  busca_whatsapp_id: whatsapp_id,
  sem_titulo: false
} }];
```

#### Query atualizada (DB: Buscar para Editar)

Alinhado com Guide §3.1 (Parametrização SQL):
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $2 
AND t.status = 'PENDENTE' 
AND t.titulo ILIKE $1 
ORDER BY t.criado_em DESC LIMIT 5;
```

**Query Parameters:** `{{ $json.busca_titulo }},{{ $json.busca_whatsapp_id }}`

**Configuração do nó Postgres** (Guide §2.2):
- `alwaysOutputData: true`
- `onError: 'continueErrorOutput'`

#### Mesmo fix para `DB: Buscar para Excluir`

Novo nó `Preparar Busca Exclusão` com mesma lógica de validação e wildcard.

---

### Fix 2: Memória de contexto (última tarefa)

**Onde:** `$getWorkflowStaticData('global')`

**⚠️ Alinhamento Guide §1.3:** Global state é em-memória. Funciona para instância única. Em produção multi-instância, migrar para Redis (Guide §8.1).

#### Salvar contexto — após criar tarefa (nó Resposta Tarefa):
```javascript
const globalState = $getWorkflowStaticData('global');
const key = 'last_task_' + state.whatsapp_id;
globalState[key] = JSON.stringify({ 
  id: db.id, 
  titulo: db.titulo,
  timestamp: Date.now()
});

// Limpeza de contextos antigos (>24h) — Guide §2.3 pattern
for (const k of Object.keys(globalState)) {
  if (k.startsWith('last_task_') && Date.now() - (JSON.parse(globalState[k] || '{}').timestamp || 0) > 86400000) {
    delete globalState[k];
  }
}
```

#### Recuperar contexto — no nó Preparar Busca Edição:

Já incluído no código do Fix 1 acima.

#### Tratamento quando sem título:
Se `sem_titulo === true`, responder na voz do Tarefildo: "Qual tarefa quer editar, chefe? Me fala o nome."

---

## Fluxo Atualizado

### Edição com nome
```
"editar dia do hamburguer pra sexta"
  → DeepSeek: titulo_atual="hamburguer", nova_data="2026-06-27"
  → Preparar Busca: valida input → busca_titulo="%hamburguer%"
  → DB: ILIKE '%hamburguer%' ($1 parametrizado) → encontra "dia do hamburguer"
  → Avaliar: 1 resultado → edita
  → Resposta: "Pronto, 'dia do hamburguer' mudou pra 27/06"
```

### Edição sem nome (com contexto)
```
"adiciona tarefa comprar pão amanhã"
  → Cria tarefa → salva contexto: last_task = "comprar pão"
"editar tarefa"
  → DeepSeek: titulo_atual="" (vazio)
  → Preparar Busca: recupera contexto → busca_titulo="%comprar pão%"
  → DB: encontra → edita
```

### Edição sem nome (sem contexto)
```
"editar tarefa"
  → DeepSeek: titulo_atual="" (vazio)
  → Preparar Busca: sem contexto → sem_titulo=true
  → Resposta: "Qual tarefa quer editar, Isabela? Me fala o nome."
```

---

## Nós afetados

| Nó | Ação | Alinhamento Guide |
|----|------|-------------------|
| `Preparar Busca Edição` | **Novo** — wildcard + contexto + validação | §2.2 Code <50 linhas, §3.2 Validação |
| `Preparar Busca Exclusão` | **Novo** — wildcard + contexto + validação | §2.2 Code <50 linhas, §3.2 Validação |
| `DB: Buscar para Editar` | **Alterar** — query com $1/$2 | §3.1 Parametrização, §2.2 Postgres |
| `DB: Buscar para Excluir` | **Alterar** — query com $1/$2 | §3.1 Parametrização, §2.2 Postgres |
| `Resposta Tarefa` | **Alterar** — salvar contexto após criar | §2.3 Global State pattern |
| `Avaliar Edição` | **Alterar** — tratar sem_titulo | §2.2 Code, §1.4 Fallback |
| `Avaliar Exclusão` | **Alterar** — tratar sem_titulo | §2.2 Code, §1.4 Fallback |

---

## Segurança (Guide §1.1, §3.1, §3.2)

| Risco | Mitigação | Status |
|-------|-----------|--------|
| SQL Injection via título | `$1` parametrizado — wildcard `%` adicionado no Code, não no input | ✅ Seguro |
| Input muito longo | `titulo.substring(0, 500)` no Code | ✅ Validado |
| Formato whatsapp_id inválido | Regex `^\d+@(c\.us\|telegram)$` | ✅ Validado |
| Contexto stale (>24h) | TTL de 24h com limpeza automática | ✅ Mitigado |
| Prompt injection via título | DeepSeek system/user separados (Guide §5.1) | ✅ Já implementado |

---

## Testes necessários (Guide §6.1, §6.2)

| Cenário | Input | Esperado |
|---------|-------|----------|
| Editar com nome parcial | "editar hamburguer pra sexta" | Encontra "dia do hamburguer" |
| Editar com nome completo | "editar dia do hamburguer pra sexta" | Encontra |
| Editar sem nome (com contexto) | Cria tarefa → "editar tarefa" | Usa última tarefa |
| Editar sem nome (sem contexto) | "editar tarefa" (primeira msg) | Pede o nome |
| Excluir com nome parcial | "excluir hamburguer" | Encontra e exclui |
| Múltiplos resultados | "editar pagar" (2 tarefas "pagar") | Lista opções |
| Tarefa não encontrada | "editar xyz123" | "Não achei" |
| SQL injection no título | "editar ' OR 1=1 --" | Busca literal, 0 resultados (seguro) |
| Título muito longo (>500 chars) | "editar [500+ chars]..." | Trunca e busca |
| whatsapp_id inválido | ID malformado | Retorna erro, não executa query |

---

## Estimativa

| Item | Tempo |
|------|-------|
| Fix wildcards (edição + exclusão) | 15 min |
| Memória de contexto | 20 min |
| Testes manuais | 15 min |
| **Total** | **~50 min** |

---

## Checklist de Produção (Guide §11)

- [ ] Queries parametrizadas ($1, $2) nos nós alterados
- [ ] Validação de inputs (comprimento, formato) no Code
- [ ] alwaysOutputData + onError nos nós Postgres
- [ ] Limpeza de globalState (TTL 24h)
- [ ] Teste de SQL injection no título
- [ ] Teste de rate limit (edição rápida)
- [ ] Fallback quando sem contexto (pedir nome)

---

## Riscos residuais

- **Global state em memória** (Guide §8.1): Funciona para instância única. Se escalar para multi-instância, migrar contexto para Redis ou tabela no banco.
- **Conflito de contexto**: Só salvar contexto na criação, não na listagem. Se o usuário listar e pedir edição, pede o nome.
- **DeepSeek extrai título parcial**: O ILIKE com `%` mitiga, mas pode retornar múltiplos. O Avaliar Edição já trata listando opções.
