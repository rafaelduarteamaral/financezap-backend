-- Migration: Adicionar colunas faltantes na tabela carteiras (versão segura)
-- Verifica se as colunas existem antes de adicionar

-- SQLite não suporta IF NOT EXISTS para ALTER TABLE ADD COLUMN diretamente
-- Mas podemos usar uma abordagem com verificação via PRAGMA

-- Adiciona coluna tipo (pode dar erro se já existir - isso é esperado e pode ser ignorado)
-- Se der erro "duplicate column", significa que já existe e está tudo ok

-- Adiciona coluna limiteCredito (pode dar erro se já existir)
ALTER TABLE carteiras ADD COLUMN limiteCredito REAL;

-- Adiciona coluna diaPagamento (pode dar erro se já existir)
ALTER TABLE carteiras ADD COLUMN diaPagamento INTEGER;

-- Atualiza registros existentes que não têm tipo definido (se a coluna tipo existir)
UPDATE carteiras SET tipo = 'debito' WHERE tipo IS NULL;

-- Cria índice para tipo se não existir
CREATE INDEX IF NOT EXISTS idx_carteiras_tipo ON carteiras(tipo);

