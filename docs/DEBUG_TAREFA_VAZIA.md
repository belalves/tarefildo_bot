# DEBUG: Por que tarefa não aparece na listagem?

## Sequência de eventos
1. ✅ Tarefa criada: "tomar sol pro dia 01/07/2026 as 09:00"
2. ❌ Listagem retorna vazio

## Hipóteses

### 1️⃣ Usuário não foi criado no banco
Se o usuário `Isabela` não existe em `usuarios`, o INSERT falha silenciosamente:
```sql
INSERT INTO tarefas (...) 
SELECT u.id, ... 
FROM usuarios u 
WHERE u.whatsapp_id = $6  -- Se nenhum usuário encontrado, retorna nada
```

**Como verificar:**
```sql
SELECT id, whatsapp_id, nome FROM usuarios WHERE nome LIKE '%Isabela%';
SELECT id, whatsapp_id, nome FROM usuarios WHERE whatsapp_id LIKE '%123456%'; -- seu ID
```

### 2️⃣ Tarefa foi criada com status errado
A query de listagem filtra `t.status = 'PENDENTE'`. Se foi criada como `AGUARDANDO_DATA`, não vai aparecer.

**Como verificar:**
```sql
SELECT id, titulo, status, data_vencimento FROM tarefas 
WHERE titulo = 'tomar sol' 
ORDER BY criado_em DESC LIMIT 5;
```

### 3️⃣ whatsapp_id não está sendo passado corretamente
Se o whatsapp_id na criação é diferente do na listagem, não vai encontrar.

**Como verificar:**
```sql
SELECT DISTINCT whatsapp_id FROM usuarios;
SELECT DISTINCT whatsapp_id FROM tarefas t JOIN usuarios u ON t.usuario_id = u.id;
```

## Ação necessária
Você precisa executar essas queries no banco Neon para ver qual é o real problema.

Se o usuário não existe, precisamos debugar o fluxo de onboarding (primeiras mensagens).

