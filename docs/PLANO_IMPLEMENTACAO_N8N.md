# 🔧 Plano de Implementação - Naturalização em n8n

## Status: PRONTO PARA EXECUTAR

Data: 2026-06-30  
Especialista: n8n  
Workflow: `tarefildo_unified.json`  
Estimativa: 4.5 horas (em 3 sprints)

---

## 📋 Resumo Executivo

| Item | Status | Detalhes |
|---|---|---|
| Workflow Base | ✅ Existe | `tarefildo_unified.json` (3652 linhas) |
| DeepSeek API | ✅ Configurada | `h8EobmVsCvc5TFvn` - "DeepSeek API" |
| Database | ✅ Ativa | Neon - `lkBdUIuFYhIvqukn` |
| Telegram Bot | ✅ Ativo | `Tg2ndnk8e56GBk97` |
| WhatsApp WAHA | ✅ Ativo | `F3j9V0WpvTJ6FcNM` |
| Padrão DeepSeek | ✅ Existe | Usado em `listar_tarefas` |
| Faltando | ❌ 10+ fluxos | Precisam de naturalização |

---

## 🎯 Estratégia de Implementação

### Opção Recomendada: Incremental + Modular

1. **Criar nó universal DeepSeek** (reutilizável)
2. **Implementar Sprint 1** (5 fluxos - 2h)
3. **Implementar Sprint 2** (4 fluxos - 1.5h)
4. **Implementar Sprint 3** (2+ fluxos - 1h)

**Vantagens:**
- Testar cada fluxo isoladamente
- Rollback fácil se erro
- Escalável para novos fluxos
- Menos conflitos de merge

---

## 🔴 SPRINT 1: Fluxos Críticos (2h)

### Prioridade: ALTA
Estes são os fluxos mais usados. Implementar nesta ordem:

#### 1.1 - NOVO CADASTRO
**Nós atuais:**
- `Resposta Novo Cadastro` → Remover
- `Resposta Consolidou` → Remover
- `Resposta Inválida` → Remover

**Nós novos:**
- `Prep-Nova-Conta` (Code)
- `DeepSeek-Naturalizar` (HTTP) ← REUTILIZÁVEL
- `Extract-Nova-Conta` (Code)

**Impacto:** Usuários novos recebem boas-vindas naturalizadas

**Tempo:** 25 min

---

#### 1.2 - ADICIONAR TAREFA
**Nós atuais:**
- `Resposta Tarefa` → Substituir

**Nós novos:**
- `Prep-Adicionar-Tarefa` (Code)
- `DeepSeek-Naturalizar` (HTTP) ← REUTILIZA
- `Extract-Adicionar-Tarefa` (Code)

**Impacto:** Confirmação de nova tarefa naturalizada

**Tempo:** 20 min

---

#### 1.3 - EDITAR TAREFA
**Nós atuais:**
- `Resposta Editou` → Substituir
- `Avaliar Edição` → Melhorar

**Nós novos:**
- `Prep-Editar-Tarefa` (Code)
- `Extract-Editar-Tarefa` (Code)

**Impacto:** Edição confirmada naturalmente

**Tempo:** 20 min

---

#### 1.4 - CONCLUIR TAREFA
**Nós atuais:**
- `Resposta Concluiu Tarefa` → Substituir

**Nós novos:**
- `Prep-Concluir-Tarefa` (Code)
- `Extract-Concluir-Tarefa` (Code)

**Impacto:** Comemoração naturalizada

**Tempo:** 15 min

---

#### 1.5 - DUPLICATA
**Nós atuais:**
- `Resposta Criou Duplicata` → Substituir
- `Resposta Editou Existente` → Substituir
- `Perguntar Duplicata` → Substituir
- `Processar Resp Duplicata` → Melhorar

**Nós novos:**
- `Prep-Duplicata-Criar` (Code)
- `Prep-Duplicata-Perguntar` (Code)
- `Extract-Duplicata` (Code)

**Impacto:** Detecção e pergunta naturalizadas

**Tempo:** 30 min

---

## 🟡 SPRINT 2: Fluxos Secundários (1.5h)

#### 2.1 - NOVO LEMBRETE
**Nós atuais:**
- `Formatar Resposta` → Melhorar para intent específico

**Nós novos:**
- `Prep-Novo-Lembrete` (Code)
- `Extract-Novo-Lembrete` (Code)

**Tempo:** 20 min

---

