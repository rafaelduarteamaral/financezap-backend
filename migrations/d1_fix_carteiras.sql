-- Migration: Corrigir tabela carteiras no D1
-- Adiciona colunas que podem estar faltando

-- Verifica e adiciona coluna 'tipo' se não existir
-- (SQLite não tem ALTER TABLE ADD COLUMN IF NOT EXISTS, então usamos uma abordagem diferente)
-- Primeiro, vamos tentar adicionar a coluna (pode dar erro se já existir, mas isso é ok)

-- Adiciona coluna tipo se não existir
-- Nota: SQLite não suporta IF NOT EXISTS para ALTER TABLE ADD COLUMN
-- Vamos tentar adicionar e ignorar o erro se já existir
ALTER TABLE carteiras ADD COLUMN tipo TEXT DEFAULT 'debito';

-- Adiciona outras colunas que podem estar faltando
ALTER TABLE carteiras ADD COLUMN limiteCredito REAL;
ALTER TABLE carteiras ADD COLUMN diaPagamento INTEGER;
ALTER TABLE carteiras ADD COLUMN padrao INTEGER DEFAULT 0;
ALTER TABLE carteiras ADD COLUMN ativo INTEGER DEFAULT 1;
ALTER TABLE carteiras ADD COLUMN criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE carteiras ADD COLUMN atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Cria índices se não existirem
CREATE INDEX IF NOT EXISTS idx_carteiras_telefone ON carteiras(telefone);
CREATE INDEX IF NOT EXISTS idx_carteiras_padrao ON carteiras(padrao);
CREATE INDEX IF NOT EXISTS idx_carteiras_ativo ON carteiras(ativo);
CREATE INDEX IF NOT EXISTS idx_carteiras_tipo ON carteiras(tipo);

