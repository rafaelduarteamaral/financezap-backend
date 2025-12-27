// Validações financeiras do sistema
import type { D1Database } from '@cloudflare/workers-types';
import { formatarMoeda } from './formatadorMensagens';

// Constantes de validação
const VALOR_MAXIMO = 10000000; // R$ 10 milhões
const VALOR_MINIMO = 0.01; // R$ 0,01 (1 centavo)
const DESCRICAO_MAX_LENGTH = 500;
const DESCRICAO_MIN_LENGTH = 1;

/**
 * Valida se uma transação pode ser criada
 * Retorna { valido: boolean, erro?: string }
 */
export interface ResultadoValidacao {
  valido: boolean;
  erro?: string;
}

/**
 * Valida valor da transação
 */
export function validarValor(valor: number, tipo: 'entrada' | 'saida'): ResultadoValidacao {
  if (isNaN(valor) || !isFinite(valor)) {
    return { valido: false, erro: 'Valor inválido' };
  }

  if (valor <= 0) {
    return { valido: false, erro: 'Valor deve ser maior que zero' };
  }

  if (valor < VALOR_MINIMO) {
    return { valido: false, erro: `Valor mínimo permitido: ${formatarMoeda(VALOR_MINIMO)}` };
  }

  if (valor > VALOR_MAXIMO) {
    return { valido: false, erro: `Valor muito alto. Máximo permitido: ${formatarMoeda(VALOR_MAXIMO)}` };
  }

  // Validação específica: entrada não pode ser negativa (já validado acima, mas reforça)
  if (tipo === 'entrada' && valor < 0) {
    return { valido: false, erro: 'Valor de entrada não pode ser negativo' };
  }

  // Validação específica: saída não pode ser negativa
  if (tipo === 'saida' && valor < 0) {
    return { valido: false, erro: 'Valor de saída não pode ser negativo' };
  }

  return { valido: true };
}

/**
 * Valida combinação de tipo e método
 */
export function validarTipoMetodo(tipo: 'entrada' | 'saida', metodo: 'credito' | 'debito'): ResultadoValidacao {
  // Entrada não pode ser em crédito (recebimentos não usam crédito)
  if (tipo === 'entrada' && metodo === 'credito') {
    return { valido: false, erro: 'Recebimentos não podem ser em crédito' };
  }

  return { valido: true };
}

/**
 * Valida descrição da transação
 */
export function validarDescricao(descricao: string): ResultadoValidacao {
  if (!descricao || typeof descricao !== 'string') {
    return { valido: false, erro: 'Descrição é obrigatória' };
  }

  const descricaoLimpa = descricao.trim();

  if (descricaoLimpa.length < DESCRICAO_MIN_LENGTH) {
    return { valido: false, erro: `Descrição deve ter pelo menos ${DESCRICAO_MIN_LENGTH} caractere(s)` };
  }

  if (descricaoLimpa.length > DESCRICAO_MAX_LENGTH) {
    return { valido: false, erro: `Descrição muito longa. Máximo: ${DESCRICAO_MAX_LENGTH} caracteres` };
  }

  return { valido: true };
}

/**
 * Valida data da transação
 * Permite data futura apenas se for agendamento (flag opcional)
 */
export function validarData(data: string, permitirDataFutura: boolean = false): ResultadoValidacao {
  if (!data) {
    return { valido: false, erro: 'Data é obrigatória' };
  }

  const dataTransacao = new Date(data);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0); // Zera horas para comparar apenas a data

  if (isNaN(dataTransacao.getTime())) {
    return { valido: false, erro: 'Data inválida' };
  }

  // Se não permitir data futura e a data for futura, retorna erro
  if (!permitirDataFutura) {
    const dataTransacaoSemHora = new Date(dataTransacao);
    dataTransacaoSemHora.setHours(0, 0, 0, 0);

    if (dataTransacaoSemHora > hoje) {
      return { valido: false, erro: 'Não é possível criar transações com data futura. Use agendamentos para isso.' };
    }
  }

  return { valido: true };
}

