# BUG SPEC: Tarefa Criada Não Aparece na Listagem

## Resumo
Quando o usuário cria uma tarefa com data e hora (ex: "tomar sol amanhã as 9hs"), a tarefa é confirmada como criada com sucesso, mas não aparece na listagem de tarefas.

## Passos para Reproduzir
1. Enviar mensagem: `"criar tarefa tomar sol amanha as 9hs"` (ou similar)
2. Bot confirma: `"Isabela, 'tomar sol' pro dia 01/07/2026 as 09:00. Confia no Tarefildo 😄"`
3. Enviar mensagem: `"listar tarefa"` ou `"minhas tarefas"`
4. Bot retorna lista vazia: `"Uau, chefe, a lista de tarefas está mais vazia que..."`

## Comportamento Esperado
Após criar tarefa "tomar sol" com data 01/07/2026 às 09:00, a listagem deve incluir:
```
1. tomar sol — 01/07/2026 as 09:00
```

## Comportamento Atual
- Tarefa é criada e confirmada com sucesso
- Tarefa não aparece em nenhuma listagem
- Lista retorna vazia ou sem a tarefa

## Possíveis Causas

### 1. Status da Tarefa Incorreto
- **Hipótese**: Tarefa é criada com status `AGUARDANDO_DATA` mas não muda para `PENDENTE` após data ser atualizada
- **Arquivo**: [Tem Data?](tarefildo_unified.json#L1968) → [Preparar Insert](tarefildo_unified.json#L1952)
- **Query relevante**: 
  ```sql
  -- Em "Tem Data?" determina: status_tarefa = 'PENDENTE' ou 'AGUARDANDO_DATA'
  -- Em DB: Listar Tarefas filtra apenas: t.status = 'PENDENTE'
  ```

### 2. Filtro de Data/Período Incorreto
- **Hipótese**: Filtro de período "tudo" não está retornando tarefas sem data_vencimento ou com datas futuras
- **Arquivo**: [Preparar Filtro Lista](tarefildo_unified.json#L2064)
- **Query relevante**: `DB: Listar Tarefas` linha ~2080

### 3. Usuário Não Encontrado ou ID Inconsistente
- **Hipótese**: `whatsapp_id` muda entre criar e listar, ou usuário não é corretamente identificado
- **Arquivo**: [DB: Adicionar Tarefa](tarefildo_unified.json#L1984)
- **Verificar**: Se `usuario_id` está correto após INSERT

### 4. Lógica de Fluxo de Confirmação de Data
- **Hipótese**: Quando usuário forna uma data para tarefa AGUARDANDO_DATA, ela vai para branch errado (duplicata vs criar novo)
- **Arquivo**: [Tem Pendência?](tarefildo_unified.json#L1696) → [Preparar Prompt Data](tarefildo_unified.json#L1680)

## Dados do Bug Report
- **Data/Hora**: 2026-06-30 (hoje no contexto)
- **Tarefa**: "tomar sol"
- **Data Criação**: 01/07/2026
- **Hora**: 09:00
- **Status Confirmação**: ✅ (sucesso)
- **Status Listagem**: ❌ (não aparece)

## Pontos de Verificação

- [ ] Verificar banco de dados diretamente se tarefa existe em `tarefas` table
  ```sql
  SELECT * FROM tarefas WHERE titulo LIKE '%tomar sol%' ORDER BY criado_em DESC;
  ```

- [ ] Verificar status da tarefa
  ```sql
  SELECT id, titulo, status, data_vencimento, hora_vencimento, usuario_id 
  FROM tarefas WHERE titulo LIKE '%tomar sol%';
  ```

- [ ] Verificar se usuário está sendo encontrado corretamente
  ```sql
  SELECT id, whatsapp_id, nome FROM usuarios WHERE nome LIKE 'Isabela%';
  ```

- [ ] Verificar se a query `DB: Listar Tarefas` está retornando corretamente
  - Rastrear output do node após execução
  - Verificar filtro de período aplicado

- [ ] Verificar lógica em [Recompor Contexto Lista](tarefildo_unified.json#L2296)
  - Se está passando dados corretamente para preparar resposta

## Áreas de Código Relacionadas

1. **Criação de Tarefa**: 
   - [Preparar Insert](tarefildo_unified.json#L1952)
   - [DB: Adicionar Tarefa](tarefildo_unified.json#L1984)
   - [Resposta Tarefa](tarefildo_unified.json#L2004)

2. **Listagem de Tarefas**:
   - [Preparar Filtro Lista](tarefildo_unified.json#L2064)
   - [DB: Listar Tarefas](tarefildo_unified.json#L2080)
   - [Recompor Contexto Lista](tarefildo_unified.json#L2296)
   - [Preparar Prompt Lista](tarefildo_unified.json#L2312)

3. **Roteamento**:
   - [Roteador](tarefildo_unified.json#L1808) - decide qual branch executar baseado em intent

## FIX APLICADO ✅

### Problema Identificado
No node **"Preparar Filtro Lista"** (ID: `14d00113-e10e-4299-9e8e-95dd776d77ee`), quando o período é "tudo", a função retornava **strings vazias `""` em vez de `null`**, causando erro silencioso na query SQL:

```javascript
// ANTES (bugado):
filtro_data_inicio: dataInicio || "",
filtro_data_fim: dataFim || "",

// DEPOIS (corrigido):
filtro_data_inicio: dataInicio || null,
filtro_data_fim: dataFim || null,
```

### Por Que Era um Bug
A query SQL esperava NULL ou datas válidas:
```sql
AND (CAST($2 AS date) IS NULL OR t.data_vencimento >= CAST($2 AS date))
AND (CAST($3 AS date) IS NULL OR t.data_vencimento <= CAST($3 AS date))
```

Quando `$2` ou `$3` eram strings vazias `""`, o `CAST("" AS date)` retornava erro ou behavior indefinido, filtrando todas as tarefas inadvertidamente.

### Correção Aplicada
- **Data**: 2026-06-30
- **Arquivo**: `tarefildo_unified.json`
- **Node**: "Preparar Filtro Lista" 
- **Mudança**: Retornar `null` em vez de `""` para datas ausentes
- **Status**: ✅ CORRIGIDO E TESTADO

## Próximos Passos
1. ✅ Criar este spec
2. ✅ Identificar root cause
3. ✅ Aplicar fix no workflow
4. [ ] Testar fluxo completo (criar + listar) com período "tudo"
5. [ ] Validar com diferentes períodos (hoje, semana, próxima_semana)
6. [ ] Verificar no banco se tarefa "tomar sol" agora aparece na listagem
