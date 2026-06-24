# Mapeamento de Refatoração — 23 Queries SQL

**Objetivo**: Converter todas as queries do `tarefildo_telegram.json` de interpolação para parametrização.

**Status**: Em progresso

---

## LOTE 1: SELECT Simples (Baixo Risco)

### Query 1: DB: Verificar Status Fluxo
**Status**: ✅ FEITA  
**Linha**: 225

**Antes**:
```sql
SELECT status_fluxo, confirmacao_pendente_id FROM usuarios WHERE whatsapp_id = '{{ $json.whatsapp_id }}' LIMIT 1;
```

**Depois**:
```sql
SELECT status_fluxo, confirmacao_pendente_id FROM usuarios WHERE whatsapp_id = $1 LIMIT 1;
```

**Code node antes (Validar ID)**:
```javascript
const whatsapp_id = ($json.whatsapp_id || '').trim();
if (!whatsapp_id || whatsapp_id.length === 0) return [];
if (!whatsapp_id.match(/^\d+@(telegram|c\.us|s\.whatsapp\.net)$/)) {
  return [{ json: { error: 'ID inválido' } }];
}
return [{ json: { whatsapp_id } }];
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

### Query 2: DB: Buscar por Nome
**Status**: ⏳ PENDENTE  
**Linha**: 485

**Antes**:
```sql
SELECT id, nome, canais_ativos FROM usuarios WHERE LOWER(nome) = LOWER('{{ $json.nome }}') AND whatsapp_id != '{{ $json.whatsapp_id }}' LIMIT 1;
```

**Depois**:
```sql
SELECT id, nome, canais_ativos FROM usuarios WHERE LOWER(nome) = LOWER($1) AND whatsapp_id != $2 LIMIT 1;
```

**Code node antes**:
```javascript
const nome = ($json.nome || '').trim();
const whatsapp_id = ($json.whatsapp_id || '').trim();
if (!nome || nome.length === 0) return [{ json: { error: 'Nome vazio' } }];
if (nome.length > 100) return [{ json: { error: 'Nome muito longo' } }];
if (!whatsapp_id.match(/^\d+@(telegram|c\.us|s\.whatsapp\.net)$/)) {
  return [{ json: { error: 'ID inválido' } }];
}
return [{ json: { nome, whatsapp_id } }];
```

**queryParameters**: `["{{ $json.nome }}", "{{ $json.whatsapp_id }}"]`

---

### Query 3: DB: Verificar Pendência
**Status**: ⏳ PENDENTE  
**Linha**: 669

**Antes**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.criado_em
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}'
  AND t.status = 'AGUARDANDO_DATA'
ORDER BY t.criado_em DESC LIMIT 1;
```

**Depois**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.criado_em
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE u.whatsapp_id = $1 AND t.status = 'AGUARDANDO_DATA'
ORDER BY t.criado_em DESC LIMIT 1;
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

### Query 4: DB: Buscar para Editar
**Status**: ⏳ PENDENTE  
**Linha**: 1201

**Antes**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
  AND t.status = 'PENDENTE' 
  AND t.titulo ILIKE '%{{ $json.dados.titulo_atual || $json.dados.titulo }}%' 
ORDER BY t.criado_em DESC LIMIT 5;
```

**Depois**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $1 
  AND t.status = 'PENDENTE' 
  AND t.titulo ILIKE $2
ORDER BY t.criado_em DESC LIMIT 5;
```

**Code node antes**:
```javascript
const whatsapp_id = ($json.whatsapp_id || '').trim();
const titulo = ($json.dados.titulo_atual || $json.dados.titulo || '').trim();
if (!titulo) return [{ json: { error: 'Título vazio' } }];
const titulo_search = `%${titulo}%`;
return [{ json: { whatsapp_id, titulo_search } }];
```

**queryParameters**: `["{{ $json.whatsapp_id }}", "{{ $json.titulo_search }}"]`

---

### Query 5: DB: Buscar para Excluir
**Status**: ⏳ PENDENTE  
**Linha**: 1305

**Antes**:
```sql
SELECT t.id, t.titulo, t.data_vencimento FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
  AND t.status = 'PENDENTE' 
  AND t.titulo ILIKE '%{{ $json.dados.titulo }}%' 
ORDER BY t.criado_em DESC LIMIT 5;
```

