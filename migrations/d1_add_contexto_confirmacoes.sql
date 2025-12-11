-- Migration para adicionar tabelas de contexto de conversação e confirmações pendentes no D1
-- Execute este script no D1 Database do Cloudflare Workers
-- 
-- Estas tabelas garantem que o contexto de conversação e confirmações pendentes
-- sobrevivam a reinicializações do worker, melhorando a experiência do usuário

-- Tabela para armazenar contexto de conversação
CREATE TABLE IF NOT EXISTS contexto_conversacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  mensagens TEXT NOT NULL, -- JSON array de mensagens
  ultimaAcao TEXT, -- 'extraindo_transacao', 'confirmando', 'editando', 'pergunta'
  ultimaAtualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para armazenar confirmações pendentes
CREATE TABLE IF NOT EXISTS confirmacoes_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  transacoes TEXT NOT NULL, -- JSON array de transações para confirmar
  messageId TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_contexto_telefone ON contexto_conversacao(telefone);
CREATE INDEX IF NOT EXISTS idx_contexto_ultimaAtualizacao ON contexto_conversacao(ultimaAtualizacao);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_telefone ON confirmacoes_pendentes(telefone);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_timestamp ON confirmacoes_pendentes(timestamp);

-- Limpa registros antigos (mais de 1 hora) automaticamente via trigger
-- Nota: SQLite não suporta triggers de limpeza automática, então isso deve ser feito
-- manualmente ou via scheduled task no worker
