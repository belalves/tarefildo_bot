# TESTE: Bug Fix - Tarefa Não Listada

## Cenário de Teste
**Objetivo**: Validar que tarefas criadas com data e hora agora aparecem na listagem

### Teste 1: Criar tarefa com data futura
```
Entrada: "tomar sol amanha as 9hs"
Esperado: 
  ✅ Resposta: "Isabela, 'tomar sol' pro dia 01/07/2026 as 09:00. Confia no Tarefildo 😄"
```

### Teste 2: Listar tarefas (período: tudo)
```
Entrada: "listar tarefas" ou "minhas tarefas"
Esperado ANTES DO FIX:
  ❌ "Uau, chefe, a lista de tarefas está mais vazia que..."

Esperado DEPOIS DO FIX:
  ✅ "Chefe, 1 tarefa no geral:
     1. tomar sol — 01/07/2026 as 09:00"
```

### Teste 3: Verificar no banco de dados
```sql
SELECT id, titulo, status, data_vencimento, hora_vencimento, usuario_id 
FROM tarefas 
WHERE titulo LIKE '%tomar sol%'
ORDER BY criado_em DESC
LIMIT 1;

Esperado:
  - status = 'PENDENTE'
  - data_vencimento = 2026-07-01
  - hora_vencimento = 09:00:00
  - usuario_id = (ID do usuário da Isabela)
```

### Teste 4: Listar com diferentes períodos
- `"listar tarefas de hoje"` → Sem tarefas (pois é 30/06, tarefa é pra 01/07)
- `"listar tarefas amanha"` → Deve incluir "tomar sol"
- `"minhas tarefas"` → Deve incluir "tomar sol"

## Resultados do Teste

### Status: 🔄 PENDENTE EXECUÇÃO

Após a fix ser deployed no n8n:
- [ ] Teste 1 passou
- [ ] Teste 2 passou  
- [ ] Teste 3 validado no banco
- [ ] Teste 4 passou

## Comandos para Executar Testes Localmente

### Se houver CLI do n8n disponível:
```bash
# Executar workflow
n8n workflow:execute --id jSAttXqwesQLiTet

# Ou usar API
curl -X POST http://localhost:5678/api/v1/webhooks/a00a49e3-e057-4218-a852-c721ed80be27 \
  -H "Content-Type: application/json" \
  -d '{"message":{"text":"tomar sol amanha as 9hs","from":{"id":"123456","first_name":"Isabela"}},"update_id":1}'
```

### Query para verificar o fix:
```sql
-- Listar todas as tarefas de "tomar sol"
SELECT 
  t.id,
  t.titulo,
  t.status,
  t.data_vencimento,
  t.hora_vencimento,
  u.whatsapp_id,
  t.criado_em
FROM tarefas t
LEFT JOIN usuarios u ON t.usuario_id = u.id
WHERE t.titulo LIKE '%tomar sol%'
ORDER BY t.criado_em DESC;

-- Verificar COUNT por período para validar filtro
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN t.status = 'PENDENTE' THEN 1 END) as pendentes,
  COUNT(CASE WHEN t.data_vencimento = CURRENT_DATE THEN 1 END) as hoje,
  COUNT(CASE WHEN t.data_vencimento = CURRENT_DATE + 1 THEN 1 END) as amanha
FROM tarefas t
JOIN usuarios u ON t.usuario_id = u.id
WHERE u.whatsapp_id = '$user_whatsapp_id';
```

## Notas
- O bug era que `filtro_data_inicio: ""` e `filtro_data_fim: ""` faziam a query falhar silenciosamente
- A fix muda para `filtro_data_inicio: null` e `filtro_data_fim: null`
- Isso permite que a query SQL funcione corretamente no CASE NULL
