-- Migration: Adicionar coluna carteiraId na tabela transacoes
-- Esta coluna associa transações a carteiras

-- Adiciona coluna carteiraId (pode dar erro se já existir - isso é esperado)
ALTER TABLE transacoes ADD COLUMN carteiraId INTEGER;

-- Cria índice para carteiraId se não existir
CREATE INDEX IF NOT EXISTS idx_transacoes_carteiraId ON transacoes(carteiraId);

