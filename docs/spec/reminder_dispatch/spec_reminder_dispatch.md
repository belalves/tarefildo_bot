# Spec: Disparo de Lembretes Customizados

**Data**: 2026-06-26  
**Status**: Planejamento  
**Requisito**: REQ 3 do ROADMAP  
**Prioridade**: Alta

---

## Problema

Hoje o Tarefildo só dispara lembretes de **tarefas com data de vencimento** (cron diário às 07:00 UTC via `tarefildo_lembrete_tarefas.json`). Não existe disparo para **lembretes customizados** — aqueles que o usuário cadastra com hora específica, como:

> "me lembre de tirar o frango do congelador às 16h hoje"

A tabela `lembretes` já existe no banco e o intent `adicionar_lembrete` já é reconhecido pelo DeepSeek, mas **nenhum workflow verifica e dispara esses lembretes na hora certa**.

---

## Solução

Criar um novo workflow n8n (`tarefildo_lembrete_customizado.json`) que roda em intervalos curtos (a cada 5 minutos), consulta lembretes pendentes cuja hora já passou, e envia a mensagem ao usuário pelo canal correto (Telegram/WhatsApp).

---

## Schema Atual da Tabela `lembretes`

```sql
CREATE TABLE lembretes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id UUID REFERENCES usuarios(id),
  titulo TEXT NOT NULL,
  hora TIME NOT NULL,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT NOW()
);
```

### Alterações Necessárias no Schema

```sql
-- Data do lembrete (hoje o sistema só grava hora, precisa da data também)
ALTER TABLE lembretes ADD COLUMN data DATE NOT NULL DEFAULT CURRENT_DATE;

-- Controle de envio (evitar reenvio)
ALTER TABLE lembretes ADD COLUMN enviado BOOLEAN DEFAULT false;

-- Quando foi enviado
ALTER TABLE lembretes ADD COLUMN enviado_em TIMESTAMP;
```

**Por que `data`?** Sem esse campo, não há como distinguir "me lembre às 16h hoje" de "me lembre às 16h amanhã". O DeepSeek já extrai a data da mensagem do usuário — basta persistir.

---

## Fluxo do Workflow

```
Schedule Trigger (*/5 * * * *)
  ↓
DB: Buscar Lembretes Pendentes
  Query: SELECT l.*, u.whatsapp_id, u.canais_ativos
         FROM lembretes l
         JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.ativo = true
           AND l.enviado = false
           AND l.data = CURRENT_DATE
           AND l.hora <= CURRENT_TIME
  ↓
Tem Lembretes? (Filter: titulo not empty)
  ↓
Formatar Mensagem (Code node)
  ↓
Qual Canal? (If: canal == 'telegram')
  ├── true  → Enviar Telegram
  └── false → Enviar WhatsApp
  ↓
DB: Marcar como Enviado
  UPDATE lembretes SET enviado = true, enviado_em = NOW() WHERE id = $1
```

---

## Nodes Detalhados

### 1. Schedule Trigger
- **Tipo**: `n8n-nodes-base.scheduleTrigger`
- **Cron**: `*/5 * * * *` (a cada 5 minutos)
- **Justificativa**: Janela máxima de 5 min de atraso é aceitável para lembretes pessoais. Intervalos menores sobrecarregam o banco sem ganho real.

### 2. DB: Buscar Lembretes Pendentes
- **Tipo**: `n8n-nodes-base.postgres`
- **Query parametrizada**: Sem interpolação de strings
```sql
SELECT l.id, l.titulo, l.hora, l.data,
       u.whatsapp_id, u.canais_ativos
FROM lembretes l
JOIN usuarios u ON u.id = l.usuario_id
WHERE l.ativo = true
  AND l.enviado = false
  AND l.data = CURRENT_DATE
  AND l.hora <= CURRENT_TIME;
```

### 3. Formatar Mensagem (Code Node)
```javascript
const items = $input.all();
const resultados = [];

for (const item of items) {
  const { titulo, hora, whatsapp_id, canais_ativos } = item.json;
  const horaFormatada = hora.substring(0, 5); // "16:00"
  const msg = `⏰ Eai, lembrete pra você: "${titulo}" (${horaFormatada}). Bora resolver isso!`;

  if (whatsapp_id.includes('@telegram')) {
    const chatId = whatsapp_id.split('@')[0];
    resultados.push({ json: { canal: 'telegram', chatId, mensagem: msg, lembrete_id: item.json.id } });
  } else if (whatsapp_id.includes('@c.us') || whatsapp_id.includes('@s.whatsapp.net')) {
    resultados.push({ json: { canal: 'whatsapp', chatId: whatsapp_id, mensagem: msg, lembrete_id: item.json.id } });
  } else {
    const canais = canais_ativos || [];
    if (canais.includes('telegram')) {
      const chatId = whatsapp_id.split('@')[0];
      resultados.push({ json: { canal: 'telegram', chatId, mensagem: msg, lembrete_id: item.json.id } });
    }
    if (canais.includes('whatsapp')) {
      resultados.push({ json: { canal: 'whatsapp', chatId: whatsapp_id, mensagem: msg, lembrete_id: item.json.id } });
    }
  }
}

return resultados;
```

