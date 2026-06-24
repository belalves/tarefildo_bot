# Spec de Melhorias — Tarefildo Bot

**Data**: 2026-06-24  
**Status**: Planejamento  
**Prioridade**: 1 (SQL Injection), 2 (Lembretes), 3+ (Features)

---

## Requisição 1: SQL Injection Fix no Telegram (CRÍTICO)

**Arquivo afetado**: `tarefildo_telegram.json`

**Problema**:  
Todas as queries SQL usam interpolação direta de strings. Um usuário pode enviar `'; DROP TABLE tarefas; --` e comprometer o banco inteiro.

**Solução**:  
Usar parametrização nativa do n8n Postgres node: `$1, $2, $3` em vez de `{{ $json.field }}` interpolados.

**Passos**:
1. Identificar todos os nodes Postgres no workflow Telegram (procurar por `type: n8n-nodes-base.postgres`)
2. Para cada query:
   - Extrair valores em nodes Code ANTES do Postgres node
   - Refatorar query SQL para usar `$1, $2, $3...` placeholders
   - Passar valores no campo `queryParameters` ou `parameters`
   
**Exemplo antes**:
```sql
INSERT INTO tarefas (...) VALUES ('{{ $json.dados.titulo }}', '{{ $json.whatsapp_id }}', ...)
```

**Exemplo depois**:
```sql
INSERT INTO tarefas (...) VALUES ($1, $2, ...)
-- Com queryParameters: [titulo, whatsapp_id, ...]
```

**Nodes afetados** (lista não-exaustiva):
- DB: Verificar Status Fluxo
- DB: Upsert Usuario
- DB: Adicionar Tarefa
- DB: Editar Tarefa (se existir)
- DB: Listar Tarefas
- DB: Buscar Duplicatas
- DB: Limpar Duplicatas
- DB: Concluir Tarefa
- DB: Excluir Tarefa (se existir)
- DB: Adicionar Lembrete
- DB: Listar Lembretes
- Qualquer outro que interpolasse strings

**Teste**: Tentar enviar `'; DROP TABLE usuarios;` — deve falhar com erro SQL, não executar.

---

## Requisição 2: Rate Limiting no Telegram (MÉDIO)

**Arquivo afetado**: `tarefildo_telegram.json`

**Problema**:  
WhatsApp tem rate limit de 3s por remetente. Telegram não tem nenhum. Um usuario pode spammar e gerar custos altos com DeepSeek.

**Solução**:  
Adicionar o mesmo mecanismo de `globalState` do WhatsApp no node "Filtrar Mensagem" do Telegram.

**Implementação**:
1. No node "Filtrar Mensagem" do Telegram, após extrair `whatsapp_id` e `text`:
   - Pegar timestamp da mensagem: `msg.date * 1000` (Telegram retorna em segundos Unix)
   - Comparar com `globalState['last_' + whatsapp_id]`
   - Se diferença < 3000ms, retornar `[]` (ignorar)
   - Atualizar `globalState['last_' + whatsapp_id] = now`
   - Limpar entradas > 1 hora (mesmo que no WhatsApp)

**Pseudocódigo**:
```javascript
const now = Date.now();
const lastTime = globalState['last_' + whatsapp_id] || 0;
if (now - lastTime < 3000) return [];
globalState['last_' + whatsapp_id] = now;

// Limpar entradas antigas
for (const key of Object.keys(globalState)) {
  if (key.startsWith('last_') && now - globalState[key] > 3600000) {
    delete globalState[key];
  }
}
```

**Teste**: Enviar 3 mensagens em 1s — apenas a primeira é processada.

---

## Requisição 3: Lembretes Customizados (FUNCIONALIDADE INCOMPLETA)

**Arquivos afetados**:  
- Novo: `tarefildo_lembrete_customizado.json` (workflow)
- `tarefildo_lembrete_tarefas.json` (já existe, apenas referência)
- Schema DB (tabela `lembretes` já existe)

**Problema**:  
Usuário pode adicionar lembrete customizado via bot, mas nunca recebe notificação. A tabela `lembretes` tem dados mas nenhum cron dispara.

**Solução**:  
Criar novo workflow agendado que:
1. Executa a cada 30min (ou 1h)
2. Busca lembretes ativos com `hora <= NOW()` e último envio hoje < hora
3. Envia para o usuário via Telegram/WhatsApp (com base em `canais_ativos`)
4. Marca como enviado (adicionar campo `ultimo_envio_em` na tabela)

