# SQL Injection Fix — Plano de Ação (Telegram)

**Status**: Em progresso  
**Data**: 2026-06-24  
**Arquivo**: `tarefildo_telegram.json`

---

## Nodes DB Identificados (20+)

| # | Node | Query Type | Risco | Status |
|---|------|-----------|-------|--------|
| 1 | DB: Verificar Status Fluxo | SELECT | 🔴 ALTO | Pendente |
| 2 | DB: Criar Mesmo Assim | INSERT | 🔴 ALTO | Pendente |
| 3 | DB: Editar Existente | UPDATE | 🔴 ALTO | Pendente |
| 4 | DB: Consolidar Conta | UPDATE | 🔴 ALTO | Pendente |
| 5 | DB: Criar Novo Usuário | INSERT | 🔴 ALTO | Pendente |
| 6 | DB: Buscar por Nome | SELECT | 🔴 ALTO | Pendente |
| 7 | DB: Marcar Aguardando | UPDATE | 🔴 ALTO | Pendente |
| 8 | DB: Criar Direto | INSERT | 🔴 ALTO | Pendente |
| 9 | DB: Verificar Pendência | SELECT | 🔴 ALTO | Pendente |
| 10 | DB: Salvar Data | UPDATE | 🔴 ALTO | Pendente |
| 11 | DB: Buscar para Editar | SELECT | 🔴 ALTO | Pendente |
| 12 | DB: Editar Tarefa | UPDATE | 🟠 CRÍTICO | Pendente |
| 13 | DB: Buscar para Excluir | SELECT | 🔴 ALTO | Pendente |
| 14 | DB: Excluir Tarefa | UPDATE | 🔴 ALTO | Pendente |
| 15 | DB: Verificar Duplicata | SELECT | 🔴 ALTO | Pendente |
| 16 | DB: Adicionar Tarefa | INSERT | 🔴 ALTO | Pendente |
| 17 | DB: Listar Tarefas | SELECT | 🔴 ALTO | Pendente |
| 18 | DB: Concluir Tarefa | UPDATE | 🔴 ALTO | Pendente |
| 19 | DB: Adicionar Lembrete | INSERT | 🔴 ALTO | Pendente |
| 20 | DB: Listar Lembretes | SELECT | 🔴 ALTO | Pendente |
| 21 | DB: Buscar Duplicatas | SELECT | 🔴 ALTO | Pendente |
| 22 | DB: Limpar Duplicatas | UPDATE | 🔴 ALTO | Pendente |
| 23 | DB: Query Dinâmica | SELECT | 🟠 CRÍTICO | Pendente |

---

## Exemplo de Refatoração (antes/depois)

### Exemplo 1: DB: Verificar Status Fluxo

**❌ ANTES (SQL Injection)**:
```json
{
  "operation": "executeQuery",
  "query": "SELECT status_fluxo, confirmacao_pendente_id FROM usuarios WHERE whatsapp_id = '{{ $json.whatsapp_id }}' LIMIT 1;"
}
```

**Ataque**: `whatsapp_id = "'; DROP TABLE usuarios; --"`

**✅ DEPOIS (Parametrizado)**:
```json
{
  "operation": "executeQuery",
  "query": "SELECT status_fluxo, confirmacao_pendente_id FROM usuarios WHERE whatsapp_id = $1 LIMIT 1;",
  "queryParameters": ["{{ $json.whatsapp_id }}"]
}
```

---

### Exemplo 2: DB: Editar Tarefa (CRÍTICO — UPDATE com campo dinâmico)

**❌ ANTES**:
```json
{
  "operation": "executeQuery",
  "query": "UPDATE tarefas SET {{ $json.updates }} WHERE id = '{{ $json.tarefa_id }}' RETURNING id, titulo, data_vencimento, hora_vencimento;"
}
```

**Problema**: `{{ $json.updates }}` vem diretamente do usuário!  
**Ataque**: `updates = "status = 'CONCLUIDA', WHERE 1=1; DROP TABLE--"`

**✅ DEPOIS (Whitelist + parametrizado)**:
```javascript
// Node Code ANTES da query
const campos = {
  titulo: $json.dados.titulo,
  descricao: $json.dados.descricao,
  data_vencimento: $json.dados.data,
  hora_vencimento: $json.dados.hora,
  prioridade: $json.dados.prioridade
};

// Validar: apenas campos conhecidos
const updates_permitidos = ['titulo', 'descricao', 'data_vencimento', 'hora_vencimento', 'prioridade'];
const updates_obj = {};
for (const [key, value] of Object.entries(campos)) {
  if (updates_permitidos.includes(key) && value) {
    updates_obj[key] = value;
  }
}

// Construir query segura
let query = 'UPDATE tarefas SET ';
const parts = [];
const values = [];
let paramIdx = 1;

for (const [key, value] of Object.entries(updates_obj)) {
  parts.push(`${key} = $${paramIdx}`);
  values.push(value);
  paramIdx++;
}

query += parts.join(', ');
query += ` WHERE id = $${paramIdx} RETURNING id, titulo, data_vencimento, hora_vencimento;`;
values.push($json.tarefa_id);

return [{ json: { query, queryParameters: values } }];
```

