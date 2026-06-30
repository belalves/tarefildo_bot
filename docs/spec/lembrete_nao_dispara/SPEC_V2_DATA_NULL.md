# SPEC V2 — Bug: SELECT do Cron Retorna 0 Rows (data IS NULL)

**Data:** 2026-06-28  
**Status:** Em andamento  
**Prioridade:** Critica  
**Iteracao:** 2 (a SPEC v1 corrigiu timezone e enviado NULL, mas nao resolveu tudo)

---

## Resumo

Mesmo apos os fixes de timezone (`NOW() AT TIME ZONE`) e `enviado IS NOT TRUE`, o cron continua sem encontrar lembretes. A query retorna 0 rows e consequentemente nenhum lembrete e enviado.

## Causa Raiz Identificada

### O problema NAO esta na query do cron — esta no INSERT

Existem 3 workflows que inserem lembretes. Apenas 1 funciona corretamente:

| Workflow | INSERT inclui `enviado`? | `data` defaults para hoje? | Status |
|----------|-------------------------|---------------------------|--------|
| `tarefildo_unified.json` | SIM (`enviado = false`) | SIM (Code node: `new Date().toISOString()`) | OK |
| `tarefildo_telegram.json` | NAO (depende de DEFAULT) | NAO (`null` vira SQL NULL) | **QUEBRADO** |
| `tarefildo_whatsapp.json` | NAO (depende de DEFAULT) | NAO (`null` vira SQL NULL) | **QUEBRADO** |

### Trace completo do bug (Telegram workflow)

```
1. Usuario: "me lembra de tomar remedio as 14h"
2. NLP extrai: { titulo: "tomar remedio", hora: "14:00", data: undefined }
3. Expression n8n: {{ $json.dados.data || null }}  →  JavaScript null
4. n8n Postgres driver envia: $3 = SQL NULL
5. Query: NULLIF(NULL, '__NULL__')  →  NULL
6. Cast: NULL::date  →  NULL
7. INSERT: data = NULL  →  inserido com sucesso (coluna permite NULL)
8. Cron query: l.data::date = '2026-06-28'  →  NULL = '2026-06-28'  →  NULL (falso)
9. Resultado: 0 rows  →  nenhum lembrete enviado
```

### Porque o unified funciona e os outros nao

O workflow `unified` tem um Code node intermediario **"Preparar Insert Lembrete"** (linha 1878):

```javascript
// unified - CORRETO
const data = (item.dados?.data || '').trim();
return [{ json: {
  p3: data || new Date().toISOString().split('T')[0],  // ← FALLBACK para hoje
  // ...
} }];
```

Os workflows Telegram e WhatsApp passam `dados.data` diretamente como queryParameter:

```javascript
// telegram/whatsapp - QUEBRADO
"queryParameters": ["...", "{{ $json.dados.hora || '08:00' }}", "{{ $json.dados.data || null }}", "..."]
//                                                                ^^^^^^^^^^^^^^^^^^^^^^^^
//                                                                null em JS = NULL em SQL
```

### Problema secundario: `enviado` omitido no INSERT

Os INSERTs do Telegram e WhatsApp nao incluem `enviado = false`:

```sql
-- Telegram (linha 1676)
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, criado_em)  -- sem 'enviado'!

-- WhatsApp (linha 518)  
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, criado_em)  -- sem 'enviado'!
```

Se a coluna `enviado` nao tem DEFAULT ou o DEFAULT nao se aplica, o valor fica NULL.
O cron query usa `IS NOT TRUE` que pega NULL, mas e fragil — melhor ser explicito.

### Problema terciario: erros silenciados pelo onError

O node "DB: Buscar Lembretes Pendentes" tem `onError: "continueErrorOutput"` mas a saida de erro nao esta conectada a nada. Qualquer erro SQL (coluna inexistente, cast invalido) e silenciosamente engolido.

---

## Correcoes

### Fix 1: Telegram INSERT — `tarefildo_telegram.json`

