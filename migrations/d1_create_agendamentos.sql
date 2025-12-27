-- Migration: Criar tabela agendamentos no D1
-- Esta tabela armazena agendamentos de pagamentos e recebimentos

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  dataAgendamento TEXT NOT NULL,
  tipo TEXT DEFAULT 'pagamento', -- 'pagamento' ou 'recebimento'
  status TEXT DEFAULT 'pendente', -- 'pendente', 'pago', 'cancelado'
  categoria TEXT,
  notificado INTEGER DEFAULT 0, -- 0 = false, 1 = true
  recorrente INTEGER DEFAULT 0, -- 0 = false, 1 = true
  totalParcelas INTEGER,
  parcelaAtual INTEGER,
  agendamentoPaiId INTEGER,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_telefone ON agendamentos(telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_dataAgendamento ON agendamentos(dataAgendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_agendamentoPaiId ON agendamentos(agendamentoPaiId);
CREATE INDEX IF NOT EXISTS idx_agendamentos_recorrente ON agendamentos(recorrente);

