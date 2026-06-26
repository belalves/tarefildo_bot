# SPEC — Lembretes Inteligentes com Envio no Horário

**Data:** 2026-06-26  
**Status:** Pendente  
**Prioridade:** Alta  
**Alinhamento:** [N8N_DEVELOPMENT_GUIDE.md](../../N8N_DEVELOPMENT_GUIDE.md) — Seções 2.1, 3.1, 5 (Scheduled Tasks)

---

## Objetivo

Quando o usuário criar um lembrete com horário (ex: "me lembra de tomar remédio às 8h"), o sistema deve enviar a mensagem no horário exato, não apenas listar no dashboard.

---

## Fluxo Atual (quebrado)

```
Usuário: "me lembra de tomar remédio às 8h"
  → DeepSeek: intent=adicionar_lembrete, dados={titulo:"tomar remédio", hora:"08:00"}
  → DB: INSERT INTO lembretes (titulo, hora, ativo) → salva
  → Resposta: "Lembrete anotado!"
  → ... e nunca mais acontece nada
```

## Fluxo Esperado

```
Usuário: "me lembra de tomar remédio às 8h"
  → Salva lembrete no banco com hora
  → Resposta: "Lembrete anotado! Te aviso às 08:00"
  
[Às 08:00 do dia seguinte e todos os dias]
  → Scheduler verifica lembretes ativos para este horário
  → Envia: "🔔 Ei Isabela, hora de: tomar remédio! Confia no Tarefildo."
```

---

## Tipos de Lembrete

| Tipo | Exemplo | Comportamento |
|------|---------|---------------|
| **Recorrente diário** | "me lembra de tomar remédio às 8h" | Envia todo dia às 8h |
| **Uma vez** | "me lembra de ligar pro banco amanhã às 14h" | Envia uma vez e desativa |
| **Vinculado a tarefa** | Tarefa com data_vencimento | Já funciona via workflow de lembretes |

---

## Modelo de Dados

### Tabela `lembretes` (atualizada)

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| id | text (UUID) | Sim | PK |
| usuario_id | text | Sim | FK → usuarios.id |
| tarefa_id | text | Não | FK → tarefas.id (opcional) |
| titulo | text | Sim | "tomar remédio" |
| hora | time | Sim | 08:00 |
| ativo | boolean | Sim | Se está ativo |
| recorrente | boolean | Sim | Se repete todo dia |
| agendado_para | date | Não | Data específica (lembretes únicos) |
| ultimo_envio | timestamptz | Não | Quando foi enviado por último |
| enviado_em | timestamptz | Não | Legacy |
| criado_em | timestamptz | Sim | Quando criou |

### Migração SQL

```sql
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS recorrente boolean DEFAULT true;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS ultimo_envio timestamptz;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT NOW();
ALTER TABLE lembretes ALTER COLUMN tarefa_id DROP NOT NULL;
ALTER TABLE lembretes ALTER COLUMN agendado_para DROP NOT NULL;
```

---

## Arquitetura do Scheduler

### Workflow: "Tarefildo - Enviar Lembretes"

Separado do workflow principal. Roda a cada **5 minutos** verificando lembretes pendentes.

```
Schedule Trigger (a cada 5 min)
    ↓
[1] DB: Buscar Lembretes Pendentes
    SELECT l.id, l.titulo, l.hora, l.recorrente, l.agendado_para,
           u.whatsapp_id, u.nome, u.canais_ativos
    FROM lembretes l
    JOIN usuarios u ON u.id = l.usuario_id
    WHERE l.ativo = true
    AND l.hora BETWEEN (CURRENT_TIME - INTERVAL '5 minutes') AND CURRENT_TIME
    AND (
      l.ultimo_envio IS NULL 
      OR l.ultimo_envio::date < CURRENT_DATE
    )
    AND (
      l.agendado_para IS NULL  -- recorrente
      OR l.agendado_para = CURRENT_DATE  -- data específica
    );
    ↓
[2] Tem Lembretes? (filtrar vazios)
    ↓
[3] Formatar Mensagens (Code)
    Para cada lembrete:
      msg = "🔔 {nome}, hora de: {titulo}! Confia no Tarefildo."
    Detectar canal (telegram/@c.us)
    ↓
[4] Route to Channel (Telegram ou WhatsApp)
    ↓
[5] DB: Marcar Enviado
    UPDATE lembretes 
    SET ultimo_envio = NOW()
    WHERE id = $1;
    
    -- Se não recorrente, desativar
    UPDATE lembretes 
    SET ativo = false 
    WHERE id = $1 AND recorrente = false;
```

### Lógica de Envio

| Cenário | Query | Ação pós-envio |
|---------|-------|----------------|
| Recorrente ativo | `hora` bate + `ultimo_envio` não é hoje | Atualiza `ultimo_envio` |
| Único (data específica) | `agendado_para` = hoje + `hora` bate | Atualiza `ultimo_envio` + `ativo = false` |
| Já enviado hoje | `ultimo_envio::date = CURRENT_DATE` | Ignora |
| Desativado | `ativo = false` | Ignora |

### Janela de Tempo

O scheduler roda a cada 5 minutos. A query busca lembretes com `hora` nos últimos 5 minutos:

```sql
WHERE l.hora BETWEEN (CURRENT_TIME - INTERVAL '5 minutes') AND CURRENT_TIME
```

Isso garante que um lembrete das 08:00 será capturado entre 08:00 e 08:05.

**⚠️ Timezone:** O servidor n8n (PikaPods) usa UTC. Lembretes devem ser armazenados no fuso do usuário. Como todos os usuários atuais são de Brasília (UTC-3), a query ajusta:

