-- Migration: SQL Injection Fix - FUNÇÕES E TRIGGERS APENAS
-- Data: 2026-06-24
-- Propósito: Criar funções e triggers (CREATE OR REPLACE é idempotente)
-- Executar no Neon: psql neon-db < 001_sql_injection_fix.sql

-- NOTA: audit_log, índices, constraints já foram criados na execução anterior

-- ============================================================================
-- FUNÇÃO 1: Calcular próxima data de recorrência
-- ============================================================================

CREATE OR REPLACE FUNCTION calcular_proxima_data_recorrencia(
  data_atual DATE,
  recorrencia TEXT,
  dia_mes INTEGER DEFAULT NULL
)
RETURNS DATE AS $$
BEGIN
  CASE recorrencia
    WHEN 'diario' THEN
      RETURN data_atual + INTERVAL '1 day';
    WHEN 'semanal' THEN
      RETURN data_atual + INTERVAL '7 days';
    WHEN 'mensal' THEN
      IF dia_mes IS NOT NULL THEN
        RETURN DATE_TRUNC('month', data_atual)::DATE + INTERVAL '1 month' + (dia_mes - 1) * INTERVAL '1 day';
      ELSE
        RETURN data_atual + INTERVAL '1 month';
      END IF;
    WHEN 'anual' THEN
      RETURN data_atual + INTERVAL '1 year';
    ELSE
      RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- FUNÇÃO 2: Log de ações (auditoria)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_acao(
  p_usuario_id UUID,
  p_acao TEXT,
  p_tabela TEXT,
  p_registro_id UUID DEFAULT NULL,
  p_valores_antigos JSONB DEFAULT NULL,
  p_valores_novos JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_log (usuario_id, acao, tabela, registro_id, valores_antigos, valores_novos)
  VALUES (p_usuario_id, p_acao, p_tabela, p_registro_id, p_valores_antigos, p_valores_novos);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER 1: Log DELETE em tarefas
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_tarefas_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (usuario_id, acao, tabela, registro_id, valores_antigos)
  VALUES (OLD.usuario_id, 'DELETE', 'tarefas', OLD.id,
    jsonb_build_object('id', OLD.id, 'titulo', OLD.titulo, 'status', OLD.status));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_audit_tarefas_delete ON tarefas;
CREATE TRIGGER trig_audit_tarefas_delete
BEFORE DELETE ON tarefas
FOR EACH ROW
EXECUTE FUNCTION audit_tarefas_delete();

-- ============================================================================
-- TRIGGER 2: Log UPDATE em tarefas
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_tarefas_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status OR OLD.titulo != NEW.titulo THEN
    INSERT INTO audit_log (usuario_id, acao, tabela, registro_id, valores_antigos, valores_novos)
    VALUES (NEW.usuario_id, 'UPDATE', 'tarefas', NEW.id,
      jsonb_build_object('status', OLD.status, 'titulo', OLD.titulo),
      jsonb_build_object('status', NEW.status, 'titulo', NEW.titulo));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_audit_tarefas_update ON tarefas;
CREATE TRIGGER trig_audit_tarefas_update
BEFORE UPDATE ON tarefas
FOR EACH ROW
EXECUTE FUNCTION audit_tarefas_update();

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================

SELECT 'Migration 001_sql_injection_fix completed successfully!' as status;

SELECT
  (SELECT COUNT(*) FROM usuarios) as total_usuarios,
  (SELECT COUNT(*) FROM tarefas) as total_tarefas,
  (SELECT COUNT(*) FROM lembretes) as total_lembretes,
  (SELECT COUNT(*) FROM audit_log) as total_audit_logs;
