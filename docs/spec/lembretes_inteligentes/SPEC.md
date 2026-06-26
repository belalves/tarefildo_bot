# SPEC — Lembretes Inteligentes com Envio Sob Demanda

**Data:** 2026-06-26  
**Status:** Pendente  
**Prioridade:** Alta  
**Alinhamento:** [N8N_DEVELOPMENT_GUIDE.md](../../N8N_DEVELOPMENT_GUIDE.md) — Seções 2.1, 3.1, 1.4

---

## Objetivo

Quando o usuário criar um lembrete com horário, o sistema deve enviar a mensagem no horário exato usando o nó **Wait** do n8n — sem scheduler adicional, zero custo extra.

---

## Abordagem: Sob Demanda com Wait Node

Em vez de um scheduler rodando periodicamente (caro), o lembrete é agendado **no momento da criação** usando o nó `Wait` do n8n que pausa a execução até o horário exato e então envia.

```
Usuário: "me lembra de tomar remédio amanhã às 8h"
  → Salva lembrete no banco
  → Calcula tempo de espera (agora → amanhã 8h)
  → Nó Wait: pausa até o horário
  → Envia mensagem no horário exato
  → Marca como enviado no banco
```

**Custo:** 0 execuções extras. A execução fica "dormindo" no n8n até o horário.

---

## Fluxo Atual (quebrado)

```
Usuário: "me lembra de tomar remédio às 8h"
  → Salva → Responde → ... nunca mais acontece nada
```

## Fluxo Novo

```
Usuário: "me lembra de tomar remédio amanhã às 8h"
    ↓
[1] Preparar Insert Lembrete
    - Valida: tem título? tem hora?
    - Calcula agendado_para (data + hora)
    ↓
[2] DB: Adicionar Lembrete
    - INSERT com titulo, hora, agendado_para, ativo
    ↓
[3] Resposta ao usuário
    - "Lembrete anotado! Te aviso amanhã às 08:00 ☕"
    ↓
[4] Route to Channel → Envia confirmação
    ↓
[5] Wait Node
    - Pausa até: agendado_para (datetime exato)
    ↓
[6] DB: Verificar se ainda ativo
    - SELECT ativo FROM lembretes WHERE id = $1
    - Se desativado pelo usuário → para
    ↓
[7] Formatar Lembrete
    - "🔔 Isabela, hora de: tomar remédio! Confia no Tarefildo."
    ↓
[8] Route to Channel → Envia lembrete
    ↓
[9] DB: Marcar Enviado
    - UPDATE ultimo_envio = NOW()
    - Se não recorrente: ativo = false
    ↓
[10] Se recorrente → Reagendar
    - Calcula próximo horário (+24h)
    - Volta pro Wait Node (loop)
```

---

## Tipos de Lembrete

| Tipo | Exemplo | Wait | Pós-envio |
|------|---------|------|-----------|
| **Único** | "me lembra amanhã às 14h" | Até data+hora | Desativa |
| **Recorrente** | "me lembra todo dia às 8h" | Até próxima 8h | Reagenda +24h |

---

## Modelo de Dados

### Tabela `lembretes` (migração)

```sql
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS titulo text;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS hora time;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS recorrente boolean DEFAULT false;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS ultimo_envio timestamptz;
ALTER TABLE lembretes ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT NOW();
ALTER TABLE lembretes ALTER COLUMN tarefa_id DROP NOT NULL;
ALTER TABLE lembretes ALTER COLUMN agendado_para DROP NOT NULL;
```

### Campos usados

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| titulo | text | "tomar remédio" |
| hora | time | 08:00 |
| ativo | boolean | Se ainda está ativo |
| recorrente | boolean | Se repete todo dia |
| agendado_para | timestamptz | Data+hora exata do próximo envio |
| ultimo_envio | timestamptz | Quando foi enviado por último |

---

## Implementação no Workflow Principal

### Preparar Insert Lembrete (atualizado)

```javascript
const item = $input.first().json;
const titulo = (item.dados?.titulo || '').trim();
const hora = (item.dados?.hora || '').trim();
const data = (item.dados?.data || '').trim();
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
const chatId = item.chatId;

// Validação
if (!titulo) {
  return [{ json: { chatId, mensagem: `${nome}, me fala o que quer lembrar e o horario. Tipo: 'me lembra de tomar remedio as 8h'.`, pular_db: true } }];
}

if (!hora) {
  return [{ json: { chatId, mensagem: `${nome}, anotei '${titulo}' mas preciso do horario. Que horas te lembro?`, pular_db: true } }];
}

// Calcular agendado_para (datetime exato)
const agora = new Date();
let agendadoPara;

if (data) {
  // Data específica + hora
  agendadoPara = new Date(data + 'T' + hora + ':00-03:00'); // Brasília
} else {
  // Hoje ou amanhã se já passou a hora
  const [h, m] = hora.split(':').map(Number);
  agendadoPara = new Date();
  agendadoPara.setHours(h + 3, m, 0, 0); // +3 para UTC
  if (agendadoPara <= agora) {
    agendadoPara.setDate(agendadoPara.getDate() + 1); // Amanhã
  }
}

const recorrente = !data; // Sem data = todo dia

return [{ json: {
  p1: titulo,
  p2: hora,
  p3: item.whatsapp_id,
  p4: recorrente ? 'true' : 'false',
  p5: agendadoPara.toISOString(),
  chatId, nome, source: item.source, whatsapp_id: item.whatsapp_id,
  pular_db: false,
  agendado_para_iso: agendadoPara.toISOString(),
  recorrente
} }];
```