### 4. Qual Canal? (If Node)
- **Condição**: `{{ $json.canal }}` equals `telegram`
- **True** → Enviar Telegram
- **False** → Enviar WhatsApp

### 5. Enviar Telegram / Enviar WhatsApp
- Mesmas credenciais do workflow existente (`tarefildo_lembrete_tarefas.json`)
- **Telegram**: `chatId = {{ $json.chatId }}`, `text = {{ $json.mensagem }}`
- **WhatsApp (WAHA)**: `chatId = {{ $json.chatId }}`, `text = {{ $json.mensagem }}`

### 6. DB: Marcar como Enviado
```sql
UPDATE lembretes SET enviado = true, enviado_em = NOW() WHERE id = $1;
```
- **queryParameters**: `{{ $json.lembrete_id }}`

---

## Alteração no Workflow Principal (Telegram)

O node que faz `INSERT INTO lembretes` precisa ser atualizado para incluir o campo `data`:

**Antes**:
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, ativo, criado_em)
SELECT u.id, $1, $2, true, NOW()
FROM usuarios u WHERE u.whatsapp_id = $3
RETURNING id, titulo, hora;
```

**Depois**:
```sql
INSERT INTO lembretes (usuario_id, titulo, hora, data, ativo, criado_em)
SELECT u.id, $1, $2, $3, true, NOW()
FROM usuarios u WHERE u.whatsapp_id = $4
RETURNING id, titulo, hora, data;
```

O DeepSeek já extrai `dados.data` da mensagem. Se o usuário não informar data, usar `CURRENT_DATE` como fallback.

---

## Alteração no Prompt do DeepSeek

Garantir que o campo `data` é extraído para o intent `adicionar_lembrete`:

```json
{
  "intent": "adicionar_lembrete",
  "dados": {
    "titulo": "tirar o frango do congelador",
    "hora": "16:00",
    "data": "2026-06-26"
  }
}
```

Se o usuário disser "hoje", `data` = data atual. Se disser "amanhã", `data` = data atual + 1.

---

## Casos de Uso

| Mensagem do Usuário | titulo | hora | data |
|---|---|---|---|
| "me lembre de tirar o frango às 16h" | tirar o frango do congelador | 16:00 | hoje |
| "lembrete: reunião amanhã 9h" | reunião | 09:00 | amanhã |
| "me avisa sexta às 18h pra comprar pão" | comprar pão | 18:00 | próxima sexta |
| "me lembre de tomar remédio às 22h" | tomar remédio | 22:00 | hoje |

---

## Testes

### Cenário 1: Lembrete disparado no horário
1. Inserir lembrete com `hora = NOW() - 1 min`, `data = CURRENT_DATE`
2. Executar workflow manualmente
3. **Esperado**: Mensagem enviada, `enviado = true`

### Cenário 2: Lembrete futuro não disparado
1. Inserir lembrete com `hora = NOW() + 2 horas`, `data = CURRENT_DATE`
2. Executar workflow
3. **Esperado**: Nenhuma mensagem, `enviado = false`

### Cenário 3: Lembrete de ontem ignorado
1. Inserir lembrete com `data = CURRENT_DATE - 1`
2. Executar workflow
3. **Esperado**: Não dispara (query filtra `data = CURRENT_DATE`)

### Cenário 4: Lembrete já enviado não reenviado
1. Inserir lembrete com `enviado = true`
2. Executar workflow
3. **Esperado**: Ignorado

### Cenário 5: Multi-canal
1. Usuário com `canais_ativos = ['telegram', 'whatsapp']`
2. **Esperado**: Recebe em ambos os canais

---

## Fora do Escopo (futuro)

- **Lembretes recorrentes**: "me lembre todo dia às 8h de tomar remédio" (REQ 4)
- **Fuso horário dinâmico**: Hoje usa `America/Sao_Paulo` fixo (REQ 9)
- **Cancelamento de lembrete**: "cancela meu lembrete das 16h"
- **Snooze**: "adia 10 minutos"

---

## Checklist de Implementação

- [ ] Migration: `ALTER TABLE lembretes ADD COLUMN data, enviado, enviado_em`
- [ ] Criar workflow `tarefildo_lembrete_customizado.json`
- [ ] Atualizar INSERT no workflow Telegram para incluir `data`
- [ ] Atualizar INSERT no workflow WhatsApp para incluir `data` (se existir)
- [ ] Validar extração de `data` pelo DeepSeek
- [ ] Testes manuais dos 5 cenários
- [ ] Ativar workflow em produção
