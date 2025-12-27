-- Migration completa: Inicializa todas as tabelas necessárias no D1
-- Execute este arquivo no banco local para desenvolvimento

-- Tabela usuarios (já criada, mas incluída para garantir)
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT,
  dataCadastro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trialExpiraEm DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial',
  plano TEXT,
  assinaturaEm DATETIME,
  templateAtivoId INTEGER,
  carteiraPadraoId INTEGER,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);

-- Tabela transacoes (se não existir)
CREATE TABLE IF NOT EXISTS transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  tipo TEXT DEFAULT 'saida',
  metodo TEXT DEFAULT 'debito',
  dataHora TEXT NOT NULL,
  data TEXT NOT NULL,
  mensagemOriginal TEXT,
  carteiraId INTEGER,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transacoes_telefone ON transacoes(telefone);
CREATE INDEX IF NOT EXISTS idx_transacoes_data ON transacoes(data);
CREATE INDEX IF NOT EXISTS idx_transacoes_categoria ON transacoes(categoria);
CREATE INDEX IF NOT EXISTS idx_transacoes_tipo ON transacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_transacoes_metodo ON transacoes(metodo);
CREATE INDEX IF NOT EXISTS idx_transacoes_carteiraId ON transacoes(carteiraId);

-- Tabela numeros_registrados (se não existir)
CREATE TABLE IF NOT EXISTS numeros_registrados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL UNIQUE,
  primeiraMensagemEnviada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimaMensagemEnviada DATETIME,
  totalMensagensEnviadas INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_numeros_registrados_telefone ON numeros_registrados(telefone);

-- Tabela agendamentos (se não existir)
CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  dataAgendamento TEXT NOT NULL,
  tipo TEXT DEFAULT 'pagamento',
  status TEXT DEFAULT 'pendente',
  categoria TEXT,
  notificado INTEGER DEFAULT 0,
  recorrente INTEGER DEFAULT 0,
  totalParcelas INTEGER,
  parcelaAtual INTEGER,
  agendamentoPaiId INTEGER,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_telefone ON agendamentos(telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_dataAgendamento ON agendamentos(dataAgendamento);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_agendamentoPaiId ON agendamentos(agendamentoPaiId);
CREATE INDEX IF NOT EXISTS idx_agendamentos_recorrente ON agendamentos(recorrente);

-- Tabela categorias (se não existir)
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT,
  padrao INTEGER DEFAULT 0,
  tipo TEXT DEFAULT 'saida',
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categorias_telefone ON categorias(telefone);
CREATE INDEX IF NOT EXISTS idx_categorias_padrao ON categorias(padrao);

-- Tabela carteiras (se não existir)
CREATE TABLE IF NOT EXISTS carteiras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT DEFAULT 'debito',
  limiteCredito REAL,
  diaPagamento INTEGER,
  padrao INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_carteiras_telefone ON carteiras(telefone);
CREATE INDEX IF NOT EXISTS idx_carteiras_padrao ON carteiras(padrao);
CREATE INDEX IF NOT EXISTS idx_carteiras_ativo ON carteiras(ativo);
CREATE INDEX IF NOT EXISTS idx_carteiras_tipo ON carteiras(tipo);

-- Aliases de carteiras (para apelidos e aprendizado de correções)
CREATE TABLE IF NOT EXISTS carteira_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  carteiraId INTEGER NOT NULL,
  alias TEXT NOT NULL,
  frequenciaUso INTEGER DEFAULT 1,
  ultimoUso DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carteira_alias_unica ON carteira_aliases(telefone, alias);
CREATE INDEX IF NOT EXISTS idx_carteira_alias_carteira ON carteira_aliases(carteiraId);

-- Preferências financeiras (última carteira usada)
CREATE TABLE IF NOT EXISTS preferencias_financeiras (
  telefone TEXT PRIMARY KEY,
  ultimaCarteiraId INTEGER,
  ultimaAtualizacao DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pref_ultimaCarteira ON preferencias_financeiras(ultimaCarteiraId);

-- Tabela templates (se não existir)
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT DEFAULT 'custom',
  corPrimaria TEXT NOT NULL,
  corSecundaria TEXT NOT NULL,
  corDestaque TEXT NOT NULL,
  corFundo TEXT NOT NULL,
  corTexto TEXT NOT NULL,
  ativo INTEGER DEFAULT 0,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_templates_telefone ON templates(telefone);
CREATE INDEX IF NOT EXISTS idx_templates_ativo ON templates(ativo);

-- Tabela codigos_verificacao (se não existir)
CREATE TABLE IF NOT EXISTS codigos_verificacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  codigo TEXT NOT NULL,
  expiraEm DATETIME NOT NULL,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_codigos_verificacao_telefone ON codigos_verificacao(telefone);
CREATE INDEX IF NOT EXISTS idx_codigos_verificacao_expiraEm ON codigos_verificacao(expiraEm);

-- Outras tabelas de melhorias de arquitetura
CREATE TABLE IF NOT EXISTS estados_conversacao (
  telefone TEXT PRIMARY KEY,
  estado TEXT NOT NULL,
  dadosTemporarios TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiraEm DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_estados_expiraEm ON estados_conversacao(expiraEm);

CREATE TABLE IF NOT EXISTS cache_ia (
  chave TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  resultado TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  ttl INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_tipo ON cache_ia(tipo);
CREATE INDEX IF NOT EXISTS idx_cache_timestamp ON cache_ia(timestamp);

CREATE TABLE IF NOT EXISTS metricas_processamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  tipoMensagem TEXT NOT NULL,
  tempoProcessamento INTEGER NOT NULL,
  sucesso INTEGER NOT NULL,
  erro TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  detalhes TEXT
);

CREATE INDEX IF NOT EXISTS idx_metricas_telefone ON metricas_processamento(telefone);
CREATE INDEX IF NOT EXISTS idx_metricas_timestamp ON metricas_processamento(timestamp);
CREATE INDEX IF NOT EXISTS idx_metricas_tipo ON metricas_processamento(tipoMensagem);

CREATE TABLE IF NOT EXISTS mensagens_queue (
  id TEXT PRIMARY KEY,
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,
  tentativas INTEGER DEFAULT 0,
  resultado TEXT,
  erro TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON mensagens_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_timestamp ON mensagens_queue(timestamp);
CREATE INDEX IF NOT EXISTS idx_queue_telefone ON mensagens_queue(telefone);

CREATE TABLE IF NOT EXISTS conversacao_contexto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contexto_telefone ON conversacao_contexto(telefone);
CREATE INDEX IF NOT EXISTS idx_contexto_criadoEm ON conversacao_contexto(telefone, criadoEm);

CREATE TABLE IF NOT EXISTS contexto_conversacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  mensagens TEXT NOT NULL,
  ultimaAcao TEXT,
  ultimaAtualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contexto_telefone_conv ON contexto_conversacao(telefone);
CREATE INDEX IF NOT EXISTS idx_contexto_ultimaAtualizacao ON contexto_conversacao(ultimaAtualizacao);

CREATE TABLE IF NOT EXISTS confirmacoes_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  transacoes TEXT NOT NULL,
  messageId TEXT,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_confirmacoes_telefone ON confirmacoes_pendentes(telefone);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_timestamp ON confirmacoes_pendentes(timestamp);