**Schema DB — Alterações**:
```sql
ALTER TABLE lembretes ADD COLUMN ultimo_envio_em TIMESTAMP DEFAULT NULL;
```

**Workflow novo — Estrutura**:
```
Schedule (0 */30 * * * *) 
  → Query: Buscar lembretes vencidos
  → Agrupar por usuário
  → [Qual canal?] (Switch: telegram vs whatsapp)
  → Enviar Telegram / Enviar WhatsApp
  → DB: Atualizar ultimo_envio_em
```

**Query principal**:
```sql
SELECT l.id, l.titulo, l.hora, u.whatsapp_id, u.canais_ativos, u.fuso_horario
FROM lembretes l
JOIN usuarios u ON u.id = l.usuario_id
WHERE l.ativo = true
  AND l.ultima_enviado_em IS NULL  -- Ainda não enviado hoje
  AND l.hora <= CURRENT_TIME       -- Hora já passou
  AND u.canais_ativos IS NOT NULL
ORDER BY u.id, l.hora;
```

**Teste**:
1. Adicionar lembrete "Almoço" às 12:30 via Telegram
2. Executar workflow manualmente ou esperar próximo ciclo de 30min
3. Verificar se mensagem foi enviada no Telegram

---

## Requisição 4: Tarefas Recorrentes (FUNCIONALIDADE NOVA)

**Arquivos afetados**:  
- `tarefildo_telegram.json` (adicionar suporte ao criar tarefa)
- `tarefildo_whatsapp.json` (id)
- Novo: `tarefildo_recorrencia_auto.json` (workflow)
- Schema DB (tabela `tarefas`)

**Problema**:  
Usuário não pode criar tarefa repetida (ex: "pagar aluguel no dia 5 de cada mês").

**Solução**:  
1. Adicionar campo `recorrencia` na tabela `tarefas`
2. Ao concluir tarefa, se tem recorrência, cria nova automaticamente
3. Criar workflow agendado que recria tarefas recorrentes (fallback)

**Schema DB**:
```sql
ALTER TABLE tarefas ADD COLUMN recorrencia TEXT DEFAULT NULL; -- 'diario', 'semanal', 'mensal', 'anual', NULL
ALTER TABLE tarefas ADD COLUMN data_proximo_ciclo DATE DEFAULT NULL;
ALTER TABLE tarefas ADD COLUMN dia_mes_recorrencia INTEGER DEFAULT NULL; -- Para 'mensal'
```

**Intents adicionados ao DeepSeek**:  
- `"Preciso pagar aluguel todo dia 5"` → `recorrencia: 'mensal', dia_mes_recorrencia: 5`
- `"Lembrar de se exercitar todo dia"` → `recorrencia: 'diario'`
- `"Revisar OKRs toda segunda"` → `recorrencia: 'semanal'` (com dia da semana)

**Update ao concluir tarefa**:
Quando usuário marca como CONCLUIDA:
```sql
IF recorrencia IS NOT NULL THEN
  -- Cria nova tarefa para próximo ciclo
  INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, recorrencia, ...)
  VALUES (usuario_id, titulo, descricao, calculate_next_date(data_vencimento, recorrencia), recorrencia, ...)
  
  -- Marca a atual como concluída
  UPDATE tarefas SET status = 'CONCLUIDA' WHERE id = X
ELSE
  UPDATE tarefas SET status = 'CONCLUIDA' WHERE id = X
END IF
```

**Workflow novo `tarefildo_recorrencia_auto.json`** (segurança):  
Executa diariamente às 00:05:
```
Schedule (5 0 * * *)
  → Query: Buscar tarefas CONCLUIDA com recorrencia != NULL criadas hoje
  → Para cada: calcular próxima data
  → Inserir nova tarefa
```

**Teste**:
1. Usuário cria "Pagar aluguel dia 5 todo mês" em 24/06
2. Marca como concluída
3. Verifica BD: deve ter nova tarefa para 05/07

---

## Requisição 5: Prioridade de Tarefas (FUNCIONALIDADE NOVA)

**Arquivos afetados**:  
- `tarefildo_telegram.json` (adicionar suporte)
- `tarefildo_whatsapp.json` (id)
- Schema DB

