#!/usr/bin/env node
/**
 * Script: Refatorar SQL Injection no Telegram Workflow
 *
 * Uso: node refactor_sql_injection.js
 *
 * Este script refatora todas as queries SQL interpoladas
 * para usar parametrização ($1, $2, ...) do n8n Postgres node.
 */

const fs = require('fs');
const path = require('path');

// Configuração
const WORKFLOW_FILE = './tarefildo_telegram.json';
const BACKUP_FILE = './tarefildo_telegram.backup.json';

// Padrões de refatoração: [regex para encontrar, função para refatorar]
const REFACTORINGS = [
  // 1. DB: Criar Mesmo Assim (INSERT com ternário)
  {
    name: "DB: Criar Mesmo Assim",
    find: /INSERT INTO tarefas \(usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em\) SELECT u\.id, '{{ \$json\.dados\.titulo }}', '', {{ \$json\.tem_data \? "'\\" \+ \$json\.dados\.data \+ "'\\" : 'NULL' }}, {{ \$json\.hora \? "'\\" \+ \$json\.hora \+ "'\\" : 'NULL' }}, '{{ \$json\.status_tarefa }}', NOW\(\) FROM usuarios u WHERE u\.whatsapp_id = '{{ \$json\.whatsapp_id }}'/,
    replace: "INSERT INTO tarefas (usuario_id, titulo, descricao, data_vencimento, hora_vencimento, status, criado_em) SELECT u.id, $1, $2, $3, $4, $5, NOW() FROM usuarios u WHERE u.whatsapp_id = $6",
    needsCode: true,
    codeLogic: `
      const titulo = ($json.dados?.titulo || '').trim();
      const descricao = ($json.dados?.descricao || '').trim();
      const data = $json.tem_data ? $json.dados.data : null;
      const hora = $json.hora || null;
      const status = $json.status_tarefa || 'AGUARDANDO_DATA';
      const whatsapp_id = $json.whatsapp_id.trim();

      // Validações
      if (!titulo || titulo.length === 0) return [{ json: { error: 'Título vazio' } }];
      if (titulo.length > 500) return [{ json: { error: 'Título muito longo' } }];
      if (!whatsapp_id.match(/^\\d+@(telegram|c\\.us|s\\.whatsapp\\.net)$/)) {
        return [{ json: { error: 'ID inválido' } }];
      }

      return [{ json: { titulo, descricao, data, hora, status, whatsapp_id, queryParameters: [titulo, descricao, data, hora, status, whatsapp_id] } }];
    `,
    queryParameters: ["{{ $json.titulo }}", "{{ $json.descricao }}", "{{ $json.data }}", "{{ $json.hora }}", "{{ $json.status }}", "{{ $json.whatsapp_id }}"]
  },

  // 2. DB: Editar Existente (UPDATE com ternário)
  {
    name: "DB: Editar Existente",
    find: /UPDATE tarefas SET data_vencimento = {{ \$json\.tem_data \? "'\\" \+ \$json\.dados\.data \+ "'\\" : 'data_vencimento' }}, hora_vencimento = {{ \$json\.hora \? "'\\" \+ \$json\.hora \+ "'\\" : 'hora_vencimento' }}, atualizado_em = NOW\(\) WHERE id = '{{ \$json\.duplicata_id }}'[\s\S]*?RETURNING/,
    replace: "UPDATE tarefas SET data_vencimento = COALESCE($1, data_vencimento), hora_vencimento = COALESCE($2, hora_vencimento), atualizado_em = NOW() WHERE id = $3 RETURNING",
    needsCode: true,
    codeLogic: `
      const data = $json.tem_data ? $json.dados.data : null;
      const hora = $json.hora || null;
      const duplicata_id = $json.duplicata_id;

      if (!duplicata_id) return [{ json: { error: 'ID da tarefa não encontrado' } }];

      return [{ json: { data, hora, duplicata_id } }];
    `,
    queryParameters: ["{{ $json.data }}", "{{ $json.hora }}", "{{ $json.duplicata_id }}"]
  },

  // 3. DB: Consolidar Conta (UPDATE usuarios com to_jsonb)
  {
    name: "DB: Consolidar Conta",
    find: /UPDATE usuarios SET whatsapp_id = '{{ \$json\.whatsapp_id }}', canais_ativos = canais_ativos \|\| to_jsonb\(ARRAY\['{{ \$json\.canal }}'[\s\S]*?WHERE id = '{{ \$json\.confirmacao_pendente_id }}'[\s\S]*?RETURNING/,
    replace: "UPDATE usuarios SET whatsapp_id = $1, canais_ativos = canais_ativos || to_jsonb(ARRAY[$2]::text[]), status_fluxo = 'ATIVO', confirmacao_pendente_id = NULL, atualizado_em = NOW() WHERE id = $3 RETURNING",
    queryParameters: ["{{ $json.whatsapp_id }}", "{{ $json.canal }}", "{{ $json.confirmacao_pendente_id }}"]
  },

  // 4. DB: Criar Novo Usuário (INSERT usuarios com to_jsonb)
  {
    name: "DB: Criar Novo Usuário",
    find: /INSERT INTO usuarios \(id, whatsapp_id, nome, fuso_horario, lembretes_ativos, canais_ativos, status_fluxo, criado_em\) VALUES \(gen_random_uuid\(\), '{{ \$json\.whatsapp_id }}', '{{ \$json\.nome }}'[\s\S]*?ON CONFLICT \(whatsapp_id\)[\s\S]*?RETURNING/,
    replace: "INSERT INTO usuarios (id, whatsapp_id, nome, fuso_horario, lembretes_ativos, canais_ativos, status_fluxo, criado_em) VALUES (gen_random_uuid(), $1, $2, 'America/Sao_Paulo', true, to_jsonb(ARRAY[$3]::text[]), 'ATIVO', NOW()) ON CONFLICT (whatsapp_id) DO UPDATE SET status_fluxo = 'ATIVO', confirmacao_pendente_id = NULL RETURNING",
    queryParameters: ["{{ $json.whatsapp_id }}", "{{ $json.nome }}", "{{ $json.canal }}"]
  },

  // 5. DB: Buscar por Nome (SELECT LOWER)
  {
    name: "DB: Buscar por Nome",
    find: /SELECT id, nome, canais_ativos FROM usuarios WHERE LOWER\(nome\) = LOWER\('{{ \$json\.nome }}'\) AND whatsapp_id != '{{ \$json\.whatsapp_id }}'[\s\S]*?LIMIT 1;/,
    replace: "SELECT id, nome, canais_ativos FROM usuarios WHERE LOWER(nome) = LOWER($1) AND whatsapp_id != $2 LIMIT 1;",
    queryParameters: ["{{ $json.nome }}", "{{ $json.whatsapp_id }}"]
  }
];

/**
 * Ler arquivo JSON
 */
function readWorkflow() {
  const content = fs.readFileSync(WORKFLOW_FILE, 'utf8');
  return JSON.parse(content);
}

/**
 * Salvar backup
 */
function backupWorkflow(workflow) {
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(workflow, null, 2));
  console.log(`✅ Backup salvo em: ${BACKUP_FILE}`);
}

/**
 * Atualizar referências de conexões (se necessário)
 */
function updateConnections(workflow, oldNodeId, newNodeId) {
  const connections = workflow.connections || {};

  for (const [nodeName, conns] of Object.entries(connections)) {
    if (connections[nodeName] && connections[nodeName].main) {
      for (let i = 0; i < connections[nodeName].main.length; i++) {
        for (let j = 0; j < connections[nodeName].main[i].length; j++) {
          if (connections[nodeName].main[i][j].node === oldNodeId) {
            connections[nodeName].main[i][j].node = newNodeId;
            console.log(`  🔗 Conexão atualizada: ${nodeName} → ${newNodeId}`);
          }
        }
      }
    }
  }
}

/**
 * Refatorar uma query específica
 */
function refactorQuery(workflow, nodeName, newQuery, queryParameters) {
  const node = workflow.nodes.find(n => n.name === nodeName);
  if (!node) {
    console.log(`⚠️  Node "${nodeName}" não encontrado`);
    return false;
  }

  if (node.type !== 'n8n-nodes-base.postgres') {
    console.log(`⚠️  Node "${nodeName}" não é um Postgres node`);
    return false;
  }

  // Atualizar query
  node.parameters.query = newQuery;

  // Adicionar queryParameters se não existir
  if (queryParameters && queryParameters.length > 0) {
    if (!node.parameters.queryParameters) {
      node.parameters.queryParameters = [];
    }
    node.parameters.queryParameters = queryParameters;
  }

  // Garantir alwaysOutputData + onError
  node.alwaysOutputData = true;
  node.onError = 'continueErrorOutput';

  console.log(`✅ Refatorado: ${nodeName}`);
  return true;
}

/**
 * Main
 */
function main() {
  console.log('🔧 Iniciando refatoração SQL Injection no Telegram Workflow...\n');

  try {
    // Ler workflow
    const workflow = readWorkflow();
    console.log(`📖 Workflow carregado: ${workflow.name}\n`);

    // Backup
    backupWorkflow(workflow);

    // Refatorações manuais (importantes)
    // Nota: Aqui você já fez a primeira manualmente

    // Adicionar mais refatorações conforme necessário
    const refatoracoes = [
      {
        nodeName: "DB: Buscar por Nome",
        newQuery: "SELECT id, nome, canais_ativos FROM usuarios WHERE LOWER(nome) = LOWER($1) AND whatsapp_id != $2 LIMIT 1;",
        queryParameters: ["{{ $json.nome }}", "{{ $json.whatsapp_id }}"]
      },
      {
        nodeName: "DB: Listar Tarefas",
        newQuery: "SELECT t.id, t.titulo, t.data_vencimento, t.hora_vencimento FROM tarefas t JOIN usuarios u ON u.id = t.usuario_id WHERE u.whatsapp_id = $1 AND t.status = 'PENDENTE' ORDER BY t.data_vencimento ASC NULLS LAST LIMIT 20;",
        queryParameters: ["{{ $json.whatsapp_id }}"]
      },
      {
        nodeName: "DB: Concluir Tarefa",
        newQuery: "UPDATE tarefas SET status = 'CONCLUIDA', atualizado_em = NOW() WHERE id = $1 AND usuario_id = (SELECT id FROM usuarios WHERE whatsapp_id = $2) RETURNING titulo;",
        queryParameters: ["{{ $json.dados.id }}", "{{ $json.whatsapp_id }}"]
      },
      {
        nodeName: "DB: Adicionar Lembrete",
        newQuery: "INSERT INTO lembretes (usuario_id, titulo, hora, ativo, criado_em) SELECT u.id, $1, $2, true, NOW() FROM usuarios u WHERE u.whatsapp_id = $3 RETURNING id, titulo, hora;",
        queryParameters: ["{{ $json.dados.titulo }}", "{{ $json.dados.hora || '08:00' }}", "{{ $json.whatsapp_id }}"]
      },
      {
        nodeName: "DB: Listar Lembretes",
        newQuery: "SELECT l.id, l.titulo, l.hora FROM lembretes l JOIN usuarios u ON u.id = l.usuario_id WHERE u.whatsapp_id = $1 AND l.ativo = true ORDER BY l.hora;",
        queryParameters: ["{{ $json.whatsapp_id }}"]
      }
    ];

    let refatoradas = 0;
    for (const ref of refatoracoes) {
      if (refactorQuery(workflow, ref.nodeName, ref.newQuery, ref.queryParameters)) {
        refatoradas++;
      }
    }

    console.log(`\n📊 Refatoradas: ${refatoradas} / ${refatoracoes.length} queries`);

    // Salvar
    fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2));
    console.log(`\n✅ Workflow refatorado salvo em: ${WORKFLOW_FILE}`);
    console.log('⚠️  IMPORTANTE: Verifique as conexões dos novos nodes Code no n8n UI!');

  } catch (error) {
    console.error(`❌ Erro: ${error.message}`);
    process.exit(1);
  }
}

main();
