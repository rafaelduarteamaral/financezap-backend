-- Migration: Adicionar colunas faltantes na tabela carteiras
-- Adiciona: tipo, limiteCredito, diaPagamento

-- Adiciona coluna tipo (pode dar erro se já existir, mas isso é ok)
ALTER TABLE carteiras ADD COLUMN tipo TEXT DEFAULT 'debito';

-- Adiciona coluna limiteCredito
ALTER TABLE carteiras ADD COLUMN limiteCredito REAL;

-- Adiciona coluna diaPagamento
ALTER TABLE carteiras ADD COLUMN diaPagamento INTEGER;

-- Atualiza registros existentes que não têm tipo definido
UPDATE carteiras SET tipo = 'debito' WHERE tipo IS NULL;

-- Cria índice para tipo se não existir
CREATE INDEX IF NOT EXISTS idx_carteiras_tipo ON carteiras(tipo);