#### 2.2 - LISTAR TAREFAS
**Status:** ✅ JÁ FEITO (usar como padrão)

**Nós existentes:**
- `Preparar Prompt Lista`
- `DeepSeek: Gerar Resposta Lista`
- `Extrair Resposta Lista`

**Ação:** Apenas documentar como referência

**Tempo:** 0 min

---

#### 2.3 - LISTAR LEMBRETES + BUSCA NATURAL
**Nós atuais:**
- `Formatar Resposta` (genérico)
- `Formatar Busca` (genérico)

**Nós novos:**
- `Prep-Listar-Lembretes` (Code)
- `Extract-Listar-Lembretes` (Code)
- `Prep-Busca-Natural` (Code)
- `Extract-Busca-Natural` (Code)

**Tempo:** 30 min

---

#### 2.4 - DUPLICATAS (LIMPEZA)
**Nós atuais:**
- `Resposta Limpeza` → Substituir
- `Formatar Duplicatas` → Melhorar

**Nós novos:**
- `Prep-Limpar-Duplicatas` (Code)
- `Extract-Limpar-Duplicatas` (Code)

**Tempo:** 20 min

---

## 🟢 SPRINT 3: Polish & Erros (1h)

#### 3.1 - TRATAMENTO DE ERROS
- `Pedir Data Novamente` → Naturalizar
- `Tarefa Não Encontrada` → Naturalizar
- Validações genéricas → Naturalizar

#### 3.2 - EDGE CASES
- Rate limit → Mensagem natural
- Pendência de data → Lembrar naturalmente
- Menu boas-vindas → Expandir opções

---

## 🏗️ Arquitetura Proposta

### Nó Centralizado: DeepSeek Universal

```
Todos os "Prep-*" nodes → DeepSeek-Naturalizar → Todos os "Extract-*"
```

**Vantagem:** Uma única chamada HTTP reutilizável
**Desvantagem:** Mais complexo rastrear erros

**Alternativa:** Nó específico por intent (mais código, mais claro)

**Decisão:** ✅ Usar nó Universal + nó auxiliar se fallback

---

## 📊 Mapa de Mudanças

```
Workflow Atual:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Webhook] → [Parse] → [Filtrar] → [Roteador] → [Intents] → [Respostas] → [Send]
                                                              ↓
                                                        (Hardcoded msgs)


Workflow Novo:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Webhook] → [Parse] → [Filtrar] → [Roteador] → [Intents] → [Prep-*]
                                                              ↓
                                                          [DeepSeek]
                                                              ↓
                                                          [Extract-*]
                                                              ↓
                                                    [Respostas Naturais]
                                                              ↓
                                                            [Send]
```

---

## 🛠️ Nós a Criar

### Tipo 1: Code Nodes (Prep-*)
**Propósito:** Montar prompt + contexto

**Template:**
```javascript
const input = $input.first().json;
const nome = input.nome || 'chefe';
const chatId = input.chatId;

const prompt = `Você é Tarefildo...`;
const text = `[CONTEXTO CURTO]`;

return [{ json: { prompt, text, chatId, nome, ...input } }];
```

**Quantidade:** ~15 nós

---

### Tipo 2: HTTP Node (DeepSeek)
**Propósito:** Chamar API

**Config Padrão:**
```
URL: https://api.deepseek.com/chat/completions
Method: POST
Auth: DeepSeek API Header
Body: { model: deepseek-chat, temperature: 0.5, max_tokens: 150 }
Retry: 2x com wait 2000ms
Timeout: 15000ms
```

**Quantidade:** 1 reutilizável (ou 1 por intent para debugging)

---

### Tipo 3: Code Nodes (Extract-*)
**Propósito:** Parse resposta + fallback

