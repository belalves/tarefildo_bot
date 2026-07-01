# Especificação: Naturalização de Mensagens em Todos os Fluxos

## Status Atual
- ✅ **1 fluxo implementado**: `listar_tarefas` → DeepSeek: Gerar Resposta Lista
- ❌ **10+ fluxos pendentes**: Retornam mensagens em JavaScript puro (sem IA)

## Objetivo
Todos os fluxos de retorno devem passar por um modelo de linguagem (DeepSeek) para gerar respostas naturalizadas e contextualizadas, mantendo a personalidade do Tarefildo.

---

## Fluxos que Precisam Naturalização

### 1. Fluxo de Confirmação de Conta
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Consolidada | `Resposta Consolidou` | Code | ✅ Naturalizar |
| Novo Cadastro | `Resposta Novo Cadastro` | Code | ✅ Naturalizar |
| Inválida | `Resposta Inválida` | Code | ✅ Naturalizar |
| Perguntar Confirmação | `Perguntar Confirmação` | Code | ✅ Naturalizar |

### 2. Fluxo de Menu/Saudações
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Menu Boas-vindas | `Menu Boas-vindas` | Code | ✅ Naturalizar |

### 3. Fluxo de Tarefas
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Adicionar Tarefa | `Resposta Tarefa` | Code | ✅ Naturalizar |
| Editar - Dados Inválidos | `Avaliar Edição` (return mensagem) | Code | ✅ Naturalizar |
| Editar - Sucesso | `Resposta Editou` | Code | ✅ Naturalizar |
| Excluir - Sucesso | `Resposta Excluiu` | Code | ✅ Naturalizar |
| Duplicata - Perguntar | `Perguntar Duplicata` | Code | ✅ Naturalizar |
| Duplicata - Criar Mesmo | `Resposta Criou Duplicata` | Code | ✅ Naturalizar |
| Duplicata - Editar Existente | `Resposta Editou Existente` | Code | ✅ Naturalizar |
| Duplicata - Cancelar | `Processar Resp Duplicata` (return) | Code | ✅ Naturalizar |
| Concluir Tarefa - Sucesso | `Resposta Concluiu Tarefa` | Code | ✅ Naturalizar |
| Concluir Tarefa - Não Encontrada | `Tarefa Não Encontrada` | Code | ✅ Naturalizar |
| Salvar Data Pendência | `Confirmar Data` | Code | ✅ Naturalizar |
| Data Inválida | `Pedir Data Novamente` | Code | ✅ Naturalizar |

### 4. Fluxo de Lembretes
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Formatar Resposta | `Formatar Resposta` | Code | ✅ Naturalizar |

### 5. Fluxo de Busca Natural
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Formatar Busca | `Formatar Busca` | Code | ✅ Naturalizar |

### 6. Fluxo de Duplicatas
| Ponto de Retorno | Nó Atual | Tipo | Necessidade |
|---|---|---|---|
| Detectar Duplicatas | `Formatar Duplicatas` | Code | ✅ Naturalizar |
| Limpeza | `Resposta Limpeza` | Code | ✅ Naturalizar |

---

## Padrão de Implementação

### Modelo Atual (DeepSeek Lista)
```
[Preparar Prompt Lista] 
  ↓
[DeepSeek: Gerar Resposta Lista] 
  ↓
[Extrair Resposta Lista]
  ↓
[Route to Channel?]
```

### Padrão a Implementar (Para Todos os Fluxos)

#### Opção A: Nó DeepSeek Centralizado (Recomendado para Simplificar)
```
[Code: Preparar Prompt Genérico]
  - Monta prompt baseado no tipo de resposta
  - Inclui contexto (nome, intent, dados)
  ↓
[DeepSeek: Naturalizar Resposta]
  - API call único para naturalização
  - Temperature: 0.5
  - Max tokens: 150-200
  ↓
[Code: Extrair Resposta]
  - Parse resposta
  - Fallback: mensagem original se erro
  ↓
[Route to Channel?]
```

#### Opção B: Nó DeepSeek Específico (Máxima Qualidade)
```
[Preparar Prompt <INTENT>]
  ↓
[DeepSeek: <INTENT>]
  ↓
[Extrair <INTENT>]
  ↓
[Route to Channel?]
```

---

## Estrutura do Prompt Genérico

### Template Base
```javascript
const prompt = `Você é o Tarefildo Silva das Pendências, bot assistente de tarefas. 
Funcionário raiz, engraçado, sarcástico. Usa: bora resolver, já era pra ontem, confia no Tarefildo. 
Emojis moderados (máximo 2). Seja curto (1-3 frases). 

Usuário: ${nome}
Intent: ${intent}
Contexto: ${contexto}

Responda com naturalidade em tom conversacional. Apenas texto, sem JSON ou markdown.`;
```

### Contextos por Intent

| Intent | Exemplo de Contexto |
|---|---|
| `nova_tarefa` | "Tarefa criada: '${titulo}' para ${data \|\| 'sem data'}. Status: ${status}" |
| `editar_tarefa` | "Tarefa '${titulo}' atualizada. Nova data: ${data \|\| 'mantida'}" |
| `excluir_tarefa` | "Tarefa '${titulo}' removida da lista" |
| `concluir_tarefa` | "Tarefa '${titulo}' marcada como concluída" |
| `listar_tarefas` | "${count} tarefas encontradas para ${periodo}" |
| `duplicata_detectada` | "${count} tarefas duplicadas encontradas: ${titulos}" |
| `duplicata_limpa` | "${count} duplicatas removidas" |
| `novo_cadastro` | "Novo usuário criado via ${canal}" |
| `conta_consolidada` | "Contas consolidadas de ${canais.join(', ')}" |
| `pendencia_data` | "Tarefa pendente: '${titulo}' aguardando data" |
| `novo_lembrete` | "Lembrete criado: '${titulo}' para ${hora}" |
| `erro_nao_encontrado` | "Não encontrei '${termo}'. Contexto: ${context}" |
| `erro_invalido` | "Entrada inválida. Esperado: ${esperado}" |

