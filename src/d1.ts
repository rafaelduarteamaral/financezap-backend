// Utilidades para acessar o D1 no Cloudflare Workers (substitui Prisma no Worker)

// Interface para D1Database (compatível com Cloudflare Workers)
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec?(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = any>(): Promise<D1Result<T>>;
}

interface D1Result<T = any> {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    rows_read: number;
    rows_written: number;
    last_row_id: number;
    changed_db: boolean;
    changes: number;
  };
}

interface D1ExecResult {
  count: number;
  duration: number;
}

export interface NotificacaoRecord {
  id?: number;
  telefone: string;
  tipo: string; // 'transacao-nova', 'categoria-removida', etc.
  dados: string; // JSON string
  lida: number; // 0 = não lida, 1 = lida
  criadoEm: string;
}

export interface TransacaoRecord {
  id?: number;
  telefone: string;
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida';
  metodo: 'credito' | 'debito';
  dataHora: string;
  data: string;
  mensagemOriginal?: string | null;
}

export interface TransacoesResultado {
  transacoes: TransacaoRecord[];
  total: number;
}

export interface Estatisticas {
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalTransacoes: number;
  mediaGasto: number;
  maiorGasto: number;
  menorGasto: number;
  gastoHoje: number;
  gastoMes: number;
}

function normalizarTelefone(telefone: string): string {
  return telefone.replace('whatsapp:', '').trim();
}

// Função para criar variações de números brasileiros com dígito 9 opcional
function criarVariacoesDigito9(numero: string): string[] {
  const variacoes: string[] = [numero];
  
  // Remove caracteres não numéricos
  const apenasNumeros = numero.replace(/\D/g, '');
  
  // Se começa com 55 (código do Brasil)
  if (apenasNumeros.startsWith('55')) {
    const resto = apenasNumeros.substring(2); // Remove o 55
    
    // Se tem mais de 10 dígitos após o 55, pode ter o 9 opcional
    if (resto.length >= 10) {
      // Tenta adicionar/remover o 9 após o DDD (após os 2 primeiros dígitos do resto)
      const ddd = resto.substring(0, 2);
      const numeroSemDDD = resto.substring(2);
      
      // Se o número começa com 9, cria variação sem o 9
      if (numeroSemDDD.startsWith('9') && numeroSemDDD.length === 9) {
        const sem9 = `55${ddd}${numeroSemDDD.substring(1)}`;
        variacoes.push(sem9);
        variacoes.push(`+${sem9}`);
        variacoes.push(`whatsapp:+${sem9}`);
      }
      
      // Se o número não começa com 9 mas tem 8 dígitos, cria variação com 9
      if (!numeroSemDDD.startsWith('9') && numeroSemDDD.length === 8) {
        const com9 = `55${ddd}9${numeroSemDDD}`;
        variacoes.push(com9);
        variacoes.push(`+${com9}`);
        variacoes.push(`whatsapp:+${com9}`);
      }
    }
  }
  
  return variacoes;
}

function telefoneVariacoes(telefone: string): string[] {
  const limpo = normalizarTelefone(telefone);
  const semMais = limpo.replace(/^\+/, '');
  const comMais = `+${semMais}`;
  const comPrefixoWhats = `whatsapp:${comMais}`;
  const semPrefixoComMais = limpo; // Mantém o formato original normalizado
  
  // Cria variações básicas
  const variacoesBasicas = [
    limpo,           // +556181474690
    semMais,         // 556181474690
    comMais,         // +556181474690
    comPrefixoWhats, // whatsapp:+556181474690
  ];
  
  // Cria variações com/sem dígito 9 opcional (para números brasileiros)
  const variacoesDigito9 = criarVariacoesDigito9(semMais);
  
  // Combina todas as variações
  const todasVariacoes = [
    ...variacoesBasicas,
    ...variacoesDigito9,
    semPrefixoComMais
  ];
  
  const unicas = [...new Set(todasVariacoes)].filter(Boolean);
  console.log('🔍 telefoneVariacoes para', telefone, '->', unicas.length, 'variações');
  return unicas;
}

function montarWhere(filtros: {
  telefone?: string;
  dataInicio?: string;
  dataFim?: string;
  valorMin?: number;
  valorMax?: number;
  descricao?: string;
  categoria?: string;
}) {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (filtros.telefone) {
    const variacoes = telefoneVariacoes(filtros.telefone);
    console.log('🔍 Montando WHERE com variações:', variacoes);
    
    // Também cria variações normalizadas (sem whatsapp: e sem +)
    const variacoesNormalizadas = variacoes.map(v => normalizarTelefone(v));
    const todasVariacoes = [...new Set([...variacoes, ...variacoesNormalizadas])];
    console.log('🔍 Todas as variações (incluindo normalizadas):', todasVariacoes);
    console.log('🔍 Quantidade de variações:', todasVariacoes.length);
    
    if (todasVariacoes.length === 0) {
      console.warn('⚠️ Nenhuma variação criada para o telefone:', filtros.telefone);
    }
    
    const placeholders = todasVariacoes.map(() => 'telefone = ?').join(' OR ');
    where.push(`(${placeholders})`);
    params.push(...todasVariacoes);
    
    console.log('🔍 SQL WHERE clause gerado:', `(${placeholders})`);
    console.log('🔍 SQL params:', params.slice(0, 10)); // Mostra apenas os primeiros 10 params
  }

  if (filtros.dataInicio) {
    where.push('date(data) >= date(?)');
    params.push(filtros.dataInicio.split('T')[0]);
  }

  if (filtros.dataFim) {
    where.push('date(data) <= date(?)');
    params.push(filtros.dataFim.split('T')[0]);
  }

  if (filtros.valorMin !== undefined) {
    where.push('valor >= ?');
    params.push(filtros.valorMin);
  }

  if (filtros.valorMax !== undefined) {
    where.push('valor <= ?');
    params.push(filtros.valorMax);
  }

  if (filtros.descricao) {
    where.push('descricao LIKE ?');
    params.push(`%${filtros.descricao}%`);
  }

  if (filtros.categoria) {
    where.push('categoria = ?');
    params.push(filtros.categoria);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, params };
}

