-- Fix lembretes com data NULL (inseridos antes do fix dos workflows)
UPDATE lembretes
SET data = COALESCE(
  (criado_em AT TIME ZONE 'America/Sao_Paulo')::date,
  CURRENT_DATE
)
WHERE data IS NULL;

-- Fix lembretes com enviado NULL
UPDATE lembretes SET enviado = false WHERE enviado IS NULL AND ativo = true;
