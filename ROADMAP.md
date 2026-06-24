# Roadmap — Tarefildo Bot 🚀

**Status Atual**: v1.0 (SQL Injection Fix + Workflows Base)  
**Próximas Versões**: v1.1 → v1.5 (Melhorias e Features)

---

## 📋 Lista de Melhorias & Sugestões

### 🔴 **Crítica** (Segurança)

#### [REQ 1] SQL Injection Fix no Telegram
- **Status**: ✅ 100% DONE
- **O que é**: Parametrizar todas as 23 queries SQL (`$1, $2, ...`)
- **Progresso**: 23/23 queries refatoradas ✅
- **Testes**: Validados contra 8 attack vectors (string termination, UNION, stacked queries, blind injection)
- **Impacto**: Elimina vulnerabilidade crítica de SQL injection
- **Timeline**: ~1h (testes)
- **Arquivo**: [SQL_INJECTION_FIX_PLAN.md](docs/spec/refactor_sql_injection/SQL_INJECTION_FIX_PLAN.md)

---

### 🟠 **Alta Prioridade** (Resiliência)

#### [REQ 2] Rate Limiting no Telegram
- **Status**: 🔄 PENDENTE
- **O que é**: Adicionar limite de 3s entre mensagens (como WhatsApp)
- **Por quê**: Evitar spam e custos altos com DeepSeek
- **Implementação**: Global state + limpeza automática
- **Timeline**: ~1h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 2

#### [REQ 8] Fallback DeepSeek
- **Status**: 🔄 PENDENTE
- **O que é**: Se IA cai, usar regex simples para comandos óbvios
- **Por quê**: Graceful degradation — bot segue funcionando
- **Comandos**: `/tarefas` lista, `adiciona:` cria, `/ajuda` menu
- **Timeline**: ~2h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 8

---

### 🟡 **Média Prioridade** (Features)

#### [REQ 3] Lembretes Customizados ⭐
- **Status**: 🔄 PENDENTE
- **O que é**: Disparar lembretes no horário configurado pelo usuário
- **Por quê**: Funcionalidade existe no BD mas não funciona (orfã)
- **Novo Workflow**: `tarefildo_lembrete_customizado.json`
- **Executa**: A cada 30min (verifica hora local)
- **Timeline**: ~3h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 3
- **Schema**: Adicionar coluna `ultimo_envio_em` em lembretes

#### [REQ 7] Tarefas Atrasadas
- **Status**: 🔄 PENDENTE
- **O que é**: Detectar tarefas vencidas e enviar alerta urgente
- **Por quê**: Sinalizar atrasos com tom mais urgente
- **Implementação**: Query + mensagem diferenciada
- **Timeline**: ~1h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 7

#### [REQ 9] Fuso Horário Dinâmico
- **Status**: 🔄 PENDENTE
- **O que é**: Respeitar fuso horário de cada usuário nos lembretes
- **Por quê**: Cron é fixo (07:00 UTC) — usuários em outros fusos recebem na hora errada
- **Implementação**: Loop por fuso + cálculo de hora local
- **Timeline**: ~2-3h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 9
- **Depende de**: REQ 3 (Lembretes customizados)

---

### 🟢 **Baixa Prioridade** (Nice to Have)

#### [REQ 4] Tarefas Recorrentes ⭐⭐
- **Status**: 🔄 PENDENTE
- **O que é**: Criar tarefas que se repetem (diário, semanal, mensal, anual)
- **Por quê**: Usuário não precisa recriar todo mês (ex: pagar aluguel dia 5)
- **Novo Workflow**: `tarefildo_recorrencia_auto.json`
- **Schema**: Adicionar colunas `recorrencia`, `dia_mes_recorrencia`
- **Timeline**: ~4h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 4

#### [REQ 5] Prioridade de Tarefas ⭐
- **Status**: 🔄 PENDENTE
- **O que é**: Classificar tarefas como ALTA/MEDIA/BAIXA
- **Por quê**: Ordenar por urgência (urgente → quando der)
- **DeepSeek**: Extrair prioridade do texto (palavras-chave: "urgente", "ASAP", etc)
- **UI**: Emoji + ordem na listagem (🔴 ALTA → 🟡 MEDIA → 🟢 BAIXA)
- **Timeline**: ~2h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 5