---

## Dados Necessários em Cada Ponto de Retorno

### Estrutura Padrão do Payload
```json
{
  "chatId": "STRING (obrigatório)",
  "nome": "STRING",
  "intent": "STRING (identificador do fluxo)",
  "contexto": "OBJECT",
  "source": "TELEGRAM | WHATSAPP",
  "whatsapp_id": "STRING"
}
```

### Exemplo: Novo Cadastro
```javascript
{
  "chatId": "123456789",
  "nome": "João",
  "intent": "novo_cadastro",
  "contexto": {
    "canal": "telegram"
  },
  "source": "TELEGRAM",
  "whatsapp_id": "123456789@telegram"
}
```

---

## Implementação Passo-a-Passo

### Fase 1: Criar Nó Centralizado DeepSeek
1. Duplicar: `DeepSeek: Gerar Resposta Lista`
2. Renomear: `DeepSeek: Naturalizar Resposta (Genérico)`
3. Manter configuração: `temperature: 0.5`, `max_tokens: 200`

### Fase 2: Criar Nó de Preparação Genérico
1. Criar nó Code: `Preparar Prompt Naturalização`
2. Input: `{ intent, contexto, nome, ... }`
3. Output: `{ prompt, text, ... }`

### Fase 3: Atualizar Cada Fluxo
Para cada ponto de retorno:
1. Substituir Code node de geração de mensagem
2. Conectar para: `Preparar Prompt Naturalização`
3. Depois: `DeepSeek: Naturalizar Resposta`
4. Depois: `Extrair Resposta`
5. Depois: `Route to Channel?`

### Fase 4: Tratamento de Erros
- Se DeepSeek falhar: usar fallback (mensagem original)
- Se sem internet: usar mensagem original
- Log de erros em workflow_errors

---

## Exemplos de Transformação

### Antes (Code Puro)
```javascript
// Resposta Tarefa
const db = $input.first().json;
const nome = $('Filtrar Mensagem').first().json.nome || 'chefe';
let msg;
if (db.status === 'AGUARDANDO_DATA') { 
  msg = `Anotado, ${nome}: '${db.titulo}'. Me fala a data 👀`; 
} else { 
  msg = `${nome}, '${db.titulo}' pro dia ${df}. Eu te lembro.`; 
}
```

### Depois (Naturalizado)
```javascript
// Preparar Prompt
const prompt = `Você é Tarefildo. Usuário: ${nome}. 
Tarefa foi anotada: "${titulo}" com status ${status}...`;

// DeepSeek responde:
// "João, anotei esse bagulho: 'pagar boleto'. Me manda a data pra gente não perder o prazo 😅"
```

---

## Checklist de Qualidade

Para cada fluxo naturalizado:
- [ ] Resposta contém emojis (máximo 2)
- [ ] Resposta usa nome do usuário (ou "chefe")
- [ ] Resposta mantém tom Tarefildo (sarcástico, motivador)
- [ ] Resposta é breve (máximo 3 frases)
- [ ] Fallback funciona se DeepSeek falhar
- [ ] Testado em Telegram e WhatsApp
- [ ] Sem JSON/markdown na resposta
- [ ] Contexto relevante incluído

---

## Prioridade de Implementação

### Sprint 1 (Alta Prioridade)
1. Fluxo de confirmação (novo cadastro)
2. Fluxo de tarefas (adicionar, editar, excluir)
3. Fluxo de conclusão

### Sprint 2 (Média Prioridade)
4. Fluxo de lembretes
5. Fluxo de duplicatas
6. Fluxo de busca

### Sprint 3 (Baixa Prioridade)
7. Mensagens de erro
8. Mensagens de validação

---

## Estimativa de Esforço

| Atividade | Tempo | Dependências |
|---|---|---|
| Setup centralizado | 30min | Nenhuma |
| Atualizar 5 fluxos | 2h | Setup |
| Testes (T + WA) | 1h | 5 fluxos |
| Ajustes finos | 1h | Testes |
| **Total** | **4.5h** | - |

---

## Notas Técnicas

- **Rate Limiting**: Manter limite de 3s entre msgs (já implementado)
- **Contexto de Memória**: Preservar `globalState` em todos os fluxos
- **Source Detection**: Incluir `source` em todos os payloads
- **Fallback**: Sempre ter mensagem hardcoded como fallback
- **Timeout**: DeepSeek com timeout de 15s (já configurado)

---

## Exemplo de Fluxo Atualizado

```
Input: { intent: 'nova_tarefa', titulo: 'pagar boleto', data: '2026-07-05' }
                          ↓
[Preparar Prompt Naturalização]
  → { prompt: "Você é Tarefildo...", contexto: { titulo, data } }
                          ↓
[DeepSeek: Naturalizar Resposta]
  → API call com prompt + contexto
                          ↓
[Extrair Resposta]
  → "João, anotei 'pagar boleto' pro dia 05/07. Eu te lembro 👀"
                          ↓
[Route to Channel?]
  → Telegram OU WhatsApp
```

---

## Referências

- Nó atual de sucesso: `DeepSeek: Gerar Resposta Lista`
- Padrão de fallback: `Preparar Busca`
- Estrutura de contexto: `Preparar Prompt Data`