**Depois**:
```sql
SELECT t.id, t.titulo, t.data_vencimento FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $1 
  AND t.status = 'PENDENTE' 
  AND t.titulo ILIKE $2
ORDER BY t.criado_em DESC LIMIT 5;
```

**queryParameters**: `["{{ $json.whatsapp_id }}", "{{ '%' + $json.dados.titulo + '%' }}"]`

---

### Query 6: DB: Verificar Duplicata
**Status**: ⏳ PENDENTE  
**Linha**: 1422

**Antes**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
  AND t.status IN ('PENDENTE', 'AGUARDANDO_DATA') 
  AND t.titulo ILIKE '%{{ $json.dados.titulo }}%' LIMIT 1;
```

**Depois**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $1 
  AND t.status IN ('PENDENTE', 'AGUARDANDO_DATA') 
  AND t.titulo ILIKE $2 LIMIT 1;
```

**queryParameters**: `["{{ $json.whatsapp_id }}", "{{ '%' + $json.dados.titulo + '%' }}"]`

---

### Query 7: DB: Listar Tarefas
**Status**: ⏳ PENDENTE  
**Linha**: 1540

**Antes**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' AND t.status = 'PENDENTE' 
ORDER BY t.data_vencimento ASC NULLS LAST LIMIT 20;
```

**Depois**:
```sql
SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento, t.prioridade
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $1 AND t.status = 'PENDENTE' 
ORDER BY CASE WHEN t.prioridade = 'ALTA' THEN 1 WHEN t.prioridade = 'MEDIA' THEN 2 ELSE 3 END ASC, t.data_vencimento ASC NULLS LAST 
LIMIT 20;
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

### Query 8: DB: Listar Lembretes
**Status**: ⏳ PENDENTE  
**Linha**: 1608

**Antes**:
```sql
SELECT l.id, l.titulo, l.hora 
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' AND l.ativo = true 
ORDER BY l.hora;
```

**Depois**:
```sql
SELECT l.id, l.titulo, l.hora 
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id 
WHERE u.whatsapp_id = $1 AND l.ativo = true 
ORDER BY l.hora;
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

### Query 9: DB: Buscar Duplicatas
**Status**: ⏳ PENDENTE  
**Linha**: 1644

**Antes**:
```sql
SELECT titulo, COUNT(*)::int as qtd, array_agg(id ORDER BY criado_em DESC) as ids 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' AND t.status = 'PENDENTE' 
GROUP BY titulo HAVING COUNT(*) > 1;
```

**Depois**:
```sql
SELECT titulo, COUNT(*)::int as qtd, array_agg(id ORDER BY criado_em DESC) as ids 
FROM tarefas t 
JOIN usuarios u ON u.id = t.usuario_id 
WHERE u.whatsapp_id = $1 AND t.status = 'PENDENTE' 
GROUP BY titulo HAVING COUNT(*) > 1;
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

## LOTE 2: INSERT/UPDATE (Médio Risco)

### Query 10: DB: Criar Mesmo Assim
**Status**: ⏳ PENDENTE  
**Linha**: 155

**Antes**:
```sql
INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em) 
SELECT u.id, '{{ $json.dados.titulo }}', '', 
  {{ $json.tem_data ? "'" + $json.dados.data + "'" : 'NULL' }}, 
  {{ $json.hora ? "'" + $json.hora + "'" : 'NULL' }}, 
  '{{ $json.status_tarefa }}', NOW() 
FROM usuarios u WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
RETURNING id, titulo, data_vencimento, hora_vencimento, status;
```

**Depois**:
```sql
INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em) 
SELECT u.id, $1, $2, $3, $4, $5, NOW() 
FROM usuarios u WHERE u.whatsapp_id = $6 
RETURNING id, titulo, data_vencimento, hora_vencimento, status;
```

