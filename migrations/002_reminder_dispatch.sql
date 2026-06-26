-- Migration: Lembretes Customizados - Disparo Automático
-- Data: 2026-06-26
-- Propósito: Adicionar campos para rastreamento de envio de lembretes
-- Requisito: REQ 3 (Lembretes Customizados)

-- ============================================================================
-- ALTERAÇÃO 1: Adicionar coluna 'data' (data do lembrete)
-- ============================================================================

ALTER TABLE lembretes
ADD COLUMN IF NOT EXISTS data DATE NOT NULL DEFAULT CURRENT_DATE;

-- ============================================================================
-- ALTERAÇÃO 2: Adicionar coluna 'enviado' (flag de envio)
-- ============================================================================

ALTER TABLE lembretes
ADD COLUMN IF NOT EXISTS enviado BOOLEAN DEFAULT false;

-- ============================================================================
-- ALTERAÇÃO 3: Adicionar coluna 'enviado_em' (timestamp do envio)
-- ============================================================================

ALTER TABLE lembretes
ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMP;

-- ============================================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================================

-- Query que busca lembretes pendentes roda frequentemente (a cada 5 min)
CREATE INDEX IF NOT EXISTS idx_lembretes_pendentes
ON lembretes(usuario_id, ativo, enviado, data, hora)
WHERE ativo = true AND enviado = false;

-- Histórico de lembretes enviados
CREATE INDEX IF NOT EXISTS idx_lembretes_enviados
ON lembretes(usuario_id, enviado_em DESC)
WHERE enviado = true;

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================

SELECT 'Migration 002_reminder_dispatch completed successfully!' as status;

SELECT
  COUNT(*) as total_lembretes,
  COUNT(*) FILTER (WHERE enviado = false) as lembretes_pendentes,
  COUNT(*) FILTER (WHERE enviado = true) as lembretes_enviados
FROM lembretes;