**Problema**:  
Não há diferenciação entre tarefas urgentes e normais. Ao listar, tudo tem o mesmo peso.

**Solução**:  
1. Adicionar campo `prioridade` na tabela `tarefas`
2. DeepSeek extrai prioridade do contexto (palavras-chave: "urgente", "ASAP", "quando der", etc)
3. Listar tarefas ordenadas por prioridade + data_vencimento

**Schema DB**:
```sql
ALTER TABLE tarefas ADD COLUMN prioridade TEXT DEFAULT 'MEDIA'; -- 'ALTA', 'MEDIA', 'BAIXA'
```

**DeepSeek prompt update**:
Adicionar ao prompt: `"Extraia também prioridade (ALTA se mencionar urgente/asap/critico, BAIXA se 'quando der', senão MEDIA)"`

**Exemplo JSON do DeepSeek**:
```json
{
  "intent": "adicionar_tarefa",
  "dados": {
    "titulo": "Pagar boleto",
    "prioridade": "ALTA"
  },
  "resposta": "..."
}
```

**Query de listagem atualizada**:
```sql
ORDER BY 
  CASE prioridade 
    WHEN 'ALTA' THEN 1 
    WHEN 'MEDIA' THEN 2 
    WHEN 'BAIXA' THEN 3 
  END ASC,
  data_vencimento ASC
```

**UI na resposta**:
```
1. 🔴 [ALTA] Pagar boleto — 25/06
2. 🟡 [MEDIA] Revisar documento — 30/06
3. 🟢 [BAIXA] Limpar email — sem data
```

**Teste**:
1. Criar "Urgente: enviar relatório" → marca ALTA
2. Criar "Quando der, listar videos" → marca BAIXA
3. Listar tarefas → ALTA aparece primeiro

---

## Requisição 6: Detecção de Tarefas Atrasadas (FUNCIONALIDADE NOVA)

**Arquivos afetados**:  
- `tarefildo_lembrete_tarefas.json` (workflow existente, vai ser expandido)

**Problema**:  
Se uma tarefa tem `data_vencimento = 2026-06-20` e hoje é 2026-06-24, o bot não sinaliza como atrasada.

**Solução**:  
No workflow de lembretes diários:
1. Separar lógica de tarefas do dia vs tarefas atrasadas
2. Enviar com mensagens diferentes (tom mais urgente para atrasos)

**Query atualizada** (dentro de `tarefildo_lembrete_tarefas.json`):
```sql
SELECT 
  t.id, t.titulo, t.data_vencimento, u.whatsapp_id, u.canais_ativos,
  CASE 
    WHEN t.data_vencimento = CURRENT_DATE THEN 'VENCE_HOJE'
    WHEN t.data_vencimento < CURRENT_DATE THEN 'ATRASADA'
  END as tipo_lembrete
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE t.status = 'PENDENTE' 
  AND t.lembrete_enviado = false
  AND (t.data_vencimento = CURRENT_DATE OR t.data_vencimento < CURRENT_DATE)
```

**Lógica de mensagem** (em "Formatar Resposta"):
```javascript
if (tipo_lembrete === 'VENCE_HOJE') {
  msg = `${nome}, '${titulo}' vence HOJE! Nao deixa pra ultima hora 🚀`;
} else if (tipo_lembrete === 'ATRASADA') {
  msg = `${nome}, ALERTA 🚨 '${titulo}' ATRASADA desde ${dias_atraso}d! Bora resolver isso urgente.`;
}
```

**Teste**:
1. Criar tarefa com data 2026-06-20 (passado)
2. Rodar workflow de lembrete
3. Verificar mensagem com tom urgente

---

## Requisição 7: Resumo Semanal (FUNCIONALIDADE NOVA)

**Arquivo novo**: `tarefildo_resumo_semanal.json`

**Problema**:  
Usuário não tem visão agregada do seu progresso. Sem feedback, engagement cai.

**Solução**:  
Novo workflow agendado (domingo 20:00) que envia:
- Tarefas concluídas nesta semana (✅ count)
- Tarefas ainda pendentes
- Tarefas atrasadas (⚠️)
- Próximas 3 tarefas da semana
- Mensagem personalizada do Tarefildo sobre produtividade