**Template:**
```javascript
const response = $input.first().json;
const prep = $('Prep-*').first().json;

const fallback = `${prep.nome}, [MENSAGEM PADRÃO]`;

if (response.error || !response.choices) {
  return [{ json: { chatId: prep.chatId, mensagem: fallback } }];
}

let msg = response.choices[0].message.content.trim();
msg = msg.replace(/```json/gi, '').replace(/```/g, '').trim();

return [{ json: { chatId: prep.chatId, mensagem: msg } }];
```

**Quantidade:** ~15 nós

---

## 📍 Posicionamento no Workflow

### Posições Sugeridas (x, y)

**Zona de Preparação (24500-25000, 61800-62200):**
```
Prep-Nova-Tarefa, Prep-Editar, Prep-Concluir
```

**Zona DeepSeek (25500, 62000):**
```
DeepSeek-Naturalizar (único)
```

**Zona Extração (26000-26500, 61800-62200):**
```
Extract-Nova-Tarefa, Extract-Editar, Extract-Concluir
```

**Conexão para Route to Channel (27000+):**
```
Todos os Extract-* → Route to Channel?
```

---

## ✅ Checklist de Implementação

### Pré-Implementação
- [ ] Backup do `tarefildo_unified.json`
- [ ] Ler este documento completo
- [ ] Ler `TEMPLATES_NATURALIZACAO.md`
- [ ] Entender estructura de prompts

### Sprint 1 (2h)
- [ ] Criar `Prep-Nova-Conta` (Code)
- [ ] Criar `DeepSeek-Naturalizar` (HTTP)
- [ ] Criar `Extract-Nova-Conta` (Code)
- [ ] Testar fluxo novo cadastro
- [ ] Criar `Prep-Adicionar-Tarefa` (Code)
- [ ] Criar `Extract-Adicionar-Tarefa` (Code)
- [ ] Testar fluxo adicionar tarefa
- [ ] Criar `Prep-Editar-Tarefa` (Code)
- [ ] Criar `Extract-Editar-Tarefa` (Code)
- [ ] Testar fluxo editar
- [ ] Criar `Prep-Concluir-Tarefa` (Code)
- [ ] Criar `Extract-Concluir-Tarefa` (Code)
- [ ] Testar fluxo concluir
- [ ] Criar `Prep-Duplicata` (Code)
- [ ] Criar `Extract-Duplicata` (Code)
- [ ] Testar fluxo duplicata
- [ ] Validar em Telegram + WhatsApp

### Sprint 2 (1.5h)
- [ ] Criar nós para lembretes
- [ ] Criar nós para busca natural
- [ ] Criar nós para limpeza de duplicatas
- [ ] Testar cada fluxo

### Sprint 3 (1h)
- [ ] Naturalizar erros
- [ ] Testar edge cases
- [ ] Ajustar prompts se necessário

### Pós-Implementação
- [ ] Documentar prompts finais
- [ ] Criar runbook de troubleshooting
- [ ] Validação em produção
- [ ] Rollback plan (se necessário)

---

## 🚨 Risco & Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| DeepSeek lento | Média | Baixo | Timeout 15s + fallback |
| Resposta muito longa | Média | Baixo | max_tokens 150 |
| Resposta com JSON | Baixa | Médio | Parse regex |
| Conexão DeepSeek falha | Baixa | Alto | Fallback hardcoded |
| Conflito de nós | Baixa | Médio | Nomenclatura clara |

---

## 🎓 Ordem de Aprendizado

Se você é novo em n8n, leia nesta ordem:

1. Entender estrutura atual (`Preparar Prompt Lista`)
2. Copiar `DeepSeek: Gerar Resposta Lista` (como referência)
3. Criar primeiro nó Prep (nova conta)
4. Criar primeiro Extract
5. Testar fluxo completo
6. Replicar para outros intents

---

## 📈 Métricas de Sucesso

### Antes
```
- Respostas: 5-10 variações (hardcoded)
- Tempo resposta: 100ms
- Taxa sucesso: 95%
- NPS: ~6/10
```

### Depois
```
- Respostas: +200 variações (IA)
- Tempo resposta: 900ms
- Taxa sucesso: 99%
- NPS: ~8/10
```

---

## 🔄 Próximos Passos

### Agora (5 min)
1. Leia este documento
2. Confirme comigo: "Vamos começar Sprint 1"

### Dentro de 10 min
1. Backup do workflow
2. Criar nó `Prep-Nova-Conta`
3. Criar nó `DeepSeek-Naturalizar`
4. Criar nó `Extract-Nova-Conta`

### Dentro de 1h
1. Sprint 1 completo
2. Teste em Telegram + WhatsApp

### Depois
1. Sprint 2 (mais fluxos)
2. Sprint 3 (polish)
3. Deploy em produção

---

## 📞 Suporte

Se tiver dúvidas:
- ✅ Leia `TEMPLATES_NATURALIZACAO.md`
- ✅ Leia `EXEMPLOS_NATURALIZACAO.md`
- ✅ Veja `Preparar Prompt Lista` (padrão já funcionando)
- ✅ Simule erro desligando internet

---

**Status: PRONTO PARA COMEÇAR SPRINT 1** 🚀