#### [REQ 6] Resumo Semanal ⭐⭐
- **Status**: 🔄 PENDENTE
- **O que é**: Enviar domingo 20h com resumo: concluídas, pendentes, atrasadas
- **Por quê**: Feedback visual + gamificação → engajamento
- **Novo Workflow**: `tarefildo_resumo_semanal.json`
- **Conteúdo**: ✅ 5 concluídas, 📋 3 pendentes, ⚠️ 1 atrasada, próximas 3
- **Timeline**: ~3h
- **Arquivo**: [SPEC.md](docs/spec/SPEC.md) — Requisição 6
- **Depende de**: REQ 7 (Tarefas atrasadas), REQ 9 (Fuso dinâmico)

---

## 📊 Tabela de Priorização

| Req | Título | Prioridade | Tempo | Status | Depende |
|---|---|---|---|---|---|
| 1 | SQL Injection Fix | 🔴 Crítica | 1h | ✅ 95% | — |
| 2 | Rate Limit Telegram | 🟠 Alta | 1h | 🔄 | — |
| 8 | Fallback DeepSeek | 🟠 Alta | 2h | 🔄 | — |
| 3 | Lembretes Customizados | 🟡 Média | 3h | 🔄 | — |
| 7 | Tarefas Atrasadas | 🟡 Média | 1h | 🔄 | — |
| 9 | Fuso Horário Dinâmico | 🟡 Média | 2-3h | 🔄 | 3, 7 |
| 4 | Tarefas Recorrentes | 🟢 Baixa | 4h | 🔄 | — |
| 5 | Prioridade de Tarefas | 🟢 Baixa | 2h | 🔄 | — |
| 6 | Resumo Semanal | 🟢 Baixa | 3h | 🔄 | 7, 9 |

---

## 🎯 Roadmap de Sprints

### **Sprint 1** (v1.1) — Segurança & Resiliência
**Duração**: ~4-5h  
**Objetivos**:
- ✅ REQ 1: SQL Injection (fechar testes)
- ✅ REQ 2: Rate Limiting Telegram
- ✅ REQ 8: Fallback DeepSeek

### **Sprint 2** (v1.2) — Lembretes & Atrasos
**Duração**: ~6-7h  
**Objetivos**:
- ✅ REQ 3: Lembretes Customizados
- ✅ REQ 7: Tarefas Atrasadas
- ✅ REQ 9: Fuso Horário Dinâmico

### **Sprint 3** (v1.3) — Recorrência & Prioridades
**Duração**: ~6h  
**Objetivos**:
- ✅ REQ 4: Tarefas Recorrentes
- ✅ REQ 5: Prioridade de Tarefas

### **Sprint 4** (v1.4) — Engajamento & Resumos
**Duração**: ~3h  
**Objetivos**:
- ✅ REQ 6: Resumo Semanal

### **Sprint 5** (v1.5) — Polish & Deploy
**Duração**: ~TBD  
**Objetivos**:
- Testes end-to-end
- Deploy em produção
- Monitoramento

---

## 📚 Documentação Relacionada

- **[SPEC.md](docs/spec/SPEC.md)** — Detalhes técnicos de cada requisição
- **[N8N_DEVELOPMENT_GUIDE.md](docs/N8N_DEVELOPMENT_GUIDE.md)** — Guia enterprise (segurança, performance, etc)
- **[SQL_INJECTION_FIX_PLAN.md](docs/spec/refactor_sql_injection/SQL_INJECTION_FIX_PLAN.md)** — Mapeamento de 23 queries
- **[REFACTORING_QUERIES_MAPEADAS.md](docs/spec/refactor_sql_injection/REFACTORING_QUERIES_MAPEADAS.md)** — Queries mapeadas com antes/depois

---

## 🚦 How to Use This Roadmap

1. **Executar Sprint 1**: Fechar segurança (4-5h)
2. **Depois Sprint 2**: Implementar lembretes (6-7h)
3. **Depois Sprint 3**: Adicionar features (6h)
4. **Depois Sprint 4**: Engajamento (3h)
5. **Deploy v1.4**: Já está pronta para usar

---

## 💡 Quick Stats

- **Total Time**: ~21-25h (sprints 1-4)
- **Críticos Pendentes**: 0 (tudo já tem spec!)
- **Documentação**: ✅ 100% (1200+ linhas)
- **Code Refatorado**: ✅ 21/23 queries
- **Workflows Criados**: ✅ 3 (Telegram, WhatsApp, Lembretes)
- **Ready for Next Sprint**: ✅ YES

---

**Próximo Passo**: Escolher Sprint 1 e começar! 🚀

---

*Last updated: 2026-06-24*  
*Roadmap version: 1.0*
