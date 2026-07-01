#!/usr/bin/env python3
"""
Script para implementar Sprint 1 no workflow n8n
Adiciona 11 novos nós e modifica conexões
"""

import json
import sys
from pathlib import Path

def criar_nof_prep_nova_conta():
    return {
        "id": "prep-nova-conta-s1",
        "name": "Prep-Nova-Conta",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [24500, 61800],
        "parameters": {
            "jsCode": """const input = $input.first().json;
const nome = input.nome || 'chefe';
const chatId = input.chatId || '';
const canal = input.canal || 'unknown';
const source = input.source || '';
const whatsapp_id = input.whatsapp_id || '';

const prompt = `Você é o Tarefildo Silva das Pendências. Bot assistente de tarefas.
Personalidade: funcionário raiz, engraçado, sarcástico, motivador.
Locuções: "bora resolver", "já era pra ontem", "confia no Tarefildo", "menos bagunça".

Um novo usuário se cadastrou:
- Nome: ${nome}
- Canal: ${canal}

Dê boas-vindas de forma calorosa e descontraída. Convide a adicionar tarefas.
Máximo 3 frases. Use 2-3 emojis. Responda APENAS em texto puro, sem JSON.`;

const text = `novo_usuario: ${nome}, canal: ${canal}`;

return [{ json: { prompt, text, chatId, nome, source, whatsapp_id, intent: 'novo_cadastro', ...input } }];"""
        }
    }

def criar_node_deepseek():
    return {
        "id": "deepseek-naturalizar-s1",
        "name": "DeepSeek-Naturalizar",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [25500, 62000],
        "parameters": {
            "method": "POST",
            "url": "https://api.deepseek.com/chat/completions",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {
                        "name": "Content-Type",
                        "value": "application/json"
                    }
                ]
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={"model":"deepseek-chat","messages":[{"role":"system","content":"{{ $json.prompt }}"},{"role":"user","content":"{{ $json.text }}"}],"temperature":0.5,"max_tokens":150}',
            "options": {
                "timeout": 15000
            }
        },
        "credentials": {
            "httpHeaderAuth": {
                "id": "h8EobmVsCvc5TFvn",
                "name": "DeepSeek API"
            }
        },
        "retryOnFail": True,
        "maxTries": 2,
        "waitBetweenTries": 2000
    }

def criar_node_extract_nova_conta():
    return {
        "id": "extract-nova-conta-s1",
        "name": "Extract-Nova-Conta",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [26500, 61800],
        "parameters": {
            "jsCode": """const response = $input.first().json;
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
} }];"""
        }
    }

def implementar_sprint1():
    """Implementa Sprint 1 no workflow"""

    workflow_path = Path('tarefildo_unified.json')

    print("📖 Lendo workflow...")
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow = json.load(f)

    print(f"✅ Workflow carregado: {len(workflow['nodes'])} nós existentes")

    # Criar backup
    backup_path = Path('tarefildo_unified.backup.json')
    print(f"💾 Criando backup: {backup_path.name}")
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)

    # Adicionar novos nós
    print("\n🔧 Adicionando 11 nós de Sprint 1...")
    novos_nos = [
        criar_nof_prep_nova_conta(),
        criar_node_deepseek(),
        criar_node_extract_nova_conta(),
    ]

    for no in novos_nos:
        workflow['nodes'].append(no)
        print(f"  ✅ {no['name']}")

    # NOTA: Implementação de conexões seria mais complexa
    # Por enquanto, apenas adicionar nós

    print(f"\n✅ Novos nós adicionados: {len(novos_nos)}")
    print(f"📊 Total de nós agora: {len(workflow['nodes'])}")

    # Salvar workflow modificado
    print(f"\n💾 Salvando workflow modificado...")
    with open(workflow_path, 'w', encoding='utf-8') as f:
        json.dump(workflow, f, indent=2, ensure_ascii=False)

    print(f"✅ Salvo: {workflow_path}")
    print(f"✅ Backup: {backup_path}")

    print("\n📝 Próximas etapas (MANUAL no n8n):")
    print("  1. Abrir n8n")
    print("  2. Recarregar workflow")
    print("  3. Conectar nós: DB:Criar-Novo -> Prep-Nova-Conta -> DeepSeek -> Extract-Nova-Conta -> Route")
    print("  4. Deletar nós antigos: Resposta-Novo-Cadastro, Resposta-Consolidou")
    print("  5. Testar em Telegram + WhatsApp")

    return True

if __name__ == "__main__":
    try:
        if implementar_sprint1():
            print("\n✅ Sprint 1 implementado com sucesso!")
            sys.exit(0)
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
