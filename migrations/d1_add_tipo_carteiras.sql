-- Migration: Adicionar coluna 'tipo' na tabela carteiras
-- Esta coluna define se a carteira é 'debito' ou 'credito'

-- SQLite não suporta IF NOT EXISTS para ALTER TABLE ADD COLUMN
-- Vamos tentar adicionar e ignorar o erro se já existir
-- Se der erro, significa que a coluna já existe

-- Adiciona coluna tipo com valor padrão 'debito'
ALTER TABLE carteiras ADD COLUMN tipo TEXT DEFAULT 'debito';

-- Atualiza registros existentes que não têm tipo definido
UPDATE carteiras SET tipo = 'debito' WHERE tipo IS NULL;

