// Utilidades para acessar o D1 no Cloudflare Workers (substitui Prisma no Worker)

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

function telefoneVariacoes(telefone: string): string[] {
  const limpo = normalizarTelefone(telefone);
  const semMais = limpo.replace(/^\+/, '');
  const comMais = `+${semMais}`;
  const comPrefixoWhats = `whatsapp:${comMais}`;

  return [limpo, semMais, comMais, comPrefixoWhats].filter(Boolean);
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
    const placeholders = variacoes.map(() => 'telefone = ?').join(' OR ');
    where.push(`(${placeholders})`);
    params.push(...variacoes);
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

  const result = await db
    .prepare(
      `INSERT INTO transacoes 
        (telefone, descricao, valor, categoria, tipo, metodo, dataHora, data, mensagemOriginal) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      normalizarTelefone(transacao.telefone),
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

  return Number(result.meta.last_row_id);
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
  const { whereClause, params } = montarWhere(filtros);
  const limit = filtros.limit && filtros.limit > 0 ? Math.min(filtros.limit, 100) : 20;
  const offset = filtros.offset && filtros.offset > 0 ? filtros.offset : 0;

  const totalRow = await db
    .prepare(`SELECT COUNT(*) as total FROM transacoes ${whereClause}`)
    .bind(...params)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT id, telefone, descricao, valor, categoria, tipo, metodo, dataHora, data, mensagemOriginal 
       FROM transacoes ${whereClause}
       ORDER BY datetime(dataHora) DESC 
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<TransacaoRecord>();

  return {
    total: totalRow?.total ?? 0,
    transacoes: (rows.results || []).map((t) => ({
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
        SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as gastoHoje,
      FROM transacoes
      ${whereClause ? `${whereClause} AND` : 'WHERE'} date(data) = date(?)`
    )
    .bind(...params, hojeIso)
    .first<{ gastoHoje: number; filterMes: number }>();

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

  return (rows.results || []).map((row) => ({
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