/**
 * Calcula data de fechamento da fatura baseado no diaPagamento
 */
export function calcularDataFechamentoFatura(diaPagamento: number, dataReferencia: Date = new Date()): Date {
  const hoje = new Date(dataReferencia);
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const diaAtual = hoje.getDate();

  // Se já passou o dia de fechamento, a fatura atual é do próximo mês
  let dataFechamento: Date;
  if (diaAtual >= diaPagamento) {
    // Fatura atual fecha no próximo mês
    dataFechamento = new Date(anoAtual, mesAtual + 1, diaPagamento);
  } else {
    // Fatura atual fecha neste mês
    dataFechamento = new Date(anoAtual, mesAtual, diaPagamento);
  }

  return dataFechamento;
}


/**
 * Calcula limite utilizado de crédito considerando período da fatura (Prisma)
 * @deprecated Use calcularLimiteUtilizadoCreditoD1 para Cloudflare Workers
 * Esta função retorna 0 no Worker (Prisma não funciona no Worker)
 */
export async function calcularLimiteUtilizadoCredito(
  telefone: string,
  carteiraId: number,
  diaPagamento: number | null
): Promise<number> {
  // Prisma não funciona no Worker, retorna 0
      return 0;
}

/**
 * Calcula limite utilizado de crédito considerando período da fatura (D1)
 */
export async function calcularLimiteUtilizadoCreditoD1(
  db: D1Database,
  telefone: string,
  carteiraId: number,
  diaPagamento: number | null
): Promise<number> {
  try {
    // Busca a carteira para verificar se é de crédito
    const carteira = await db
      .prepare('SELECT * FROM carteiras WHERE id = ? AND telefone = ? AND ativo = 1')
      .bind(carteiraId, telefone)
      .first<{ tipo: string }>();

    if (!carteira || carteira.tipo !== 'credito') {
      return 0;
    }

    // Calcula período da fatura atual
    const dataFechamento = calcularDataFechamentoFatura(diaPagamento || 10);
    const dataInicioFatura = new Date(dataFechamento);
    dataInicioFatura.setMonth(dataInicioFatura.getMonth() - 1);
    dataInicioFatura.setDate((diaPagamento || 10) + 1);

    // Formata datas para string (YYYY-MM-DD)
    const dataInicioStr = dataInicioFatura.toISOString().slice(0, 10);
    const dataFimStr = dataFechamento.toISOString().slice(0, 10);

    // Calcula apenas saídas de CRÉDITO no período da fatura
    const resultado = await db
      .prepare(
        `SELECT SUM(valor) as total 
         FROM transacoes 
         WHERE telefone = ? 
           AND tipo = 'saida' 
           AND metodo = 'credito' 
           AND carteiraId = ?
           AND date(data) >= date(?)
           AND date(data) <= date(?)`
      )
      .bind(telefone, carteiraId, dataInicioStr, dataFimStr)
      .first<{ total: number | null }>();

    return resultado?.total || 0;
  } catch (error) {
    console.error('❌ Erro ao calcular limite utilizado D1:', error);
    return 0;
  }
}


/**
 * Valida limite de crédito antes de criar transação (Prisma)
 * @deprecated Use validarLimiteCreditoD1 para Cloudflare Workers
 * Esta função retorna válido no Worker (Prisma não funciona no Worker)
 */
export async function validarLimiteCredito(
  telefone: string,
  carteiraId: number | null,
  valorTransacao: number,
  metodo: 'credito' | 'debito'
): Promise<ResultadoValidacao> {
  // Prisma não funciona no Worker, retorna válido
      return { valido: true };
}

/**
 * Valida limite de crédito antes de criar transação (D1)
 */