### Query INSERT

```sql
INSERT INTO lembretes (usuario_id, titulo, hora, ativo, recorrente, agendado_para, criado_em)
SELECT u.id, $1, $2::time, true, $4::boolean, $5::timestamptz, NOW()
FROM usuarios u WHERE u.whatsapp_id = $3
RETURNING id, titulo, hora, recorrente, agendado_para;
```

### Após salvar → Resposta + Wait + Envio

```
DB: Adicionar Lembrete
    ↓
Resposta Lembrete (confirma ao usuário)
    ↓
Route to Channel (envia confirmação)
    ↓
Wait Node (pausa até agendado_para)
    ↓
DB: Lembrete ainda ativo? (verifica se não foi cancelado)
    ↓ [Se ativo]
Formatar Lembrete (msg do Tarefildo)
    ↓
Route to Channel (envia lembrete)
    ↓
DB: Marcar Enviado (ultimo_envio + desativar se único)
    ↓ [Se recorrente]
Reagendar (+24h) → volta pro Wait
```

### Wait Node — Configuração

```json
{
  "type": "n8n-nodes-base.wait",
  "parameters": {
    "resume": "specificTime",
    "dateTime": "={{ $json.agendado_para_iso }}"
  }
}
```

---

## Respostas do Tarefildo

| Cenário | Resposta |
|---------|----------|
| Recorrente criado | `{nome}, lembrete '{titulo}' as {hora} anotado. Te aviso todo dia nesse horario ☕` |
| Único criado | `{nome}, lembrete '{titulo}' pra {data} as {hora}. Te aviso no dia!` |
| Sem título | `{nome}, me fala o que quer lembrar e o horario.` |
| Sem hora | `{nome}, anotei '{titulo}' mas preciso do horario.` |
| Envio do lembrete | `🔔 {nome}, hora de: {titulo}! Confia no Tarefildo.` |
| Lembrete cancelado antes de disparar | Não envia (verificação pré-envio) |

---

## Listar Lembretes

```sql
SELECT l.id, l.titulo, l.hora, l.recorrente, l.agendado_para
FROM lembretes l JOIN usuarios u ON u.id = l.usuario_id
WHERE u.whatsapp_id = $1 AND l.ativo = true
ORDER BY l.hora;
```

Formatação:
```
🔔 Seus lembretes:
1. Tomar remédio — 08:00 (todo dia)
2. Ligar pro banco — 14:00 (amanhã)
```

---

## Cancelar Lembrete

```
"cancela lembrete tomar remédio"
  → DB: UPDATE lembretes SET ativo = false WHERE titulo ILIKE '%remédio%'
  → O Wait Node verifica ativo antes de enviar → não envia
```

---

## Vantagens sobre Scheduler

| Aspecto | Scheduler (5 min) | Sob Demanda (Wait) |
|---------|-------------------|-------------------|
| Execuções/dia | 288 | 0 extras |
| Precisão | ±5 min | Exata |
| Custo | Alto | Zero |
| Complexidade | Workflow separado | Mesmo workflow |
| Escalabilidade | Limitada | Cada lembrete é independente |

---

## Limitações do Wait Node

| Limitação | Mitigação |
|-----------|-----------|
| Se n8n reiniciar, Waits pendentes podem perder | n8n persiste Waits no banco — sobrevive restart |
| Muitos Waits simultâneos | n8n suporta milhares — não é problema para uso pessoal |
| Recorrente infinito | Limitar a 30 dias, depois pedir renovação |
| PikaPods pode ter limite de execuções pausadas | Monitorar — se necessário, migrar para scheduler 3x/dia |

---

## Testes

| Cenário | Input | Esperado |
|---------|-------|----------|
| Lembrete único | "me lembra amanhã às 14h de ligar pro banco" | Salva, envia às 14h, desativa |
| Lembrete recorrente | "me lembra de tomar remédio às 8h" | Salva, envia todo dia 8h |
| Sem hora | "me lembra de comprar pão" | Pede horário |
| Sem título | "adiciona lembrete" | Pede informações |
| Cancelar antes de disparar | "cancela lembrete remédio" → Wait verifica | Não envia |
| Listar | "meus lembretes" | Lista com tipo |
| Hora já passou hoje | "me lembra às 6h" (são 10h) | Agenda pra amanhã 6h |

---

## Estimativa

| Item | Tempo |
|------|-------|
| Migração banco | 5 min |
| Atualizar Preparar Insert Lembrete | 15 min |
| Adicionar Wait + verificação + envio | 25 min |
| Loop recorrente | 15 min |
| Formatar respostas | 10 min |
| Testes | 15 min |
| **Total** | **~85 min** |

---

## Checklist (Guide §11)

- [ ] Queries parametrizadas ($1-$5)
- [ ] Validação: título e hora obrigatórios
- [ ] Wait Node com datetime ISO
- [ ] Verificação de ativo antes de enviar
- [ ] Marcar enviado + desativar se único
- [ ] Loop recorrente (+24h)
- [ ] Timezone Brasília (UTC-3)
- [ ] Cancelamento funciona (ativo=false)
- [ ] Teste hora passada → agenda amanhã