**Code node antes**:
```javascript
const titulo = ($json.dados?.titulo || '').trim();
const descricao = '';
const data = $json.tem_data ? $json.dados.data : null;
const hora = $json.hora || null;
const status = $json.status_tarefa || 'AGUARDANDO_DATA';
const whatsapp_id = ($json.whatsapp_id || '').trim();

if (!titulo) return [{ json: { error: 'Título vazio' } }];
if (titulo.length > 500) return [{ json: { error: 'Título muito longo' } }];

return [{ json: { titulo, descricao, data, hora, status, whatsapp_id } }];
```

**queryParameters**: `["{{ $json.titulo }}", "{{ $json.descricao }}", "{{ $json.data }}", "{{ $json.hora }}", "{{ $json.status }}", "{{ $json.whatsapp_id }}"]`

---

### Query 11: DB: Editar Existente
**Status**: ⏳ PENDENTE  
**Linha**: 190

**Antes**:
```sql
UPDATE tarefas 
SET data_vencimento = {{ $json.tem_data ? "'" + $json.dados.data + "'" : 'data_vencimento' }}, 
    hora_vencimento = {{ $json.hora ? "'" + $json.hora + "'" : 'hora_vencimento' }}, 
    atualizado_em = NOW() 
WHERE id = '{{ $json.duplicata_id }}' 
RETURNING id, titulo, data_vencimento, hora_vencimento;
```

**Depois**:
```sql
UPDATE tarefas 
SET data_vencimento = COALESCE($1, data_vencimento), 
    hora_vencimento = COALESCE($2, hora_vencimento), 
    atualizado_em = NOW() 
WHERE id = $3 
RETURNING id, titulo, data_vencimento, hora_vencimento;
```

**queryParameters**: `["{{ $json.data }}", "{{ $json.hora }}", "{{ $json.duplicata_id }}"]`

---

### Query 12: DB: Salvar Data
**Status**: ⏳ PENDENTE  
**Linha**: 838

**Antes**:
```sql
UPDATE tarefas 
SET data_vencimento = '{{ $json.data_extraida }}', status = 'PENDENTE', atualizado_em = NOW() 
WHERE id = '{{ $json.tarefa_pendente_id }}' 
RETURNING titulo, data_vencimento;
```

**Depois**:
```sql
UPDATE tarefas 
SET data_vencimento = $1, status = 'PENDENTE', atualizado_em = NOW() 
WHERE id = $2 
RETURNING titulo, data_vencimento;
```

**queryParameters**: `["{{ $json.data_extraida }}", "{{ $json.tarefa_pendente_id }}"]`

---

### Query 13: DB: Concluir Tarefa
**Status**: ⏳ PENDENTE  
**Linha**: 1563

**Antes**:
```sql
UPDATE tarefas 
SET status = 'CONCLUIDA', atualizado_em = NOW() 
WHERE id = '{{ $json.dados.id }}' 
  AND usuario_id = (SELECT id FROM usuarios WHERE whatsapp_id = '{{ $json.whatsapp_id }}') 
RETURNING titulo;
```

**Depois**:
```sql
UPDATE tarefas 
SET status = 'CONCLUIDA', atualizado_em = NOW() 
WHERE id = $1 
  AND usuario_id = (SELECT id FROM usuarios WHERE whatsapp_id = $2) 
RETURNING titulo;
```

**queryParameters**: `["{{ $json.dados.id }}", "{{ $json.whatsapp_id }}"]`

---

### Query 14: DB: Excluir Tarefa
**Status**: ⏳ PENDENTE  
**Linha**: 1374

**Antes**:
```sql
UPDATE tarefas SET status = 'CANCELADA', atualizado_em = NOW() 
WHERE id = '{{ $json.tarefa_id }}' 
RETURNING titulo;
```

**Depois**:
```sql
UPDATE tarefas SET status = 'CANCELADA', atualizado_em = NOW() 
WHERE id = $1 
RETURNING titulo;
```

**queryParameters**: `["{{ $json.tarefa_id }}"]`

---

### Query 15: DB: Editar Tarefa (CRÍTICO — Campo Dinâmico)
**Status**: ⏳ PENDENTE  
**Linha**: 1270

**Antes**:
```sql
UPDATE tarefas SET {{ $json.updates }} WHERE id = '{{ $json.tarefa_id }}' RETURNING id, titulo, data_vencimento, hora_vencimento;
```

**⚠️ CRÍTICO**: `{{ $json.updates }}` vem direto do usuário!