```sql
WHERE l.hora BETWEEN 
  ((CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '5 minutes') 
  AND (CURRENT_TIME AT TIME ZONE 'America/Sao_Paulo')
```

---

## Fluxo de Criação (Bot Principal)

### DeepSeek — nova lógica para lembretes

O prompt já suporta `adicionar_lembrete`. Adicionar ao Preparar Prompt:

- Se o texto mencionar "todo dia" ou "sempre" → `recorrente = true`
- Se mencionar data específica ("amanhã", "sexta") → `recorrente = false`, `agendado_para = data`
- Default: `recorrente = true`

### Preparar Insert Lembrete (atualizado)

```javascript
const item = $input.first().json;
const titulo = (item.dados?.titulo || '').trim();
const hora = (item.dados?.hora || '').trim();
const data = (item.dados?.data || '').trim();
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const chatId = item.chatId;

if (!titulo) {
  return [{ json: { chatId, mensagem: `${nome}, me fala o que quer lembrar e o horario.`, pular_db: true } }];
}

if (!hora) {
  return [{ json: { chatId, mensagem: `${nome}, anotei '${titulo}' mas preciso do horario. Que horas te lembro?`, pular_db: true } }];
}

const recorrente = !data; // Se tem data específica, não é recorrente

return [{ json: {
  p1: titulo,
  p2: hora,
  p3: item.whatsapp_id,
  p4: recorrente ? 'true' : 'false',
  p5: data || '__NULL__',
  chatId, nome, source: item.source, whatsapp_id: item.whatsapp_id, pular_db: false
} }];
```

### Query INSERT (atualizada)

```sql
INSERT INTO lembretes (usuario_id, titulo, hora, ativo, recorrente, agendado_para, criado_em) 
SELECT u.id, $1, $2::time, true, $4::boolean, NULLIF($5,'__NULL__')::date, NOW() 
FROM usuarios u WHERE u.whatsapp_id = $3 
RETURNING id, titulo, hora, recorrente;
```

### Respostas do Tarefildo

| Cenário | Resposta |
|---------|----------|
| Recorrente criado | `{nome}, lembrete '${titulo}' as ${hora} anotado. Te aviso todo dia nesse horario ☕` |
| Único criado | `{nome}, lembrete '${titulo}' pra ${data} as ${hora}. Te aviso no dia!` |
| Sem título | `{nome}, me fala o que quer lembrar e o horario.` |
| Sem hora | `{nome}, anotei '${titulo}' mas preciso do horario. Que horas?` |

---

## Listar Lembretes (atualizado)

### Query

```sql
SELECT l.id, l.titulo, l.hora, l.recorrente, l.agendado_para
FROM lembretes l
JOIN usuarios u ON u.id = l.usuario_id
WHERE u.whatsapp_id = $1 AND l.ativo = true
ORDER BY l.hora;
```

### Formatação

```
🔔 Seus lembretes:

1. Tomar remédio — 08:00 (todo dia)
2. Ligar pro banco — 14:00 (amanhã)
3. Reunião — 10:00 (28/06)
```

---

## Desativar/Excluir Lembrete

Adicionar intent `excluir_lembrete` ao DeepSeek:

```
"excluir lembrete tomar remédio"
  → DB: UPDATE lembretes SET ativo = false WHERE titulo ILIKE '%remédio%'
  → "Pronto {nome}, lembrete desativado."
```

---

## Nós do Workflow Scheduler

| Nó | Tipo | Descrição |
|----|------|-----------|
| Schedule Trigger | scheduleTrigger | Cron: `0 */5 * * * *` (a cada 5 min) |
| DB: Lembretes Pendentes | postgres | Query com timezone |
| Tem Lembretes? | filter | titulo not empty |
| Formatar Lembretes | code | Monta mensagem + detecta canal |
| Route to Channel | switch | Telegram ou WhatsApp |
| Enviar Telegram | telegram | Envia msg |
| Enviar WhatsApp | WAHA | Envia msg |
| DB: Marcar Enviado | postgres | UPDATE ultimo_envio + desativar se único |

---

## Testes

| Cenário | Input | Esperado |
|---------|-------|----------|
| Lembrete recorrente | "me lembra de tomar remédio às 8h" | Salva recorrente, envia todo dia 8h |
| Lembrete único | "me lembra de ligar pro banco amanhã às 14h" | Salva com data, envia 1x, desativa |
| Sem hora | "me lembra de comprar pão" | Pede horário |
| Sem título | "adiciona lembrete" | Pede informações |
| Listar | "meus lembretes" | Lista com tipo (todo dia / data) |
| Excluir | "remove lembrete remédio" | Desativa |
| Já enviado hoje | Scheduler roda 2x no mesmo horário | Não duplica |
| Timezone | Lembrete 8h Brasília | Dispara correto em UTC |

---

## Estimativa

| Item | Tempo |
|------|-------|
| Migração banco (colunas) | 5 min |
| Atualizar Preparar Insert Lembrete | 15 min |
| Criar workflow scheduler | 30 min |
| Formatar respostas | 10 min |
| Testes | 15 min |
| **Total** | **~75 min** |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Scheduler cai | Keepalive + alerta se 0 execuções em 1h |
| Timezone errado | Query com AT TIME ZONE + fuso no usuario |
| Duplicação de envio | Campo `ultimo_envio` impede re-envio no mesmo dia |
| Lembrete sem hora | Validação no Preparar Insert — pede hora antes de salvar |
| Muitos lembretes simultâneos | LIMIT 50 na query + batch envio |