export async function validarLimiteCreditoD1(
  db: D1Database,
  telefone: string,
  carteiraId: number | null,
  valorTransacao: number,
  metodo: 'credito' | 'debito'
): Promise<ResultadoValidacao> {
  // Se não é crédito, não precisa validar
  if (metodo !== 'credito' || !carteiraId) {
    return { valido: true };
  }

  try {
    // Busca a carteira
    const carteira = await db
      .prepare('SELECT * FROM carteiras WHERE id = ? AND telefone = ? AND ativo = 1')
      .bind(carteiraId, telefone)
      .first<{ tipo: string; limiteCredito: number | null; diaPagamento: number | null }>();

    if (!carteira) {
      return { valido: false, erro: 'Carteira não encontrada' };
    }

    // Se não é carteira de crédito, não precisa validar
    if (carteira.tipo !== 'credito') {
      return { valido: true };
    }

    // Verifica se tem limite configurado
    const limiteCredito = carteira.limiteCredito;
    if (!limiteCredito || limiteCredito <= 0) {
      return { valido: false, erro: 'Carteira de crédito sem limite configurado' };
    }

    // Calcula limite utilizado no período da fatura atual
    const limiteUtilizado = await calcularLimiteUtilizadoCreditoD1(
      db,
      telefone,
      carteiraId,
      carteira.diaPagamento
    );

    // Verifica se a nova transação excede o limite
    const novoLimiteUtilizado = limiteUtilizado + valorTransacao;
    if (novoLimiteUtilizado > limiteCredito) {
      const disponivel = limiteCredito - limiteUtilizado;
      return {
        valido: false,
        erro: `Limite de crédito excedido. Disponível: ${formatarMoeda(disponivel)}, Tentativa: ${formatarMoeda(valorTransacao)}`,
      };
    }

    return { valido: true };
  } catch (error: any) {
    console.error('❌ Erro ao validar limite de crédito D1:', error);
    return { valido: false, erro: 'Erro ao validar limite de crédito' };
  }
}


/**
 * Valida todas as regras financeiras de uma transação (Prisma)
 * @deprecated Use validarTransacaoCompletaD1 para Cloudflare Workers
 * Esta função retorna válido no Worker (Prisma não funciona no Worker)
 */
export async function validarTransacaoCompleta(
  transacao: {
    valor: number;
    tipo: 'entrada' | 'saida';
    metodo: 'credito' | 'debito';
    descricao: string;
    data: string;
    carteiraId?: number | null;
    telefone: string;
    permitirDataFutura?: boolean;
  }
): Promise<ResultadoValidacao> {
  // Prisma não funciona no Worker, retorna válido
  // As validações básicas (valor, tipo, descrição, data) são feitas no database.ts antes de chamar esta função
  return { valido: true };
}

/**
 * Valida todas as regras financeiras de uma transação (D1)
 */
export async function validarTransacaoCompletaD1(
  db: D1Database,
  transacao: {
    valor: number;
    tipo: 'entrada' | 'saida';
    metodo: 'credito' | 'debito';
    descricao: string;
    data: string;
    carteiraId?: number | null;
    telefone: string;
    permitirDataFutura?: boolean;
  }
): Promise<ResultadoValidacao> {
  // 1. Valida valor
  const validacaoValor = validarValor(transacao.valor, transacao.tipo);
  if (!validacaoValor.valido) {
    return validacaoValor;
  }

  // 2. Valida tipo vs método
  const validacaoTipoMetodo = validarTipoMetodo(transacao.tipo, transacao.metodo);
  if (!validacaoTipoMetodo.valido) {
    return validacaoTipoMetodo;
  }

  // 3. Valida descrição
  const validacaoDescricao = validarDescricao(transacao.descricao);
  if (!validacaoDescricao.valido) {
    return validacaoDescricao;
  }

  // 4. Valida data
  const validacaoData = validarData(transacao.data, transacao.permitirDataFutura || false);
  if (!validacaoData.valido) {
    return validacaoData;
  }

  // 5. Valida limite de crédito (se aplicável)
  const validacaoLimite = await validarLimiteCreditoD1(
    db,
    transacao.telefone,
    transacao.carteiraId || null,
    transacao.valor,
    transacao.metodo
  );
  if (!validacaoLimite.valido) {
    return validacaoLimite;
  }

  return { valido: true };
}