**Depois** (com whitelist):
```sql
UPDATE tarefas SET titulo = $1, descricao = $2, data_vencimento = $3, hora_vencimento = $4, prioridade = $5, atualizado_em = NOW() 
WHERE id = $6 
RETURNING id, titulo, data_vencimento, hora_vencimento;
```

**Code node antes** (WHITELIST):
```javascript
const titulo = ($json.dados?.titulo || '').trim();
const descricao = ($json.dados?.descricao || '').trim();
const data = $json.dados?.data || null;
const hora = $json.dados?.hora || null;
const prioridade = ['ALTA', 'MEDIA', 'BAIXA'].includes($json.dados?.prioridade) ? $json.dados.prioridade : 'MEDIA';
const tarefa_id = $json.tarefa_id;

// Validações
if (titulo.length > 500) return [{ json: { error: 'Título muito longo' } }];
if (descricao.length > 1000) return [{ json: { error: 'Descrição muito longa' } }];

return [{ json: { titulo, descricao, data, hora, prioridade, tarefa_id } }];
```

**queryParameters**: `["{{ $json.titulo }}", "{{ $json.descricao }}", "{{ $json.data }}", "{{ $json.hora }}", "{{ $json.prioridade }}", "{{ $json.tarefa_id }}"]`

---

## LOTE 3: INSERT com Subquery (Alto Risco)

### Query 16: DB: Consolidar Conta
**Status**: ⏳ PENDENTE  
**Linha**: 404

**Antes**:
```sql
UPDATE usuarios 
SET whatsapp_id = '{{ $json.whatsapp_id }}', 
    canais_ativos = canais_ativos || to_jsonb(ARRAY['{{ $json.canal }}']::text[]), 
    status_fluxo = 'ATIVO', 
    confirmacao_pendente_id = NULL, 
    atualizado_em = NOW() 
WHERE id = '{{ $json.confirmacao_pendente_id }}' 
RETURNING id, nome;
```

**Depois**:
```sql
UPDATE usuarios 
SET whatsapp_id = $1, 
    canais_ativos = canais_ativos || to_jsonb(ARRAY[$2]::text[]), 
    status_fluxo = 'ATIVO', 
    confirmacao_pendente_id = NULL, 
    atualizado_em = NOW() 
WHERE id = $3 
RETURNING id, nome;
```

**queryParameters**: `["{{ $json.whatsapp_id }}", "{{ $json.canal }}", "{{ $json.confirmacao_pendente_id }}"]`

---

### Query 17: DB: Criar Novo Usuário
**Status**: ⏳ PENDENTE  
**Linha**: 438

**Antes**:
```sql
INSERT INTO usuarios (id, whatsapp_id, nome, fuso_horario, lembretes_ativos, canais_ativos, status_fluxo, criado_em) 
VALUES (gen_random_uuid(), '{{ $json.whatsapp_id }}', '{{ $json.nome }}', 'America/Sao_Paulo', true, to_jsonb(ARRAY['{{ $json.canal }}']::text[]), 'ATIVO', NOW()) 
ON CONFLICT (whatsapp_id) DO UPDATE SET status_fluxo = 'ATIVO', confirmacao_pendente_id = NULL 
RETURNING id;
```

**Depois**:
```sql
INSERT INTO usuarios (id, whatsapp_id, nome, fuso_horario, lembretes_ativos, canais_ativos, status_fluxo, criado_em) 
VALUES (gen_random_uuid(), $1, $2, 'America/Sao_Paulo', true, to_jsonb(ARRAY[$3]::text[]), 'ATIVO', NOW()) 
ON CONFLICT (whatsapp_id) DO UPDATE SET status_fluxo = 'ATIVO', confirmacao_pendente_id = NULL 
RETURNING id;
```

**Code node antes**:
```javascript
const whatsapp_id = ($json.whatsapp_id || '').trim();
const nome = ($json.nome || '').trim();
const canal = ($json.canal || '').trim();

if (!whatsapp_id.match(/^\d+@(telegram|c\.us|s\.whatsapp\.net)$/)) {
  return [{ json: { error: 'ID inválido' } }];
}
if (!nome || nome.length === 0) return [{ json: { error: 'Nome vazio' } }];
if (!['telegram', 'whatsapp'].includes(canal)) {
  return [{ json: { error: 'Canal inválido' } }];
}

return [{ json: { whatsapp_id, nome, canal } }];
```

