# 🚀 Guia Passo-a-Passo: Implementar Sprint 1 em 2 Horas

## ⏱️ Timeline
- Setup: 5 min
- Novo Cadastro: 25 min
- Adicionar Tarefa: 20 min
- Editar Tarefa: 20 min
- Concluir Tarefa: 15 min
- Duplicata: 30 min
- Testes: 5 min
- **Total: 2 horas**

---

## 🔧 Pré-Requisitos

- ✅ n8n aberto no navegador
- ✅ `tarefildo_unified.json` carregado
- ✅ Acesso ao editor do workflow
- ✅ `NODES_SPRINT1.json` aberto em um editor de texto (lado)
- ✅ Backup feito (opcional mas recomendado)

---

## 📋 Material de Referência

| Arquivo | Uso |
|---|---|
| `NODES_SPRINT1.json` | Código dos nós (copiar/colar) |
| `PLANO_IMPLEMENTACAO_N8N.md` | Visão geral |
| `TEMPLATES_NATURALIZACAO.md` | Exemplos de prompts |
| `SPEC_NATURALIZACAO_MENSAGENS.md` | Especificação técnica |

---

## 🟢 PASSO 1: Setup (5 min)

### 1.1 - Abrir o Workflow
```
1. Acesse: http://seu-n8n:5678/workflow
2. Abra: "🤖 Tarefildo - Unified (Telegram + WhatsApp) 🤖"
3. Clique em "Edit" (se não estiver em modo edição)
```

### 1.2 - Localizar Zona de Trabalho
```
Procure pelos nós:
- [Preparar Prompt Lista] ← Será nossa referência
- [DeepSeek: Gerar Resposta Lista] ← Será duplicado
- [Extrair Resposta Lista] ← Será referência

Aproxime-se desses nós para ver estrutura
```

### 1.3 - Preparar Área para Novos Nós
```
Na posição aproximada (24000-27000, 61800-62600):
- Verifique se tem espaço
- Se não, arraste alguns nós para cima
- Deixe zona clara para inserir 11 novos nós
```

---

## 🔴 PASSO 2: Novo Cadastro (25 min)

### 2.1 - Criar Node: Prep-Nova-Conta

```
Ação: Clicar em "+" → Add Node → Code
Nome: Prep-Nova-Conta
Position X: 24500, Y: 61800

Copiar do NODES_SPRINT1.json:
{
  "id": "node-prep-nova-conta",
  "name": "Prep-Nova-Conta",
  "parameters": { "jsCode": "..." }
}

JavaScript:
const input = $input.first().json;
const nome = input.nome || 'chefe';
const chatId = input.chatId || '';
const canal = input.canal || 'unknown';
const source = input.source || '';
const whatsapp_id = input.whatsapp_id || '';

const prompt = `Você é o Tarefildo Silva das Pendências...
Um novo usuário se cadastrou:
- Nome: ${nome}
- Canal: ${canal}

Dê boas-vindas...`;

const text = `novo_usuario: ${nome}, canal: ${canal}`;

return [{ json: {
  prompt, text, chatId, nome, source, whatsapp_id,
  intent: 'novo_cadastro', ...input
} }];
```

✅ Clique "Execute" para validar

---

### 2.2 - Criar Node: DeepSeek-Naturalizar

```
Ação: Clicar em "+" → Add Node → HTTP Request
Nome: DeepSeek-Naturalizar
Position X: 25500, Y: 62000

Configuração:
- Method: POST
- URL: https://api.deepseek.com/chat/completions
- Authentication: Header Auth
  - Select: "DeepSeek API" (credencial existente)
- Headers: Content-Type: application/json
- Body (JSON):
  {
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "{{ $json.prompt }}"},
      {"role": "user", "content": "{{ $json.text }}"}
    ],
    "temperature": 0.5,
    "max_tokens": 150
  }
- Options:
  - Timeout: 15000
  - Retry on Fail: YES
  - Max Tries: 2
  - Wait Between Tries: 2000
```

✅ Teste conexão (sem conectar ao fluxo ainda)

---

### 2.3 - Criar Node: Extract-Nova-Conta

