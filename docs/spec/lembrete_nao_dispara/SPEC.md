# SPEC — Bug: Lembretes Não Disparam no Horário + Melhorias

**Data:** 2026-06-28  
**Status:** Concluido  
**Prioridade:** Alta (funcionalidade core quebrada)

---

## Resumo

Lembretes criados com horário específico (ex: "23:09") não são enviados ao usuário. O cron roda a cada 5 minutos mas a query de busca não encontra os lembretes pendentes devido a incompatibilidade de fuso horário. Adicionalmente, a listagem de lembretes não mostrava a data.

## Reprodução

```
Usuário: "criar lembrete para hoje as 23:09 tirar leite geladeira"
Bot:     "lembrete 'tirar leite geladeira' as 23:09:00 anotado"

(23:10 passa, 23:15 passa... nenhuma notificação)

Usuário: "listar lembretes"
Bot:     "1. tirar leite geladeira — 23:09"   ← ❌ sem data
```

---

## Problemas Identificados

### Bug 1: CURRENT_DATE/CURRENT_TIME em UTC vs dados em horário local

**Causa raiz:** O banco Neon PostgreSQL roda em **UTC**. A query do cron usa `CURRENT_DATE` e `CURRENT_TIME` que retornam valores em UTC. Porém os lembretes são salvos com data/hora no fuso do usuário (Brasil, UTC-3).

**Exemplo concreto:**

```
Lembrete salvo:  data = 2026-06-28, hora = 23:09
Usuário (BRT):   28/06 às 23:09 local
Servidor (UTC):  29/06 às 02:09 UTC

Query do cron:
  l.data = CURRENT_DATE     → 2026-06-28 = 2026-06-29  ❌ (dia diferente!)
  l.hora <= CURRENT_TIME    → 23:09 <= 02:09            ❌ (hora menor!)
```

A partir de ~21h no Brasil (00:00 UTC), `CURRENT_DATE` já é o dia seguinte → nenhum lembrete do "hoje" é encontrado.

**Node afetado:** `DB: Buscar Lembretes Pendentes` em `tarefildo_lembrete_customizado.json`

**Query atual:**
```sql
SELECT l.id, l.titulo, l.hora, l.data, u.whatsapp_id, u.canais_ativos 
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id 
WHERE l.ativo = true AND l.enviado = false 
AND l.data = CURRENT_DATE 
AND l.hora <= CURRENT_TIME;
```

**Query corrigida:**
```sql
SELECT l.id, l.titulo, l.hora, l.data, u.whatsapp_id, u.canais_ativos 
FROM lembretes l 
JOIN usuarios u ON u.id = l.usuario_id 
WHERE l.ativo = true AND l.enviado = false 
AND l.data = (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::date
AND l.hora <= (NOW() AT TIME ZONE COALESCE(u.fuso_horario, 'America/Sao_Paulo'))::time;
```

Usa o campo `fuso_horario` do usuário (salvo como `'America/Sao_Paulo'` no cadastro) para converter `NOW()` para o horário local antes de comparar.

---

### Bug 2: "Marcar como Enviado" usa `.first()` — só marca o primeiro lembrete

**Node afetado:** `DB: Marcar como Enviado` em `tarefildo_lembrete_customizado.json`

**Query atual:**
```sql
UPDATE lembretes SET enviado = true, enviado_em = NOW() 
WHERE id = '{{ $('Formatar Mensagem').first().json.lembrete_id }}';
```

O `.first()` sempre pega o `lembrete_id` do primeiro item do "Formatar Mensagem". Se há múltiplos lembretes, apenas o primeiro é marcado como enviado — os demais são reenviados infinitamente a cada 5 minutos.

**Correção:** Usar `$('Formatar Mensagem').item.json.lembrete_id` (item pareado no loop) em vez de `.first()`.

---

### Melhoria: Listagem de lembretes não mostra a data

**Sintoma:** Ao listar lembretes, o bot mostra apenas título e hora, sem a data.

```
Antes:  "1. tirar leite geladeira — 23:09"
Depois: "1. tirar leite geladeira — 23:09 — 28/06/2026"
```

**Nodes afetados (em `tarefildo_unified.json`):**

1. **DB: Listar Lembretes** — query não incluía `l.data` no SELECT

   ```sql
   -- Antes:
   SELECT l.id, l.titulo, l.hora FROM lembretes l ...
   
   -- Depois:
   SELECT l.id, l.titulo, l.hora, l.data FROM lembretes l ...
   ORDER BY l.data ASC NULLS LAST, l.hora ASC;
   ```

2. **Formatar Resposta** — case `listar_lembretes` não formatava a data

   ```javascript
   // Antes:
   const lista = v.map((i,idx) => `${idx+1}. ${i.json.titulo} — ${i.json.hora}`).join('\n');
   
   // Depois:
   const lista = v.map((i,idx) => {
     let info = i.json.hora ? i.json.hora.substring(0,5) : '';
     if (i.json.data) {
       const p = i.json.data.split('T')[0].split('-');
       info += (info ? ' — ' : '') + p[2] + '/' + p[1] + '/' + p[0];
     }
     return `${idx+1}. ${i.json.titulo} — ${info}`;
   }).join('\n');
   ```

---

## Correções Aplicadas

### 1. Query com timezone do usuário (`tarefildo_lembrete_customizado.json`)

Substituir `CURRENT_DATE`/`CURRENT_TIME` por `NOW() AT TIME ZONE` usando o fuso do usuário.

### 2. Marcar enviado com item pareado (`tarefildo_lembrete_customizado.json`)

Trocar `.first()` por `.item` para referenciar o item correto no loop.

### 3. Listagem com data (`tarefildo_unified.json`)

- Query `DB: Listar Lembretes`: adicionado `l.data` no SELECT, ordenação por data + hora
- `Formatar Resposta`: case `listar_lembretes` agora exibe data no formato DD/MM/YYYY

---

## Casos de Teste

| # | Cenário | Resultado esperado |
|---|---------|-------------------|
| 1 | Criar lembrete para 23:09 e esperar cron rodar | ✅ Notificação enviada |
| 2 | Criar 2 lembretes para o mesmo horário | ✅ Ambos enviados e marcados |
| 3 | Listar lembretes | ✅ Exibe hora E data: `"23:09 — 28/06/2026"` |
| 4 | Lembrete sem data explícita | ✅ Usa data de hoje, exibe na listagem |
| 5 | Lembrete para amanhã | ✅ Não dispara hoje, dispara amanhã |