**De:**
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, criado_em)
SELECT u.id, $1, $2, NULLIF($3,'__NULL__')::date, true, NOW()
FROM usuarios u WHERE u.whatsapp_id = $4
```
```
queryParameters: ["titulo", "hora || '08:00'", "data || null", "whatsapp_id"]
```

**Para:**
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, enviado, criado_em)
SELECT u.id, $1, $2, 
  COALESCE(NULLIF($3,'__NULL__')::date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
  true, false, NOW()
FROM usuarios u WHERE u.whatsapp_id = $4
RETURNING id, titulo, hora, data;
```

### Fix 2: WhatsApp INSERT — `tarefildo_whatsapp.json`

**De:**
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, criado_em)
SELECT id, $2, $3, NULLIF($4, '__NULL__')::date, true, NOW()
FROM get_user
```

**Para:**
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, enviado, criado_em)
SELECT id, $2, $3,
  COALESCE(NULLIF($4, '__NULL__')::date, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
  true, false, NOW()
FROM get_user
```

### Fix 3: Cron query defensiva — `tarefildo_lembrete_customizado.json`

Adicionar tratamento de `data IS NULL` para pegar lembretes antigos que foram inseridos sem data:

**De:**
```sql
AND l.data::date = (NOW() AT TIME ZONE COALESCE(...))::date
```

**Para:**
```sql
AND (l.data IS NULL OR l.data::date = (NOW() AT TIME ZONE COALESCE(...))::date)
```

### Fix 4: Migration para corrigir dados existentes

```sql
-- Fix lembretes com data NULL (inseridos antes do fix)
UPDATE lembretes 
SET data = COALESCE(
  (criado_em AT TIME ZONE 'America/Sao_Paulo')::date,
  CURRENT_DATE
)
WHERE data IS NULL;

-- Fix lembretes com enviado NULL
UPDATE lembretes SET enviado = false WHERE enviado IS NULL AND ativo = true;
```

---

## Validacao

### Query de diagnostico (rodar no Neon para verificar ANTES do fix)

```sql
-- 1. Verificar se existem lembretes com data NULL
SELECT id, titulo, hora, data, enviado, criado_em 
FROM lembretes WHERE data IS NULL;

-- 2. Verificar o que o cron esta buscando vs o que existe
SELECT 
  l.id, l.titulo, l.hora, l.data, l.enviado,
  u.fuso_horario,
  (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::date as hoje_local,
  (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::time as agora_local,
  l.data::date = (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::date as data_match,
  l.hora::time <= (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::time as hora_match
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id
WHERE l.ativo = true AND l.enviado IS NOT TRUE;

-- 3. Simular exatamente o que o cron faria (deve retornar rows)
SELECT l.id, l.titulo, l.hora, l.data, u.whatsapp_id, u.canais_ativos 
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id 
WHERE l.ativo = true 
  AND l.enviado IS NOT TRUE
  AND (l.data IS NULL OR l.data::date = (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::date)
  AND l.hora::time <= (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::time;
```

### Casos de teste

| # | Cenario | Resultado esperado |
|---|---------|-------------------|
| 1 | Telegram: "me lembra de X as 14h" (SEM data) | INSERT com `data = hoje`, `enviado = false` |
| 2 | Telegram: "me lembra de X dia 30/06 as 10h" (COM data) | INSERT com `data = 2026-06-30`, `enviado = false` |
| 3 | WhatsApp: "me lembra de Y as 9h" (SEM data) | INSERT com `data = hoje`, `enviado = false` |
| 4 | Cron roda apos hora do lembrete | SELECT retorna o lembrete, mensagem enviada |
| 5 | Lembrete antigo com `data = NULL` no banco | Cron encontra e envia (fix defensivo) |
| 6 | 2 lembretes para mesmo horario | Ambos enviados e marcados como enviado |

---

## Arquivos alterados

1. `tarefildo_telegram.json` — INSERT com `enviado = false` + COALESCE na data
2. `tarefildo_whatsapp.json` — INSERT com `enviado = false` + COALESCE na data
3. `tarefildo_lembrete_customizado.json` — Query com `data IS NULL OR` defensivo
4. `migrations/003_fix_null_data.sql` — Corrigir dados existentes no banco