**Schedule**: `0 20 * * 0` (todo domingo 20:00 — UTC, precisa ajustar para fuso!)

**Workflow**:
```
Schedule (domingo 20h)
  → Query: tarefas CONCLUIDA criadas na semana atual (Mon-Sun)
  → Query: tarefas PENDENTE (próximas 7 dias)
  → Query: tarefas ATRASADA
  → Agrupar por usuário
  → Formatar resumo
  → [Qual canal?] Enviar Telegram / WhatsApp
```

**Queries**:
```sql
-- Concluídas esta semana (segunda a domingo)
SELECT COUNT(*) as count_concluidas, u.whatsapp_id
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE t.status = 'CONCLUIDA'
  AND t.atualizado_em >= (CURRENT_DATE - INTERVAL '7 days')
  AND EXTRACT(DOW FROM t.atualizado_em) BETWEEN 1 AND 6
GROUP BY u.whatsapp_id;

-- Pendentes próximos 7 dias
SELECT COUNT(*) as count_proximas
FROM tarefas t
WHERE t.status = 'PENDENTE'
  AND t.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7;

-- Atrasadas
SELECT COUNT(*) as count_atrasadas
FROM tarefas t
WHERE t.status = 'PENDENTE' AND t.data_vencimento < CURRENT_DATE;
```

**Formato da mensagem**:
```
🎯 Resumo da semana, ${nome}!

✅ Concluídas: 5 tarefas
📋 Pendentes: 3 tarefas
⚠️ Atrasadas: 1 tarefa

Próximas 3:
1. Pagar boleto — 25/06
2. Enviar relatório — 26/06
3. Reunião — 27/06

Ai sim! Você ta pegando ritmo. Bora manter essa energia 💪
```

**Teste**:
1. Criar 5 tarefas ao longo da semana, marcar 3 como concluídas
2. Executar workflow manualmente
3. Verificar se a contagem está correta

---

## Requisição 8: Fallback DeepSeek (RESILIÊNCIA)

**Arquivos afetados**:  
- `tarefildo_telegram.json` (node "DeepSeek NLP")
- `tarefildo_whatsapp.json` (id)

**Problema**:  
Se DeepSeek cai (rate limit, indisponibilidade), usuário recebe erro genérico. Perde funcionalidade 100%.

**Solução**:  
Adicionar fallback com regex simples para comandos óbvios, sem precisar de IA.

**Implementação**:
Novo node Code ANTES do DeepSeek chamado "Tentar Fallback":
```javascript
const text = $input.first().json.text.toLowerCase();

// Comandos simples com regex
const fallback = {
  intent: null,
  dados: {},
  resposta: null
};

// Lista de tarefas
if (text.match(/\b(lista|minhas|tarefas|ver|show)\b/i)) {
  fallback.intent = 'listar_tarefas';
}
// Adicionar tarefa (começa com "tarefa:" ou "adiciona")
else if (text.match(/^(tarefa|adiciona?|add)\b/i)) {
  const titulo = text.replace(/^(tarefa|adiciona?|add)\s*:?\s*/i, '');
  fallback.intent = 'adicionar_tarefa';
  fallback.dados = { titulo };
}
// Ajuda
else if (text.match(/\b(ajuda|help|comando|o que)\b/i)) {
  fallback.intent = 'ajuda';
}
// Concluir tarefa
else if (text.match(/\b(concluir|done|pronto|finalizei|fechei)\b/i)) {
  fallback.intent = 'conversa'; // Sem dados, user precisa especificar qual
  fallback.resposta = 'Qual tarefa foi concluída? Me manda o nome certinho.';
}

return [{ json: { ...fallback, fallback_attempt: fallback.intent !== null } }];
```

**Node "DeepSeek NLP"** — Adicionar `onError`:
```
se fallback_attempt === true, retornar fallback
senao, chamar DeepSeek (com retry)
se DeepSeek falhar e nao houver fallback, retornar erro genérico
```

**Teste**:
1. Desabilitar credencial DeepSeek ou simular erro 503
2. Enviar `/tarefas` — deve retornar lista sem chamar DeepSeek
3. Enviar `Adiciona: pagar boleto` — deve tentar fallback
4. Enviar texto aleatório — deve retornar "não entendi"

---

## Requisição 9: Fuso Horário Dinâmico (RESILIÊNCIA)