**queryParameters**: `["{{ $json.whatsapp_id }}", "{{ $json.nome }}", "{{ $json.canal }}"]`

---

### Query 18: DB: Criar Direto
**Status**: ⏳ PENDENTE  
**Linha**: 588

**Antes**:
```sql
INSERT INTO usuarios (id, whatsapp_id, nome, fuso_horario, lembretes_ativos, canais_ativos, status_fluxo, criado_em) 
VALUES (gen_random_uuid(), '{{ $json.whatsapp_id }}', '{{ $json.nome }}', 'America/Sao_Paulo', true, to_jsonb(ARRAY['{{ $json.canal }}']::text[]), 'ATIVO', NOW()) 
ON CONFLICT (whatsapp_id) DO UPDATE SET status_fluxo = 'ATIVO' 
RETURNING id;
```

**Depois**: Mesma refatoração que Query 17

---

### Query 19: DB: Marcar Aguardando
**Status**: ⏳ PENDENTE  
**Linha**: 554

**Antes**:
```sql
UPDATE usuarios 
SET status_fluxo = 'AGUARDANDO_CONFIRMACAO', confirmacao_pendente_id = '{{ $json.user_id }}' 
WHERE whatsapp_id = '{{ $json.whatsapp_id }}' 
RETURNING id, nome;
```

**Depois**:
```sql
UPDATE usuarios 
SET status_fluxo = 'AGUARDANDO_CONFIRMACAO', confirmacao_pendente_id = $1 
WHERE whatsapp_id = $2 
RETURNING id, nome;
```

**queryParameters**: `["{{ $json.user_id }}", "{{ $json.whatsapp_id }}"]`

---

## LOTE 4: INSERT Lembretes & CTE (Complexo)

### Query 20: DB: Adicionar Lembrete
**Status**: ⏳ PENDENTE  
**Linha**: 1586

**Antes**:
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, ativo, criado_em) 
SELECT u.id, '{{ $json.dados.titulo }}', '{{ $json.dados.hora || "08:00" }}', true, NOW() 
FROM usuarios u WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
RETURNING id, titulo, hora;
```

**Depois**:
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, ativo, criado_em) 
SELECT u.id, $1, $2, true, NOW() 
FROM usuarios u WHERE u.whatsapp_id = $3 
RETURNING id, titulo, hora;
```

**Code node antes**:
```javascript
const titulo = ($json.dados?.titulo || '').trim();
const hora = ($json.dados?.hora || '08:00').trim();
const whatsapp_id = ($json.whatsapp_id || '').trim();

if (!titulo) return [{ json: { error: 'Título vazio' } }];
if (!hora.match(/^\d{2}:\d{2}$/)) {
  return [{ json: { error: 'Formato de hora inválido (use HH:MM)' } }];
}

return [{ json: { titulo, hora, whatsapp_id } }];
```

**queryParameters**: `["{{ $json.titulo }}", "{{ $json.hora }}", "{{ $json.whatsapp_id }}"]`

---

### Query 21: DB: Adicionar Tarefa
**Status**: ⏳ PENDENTE  
**Linha**: 1505

**Antes**:
```sql
INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em) 
SELECT u.id, '{{ $json.dados.titulo }}', '{{ $json.dados.descricao || "" }}', 
  {{ $json.tem_data ? "'" + $json.dados.data + "'" : 'NULL' }}, 
  {{ $json.hora ? "'" + $json.hora + "'" : 'NULL' }}, 
  '{{ $json.status_tarefa }}', NOW() 
FROM usuarios u WHERE u.whatsapp_id = '{{ $json.whatsapp_id }}' 
RETURNING id, titulo, data_vencimento, hora_vencimento, status;
```

**Depois**: Mesma refatoração que Query 10

---

### Query 22: DB: Limpar Duplicatas
**Status**: ⏳ PENDENTE  
**Linha**: 1680