export async function salvarTransacao(
  db: D1Database,
  transacao: Omit<TransacaoRecord, 'id'>
): Promise<number> {
  const agora = new Date();
  const dataHora = transacao.dataHora || agora.toISOString();
  const data = transacao.data || dataHora.slice(0, 10);
  
  const telefoneNormalizado = normalizarTelefone(transacao.telefone);
  console.log('💾 D1: Salvando transação com telefone normalizado:', telefoneNormalizado);

  const result = await db
    .prepare(
      `INSERT INTO transacoes 
        (telefone, descricao, valor, categoria, tipo, metodo, dataHora, data, mensagemOriginal) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      telefoneNormalizado,
      transacao.descricao,
      transacao.valor,
      transacao.categoria || 'outros',
      transacao.tipo || 'saida',
      transacao.metodo || 'debito',
      dataHora,
      data,
      transacao.mensagemOriginal ?? null
    )
    .run();

  const id = Number(result.meta.last_row_id);
  console.log('✅ D1: Transação salva com ID:', id, 'telefone:', telefoneNormalizado);
  return id;
}

export async function buscarTransacoes(
  db: D1Database,
  filtros: {
    telefone?: string;
    dataInicio?: string;
    dataFim?: string;
    valorMin?: number;
    valorMax?: number;
    descricao?: string;
    categoria?: string;
    limit?: number;
    offset?: number;
  }
): Promise<TransacoesResultado> {
  // Log para debug
  if (filtros.telefone) {
    const variacoes = telefoneVariacoes(filtros.telefone);
    console.log('🔍 Buscando transações com variações:', variacoes);
  }
  
  const { whereClause, params } = montarWhere(filtros);
  const limit = filtros.limit && filtros.limit > 0 ? Math.min(filtros.limit, 100) : 20;
  const offset = filtros.offset && filtros.offset > 0 ? filtros.offset : 0;

  console.log('🔍 Executando COUNT com WHERE:', whereClause);
  console.log('🔍 Parâmetros do COUNT:', params);
  
  const totalRow = await db
    .prepare(`SELECT COUNT(*) as total FROM transacoes ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();
  
  console.log('🔍 Resultado do COUNT:', totalRow?.total ?? 0);

  console.log('🔍 Executando SELECT com WHERE:', whereClause);
  console.log('🔍 Parâmetros do SELECT:', [...params, limit, offset]);
  
  const rows = await db
    .prepare(
      `SELECT id, telefone, descricao, valor, categoria, tipo, metodo, dataHora, data, mensagemOriginal 
       FROM transacoes ${whereClause}
       ORDER BY datetime(dataHora) DESC 
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<TransacaoRecord>();
  
  console.log('🔍 Resultado do SELECT:', {
    quantidade: rows.results?.length ?? 0,
    telefonesEncontrados: rows.results?.map((t: any) => t.telefone).slice(0, 5) ?? []
  });

  return {
    total: totalRow?.total ?? 0,
    transacoes: (rows.results || []).map((t: any) => ({
      ...t,
      mensagemOriginal: t.mensagemOriginal ?? null,
      dataHora: t.dataHora ?? new Date().toISOString(),
      data: t.data ?? (t.dataHora ? t.dataHora.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      tipo: t.tipo === 'entrada' ? 'entrada' : 'saida',
      metodo: t.metodo === 'credito' ? 'credito' : 'debito',
    })),
  };
}

export async function calcularEstatisticas(
  db: D1Database,
  filtros: {
    telefone?: string;
    dataInicio?: string;
    dataFim?: string;
    valorMin?: number;
    valorMax?: number;
    descricao?: string;
    categoria?: string;
  } = {}
): Promise<Estatisticas> {
  const { whereClause, params } = montarWhere(filtros);

  const statsRow = await db
    .prepare(
      `SELECT
        COUNT(*) as totalTransacoes,
        SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as totalEntradas,
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as totalSaidas,
        AVG(valor) as mediaGasto,
        MAX(valor) as maiorGasto,
        MIN(valor) as menorGasto
      FROM transacoes
      ${whereClause}`
    )
    .bind(...params)
    .first<{
      totalTransacoes: number;
      totalEntradas: number;
      totalSaidas: number;
      mediaGasto: number;
      maiorGasto: number;
      menorGasto: number;
    }>();

  // Gasto hoje e no mês corrente
  const hojeIso = new Date().toISOString().slice(0, 10);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const mesIso = inicioMes.toISOString().slice(0, 10);

  const gastoHojeRow = await db
    .prepare(
      `SELECT 
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as gastoHoje
      FROM transacoes
      ${whereClause ? `${whereClause} AND` : 'WHERE'} date(data) = date(?)`
    )
    .bind(...params, hojeIso)
    .first<{ gastoHoje: number }>();

  const gastoMesRow = await db
    .prepare(
      `SELECT 
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as gastoMes
      FROM transacoes
      ${whereClause ? `${whereClause} AND` : 'WHERE'} date(data) >= date(?)`
    )
    .bind(...params, mesIso)
    .first<{ gastoMes: number }>();

  const totalEntradas = statsRow?.totalEntradas || 0;
  const totalSaidas = statsRow?.totalSaidas || 0;

  return {
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    totalTransacoes: statsRow?.totalTransacoes || 0,
    mediaGasto: statsRow?.mediaGasto || 0,
    maiorGasto: statsRow?.maiorGasto || 0,
    menorGasto: statsRow?.menorGasto || 0,
    gastoHoje: gastoHojeRow?.gastoHoje || 0,
    gastoMes: gastoMesRow?.gastoMes || 0,
  };
}

export async function gastosPorDia(
  db: D1Database,
  telefone?: string,
  dias: number = 30
): Promise<Array<{ data: string; entradas: number; saidas: number; saldo: number }>> {
  const filtros: any = {};
  if (telefone) filtros.telefone = telefone;

  const { whereClause, params } = montarWhere(filtros);

  const rows = await db
    .prepare(
      `SELECT 
        data,
        SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as entradas,
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as saidas
      FROM transacoes
      ${whereClause}
      GROUP BY data
      ORDER BY date(data) DESC
      LIMIT ?`
    )
    .bind(...params, dias)
    .all<{ data: string; entradas: number; saidas: number }>();

  return (rows.results || []).map((row: any) => ({
    data: row.data,
    entradas: row.entradas || 0,
    saidas: row.saidas || 0,
    saldo: (row.entradas || 0) - (row.saidas || 0),
  }));
}

export async function listarTelefones(
  db: D1Database
): Promise<Array<{ telefone: string; total: number; totalGasto: number }>> {
  const rows = await db
    .prepare(
      `SELECT telefone, COUNT(*) as total,
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as totalGasto
       FROM transacoes
       GROUP BY telefone
       ORDER BY total DESC
       LIMIT 100`
    )
    .all<{ telefone: string; total: number; totalGasto: number }>();

  return rows.results || [];
}

export async function resumoPorTelefone(
  db: D1Database,
  telefone: string
): Promise<{
  telefone: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalTransacoes: number;
}> {
  const stats = await calcularEstatisticas(db, { telefone });
  return {
    telefone: normalizarTelefone(telefone),
    totalEntradas: stats.totalEntradas,
    totalSaidas: stats.totalSaidas,
    saldo: stats.saldo,
    totalTransacoes: stats.totalTransacoes,
  };
}

export async function registrarNumero(db: D1Database, telefone: string): Promise<void> {
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  await db
    .prepare(
      `INSERT INTO numeros_registrados (telefone, primeiraMensagemEnviada, totalMensagensEnviadas)
       VALUES (?, CURRENT_TIMESTAMP, 1)
       ON CONFLICT(telefone) DO UPDATE SET 
         ultimaMensagemEnviada = CURRENT_TIMESTAMP,
         totalMensagensEnviadas = COALESCE(totalMensagensEnviadas, 0) + 1`
    )
    .bind(preferida)
    .run();
}

export async function removerTransacao(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM transacoes WHERE id = ?').bind(id).run();
  return (result.meta.changes || 0) > 0;
}

// Funções de gerenciamento de usuários
export async function buscarUsuarioPorTelefone(
  db: D1Database,
  telefone: string
): Promise<{
  id: number;
  telefone: string;
  nome: string;
  email: string | null;
  dataCadastro: string;
  trialExpiraEm: string;
  status: string;
  assinaturaEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
} | null> {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const variacoes = telefoneVariacoes(telefone);
  
  for (const variacao of variacoes) {
    const result = await db
      .prepare('SELECT * FROM usuarios WHERE telefone = ?')
      .bind(variacao)
      .first<{
        id: number;
        telefone: string;
        nome: string;
        email: string | null;
        dataCadastro: string;
        trialExpiraEm: string;
        status: string;
        assinaturaEm: string | null;
        criadoEm: string;
        atualizadoEm: string;
      }>();
    
    if (result) return result;
  }
  
  return null;
}

export async function criarUsuario(
  db: D1Database,
  dados: {
    telefone: string;
    nome: string;
    email?: string | null;
    trialExpiraEm: Date;
  }
): Promise<number> {
  const telefoneNormalizado = normalizarTelefone(dados.telefone);
  const variacoes = telefoneVariacoes(dados.telefone);
  const preferida = variacoes[0];
  
  const result = await db
    .prepare(
      `INSERT INTO usuarios (telefone, nome, email, dataCadastro, trialExpiraEm, status, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'trial', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(
      preferida,
      dados.nome.trim(),
      dados.email?.trim() || null,
      dados.trialExpiraEm.toISOString()
    )
    .run();
  
  return Number(result.meta.last_row_id);
}

export async function atualizarUsuarioStatus(
  db: D1Database,
  telefone: string,
  status: string
): Promise<boolean> {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const variacoes = telefoneVariacoes(telefone);
  
  for (const variacao of variacoes) {
    const result = await db
      .prepare('UPDATE usuarios SET status = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE telefone = ?')
      .bind(status, variacao)
      .run();
    
    if ((result.meta.changes || 0) > 0) return true;
  }
  
  return false;
}

export async function atualizarUsuarioPerfil(
  db: D1Database,
  telefone: string,
  dados: { nome?: string; email?: string | null }
): Promise<boolean> {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const variacoes = telefoneVariacoes(telefone);
  
  const updates: string[] = [];
  const params: Array<string | null> = [];
  
  if (dados.nome !== undefined) {
    updates.push('nome = ?');
    params.push(dados.nome.trim());
  }
  
  if (dados.email !== undefined) {
    updates.push('email = ?');
    params.push(dados.email?.trim() || null);
  }
  
  if (updates.length === 0) return false;
  
  updates.push('atualizadoEm = CURRENT_TIMESTAMP');
  
  for (const variacao of variacoes) {
    const result = await db
      .prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE telefone = ?`)
      .bind(...params, variacao)
      .run();
    
    if ((result.meta.changes || 0) > 0) return true;
  }
  
  return false;
}

export async function excluirTodosDadosUsuario(
  db: D1Database,
  telefone: string
): Promise<{ sucesso: boolean; dadosRemovidos?: { transacoes: number; agendamentos: number; categorias: number; usuarios: number; numerosRegistrados: number } }> {
  const telefoneNormalizado = normalizarTelefone(telefone);
  const variacoes = telefoneVariacoes(telefone);
  
  let totalTransacoes = 0;
  let totalAgendamentos = 0;
  let totalCategorias = 0;
  let totalUsuarios = 0;
  let totalNumerosRegistrados = 0;
  
  try {
    for (const variacao of variacoes) {
      // Remove transações e conta quantas foram removidas
      const resultTransacoes = await db.prepare('DELETE FROM transacoes WHERE telefone = ?').bind(variacao).run();
      totalTransacoes += resultTransacoes.meta.changes || 0;
      
      // Remove agendamentos e conta quantos foram removidos
      const resultAgendamentos = await db.prepare('DELETE FROM agendamentos WHERE telefone = ?').bind(variacao).run();
      totalAgendamentos += resultAgendamentos.meta.changes || 0;
      
      // Remove categorias personalizadas e conta quantas foram removidas
      const resultCategorias = await db.prepare('DELETE FROM categorias WHERE telefone = ? AND padrao = 0').bind(variacao).run();
      totalCategorias += resultCategorias.meta.changes || 0;
      
      // Remove número registrado e conta quantos foram removidos
      const resultNumeros = await db.prepare('DELETE FROM numeros_registrados WHERE telefone = ?').bind(variacao).run();
      totalNumerosRegistrados += resultNumeros.meta.changes || 0;
      
      // Remove usuário e conta quantos foram removidos
      const resultUsuarios = await db.prepare('DELETE FROM usuarios WHERE telefone = ?').bind(variacao).run();
      totalUsuarios += resultUsuarios.meta.changes || 0;
    }
    
    return {
      sucesso: true,
      dadosRemovidos: {
        transacoes: totalTransacoes,
        agendamentos: totalAgendamentos,
        categorias: totalCategorias,
        usuarios: totalUsuarios,
        numerosRegistrados: totalNumerosRegistrados
      }
    };
  } catch (error) {
    console.error('Erro ao excluir dados do usuário:', error);
    return { sucesso: false };
  }
}

// ========== FUNÇÕES DE CATEGORIAS ==========

export interface CategoriaRecord {
  id: number;
  telefone: string | null;
  nome: string;
  descricao: string | null;
  cor: string | null;
  padrao: number; // 0 ou 1 (SQLite não tem boolean)
  tipo: string;
  criadoEm: string;
  atualizadoEm: string;
}

// Categorias padrão do sistema
const CATEGORIAS_PADRAO_D1 = [
  // Saídas
  { nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes', tipo: 'saida', cor: '#FF6B6B' },
  { nome: 'Transporte', descricao: 'Combustível, passagens, táxi', tipo: 'saida', cor: '#4ECDC4' },
  { nome: 'Moradia', descricao: 'Aluguel, condomínio, água, luz', tipo: 'saida', cor: '#45B7D1' },
  { nome: 'Saúde', descricao: 'Médicos, remédios, plano de saúde', tipo: 'saida', cor: '#FFA07A' },
  { nome: 'Educação', descricao: 'Cursos, livros, mensalidades', tipo: 'saida', cor: '#98D8C8' },
  { nome: 'Lazer', descricao: 'Cinema, viagens, entretenimento', tipo: 'saida', cor: '#F7DC6F' },
  { nome: 'Compras', descricao: 'Roupas, eletrônicos, supermercado', tipo: 'saida', cor: '#BB8FCE' },
  { nome: 'Outros', descricao: 'Outras despesas', tipo: 'saida', cor: '#95A5A6' },
  
  // Entradas
  { nome: 'Salário', descricao: 'Rendimento do trabalho', tipo: 'entrada', cor: '#52BE80' },
  { nome: 'Freelance', descricao: 'Trabalhos autônomos', tipo: 'entrada', cor: '#5DADE2' },
  { nome: 'Investimentos', descricao: 'Dividendos, juros', tipo: 'entrada', cor: '#F4D03F' },
  { nome: 'Vendas', descricao: 'Venda de produtos ou serviços', tipo: 'entrada', cor: '#85C1E2' },
  { nome: 'Outros', descricao: 'Outras receitas', tipo: 'entrada', cor: '#A9DFBF' },
];

// Inicializar categorias padrão no D1
async function inicializarCategoriasPadraoD1(db: D1Database): Promise<void> {
  try {
    // Verifica se já existem categorias padrão
    const categoriasExistentes = await db
      .prepare('SELECT COUNT(*) as count FROM categorias WHERE padrao = 1')
      .first<{ count: number }>();
    
    const count = categoriasExistentes?.count || 0;
    
    if (count === 0) {
      console.log('📋 Criando categorias padrão no D1...');
      
      for (const cat of CATEGORIAS_PADRAO_D1) {
        // Verifica se já existe antes de criar
        const existente = await db
          .prepare('SELECT id FROM categorias WHERE padrao = 1 AND nome = ?')
          .bind(cat.nome)
          .first();
        
        if (!existente) {
          await db
            .prepare(`
              INSERT INTO categorias (telefone, nome, descricao, cor, padrao, tipo, criadoEm, atualizadoEm)
              VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `)
            .bind(null, cat.nome, cat.descricao, cat.cor, cat.tipo)
            .run();
        }
      }
      
      console.log(`✅ ${CATEGORIAS_PADRAO_D1.length} categorias padrão criadas no D1!`);
    }
  } catch (error: any) {
    console.error('❌ Erro ao inicializar categorias padrão no D1:', error);
    // Não lança erro para não quebrar a busca
  }
}

export async function buscarCategoriasD1(
  db: D1Database,
  telefone: string
): Promise<CategoriaRecord[]> {
  // Garante que as categorias padrão existem
  await inicializarCategoriasPadraoD1(db);
  
  const variacoes = telefoneVariacoes(telefone);
  
  // Busca categorias do usuário e categorias padrão (padrao = 1)
  const categorias = await db
    .prepare(`
      SELECT * FROM categorias 
      WHERE telefone IN (${variacoes.map(() => '?').join(',')}) OR padrao = 1
      ORDER BY padrao DESC, nome ASC
    `)
    .bind(...variacoes)
    .all<CategoriaRecord>();
  
  return categorias.results || [];
}

export async function criarCategoriaD1(
  db: D1Database,
  telefone: string,
  dados: { nome: string; descricao?: string; cor?: string; tipo?: string }
): Promise<number> {
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  
  // Verifica se já existe
  const existente = await db
    .prepare('SELECT id FROM categorias WHERE telefone = ? AND nome = ?')
    .bind(preferida, dados.nome.trim())
    .first();
  
  if (existente) {
    throw new Error('Já existe uma categoria com este nome');
  }
  
  const result = await db
    .prepare(`
      INSERT INTO categorias (telefone, nome, descricao, cor, padrao, tipo, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      preferida,
      dados.nome.trim(),
      dados.descricao?.trim() || null,
      dados.cor?.trim() || null,
      dados.tipo || 'saida'
    )
    .run();
  
  return Number(result.meta.last_row_id);
}

export async function atualizarCategoriaD1(
  db: D1Database,
  id: number,
  telefone: string,
  dados: { nome?: string; descricao?: string; cor?: string; tipo?: string }
): Promise<boolean> {
  const categoria = await db
    .prepare('SELECT * FROM categorias WHERE id = ?')
    .bind(id)
    .first<CategoriaRecord>();
  
  if (!categoria) {
    throw new Error('Categoria não encontrada');
  }
  
  // PROTEÇÃO CRÍTICA: Nunca permite atualizar categorias padrão, mesmo que alguém tente burlar
  if (categoria.padrao === 1) {
    console.warn(`🚫 Tentativa de atualizar categoria padrão bloqueada! ID: ${id}, Nome: ${categoria.nome}`);
    throw new Error('Não é possível atualizar categorias padrão do sistema');
  }
  
  // Verifica se a categoria pertence ao usuário
  const variacoes = telefoneVariacoes(telefone);
  const telefoneCorresponde = variacoes.includes(categoria.telefone || '');
  
  if (!telefoneCorresponde) {
    throw new Error('Você não tem permissão para atualizar esta categoria');
  }
  
  const updates: string[] = [];
  const params: Array<string | null> = [];
  
  if (dados.nome !== undefined) {
    updates.push('nome = ?');
    params.push(dados.nome.trim());
  }
  if (dados.descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(dados.descricao?.trim() || null);
  }
  if (dados.cor !== undefined) {
    updates.push('cor = ?');
    params.push(dados.cor?.trim() || null);
  }
  if (dados.tipo !== undefined) {
    updates.push('tipo = ?');
    params.push(dados.tipo);
  }
  
  if (updates.length === 0) return false;
  
  updates.push('atualizadoEm = CURRENT_TIMESTAMP');
  
  await db
    .prepare(`UPDATE categorias SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
  
  return true;
}

export async function removerCategoriaD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<boolean> {
  const categoria = await db
    .prepare('SELECT * FROM categorias WHERE id = ?')
    .bind(id)
    .first<CategoriaRecord>();
  
  if (!categoria) {
    throw new Error('Categoria não encontrada');
  }
  
  // PROTEÇÃO CRÍTICA: Nunca permite remover categorias padrão, mesmo que alguém tente burlar
  if (categoria.padrao === 1) {
    console.warn(`🚫 Tentativa de remover categoria padrão bloqueada! ID: ${id}, Nome: ${categoria.nome}`);
    throw new Error('Não é possível remover categorias padrão do sistema');
  }
  
  // Verifica se a categoria pertence ao usuário
  const variacoes = telefoneVariacoes(telefone);
  const telefoneCorresponde = variacoes.includes(categoria.telefone || '');
  
  if (!telefoneCorresponde) {
    throw new Error('Você não tem permissão para remover esta categoria');
  }
  
  // PROTEÇÃO EXTRA: SQL também bloqueia categorias padrão (proteção em múltiplas camadas)
  const result = await db
    .prepare('DELETE FROM categorias WHERE id = ? AND padrao = 0')
    .bind(id)
    .run();
  
  // Verifica se realmente deletou (proteção extra)
  if ((result.meta.changes || 0) === 0) {
    // Se não deletou, verifica novamente se é padrão (proteção contra race condition)
    const categoriaVerificada = await db
      .prepare('SELECT padrao FROM categorias WHERE id = ?')
      .bind(id)
      .first<{ padrao: number }>();
    
    if (categoriaVerificada && categoriaVerificada.padrao === 1) {
      throw new Error('Não é possível remover categorias padrão do sistema');
    }
    
    throw new Error('Erro ao remover categoria');
  }
  
  return true;
}

// ========== FUNÇÕES DE AGENDAMENTOS ==========

export interface AgendamentoRecord {
  id: number;
  telefone: string;
  descricao: string;
  valor: number;
  dataAgendamento: string;
  tipo: string;
  status: string;
  categoria: string | null;
  notificado: number; // 0 ou 1
  criadoEm: string;
  atualizadoEm: string;
}

export async function buscarAgendamentosD1(
  db: D1Database,
  telefone: string,
  filtros?: { status?: string; dataInicio?: string; dataFim?: string }
): Promise<AgendamentoRecord[]> {
  const variacoes = telefoneVariacoes(telefone);
  
  if (variacoes.length === 0) {
    return [];
  }
  
  let query = `SELECT * FROM agendamentos WHERE telefone IN (${variacoes.map(() => '?').join(',')})`;
  const params: Array<string> = [...variacoes];
  
  if (filtros?.status) {
    query += ' AND status = ?';
    params.push(filtros.status);
  }
  if (filtros?.dataInicio) {
    query += ' AND date(dataAgendamento) >= date(?)';
    params.push(filtros.dataInicio);
  }
  if (filtros?.dataFim) {
    query += ' AND date(dataAgendamento) <= date(?)';
    params.push(filtros.dataFim);
  }
  
  query += ' ORDER BY date(dataAgendamento) ASC';
  
  try {
    const result = await db.prepare(query).bind(...params).all<AgendamentoRecord>();
    return result.results || [];
  } catch (error: any) {
    console.error('Erro ao buscar agendamentos:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

export async function buscarAgendamentoPorIdD1(
  db: D1Database,
  id: number
): Promise<AgendamentoRecord | null> {
  const result = await db
    .prepare('SELECT * FROM agendamentos WHERE id = ?')
    .bind(id)
    .first<AgendamentoRecord>();
  
  return result || null;
}

export async function criarAgendamentoD1(
  db: D1Database,
  dados: {
    telefone: string;
    descricao: string;
    valor: number;
    dataAgendamento: string;
    tipo: string;
    categoria?: string;
  }
): Promise<number> {
  const variacoes = telefoneVariacoes(dados.telefone);
  const preferida = variacoes[0];
  
  const result = await db
    .prepare(`
      INSERT INTO agendamentos 
      (telefone, descricao, valor, dataAgendamento, tipo, status, categoria, notificado, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, ?, 'pendente', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      preferida,
      dados.descricao,
      dados.valor,
      dados.dataAgendamento,
      dados.tipo,
      dados.categoria || 'outros'
    )
    .run();
  
  return Number(result.meta.last_row_id);
}

export async function atualizarStatusAgendamentoD1(
  db: D1Database,
  id: number,
  status: string
): Promise<boolean> {
  const result = await db
    .prepare('UPDATE agendamentos SET status = ?, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, id)
    .run();
  
  return (result.meta.changes || 0) > 0;
}

export async function removerAgendamentoD1(
  db: D1Database,
  id: number
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM agendamentos WHERE id = ?')
    .bind(id)
    .run();
  
  return (result.meta.changes || 0) > 0;
}

// ========== NOTIFICAÇÕES (para SSE fallback) ==========

// Cria a tabela de notificações se não existir
export async function criarTabelaNotificacoes(db: D1Database): Promise<void> {
  try {
    // Executa queries separadamente para evitar problemas com db.exec()
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telefone TEXT NOT NULL,
        tipo TEXT NOT NULL,
        dados TEXT NOT NULL,
        lida INTEGER NOT NULL DEFAULT 0,
        criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    // Cria índices separadamente
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_notificacoes_telefone ON notificacoes(telefone)').run();
    } catch (e) {
      // Índice pode já existir, ignora erro
      console.log('   ℹ️  Índice idx_notificacoes_telefone já existe ou erro ao criar');
    }
    
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida)').run();
    } catch (e) {
      // Índice pode já existir, ignora erro
      console.log('   ℹ️  Índice idx_notificacoes_lida já existe ou erro ao criar');
    }
  } catch (error: any) {
    // Se a tabela já existe, não é um erro crítico
    if (error.message && error.message.includes('already exists')) {
      console.log('   ℹ️  Tabela notificacoes já existe');
      return;
    }
    console.error('❌ Erro ao criar tabela notificacoes:', error);
    throw error;
  }
}

// Salva uma notificação no D1
export async function salvarNotificacaoD1(
  db: D1Database,
  telefone: string,
  tipo: string,
  dados: any
): Promise<number> {
  // Garante que a tabela existe
  await criarTabelaNotificacoes(db);
  
  const dadosJson = JSON.stringify(dados);
  const result = await db
    .prepare('INSERT INTO notificacoes (telefone, tipo, dados, lida) VALUES (?, ?, ?, 0)')
    .bind(telefone, tipo, dadosJson)
    .run();
  
  return Number(result.meta.last_row_id);
}

// Busca notificações não lidas para um telefone
export async function buscarNotificacoesNaoLidasD1(
  db: D1Database,
  telefone: string
): Promise<NotificacaoRecord[]> {
  try {
    await criarTabelaNotificacoes(db);
    
    if (!db) {
      console.error('❌ Database não disponível em buscarNotificacoesNaoLidasD1');
      return [];
    }
    
    const result = await db
      .prepare('SELECT * FROM notificacoes WHERE telefone = ? AND lida = 0 ORDER BY criadoEm DESC LIMIT 50')
      .bind(telefone)
      .all<NotificacaoRecord>();
    
    if (!result) {
      console.warn('⚠️ Resultado da query de notificações é null/undefined');
      return [];
    }
    
    if (!result.results) {
      console.warn('⚠️ result.results é null/undefined');
      return [];
    }
    
    // Valida e filtra resultados inválidos
    return result.results.filter((not: any) => {
      if (!not || typeof not !== 'object') {
        return false;
      }
      // Valida campos obrigatórios
      return not.hasOwnProperty('telefone') && not.hasOwnProperty('tipo');
    });
  } catch (error: any) {
    console.error('❌ Erro ao buscar notificações:', error);
    console.error('   Stack:', error.stack);
    return [];
  }
}

// Marca notificações como lidas
export async function marcarNotificacoesComoLidasD1(
  db: D1Database,
  telefone: string,
  ids?: number[]
): Promise<number> {
  await criarTabelaNotificacoes(db);
  
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const result = await db
      .prepare(`UPDATE notificacoes SET lida = 1 WHERE telefone = ? AND id IN (${placeholders})`)
      .bind(telefone, ...ids)
      .run();
    return result.meta.changes || 0;
  } else {
    // Marca todas como lidas
    const result = await db
      .prepare('UPDATE notificacoes SET lida = 1 WHERE telefone = ? AND lida = 0')
      .bind(telefone)
      .run();
    return result.meta.changes || 0;
  }
}

// Remove notificações antigas (mais de 24 horas)
export async function limparNotificacoesAntigasD1(db: D1Database): Promise<number> {
  await criarTabelaNotificacoes(db);
  
  const result = await db
    .prepare('DELETE FROM notificacoes WHERE lida = 1 AND criadoEm < datetime("now", "-1 day")')
    .run();
  
  return result.meta.changes || 0;
}

// ========== CÓDIGOS DE VERIFICAÇÃO ==========

export interface CodigoVerificacaoRecord {
  telefone: string;
  codigo: string;
  criadoEm: string;
  expiraEm: string;
}

// Cria a tabela de códigos de verificação se não existir
export async function criarTabelaCodigosVerificacao(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS codigos_verificacao (
        telefone TEXT NOT NULL PRIMARY KEY,
        codigo TEXT NOT NULL,
        criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiraEm TEXT NOT NULL
      )
    `).run();
    
    // Cria índice para limpeza de códigos expirados
    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_codigos_verificacao_expiraEm ON codigos_verificacao(expiraEm)').run();
    } catch (e) {
      // Índice pode já existir, ignora erro
      console.log('   ℹ️  Índice idx_codigos_verificacao_expiraEm já existe ou erro ao criar');
    }
  } catch (error: any) {
    // Se a tabela já existe, não é um erro crítico
    if (error.message && error.message.includes('already exists')) {
      console.log('   ℹ️  Tabela codigos_verificacao já existe');
      return;
    }
    console.error('❌ Erro ao criar tabela codigos_verificacao:', error);
    throw error;
  }
}

// Salva um código de verificação no D1
export async function salvarCodigoVerificacaoD1(
  db: D1Database,
  telefone: string,
  codigo: string,
  expiraEm: Date
): Promise<void> {
  await criarTabelaCodigosVerificacao(db);
  
  // Remove código antigo se existir (upsert)
  await db
    .prepare('DELETE FROM codigos_verificacao WHERE telefone = ?')
    .bind(telefone)
    .run();
  
  // Insere novo código
  await db
    .prepare('INSERT INTO codigos_verificacao (telefone, codigo, criadoEm, expiraEm) VALUES (?, ?, CURRENT_TIMESTAMP, ?)')
    .bind(telefone, codigo, expiraEm.toISOString())
    .run();
  
  console.log(`✅ D1: Código de verificação salvo para ${telefone}: ${codigo} (expira em ${expiraEm.toLocaleString('pt-BR')})`);
}

// Busca um código de verificação no D1
export async function buscarCodigoVerificacaoD1(
  db: D1Database,
  telefone: string
): Promise<CodigoVerificacaoRecord | null> {
  await criarTabelaCodigosVerificacao(db);
  
  const result = await db
    .prepare('SELECT * FROM codigos_verificacao WHERE telefone = ?')
    .bind(telefone)
    .first<CodigoVerificacaoRecord>();
  
  return result || null;
}

// Verifica e remove um código de verificação do D1
export async function verificarCodigoD1(
  db: D1Database,
  telefone: string,
  codigo: string
): Promise<boolean> {
  await criarTabelaCodigosVerificacao(db);
  
  const codigoSalvo = await buscarCodigoVerificacaoD1(db, telefone);
  
  if (!codigoSalvo) {
    // Tenta buscar com variações do telefone
    const telefoneSemWhatsapp = telefone.replace('whatsapp:', '');
    const telefoneComWhatsapp = telefone.startsWith('whatsapp:') ? telefone : `whatsapp:${telefone}`;
    const telefoneSemMais = telefone.replace(/\+/g, '');
    
    const variacoes = [telefoneSemWhatsapp, telefoneComWhatsapp, telefoneSemMais];
    for (const variacao of variacoes) {
      const codigoVariacao = await buscarCodigoVerificacaoD1(db, variacao);
      if (codigoVariacao) {
        // Move o código para o formato correto
        await db
          .prepare('UPDATE codigos_verificacao SET telefone = ? WHERE telefone = ?')
          .bind(telefone, variacao)
          .run();
        
        // Continua a verificação
        const codigoSalvoCorrigido = await buscarCodigoVerificacaoD1(db, telefone);
        if (!codigoSalvoCorrigido) return false;
        
        // Verifica se expirou
        if (new Date() > new Date(codigoSalvoCorrigido.expiraEm)) {
          await db
            .prepare('DELETE FROM codigos_verificacao WHERE telefone = ?')
            .bind(telefone)
            .run();
          console.log(`❌ Código expirado para ${telefone}`);
          return false;
        }
        
        // Verifica se o código está correto
        const codigoNormalizado = String(codigo).trim().replace(/\s/g, '');
        if (codigoSalvoCorrigido.codigo !== codigoNormalizado) {
          console.log(`❌ Código incorreto para ${telefone}. Esperado: "${codigoSalvoCorrigido.codigo}", Recebido: "${codigoNormalizado}"`);
          return false;
        }
        
        // Código válido - remove
        await db
          .prepare('DELETE FROM codigos_verificacao WHERE telefone = ?')
          .bind(telefone)
          .run();
        console.log(`✅ Código verificado com sucesso para ${telefone}`);
        return true;
      }
    }
    
    console.log(`❌ Nenhum código encontrado para "${telefone}"`);
    return false;
  }
  
  // Verifica se expirou
  if (new Date() > new Date(codigoSalvo.expiraEm)) {
    await db
      .prepare('DELETE FROM codigos_verificacao WHERE telefone = ?')
      .bind(telefone)
      .run();
    console.log(`❌ Código expirado para ${telefone}`);
    return false;
  }
  
  // Verifica se o código está correto
  const codigoNormalizado = String(codigo).trim().replace(/\s/g, '');
  if (codigoSalvo.codigo !== codigoNormalizado) {
    console.log(`❌ Código incorreto para ${telefone}. Esperado: "${codigoSalvo.codigo}", Recebido: "${codigoNormalizado}"`);
    return false;
  }
  
  // Código válido - remove
  await db
    .prepare('DELETE FROM codigos_verificacao WHERE telefone = ?')
    .bind(telefone)
    .run();
  console.log(`✅ Código verificado com sucesso para ${telefone}`);
  return true;
}

// Remove códigos expirados (limpeza periódica)
export async function limparCodigosExpiradosD1(db: D1Database): Promise<number> {
  await criarTabelaCodigosVerificacao(db);
  
  const result = await db
    .prepare('DELETE FROM codigos_verificacao WHERE expiraEm < CURRENT_TIMESTAMP')
    .run();
  
  const removidos = result.meta.changes || 0;
  if (removidos > 0) {
    console.log(`🧹 D1: ${removidos} código(s) expirado(s) removido(s)`);
  }
  
  return removidos;
}

// ========== TEMPLATES ==========

export interface TemplateRecord {
  id?: number;
  telefone: string;
  nome: string;
  tipo: string; // 'dark', 'light', 'custom'
  corPrimaria: string;
  corSecundaria: string;
  corDestaque: string;
  corFundo: string;
  corTexto: string;
  ativo: number; // 0 = false, 1 = true
  criadoEm: string;
  atualizadoEm: string;
}

// Cria templates padrão se não existirem
export async function criarTemplatesPadraoD1(
  db: D1Database,
  telefone: string
): Promise<void> {
  try {
    const variacoes = telefoneVariacoes(telefone);
    const preferida = variacoes[0];
    
    // Verifica se já existem templates para este usuário
    const templatesExistentes = await db
      .prepare('SELECT id FROM templates WHERE telefone = ?')
      .bind(preferida)
      .all<TemplateRecord>();
    
    if (templatesExistentes.results && templatesExistentes.results.length > 0) {
      return; // Já existem templates
    }
  } catch (error: any) {
    // Se a tabela não existir, ignora o erro (será criada depois)
    if (error.message && error.message.includes('no such table')) {
      console.warn('⚠️ Tabela templates ainda não existe, será criada automaticamente');
      return;
    }
    throw error;
  }
  
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  
  // Template Dark
  await db
    .prepare(`
      INSERT INTO templates (telefone, nome, tipo, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto, ativo, criadoEm, atualizadoEm)
      VALUES (?, 'Dark', 'dark', '#3B82F6', '#8B5CF6', '#10B981', '#1E293B', '#F1F5F9', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(preferida)
    .run();
  
  // Template Light
  const resultLight = await db
    .prepare(`
      INSERT INTO templates (telefone, nome, tipo, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto, ativo, criadoEm, atualizadoEm)
      VALUES (?, 'Light', 'light', '#3B82F6', '#8B5CF6', '#10B981', '#F9FAFB', '#111827', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(preferida)
    .run();
  
  const templateLightId = Number(resultLight.meta.last_row_id);
  
  // Atualiza o usuário com o template ativo
  await db
    .prepare('UPDATE usuarios SET templateAtivoId = ? WHERE telefone = ?')
    .bind(templateLightId, preferida)
    .run();
  
  console.log(`✅ Templates padrão criados para: ${preferida}`);
}

export async function buscarTemplatesD1(
  db: D1Database,
  telefone: string
): Promise<TemplateRecord[]> {
  // Garante que os templates padrão existem
  await criarTemplatesPadraoD1(db, telefone);
  
  const variacoes = telefoneVariacoes(telefone);
  
  const templates = await db
    .prepare(`
      SELECT * FROM templates 
      WHERE telefone IN (${variacoes.map(() => '?').join(',')})
      ORDER BY ativo DESC, tipo ASC, criadoEm ASC
    `)
    .bind(...variacoes)
    .all<TemplateRecord>();
  
  return templates.results || [];
}

export async function criarTemplateD1(
  db: D1Database,
  telefone: string,
  dados: {
    nome: string;
    corPrimaria: string;
    corSecundaria: string;
    corDestaque: string;
    corFundo: string;
    corTexto: string;
  }
): Promise<number> {
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  
  // Valida formato hex das cores
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  const cores = [dados.corPrimaria, dados.corSecundaria, dados.corDestaque, dados.corFundo, dados.corTexto];
  for (const cor of cores) {
    if (!cor || !hexRegex.test(cor)) {
      throw new Error('Todas as cores devem estar no formato hexadecimal (ex: #3B82F6)');
    }
  }
  
  const result = await db
    .prepare(`
      INSERT INTO templates (telefone, nome, tipo, corPrimaria, corSecundaria, corDestaque, corFundo, corTexto, ativo, criadoEm, atualizadoEm)
      VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      preferida,
      dados.nome.trim(),
      dados.corPrimaria,
      dados.corSecundaria,
      dados.corDestaque,
      dados.corFundo,
      dados.corTexto
    )
    .run();
  
  return Number(result.meta.last_row_id);
}

export async function atualizarTemplateD1(
  db: D1Database,
  id: number,
  telefone: string,
  dados: {
    nome?: string;
    corPrimaria?: string;
    corSecundaria?: string;
    corDestaque?: string;
    corFundo?: string;
    corTexto?: string;
  }
): Promise<boolean> {
  const template = await db
    .prepare('SELECT * FROM templates WHERE id = ?')
    .bind(id)
    .first<TemplateRecord>();
  
  if (!template) {
    throw new Error('Template não encontrado');
  }
  
  // Não permite editar templates padrão (dark e light)
  if (template.tipo !== 'custom') {
    throw new Error('Não é possível editar templates padrão');
  }
  
  // Verifica se o template pertence ao usuário
  const variacoes = telefoneVariacoes(telefone);
  const telefoneCorresponde = variacoes.includes(template.telefone);
  
  if (!telefoneCorresponde) {
    throw new Error('Você não tem permissão para atualizar este template');
  }
  
  const updates: string[] = [];
  const params: Array<string> = [];
  
  // Valida formato hex das cores se fornecidas
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  
  if (dados.nome !== undefined) {
    updates.push('nome = ?');
    params.push(dados.nome.trim());
  }
  if (dados.corPrimaria !== undefined) {
    if (!hexRegex.test(dados.corPrimaria)) {
      throw new Error('Cor primária deve estar no formato hexadecimal');
    }
    updates.push('corPrimaria = ?');
    params.push(dados.corPrimaria);
  }
  if (dados.corSecundaria !== undefined) {
    if (!hexRegex.test(dados.corSecundaria)) {
      throw new Error('Cor secundária deve estar no formato hexadecimal');
    }
    updates.push('corSecundaria = ?');
    params.push(dados.corSecundaria);
  }
  if (dados.corDestaque !== undefined) {
    if (!hexRegex.test(dados.corDestaque)) {
      throw new Error('Cor de destaque deve estar no formato hexadecimal');
    }
    updates.push('corDestaque = ?');
    params.push(dados.corDestaque);
  }
  if (dados.corFundo !== undefined) {
    if (!hexRegex.test(dados.corFundo)) {
      throw new Error('Cor de fundo deve estar no formato hexadecimal');
    }
    updates.push('corFundo = ?');
    params.push(dados.corFundo);
  }
  if (dados.corTexto !== undefined) {
    if (!hexRegex.test(dados.corTexto)) {
      throw new Error('Cor de texto deve estar no formato hexadecimal');
    }
    updates.push('corTexto = ?');
    params.push(dados.corTexto);
  }
  
  if (updates.length === 0) return false;
  
  updates.push('atualizadoEm = CURRENT_TIMESTAMP');
  
  await db
    .prepare(`UPDATE templates SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
  
  return true;
}

export async function removerTemplateD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<boolean> {
  const template = await db
    .prepare('SELECT * FROM templates WHERE id = ?')
    .bind(id)
    .first<TemplateRecord>();
  
  if (!template) {
    throw new Error('Template não encontrado');
  }
  
  // Não permite deletar templates padrão
  if (template.tipo !== 'custom') {
    throw new Error('Não é possível deletar templates padrão');
  }
  
  // Verifica se o template pertence ao usuário
  const variacoes = telefoneVariacoes(telefone);
  const telefoneCorresponde = variacoes.includes(template.telefone);
  
  if (!telefoneCorresponde) {
    throw new Error('Você não tem permissão para remover este template');
  }
  
  const result = await db
    .prepare('DELETE FROM templates WHERE id = ?')
    .bind(id)
    .run();
  
  return (result.meta.changes || 0) > 0;
}

export async function ativarTemplateD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<boolean> {
  try {
    const template = await db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .bind(id)
      .first<TemplateRecord>();
    
    if (!template) {
      throw new Error('Template não encontrado');
    }
    
    // Verifica se o template pertence ao usuário
    const variacoes = telefoneVariacoes(telefone);
    const telefoneCorresponde = variacoes.includes(template.telefone);
    
    if (!telefoneCorresponde) {
      throw new Error('Você não tem permissão para ativar este template');
    }
    
    // Desativa todos os templates do usuário
    await db
      .prepare(`UPDATE templates SET ativo = 0 WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(...variacoes)
      .run();
    
    // Ativa o template selecionado
    await db
      .prepare('UPDATE templates SET ativo = 1 WHERE id = ?')
      .bind(id)
      .run();
    
    // Atualiza o usuário com o template ativo
    await db
      .prepare(`UPDATE usuarios SET templateAtivoId = ? WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(id, ...variacoes)
      .run();
    
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao ativar template:', error);
    if (error.message && error.message.includes('no such table')) {
      throw new Error('Tabela templates não existe no banco de dados. Por favor, aguarde alguns minutos para a propagação.');
    }
    throw error;
  }
}

// ========== CARTEIRAS ==========

export interface CarteiraRecord {
  id?: number;
  telefone: string;
  nome: string;
  descricao?: string | null;
  padrao: number; // 0 = false, 1 = true
  ativo: number; // 0 = false, 1 = true
  criadoEm: string;
  atualizadoEm: string;
}

export async function buscarCarteirasD1(
  db: D1Database,
  telefone: string
): Promise<CarteiraRecord[]> {
  try {
    const variacoes = telefoneVariacoes(telefone);
    
    const carteiras = await db
      .prepare(`
        SELECT * FROM carteiras 
        WHERE telefone IN (${variacoes.map(() => '?').join(',')}) AND ativo = 1
        ORDER BY padrao DESC, criadoEm ASC
      `)
      .bind(...variacoes)
      .all<CarteiraRecord>();
    
    return carteiras.results || [];
  } catch (error: any) {
    console.error('❌ Erro ao buscar carteiras:', error);
    // Se a tabela não existir, retorna array vazio em vez de lançar erro
    if (error.message && error.message.includes('no such table')) {
      console.warn('⚠️ Tabela carteiras não existe ainda, retornando array vazio');
      return [];
    }
    throw error;
  }
}

export async function buscarCarteiraPorIdD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<CarteiraRecord | null> {
  try {
    const variacoes = telefoneVariacoes(telefone);
    
    for (const variacao of variacoes) {
      const carteira = await db
        .prepare('SELECT * FROM carteiras WHERE id = ? AND telefone = ? AND ativo = 1')
        .bind(id, variacao)
        .first<CarteiraRecord>();
      
      if (carteira) return carteira;
    }
    
    return null;
  } catch (error: any) {
    console.error('❌ Erro ao buscar carteira por ID:', error);
    if (error.message && error.message.includes('no such table')) {
      throw new Error('Tabela carteiras não existe no banco de dados. Por favor, aguarde alguns minutos para a propagação.');
    }
    throw error;
  }
}

export async function buscarCarteiraPadraoD1(
  db: D1Database,
  telefone: string
): Promise<CarteiraRecord | null> {
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  
  // Primeiro tenta buscar pela carteira padrão do usuário
  const usuario = await db
    .prepare('SELECT carteiraPadraoId FROM usuarios WHERE telefone = ?')
    .bind(preferida)
    .first<{ carteiraPadraoId: number | null }>();
  
  if (usuario?.carteiraPadraoId) {
    const carteira = await buscarCarteiraPorIdD1(db, usuario.carteiraPadraoId, telefone);
    if (carteira) return carteira;
  }
  
  // Se não encontrou, busca pela primeira carteira marcada como padrão
  for (const variacao of variacoes) {
    const carteiraPadrao = await db
      .prepare('SELECT * FROM carteiras WHERE telefone = ? AND padrao = 1 AND ativo = 1 LIMIT 1')
      .bind(variacao)
      .first<CarteiraRecord>();
    
    if (carteiraPadrao) return carteiraPadrao;
  }
  
  // Se não encontrou, retorna a primeira carteira ativa
  for (const variacao of variacoes) {
    const carteira = await db
      .prepare('SELECT * FROM carteiras WHERE telefone = ? AND ativo = 1 ORDER BY criadoEm ASC LIMIT 1')
      .bind(variacao)
      .first<CarteiraRecord>();
    
    if (carteira) return carteira;
  }
  
  return null;
}

export async function criarCarteiraD1(
  db: D1Database,
  telefone: string,
  dados: {
    nome: string;
    descricao?: string;
    padrao?: boolean;
  }
): Promise<number> {
  const variacoes = telefoneVariacoes(telefone);
  const preferida = variacoes[0];
  
  // Se está marcando como padrão, remove o padrão das outras
  if (dados.padrao === true) {
    await db
      .prepare(`UPDATE carteiras SET padrao = 0 WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(...variacoes)
      .run();
    
    await db
      .prepare(`UPDATE usuarios SET carteiraPadraoId = NULL WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(...variacoes)
      .run();
  }
  
  const result = await db
    .prepare(`
      INSERT INTO carteiras (telefone, nome, descricao, padrao, ativo, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .bind(
      preferida,
      dados.nome.trim(),
      dados.descricao?.trim() || null,
      dados.padrao === true ? 1 : 0
    )
    .run();
  
  const carteiraId = Number(result.meta.last_row_id);
  
  // Se é padrão, atualiza o usuário
  if (dados.padrao === true) {
    await db
      .prepare(`UPDATE usuarios SET carteiraPadraoId = ? WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(carteiraId, ...variacoes)
      .run();
  }
  
  return carteiraId;
}

export async function atualizarCarteiraD1(
  db: D1Database,
  id: number,
  telefone: string,
  dados: {
    nome?: string;
    descricao?: string;
    padrao?: boolean;
    ativo?: boolean;
  }
): Promise<boolean> {
  const carteira = await buscarCarteiraPorIdD1(db, id, telefone);
  if (!carteira) {
    throw new Error('Carteira não encontrada');
  }
  
  // Se está marcando como padrão, remove o padrão das outras
  if (dados.padrao === true) {
    const variacoes = telefoneVariacoes(telefone);
    await db
      .prepare(`UPDATE carteiras SET padrao = 0 WHERE telefone IN (${variacoes.map(() => '?').join(',')}) AND id != ?`)
      .bind(...variacoes, id)
      .run();
    
    await db
      .prepare(`UPDATE usuarios SET carteiraPadraoId = ? WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
      .bind(id, ...variacoes)
      .run();
  }
  
  const updates: string[] = [];
  const params: Array<string | number | null> = [];
  
  if (dados.nome !== undefined) {
    updates.push('nome = ?');
    params.push(dados.nome.trim());
  }
  if (dados.descricao !== undefined) {
    updates.push('descricao = ?');
    params.push(dados.descricao?.trim() || null);
  }
  if (dados.padrao !== undefined) {
    updates.push('padrao = ?');
    params.push(dados.padrao ? 1 : 0);
  }
  if (dados.ativo !== undefined) {
    updates.push('ativo = ?');
    params.push(dados.ativo ? 1 : 0);
  }
  
  if (updates.length === 0) return false;
  
  updates.push('atualizadoEm = CURRENT_TIMESTAMP');
  
  await db
    .prepare(`UPDATE carteiras SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
  
  return true;
}

export async function removerCarteiraD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<boolean> {
  try {
    const carteira = await buscarCarteiraPorIdD1(db, id, telefone);
    if (!carteira) {
      throw new Error('Carteira não encontrada');
    }
    
    // Não permite remover a carteira padrão se houver transações
    if (carteira.padrao === 1) {
      const transacoes = await db
        .prepare('SELECT COUNT(*) as count FROM transacoes WHERE carteiraId = ?')
        .bind(id)
        .first<{ count: number }>();
      
      if (transacoes && transacoes.count > 0) {
        throw new Error('Não é possível remover a carteira padrão que possui transações');
      }
    }
    
    // Marca como inativa
    await db
      .prepare('UPDATE carteiras SET ativo = 0, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id)
      .run();
    
    // Se era a carteira padrão, remove a referência do usuário
    if (carteira.padrao === 1) {
      const variacoes = telefoneVariacoes(telefone);
      await db
        .prepare(`UPDATE usuarios SET carteiraPadraoId = NULL WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
        .bind(...variacoes)
        .run();
    }
    
    return true;
  } catch (error: any) {
    console.error('❌ Erro ao remover carteira:', error);
    // Se a tabela não existir, lança erro mais descritivo
    if (error.message && error.message.includes('no such table')) {
      throw new Error('Tabela carteiras não existe no banco de dados. Por favor, aguarde alguns minutos para a propagação ou entre em contato com o suporte.');
    }
    throw error;
  }
}

export async function definirCarteiraPadraoD1(
  db: D1Database,
  id: number,
  telefone: string
): Promise<boolean> {
  const carteira = await buscarCarteiraPorIdD1(db, id, telefone);
  if (!carteira) {
    throw new Error('Carteira não encontrada');
  }
  
  const variacoes = telefoneVariacoes(telefone);
  
  // Remove o padrão das outras
  await db
    .prepare(`UPDATE carteiras SET padrao = 0 WHERE telefone IN (${variacoes.map(() => '?').join(',')}) AND id != ?`)
    .bind(...variacoes, id)
    .run();
  
  // Marca esta como padrão
  await db
    .prepare('UPDATE carteiras SET padrao = 1, atualizadoEm = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(id)
    .run();
  
  // Atualiza o usuário
  await db
    .prepare(`UPDATE usuarios SET carteiraPadraoId = ? WHERE telefone IN (${variacoes.map(() => '?').join(',')})`)
    .bind(id, ...variacoes)
    .run();
  
  return true;
}