**Query final (segura)**:
```sql
UPDATE tarefas SET titulo = $1, descricao = $2, data_vencimento = $3 WHERE id = $4 RETURNING ...;
-- Com queryParameters: [titulo, descricao, data, id]
```

---

### Exemplo 3: DB: Adicionar Tarefa (INSERT com ternário)

**❌ ANTES**:
```json
{
  "operation": "executeQuery",
  "query": "INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em) SELECT u.id, '{{ $json.dados.titulo }}', '{{ $json.dados.descricao || \"\" }}', {{ $json.tem_data ? \"'\" + $json.dados.data + \"'\" : 'NULL' }}, {{ $json.hora ? \"'\" + $json.hora + \"'\" : 'NULL' }}, '{{ $json.status_tarefa }}', NOW() FROM usuarios u WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' RETURNING ..."
}
```

**✅ DEPOIS**:
```javascript
// Node Code ANTES da query
const titulo = $json.dados?.titulo || '';
const descricao = $json.dados?.descricao || '';
const data = $json.tem_data ? $json.dados.data : null;
const hora = $json.hora || null;
const status = $json.status_tarefa || 'AGUARDANDO_DATA';
const whatsapp_id = $json.whatsapp_id;

return [{ json: { titulo, descricao, data, hora, status, whatsapp_id } }];
```

**Query**:
```sql
INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em)
SELECT u.id, $1, $2, $3, $4, $5, NOW()
FROM usuarios u
WHERE u.whatsapp_id = $6
RETURNING id, titulo, data_vencimento, hora_vencimento, status;
```

**queryParameters**: `[titulo, descricao, data, hora, status, whatsapp_id]`

---

## Padrão Geral de Refatoração

1. **Extração em Code Node** (antes do Postgres)
   - Validar tipos
   - Aplicar limites de tamanho
   - Construir valores em variáveis

2. **Prepare Query** (se dinâmica)
   - Usar whitelist de campos permitidos
   - Construir string com `$1, $2, ...` placeholders
   - Retornar `{ query, queryParameters: [...] }`

3. **Postgres Node**
   - Campo `query`: usar placeholders `$1, $2`
   - Campo `queryParameters`: array de valores
   - `alwaysOutputData: true`
   - `onError: continueErrorOutput`

4. **Validação após Query** (no Code node seguinte)
   - Verificar se retornou dados
   - Tratar erro graciosamente
   - Nunca expor detalhes SQL ao usuário

---

## Padrão: Validação de Inputs (sempre antes de query)

```javascript
// Validar e sanitizar
const titulo = ($json.dados?.titulo || '').trim();
const whatsapp_id = ($json.whatsapp_id || '').trim();

// Comprimento
if (titulo.length === 0) return [{ json: { error: 'Título vazio' } }];
if (titulo.length > 500) {
  return [{ json: { error: 'Título muito longo (máx 500 chars)' } }];
}

// Formato esperado
if (!whatsapp_id.match(/^\d+@(telegram|c\.us|s\.whatsapp\.net)$/)) {
  return [{ json: { error: 'ID inválido' } }];
}

// Passar adiante
return [{ json: { titulo, whatsapp_id, ... } }];
```

---

## Metodologia de Teste

### Teste 1: SQL Injection básica
```
Input: whatsapp_id = "123'; DROP TABLE usuarios; --"
Esperado: Erro SQL (não executa DROP)
```

### Teste 2: Escape de string
```
Input: titulo = "O'Reilly & Associates"
Esperado: Salva corretamente (sem quebrar SQL)
```

### Teste 3: UNION-based injection
```
Input: whatsapp_id = "123' UNION SELECT * FROM usuarios--"
Esperado: Erro SQL (parâmetro não aceita SQL)
```

### Teste 4: Boolean-based blind
```
Input: whatsapp_id = "123' AND '1'='1"
Esperado: Não encontra resultado (comparação de strings, não SQL)
```

---

## Checklist de Implementação

- [ ] Refatorar todos 23 nodes (em lotes)
- [ ] Adicionar validação de inputs em cada Code node
- [ ] Testar cada query com SQL injection
- [ ] Validar que funcionalidade mantém-se igual
- [ ] Commit com mensagem: "fix: parametrize all SQL queries (SQL injection fix)"
- [ ] Rodar workflow em staging
- [ ] Deploy em produção

---

## Próximos Passos

1. **Lote 1** (linha 224-225): DB: Verificar Status Fluxo
2. **Lote 2** (linha 154-207): DB: Criar/Editar (duplicatas)
3. **Lote 3** (linha 403-443): DB: Usuarios (criar/consolidar)
4. **Lote 4** (linha 837-1613): DB: Tarefas + Lembretes
5. **Lote 5** (linha 1643-1734): DB: Duplicatas + Query dinâmica

---

**Tempo estimado**: 3-4 horas  
**Risco**: Baixo (apenas refatoração, sem lógica nova)  
**Rollback**: Trivial (reverter para query com `{{ }}`)

