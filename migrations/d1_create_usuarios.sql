-- Migration: Criar tabela usuarios no D1
-- Esta tabela armazena informações dos usuários do sistema

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT,
  dataCadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trialExpiraEm DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial', -- 'trial', 'ativo', 'expirado'
  plano TEXT, -- 'mensal', 'trimestral', 'anual' - null se ainda em trial
  assinaturaEm DATETIME, -- Data da assinatura (quando assinar)
  templateAtivoId INTEGER, -- ID do template ativo
  carteiraPadraoId INTEGER, -- ID da carteira padrão
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);

