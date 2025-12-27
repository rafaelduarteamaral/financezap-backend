-- Migration: Criar tabela carteiras no D1
-- Esta tabela armazena as carteiras/bancos dos usuários

CREATE TABLE IF NOT EXISTS carteiras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'debito', -- 'debito' ou 'credito'
  limiteCredito REAL, -- Limite da conta de crédito (apenas para tipo "credito")
  diaPagamento INTEGER, -- Dia do mês para pagamento da fatura (apenas para tipo "credito", 1-31)
  padrao INTEGER NOT NULL DEFAULT 0, -- 0 = false, 1 = true (carteira padrão)
  ativo INTEGER NOT NULL DEFAULT 1, -- 0 = false, 1 = true (carteira ativa)
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_carteiras_telefone ON carteiras(telefone);
CREATE INDEX IF NOT EXISTS idx_carteiras_padrao ON carteiras(padrao);
CREATE INDEX IF NOT EXISTS idx_carteiras_ativo ON carteiras(ativo);
CREATE INDEX IF NOT EXISTS idx_carteiras_tipo ON carteiras(tipo);

