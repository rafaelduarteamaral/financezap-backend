-- Adiciona suporte a aliases e preferências de carteira para melhorar o acerto via WhatsApp

-- Tabela de aliases de carteira por telefone (permite múltiplos apelidos por carteira)
CREATE TABLE IF NOT EXISTS carteira_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  carteiraId INTEGER NOT NULL,
  alias TEXT NOT NULL,
  frequenciaUso INTEGER DEFAULT 1,
  ultimoUso DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Garante unicidade do alias por telefone
CREATE UNIQUE INDEX IF NOT EXISTS idx_carteira_alias_unica ON carteira_aliases(telefone, alias);
CREATE INDEX IF NOT EXISTS idx_carteira_alias_carteira ON carteira_aliases(carteiraId);

-- Preferências financeiras por telefone (última carteira usada)
CREATE TABLE IF NOT EXISTS preferencias_financeiras (
  telefone TEXT PRIMARY KEY,
  ultimaCarteiraId INTEGER,
  ultimaAtualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pref_ultimaCarteira ON preferencias_financeiras(ultimaCarteiraId);