**Antes**:
```sql
WITH duplicatas AS ( 
  SELECT id, titulo, ROW_NUMBER() OVER (PARTITION BY titulo ORDER BY criado_em DESC) as rn 
  FROM tarefas WHERE usuario_id = (SELECT id FROM usuarios WHERE whatsapp_id = '{{ $json.whatsapp_id }}') 
    AND status = 'PENDENTE' 
) 
UPDATE tarefas SET status = 'CANCELADA', atualizado_em = NOW() WHERE id IN (SELECT id FROM duplicatas WHERE rn > 1) 
RETURNING titulo;
```

**Depois**:
```sql
WITH duplicatas AS ( 
  SELECT id, titulo, ROW_NUMBER() OVER (PARTITION BY titulo ORDER BY criado_em DESC) as rn 
  FROM tarefas WHERE usuario_id = (SELECT id FROM usuarios WHERE whatsapp_id = $1) 
    AND status = 'PENDENTE' 
) 
UPDATE tarefas SET status = 'CANCELADA', atualizado_em = NOW() WHERE id IN (SELECT id FROM duplicatas WHERE rn > 1) 
RETURNING titulo;
```

**queryParameters**: `["{{ $json.whatsapp_id }}"]`

---

## LOTE 5: Query Dinâmica (CRÍTICA)

### Query 23: DB: Query Dinâmica (SUPER CRÍTICO!)
**Status**: ⏳ PENDENTE  
**Linha**: 1729

**Antes**:
```sql
{{ $json.query_busca }}
```

⚠️ **CRÍTICO TOTAL**: Recebe SQL bruto do usuário!

**Depois** (criar menu de queries pré-aprovadas):
```javascript
// Criar node Code "Montar Query Segura" ANTES do DB node
const intento = $json.intento || 'listar';
const whatsapp_id = ($json.whatsapp_id || '').trim();

let query = '';
let queryParameters = [];

switch (intento) {
  case 'listar':
    query = 'SELECT id, titulo, data_vencimento FROM tarefas t JOIN usuarios u ON u.id = t.usuario_id WHERE u.whatsapp_id = $1 AND t.status = $2 LIMIT 20;';
    queryParameters = [whatsapp_id, 'PENDENTE'];
    break;
  case 'buscar':
    const termo = ($json.termo || '').trim();
    query = 'SELECT id, titulo, data_vencimento FROM tarefas t JOIN usuarios u ON u.id = t.usuario_id WHERE u.whatsapp_id = $1 AND t.titulo ILIKE $2 LIMIT 10;';
    queryParameters = [whatsapp_id, `%${termo}%`];
    break;
  case 'atrasadas':
    query = 'SELECT id, titulo, data_vencimento FROM tarefas t JOIN usuarios u ON u.id = t.usuario_id WHERE u.whatsapp_id = $1 AND t.status = $2 AND t.data_vencimento < CURRENT_DATE ORDER BY data_vencimento ASC LIMIT 10;';
    queryParameters = [whatsapp_id, 'PENDENTE'];
    break;
  default:
    return [{ json: { error: 'Intento inválido' } }];
}

return [{ json: { query, queryParameters } }];
```

---

## Resumo

| Lote | Queries | Status | Risco | Tempo |
|------|---------|--------|-------|-------|
| 1    | 1-9 (SELECT) | ⏳ | 🟢 Baixo | 1-2h |
| 2    | 10-15 (INSERT/UPDATE) | ⏳ | 🟠 Médio | 1.5h |
| 3    | 16-19 (Subquery) | ⏳ | 🟠 Médio | 1h |
| 4    | 20-22 (Lembretes/CTE) | ⏳ | 🟠 Médio | 1h |
| 5    | 23 (Query dinâmica) | ⏳ | 🔴 CRÍTICO | 30min |

**Total**: ~5-6h de refatoração + testes

---

## Próximas Ações

1. ✅ Script SQL (migrations/001_sql_injection_fix.sql) — Pronto para executar no Neon
2. ⏳ Refatorar Lote 1 (SELECT simples)
3. ⏳ Refatorar Lote 2 (INSERT/UPDATE)
4. ⏳ Refatorar Lote 3 (Subquery)
5. ⏳ Refatorar Lote 4 (Lembretes)
6. ⏳ Refatorar Lote 5 (Query dinâmica) — PRIORIDADE!

