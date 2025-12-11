-- Migration para adicionar campos de recorrência em agendamentos no D1
-- Execute este script no D1 Database do Cloudflare Workers

ALTER TABLE agendamentos ADD COLUMN recorrente INTEGER DEFAULT 0;
ALTER TABLE agendamentos ADD COLUMN totalParcelas INTEGER;
ALTER TABLE agendamentos ADD COLUMN parcelaAtual INTEGER;
ALTER TABLE agendamentos ADD COLUMN agendamentoPaiId INTEGER;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_agendamentoPaiId ON agendamentos(agendamentoPaiId);
CREATE INDEX IF NOT EXISTS idx_agendamentos_recorrente ON agendamentos(recorrente);