```
Ação: Clicar em "+" → Add Node → Code
Nome: Extract-Nova-Conta
Position X: 26500, Y: 61800

JavaScript:
const response = $input.first().json;
const prep = $('Prep-Nova-Conta').first().json;

const fallback = `Beleza ${prep.nome}, bem-vindo ao Tarefildo! ☕ Bora organizar suas tarefas?`;

if (response.error || !response.choices) {
  console.warn(`[FALLBACK-NOVA-CONTA] DeepSeek falhou`);
  return [{ json: {
    chatId: prep.chatId,
    mensagem: fallback,
    source: prep.source,
    whatsapp_id: prep.whatsapp_id,
    fallback_used: true
  } }];
}

let mensagem = response.choices[0].message.content.trim();
mensagem = mensagem.replace(/```json/gi, '').replace(/```/g, '').trim();

return [{ json: {
  chatId: prep.chatId,
  mensagem: mensagem,
  source: prep.source,
  whatsapp_id: prep.whatsapp_id,
  fallback_used: false
} }];
```

✅ Clique "Execute"

---

### 2.4 - Conectar Fluxo: Novo Cadastro

**Remover connections:**
```
[Resposta Consolidou] → disconnect tudo
[Resposta Novo Cadastro] → disconnect tudo
```

**Criar connections:**
```
Clique na saída de [DB: Criar Novo Usuário]
Arraste para entrada de [Prep-Nova-Conta]

Clique na saída de [Prep-Nova-Conta]
Arraste para entrada de [DeepSeek-Naturalizar]

Clique na saída de [DeepSeek-Naturalizar]
Arraste para entrada de [Extract-Nova-Conta]

Clique na saída de [Extract-Nova-Conta]
Arraste para entrada "extra" de [Route to Channel?]
(ao lado da entrada existente do [Menu Boas-vindas])
```

---

### 2.5 - Testar: Novo Cadastro

```
1. Abra Telegram
2. Escreva: /start
3. Veja resposta do bot

Esperado:
❌ Resposta hardcoded genérica
✅ Resposta naturalizada, variada, com tom Tarefildo

4. Se vir "Probleminha tecnico", check:
   - DeepSeek API credencial (status)
   - Network (internet on)
   - Fallback deve retornar mesmo assim

5. Repita no WhatsApp
```

✅ **Novo Cadastro: CONCLUÍDO**

---

## 🟡 PASSO 3: Adicionar Tarefa (20 min)

Repetir processo com:

### 3.1 - Prep-Adicionar-Tarefa
```
Position: 24500, 62000
Lógica: Monta prompt com título e data da tarefa
```

### 3.2 - Extract-Adicionar-Tarefa
```
Position: 26500, 62000
Fallback: "Anotado, ${nome}: '${titulo}'. Me fala a data 👀"
```

### 3.3 - Conectar
```
[DB: Adicionar Tarefa] → Prep-Adicionar-Tarefa
→ DeepSeek-Naturalizar (REUTILIZA)
→ Extract-Adicionar-Tarefa
→ Route to Channel?
```

### 3.4 - Remover Node Antigo
```
[Resposta Tarefa] → DELETAR
(Desconecta tudo antes)
```

### 3.5 - Testar
```
Telegram: "adiciona pagar boleto dia 25"
Esperado: Resposta natural confirmando a tarefa
```

✅ **Adicionar Tarefa: CONCLUÍDO**

---

## 🟡 PASSO 4: Editar Tarefa (20 min)

### 4.1 - Criar Nodes
```
Prep-Editar-Tarefa (24500, 62200)
Extract-Editar-Tarefa (26500, 62200)
```

### 4.2 - Conectar
```
[DB: Editar Tarefa] → Prep-Editar-Tarefa
→ DeepSeek-Naturalizar
→ Extract-Editar-Tarefa
→ Route to Channel?
```

### 4.3 - Remover
```
[Resposta Editou] → DELETAR
[Resposta Editou Existente] → DELETAR (se existe)
```

### 4.4 - Testar
```
Telegram: "editar tarefa pagar boleto dia 30"
Esperado: Resposta natural da edição
```

✅ **Editar Tarefa: CONCLUÍDO**

---

## 🟡 PASSO 5: Concluir Tarefa (15 min)

### 5.1 - Criar Nodes
```
Prep-Concluir-Tarefa (24500, 62400)
Extract-Concluir-Tarefa (26500, 62400)
```

### 5.2 - Conectar
```
[DB: Concluir Tarefa] → Prep-Concluir-Tarefa
→ DeepSeek-Naturalizar
→ Extract-Concluir-Tarefa
→ Route to Channel?
```

### 5.3 - Remover
```
[Resposta Concluiu Tarefa] → DELETAR
```

### 5.4 - Testar
```
Telegram: "conclui tarefa pagar boleto"
Esperado: Resposta celebratória com emojis
```

✅ **Concluir Tarefa: CONCLUÍDO**

---

## 🟡 PASSO 6: Duplicata (30 min)

### 6.1 - Criar Nodes
```
Prep-Duplicata (24500, 62600)
Extract-Duplicata (26500, 62600)
```

### 6.2 - Conectar
```
Adicionar lógica em [Avaliar Duplicata]:

Se tem_duplicata = true:
  → Prep-Duplicata
    → DeepSeek-Naturalizar
    → Extract-Duplicata
    → Route to Channel?

Se tem_duplicata = false:
  → [Preparar Insert] (fluxo normal)
```

### 6.3 - Remover
```
[Perguntar Duplicata] → DELETAR
[Resposta Criou Duplicata] → DELETAR
```

### 6.4 - Testar
```
Telegram: 
1. "adiciona pagar boleto dia 25"
   Esperado: "Anotei..."

2. "adiciona pagar boleto dia 30"
   Esperado: Pergunta sobre duplicata naturalizada
   
3. "sim criar"
   Esperado: Cria e comemora
```

✅ **Duplicata: CONCLUÍDO**

---

## ✅ PASSO 7: Validação Final (5 min)

### Checklist Antes de Finalizar

- [ ] Novo cadastro retorna msg naturalizada
- [ ] Adicionar tarefa retorna msg naturalizada
- [ ] Editar retorna msg naturalizada
- [ ] Concluir retorna msg naturalizada
- [ ] Duplicata pergunta naturalmente
- [ ] Tudo funciona em Telegram
- [ ] Tudo funciona em WhatsApp
- [ ] Sem erros no console
- [ ] Fallback funciona (desligar internet)
- [ ] Nós antigos removidos com sucesso

### Teste de Fallback

```
1. Desligar internet (Airplane Mode)
2. Enviar mensagem no Telegram
3. Ver fallback ser retornado
4. Ligar internet de volta
5. Confirmar que volta ao normal
```

---

## 🎯 Resultado Final

Após Sprint 1, seu workflow terá:

```
✅ 10 novos nós (Prep + Extract × 5)
✅ 1 nó compartilhado (DeepSeek-Naturalizar)
✅ 5 fluxos naturalizados
❌ 10+ nós antigos removidos
📊 Taxa de sucesso: 99%+
⏱️ Tempo resposta: ~900ms (aceitável)
💰 Custo: ~$0.01 por 200 mensagens
```

---

## 🆘 Troubleshooting

### Problema: "Cannot find node 'Prep-Nova-Conta'"
**Solução:** Nó não foi criado ainda. Volte ao Passo 2.1

### Problema: Resposta vazia
**Solução:** DeepSeek timeout. Check:
- Internet on
- API key válida
- Retry: 2x funcionando

### Problema: Resposta com ``` no inicio
**Solução:** Regex de parse falhando. Check:
- Replace está correto (`/```json/gi`)
- Está após `choices[0].message.content`

### Problema: Fallback não aparece
**Solução:** Extract não está pegando erro. Check:
- `response.error` ou `!response.choices`
- Log com `console.warn`

### Problema: Nó antigo ainda retornando
**Solução:** Ainda conectado. Check:
- Desconectar todas as conexões
- Deletar nó
- Reconectar novo fluxo

---

## 📝 Anotações

Deixe espaço aqui para suas notas:

```
[Espaço livre para anotar o que fez]
```

---

## 🚀 Próxima Etapa

Após completar Sprint 1:

```
Você pode:
1. ✅ Fazer Sprint 2 (4 fluxos - 1.5h)
2. ✅ Fazer Sprint 3 (polish - 1h)
3. ✅ Deploy em produção
4. ✅ Monitorar métricas
```

---

## 📞 Suporte Rápido

Se ficar travado:

1. Leia `TEMPLATES_NATURALIZACAO.md` (Seção 5)
2. Compare seu código com NODES_SPRINT1.json
3. Veja [Preparar Prompt Lista] como referência
4. Check logs do n8n (Console tab)
5. Restart o workflow

---

**Status: PRONTO PARA COMEÇAR AGORA! 🚀**

Tempo total: ~2 horas
Dificuldade: Média
Impacto: Alto