**Arquivos afetados**:  
- `tarefildo_lembrete_tarefas.json`
- `tarefildo_lembrete_customizado.json` (novo)
- `tarefildo_resumo_semanal.json` (novo)

**Problema**:  
Cron é fixo (07:00 UTC). Usuário em São Paulo (-3 UTC) recebe lembrete às 10:00 local, não 7:00.

**Solução**:  
1. Workflow roda a cada 1 hora (ou 30min) com parametrização de fuso
2. Cada query filtra por fuso do usuário
3. Compara hora local vs hora do lembrete

**Implementação**:
Novo workflow `tarefildo_lembrete_tarefas_v2.json` (ou refatorar existente):
```
Schedule (0 * * * *) -- A cada hora
  → Query: SELECT DISTINCT fuso_horario FROM usuarios
  → Loop: para cada fuso
    → Calcular hora_atual no fuso (via PostgreSQL)
    → Buscar tarefas do dia no fuso
    → Enviar via Telegram/WhatsApp
    → Marcar como enviado
```

**Query parametrizada por fuso**:
```sql
SELECT t.id, t.titulo, u.whatsapp_id, u.fuso_horario,
       (CURRENT_TIME AT TIME ZONE u.fuso_horario) as hora_local
FROM tarefas t
JOIN usuarios u ON u.id = t.usuario_id
WHERE t.data_vencimento = CURRENT_DATE AT TIME ZONE u.fuso_horario
  AND t.status = 'PENDENTE'
  AND t.lembrete_enviado = false
ORDER BY u.fuso_horario;
```

**Loop no n8n**:
1. Query principal retorna 1 linha por (fuso, tarefa)
2. Agrupar por fuso no Code node
3. Para cada fuso, verificar se `hora_local >= 07:00`
4. Enviar apenas se horário passou

**Teste**:
1. Criar 2 usuários: fuso_horario = 'America/Sao_Paulo' (-3) e 'America/Los_Angeles' (-7)
2. Ambos com tarefa vencendo hoje
3. Rodar workflow às 10:00 UTC
4. SP deve receber (10:00 UTC = 07:00 SP), LA não deve (10:00 UTC = 03:00 LA)

---

## Priorização de Implementação

| Req | Título | Prioridade | Deps | Est. Tempo |
|-----|--------|-----------|------|-----------|
| 1 | SQL Injection Fix | 🔴 CRÍTICA | Nenhuma | 3-4h |
| 2 | Rate Limit Telegram | 🟠 ALTA | Nenhuma | 1h |
| 8 | Fallback DeepSeek | 🟠 ALTA | Nenhuma | 2h |
| 3 | Lembretes Customizados | 🟡 MÉDIA | 1 | 3h |
| 7 | Tarefas Atrasadas | 🟡 MÉDIA | 3 | 1h |
| 9 | Fuso Horário | 🟡 MÉDIA | 3, 7 | 2-3h |
| 4 | Tarefas Recorrentes | 🟢 BAIXA | Nenhuma | 4h |
| 5 | Prioridade Tarefas | 🟢 BAIXA | Nenhuma | 2h |
| 6 | Resumo Semanal | 🟢 BAIXA | 7, 9 | 3h |

---

## Checklist de Validação

- [ ] Req 1: Testar SQL injection com `'; DROP TABLE;`
- [ ] Req 2: Enviar 3 msgs em 1s, verificar se apenas 1 processada
- [ ] Req 3: Criar lembrete, verificar se recebe notificação na hora
- [ ] Req 4: Criar tarefa recorrente, concluir, verificar próxima criação
- [ ] Req 5: Criar tarefas com prioridades diferentes, verificar ordem na listagem
- [ ] Req 6: Marcar tarefas como concluídas, rodar cron de atrasadas, verificar tom
- [ ] Req 7: Rodar cron no domingo, receber resumo com contagens corretas
- [ ] Req 8: Desabilitar DeepSeek, enviar `/tarefas`, funcionar com fallback
- [ ] Req 9: Criar usuários em 3 fusos, rodar cron, verificar horário local

---

**Próximos passos**:  
1. Validar spec com o usuário
2. Implementar Req 1 (SQL Injection) no Telegram
3. Implementar Req 2 (Rate Limit)
4. Testar e fazer commit

