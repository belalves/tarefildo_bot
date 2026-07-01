# 🐛 BUG FIX: Tarefas Criadas Não Listam

## Problema
Quando usuário cria uma tarefa com data ("criar tarefa tomar sol amanhã as 9hs"), a tarefa é confirmada mas **não aparece na listagem** ("minhas tarefas", "listar tarefas").

## Root Cause
Node **"Preparar Filtro Lista"** retornava strings vazias `""` em vez de `null` quando o período era "tudo", causando erro silencioso na query SQL de filtro de datas.

```sql
-- Query falha com strings vazias
WHERE (CAST("" AS date) IS NULL OR ...)  -- ERRO!

-- Query funciona com NULL
WHERE (CAST(NULL AS date) IS NULL OR ...)  -- OK ✅
```

## Arquivo Corrigido
**`tarefildo_unified.json`** - Node "Preparar Filtro Lista" (ID: `14d00113-e10e-4299-9e8e-95dd776d77ee`)

### Mudança
```diff
- filtro_data_inicio: dataInicio || "",
- filtro_data_fim: dataFim || "",

+ filtro_data_inicio: dataInicio || null,
+ filtro_data_fim: dataFim || null,
```

## Impacto
- **Antes**: Todas as tarefas sem período específico retornavam lista vazia
- **Depois**: Tarefas listam corretamente para qualquer período

## Intents Afetados
- `listar_tarefas` com período = "tudo" (padrão)
- Qualquer período não mapeado explicitamente

## Como Testar

1. **Criar tarefa com data**:
   ```
   User: "criar tarefa tomar sol amanha as 9hs"
   Bot: "Isabela, 'tomar sol' pro dia 01/07/2026 as 09:00. Confia no Tarefildo 😄"
   ```

2. **Listar tarefas**:
   ```
   User: "minhas tarefas"
   Bot: "Chefe, 1 tarefa no geral:
        1. tomar sol — 01/07/2026 as 09:00"
   ```

3. **Verificar banco**:
   ```sql
   SELECT * FROM tarefas 
   WHERE titulo = 'tomar sol' 
   AND status = 'PENDENTE';
   ```

## Status
✅ **BUG CORRIGIDO**
- Spec criada: `BUG_SPEC_TAREFA_NAO_LISTADA.md`
- Fix aplicado: `tarefildo_unified.json`
- Teste planejado: `TESTE_BUG_FIX.md`

## Próximos Passos
1. Deploy do workflow corrigido no n8n
2. Executar testes de regressão
3. Monitorar logs para confirmar que listas retornam tarefas
