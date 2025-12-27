-- Migrations para melhorias de arquitetura (Fases 2 e 3)

-- Tabela de estados de conversação
CREATE TABLE IF NOT EXISTS estados_conversacao (
  telefone TEXT PRIMARY KEY,
  estado TEXT NOT NULL,
  dadosTemporarios TEXT, -- JSON
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiraEm DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_estados_expiraEm ON estados_conversacao(expiraEm);

-- Tabela de cache de IA
CREATE TABLE IF NOT EXISTS cache_ia (
  chave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  resultado TEXT NOT NULL, -- JSON
  timestamp INTEGER NOT NULL,
  ttl INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_tipo ON cache_ia(tipo);
CREATE INDEX IF NOT EXISTS idx_cache_timestamp ON cache_ia(timestamp);

-- Tabela de métricas de processamento
CREATE TABLE IF NOT EXISTS metricas_processamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  tipoMensagem TEXT NOT NULL,
  tempoProcessamento INTEGER NOT NULL, -- em ms
  sucesso INTEGER NOT NULL, -- 0 ou 1
  erro TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  detalhes TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_metricas_telefone ON metricas_processamento(telefone);
CREATE INDEX IF NOT EXISTS idx_metricas_timestamp ON metricas_processamento(timestamp);
CREATE INDEX IF NOT EXISTS idx_metricas_tipo ON metricas_processamento(tipoMensagem);

-- Tabela de queue de processamento
CREATE TABLE IF NOT EXISTS mensagens_queue (
  id TEXT PRIMARY KEY,
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL, -- 'pendente', 'processando', 'concluido', 'erro'
  tentativas INTEGER DEFAULT 0,
  resultado TEXT,
  erro TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON mensagens_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON mensagens_queue(timestamp);
CREATE INDEX IF NOT EXISTS idx_queue_telefone ON mensagens_queue(telefone);

-- Tabela de contexto de conversação persistente (melhoria da Fase 1)
CREATE TABLE IF NOT EXISTS conversacao_contexto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant'
  content TEXT NOT NULL,
  metadata TEXT, -- JSON com informações extras
  criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contexto_telefone ON conversacao_contexto(telefone);
CREATE INDEX IF NOT EXISTS idx_contexto_criadoEm ON conversacao_contexto(telefone, criadoEm);

