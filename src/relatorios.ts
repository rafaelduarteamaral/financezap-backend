// Sistema de relatórios financeiros (diário, semanal, mensal)

import { D1Database, TransacaoRecord } from './d1';
import { buscarTransacoes } from './d1';
import { buscarCarteiraPadraoD1 } from './d1';
import { formatarMoeda } from './formatadorMensagens';

export interface RelatorioPeriodo {
  dataInicio: string;
  dataFim: string;
  tipo: 'diario' | 'semanal' | 'mensal';
}

export interface RelatorioDados {
  periodo: RelatorioPeriodo;
  despesas: {
    total: number;
    pago: number;
    naoPago: number;
    porCategoria: Array<{
      categoria: string;
      pago: number;
      naoPago: number;
      total: number;
    }>;
  };
  receitas: {
    total: number;
    recebido: number;
    aReceber: number;
  };
  transacoes: TransacaoRecord[];
}

/**
 * Gera dados do relatório para um período específico
 */
export async function gerarDadosRelatorio(
  db: D1Database,
  telefone: string,
  periodo: RelatorioPeriodo
): Promise<RelatorioDados> {
  const { dataInicio, dataFim } = periodo;
  
  // Busca todas as transações do período
  const resultado = await buscarTransacoes(db, {
    telefone,
    dataInicio,
    dataFim,
    limit: 10000, // Busca todas as transações do período
  });

  const transacoes = resultado.transacoes || [];

  // Separa despesas e receitas
  const despesas = transacoes.filter(t => t.tipo === 'saida');
  const receitas = transacoes.filter(t => t.tipo === 'entrada');

  // Calcula totais de despesas
  const despesasPago = despesas.filter(d => d.metodo === 'debito');
  const despesasNaoPago = despesas.filter(d => d.metodo === 'credito');
  
  const totalDespesasPago = despesasPago.reduce((sum, d) => sum + d.valor, 0);
  const totalDespesasNaoPago = despesasNaoPago.reduce((sum, d) => sum + d.valor, 0);
  const totalDespesas = totalDespesasPago + totalDespesasNaoPago;

  // Calcula totais de receitas
  const receitasRecebido = receitas.filter(r => r.metodo === 'debito');
  const receitasAReceber = receitas.filter(r => r.metodo === 'credito');
  
  const totalReceitasRecebido = receitasRecebido.reduce((sum, r) => sum + r.valor, 0);
  const totalReceitasAReceber = receitasAReceber.reduce((sum, r) => sum + r.valor, 0);
  const totalReceitas = totalReceitasRecebido + totalReceitasAReceber;

  // Agrupa despesas por categoria
  const despesasPorCategoria = new Map<string, { pago: number; naoPago: number }>();
  
  despesas.forEach(d => {
    const categoria = d.categoria || 'outros';
    const atual = despesasPorCategoria.get(categoria) || { pago: 0, naoPago: 0 };
    
    if (d.metodo === 'debito') {
      atual.pago += d.valor;
    } else {
      atual.naoPago += d.valor;
    }
    
    despesasPorCategoria.set(categoria, atual);
  });

  const despesasPorCategoriaArray = Array.from(despesasPorCategoria.entries()).map(([categoria, valores]) => ({
    categoria,
    pago: valores.pago,
    naoPago: valores.naoPago,
    total: valores.pago + valores.naoPago,
  })).sort((a, b) => b.total - a.total);

  return {
    periodo,
    despesas: {
      total: totalDespesas,
      pago: totalDespesasPago,
      naoPago: totalDespesasNaoPago,
      porCategoria: despesasPorCategoriaArray,
    },
    receitas: {
      total: totalReceitas,
      recebido: totalReceitasRecebido,
      aReceber: totalReceitasAReceber,
    },
    transacoes: transacoes.sort((a, b) => {
      const dataA = new Date(a.dataHora).getTime();
      const dataB = new Date(b.dataHora).getTime();
      return dataB - dataA; // Mais recente primeiro
    }),
  };
}

/**
 * Calcula o período baseado no tipo (diário, semanal, mensal)
 */
export function calcularPeriodo(tipo: 'diario' | 'semanal' | 'mensal', dataReferencia?: Date): RelatorioPeriodo {
  const hoje = dataReferencia || new Date();
  const dataInicio = new Date(hoje);
  const dataFim = new Date(hoje);

  switch (tipo) {
    case 'diario':
      dataInicio.setHours(0, 0, 0, 0);
      dataFim.setHours(23, 59, 59, 999);
      break;
    
    case 'semanal':
      // Segunda-feira da semana atual
      const diaSemana = hoje.getDay(); // 0 = domingo, 1 = segunda, etc.
      const diasParaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
      dataInicio.setDate(hoje.getDate() - diasParaSegunda);
      dataInicio.setHours(0, 0, 0, 0);
      // Domingo da semana atual
      dataFim.setDate(dataInicio.getDate() + 6);
      dataFim.setHours(23, 59, 59, 999);
      break;
    
    case 'mensal':
      // Primeiro dia do mês
      dataInicio.setDate(1);
      dataInicio.setHours(0, 0, 0, 0);
      // Último dia do mês
      dataFim.setMonth(hoje.getMonth() + 1, 0);
      dataFim.setHours(23, 59, 59, 999);
      break;
  }

  return {
    dataInicio: dataInicio.toISOString().slice(0, 10),
    dataFim: dataFim.toISOString().slice(0, 10),
    tipo,
  };
}

/**
 * Formata o relatório para WhatsApp
 */
export function formatarRelatorioWhatsApp(
  dados: RelatorioDados,
  carteiraNome?: string
): string {
  const { periodo, despesas, receitas, transacoes } = dados;
  
  // Formata datas
  const dataInicio = new Date(periodo.dataInicio + 'T00:00:00');
  const dataFim = new Date(periodo.dataFim + 'T23:59:59');
  
  let titulo = '';
  let periodoTexto = '';
  
  switch (periodo.tipo) {
    case 'diario':
      titulo = '📅 Relatório diário';
      periodoTexto = dataInicio.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      break;
    case 'semanal':
      titulo = '📊 Relatório semanal';
      periodoTexto = `${dataInicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${dataFim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
      break;
    case 'mensal':
      titulo = '📊 Resumo Financeiro';
      periodoTexto = dataInicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      break;
  }

  let relatorio = `${titulo} (${periodoTexto})\n\n`;
  relatorio += '───────────────────────\n\n';

  // Despesas
  relatorio += `🔻 Despesas totais: *${formatarMoeda(despesas.total)}*\n\n`;
  relatorio += `* Pago: *${formatarMoeda(despesas.pago)}* ✅\n\n`;
  relatorio += `* Não pago: *${formatarMoeda(despesas.naoPago)}*\n\n`;

  // Receitas
  relatorio += `🔺 Receitas totais: *${formatarMoeda(receitas.total)}*\n\n`;
  relatorio += '───────────────────────\n\n';

  // Resumo por categoria (apenas despesas)
  if (despesas.porCategoria.length > 0) {
    relatorio += '📂 Resumo por categoria\n\n';
    
    despesas.porCategoria.forEach(cat => {
      const emoji = obterEmojiCategoria(cat.categoria);
      relatorio += `- ${emoji} ${cat.categoria} — Pago: *${formatarMoeda(cat.pago)}* | Não pago: *${formatarMoeda(cat.naoPago)}*\n`;
    });
    
    relatorio += '\n';
  }

  // Detalhamento das transações (apenas despesas)
  const despesasTransacoes = transacoes.filter(t => t.tipo === 'saida');
  if (despesasTransacoes.length > 0) {
    relatorio += 'Detalhamento das transações:\n\n';
    
    despesasTransacoes.forEach((t, index) => {
      const dataFormatada = new Date(t.dataHora).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      // Gera identificador curto (primeiros 5 caracteres do ID ou descrição)
      const identificador = t.id ? t.id.toString().slice(-5).toUpperCase() : t.descricao.slice(0, 5).toUpperCase();
      
      const statusPago = t.metodo === 'debito' ? 'Pago ✅' : 'Não pago';
      
      // Busca nome da carteira (se houver)
      const contaNome = carteiraNome || 'nubank';
      
      relatorio += `${index + 1}. ${identificador} — ${t.descricao} — ${dataFormatada} — *${formatarMoeda(t.valor)}* — Conta: ${contaNome} — ${statusPago}\n\n`;
    });
    
    relatorio += '───────────────────────\n\n';
  }

  // Mensagem final baseada no tipo
  if (periodo.tipo === 'diario') {
    if (transacoes.length === 0) {
      relatorio += 'ℹ️ Nenhuma transação encontrada para hoje.\n\n\n';
    }
    relatorio += 'Quer registrar uma despesa agora ou ver os gastos dos últimos 7 dias? 💸';
  } else {
    relatorio += 'Deseja exportar esse relatório ou ver o detalhamento por dia? 🚀';
  }

  return relatorio;
}

/**
 * Formata relatório mensal completo (formato alternativo)
 */
export function formatarRelatorioMensalCompleto(
  dados: RelatorioDados,
  carteiraNome?: string
): string {
  const { periodo, despesas, receitas } = dados;
  
  const dataInicio = new Date(periodo.dataInicio + 'T00:00:00');
  const mesAno = dataInicio.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const ultimoDia = new Date(periodo.dataFim + 'T23:59:59');
  
  let relatorio = `Resumo Financeiro - ${mesAno.charAt(0).toUpperCase() + mesAno.slice(1)}\n\n`;
  
  // Saldo
  const saldoPrevisto = receitas.total - despesas.total;
  const saldoDisponivel = receitas.recebido - despesas.pago;
  
  relatorio += `🏦 Seu Saldo até dia ${ultimoDia.getDate()}/${String(ultimoDia.getMonth() + 1).padStart(2, '0')}\n\n`;
  relatorio += `Previsto: ${formatarMoeda(saldoPrevisto)}\n`;
  relatorio += `Disponível: ${formatarMoeda(saldoDisponivel)}\n\n`;
  
  // Receitas
  relatorio += '📥 Receitas\n\n';
  relatorio += `Recebido: ${formatarMoeda(receitas.recebido)}\n`;
  relatorio += `A receber: ${formatarMoeda(receitas.aReceber)}\n\n`;
  
  // Despesas
  relatorio += '📤 Despesas\n\n';
  relatorio += `Pago: ${formatarMoeda(despesas.pago)}\n`;
  relatorio += `A pagar: ${formatarMoeda(despesas.naoPago)}\n\n`;
  
  // Categorias de despesas
  if (despesas.porCategoria.length > 0) {
    relatorio += 'Categorias de Despesas\n\n';
    const totalDespesas = despesas.total;
    despesas.porCategoria.forEach(cat => {
      const percentual = totalDespesas > 0 ? ((cat.total / totalDespesas) * 100).toFixed(0) : '0';
      relatorio += `${cat.categoria} → ${formatarMoeda(cat.total)} (${percentual}%)\n`;
    });
    relatorio += '\n';
  } else {
    relatorio += 'Categorias de Despesas\n\n';
    relatorio += 'Nenhuma despesa no período.\n\n';
  }
  
  // Categorias de receitas
  relatorio += 'Categorias de Receitas\n\n';
  if (receitas.total > 0) {
    // TODO: Agrupar receitas por categoria se necessário
    relatorio += 'Nenhuma receita no período.\n\n';
  } else {
    relatorio += 'Nenhuma receita no período.\n\n';
  }

  return relatorio;
}

/**
 * Obtém emoji para categoria
 */
function obterEmojiCategoria(categoria: string): string {
  const categoriaLower = categoria.toLowerCase();
  const emojis: Record<string, string> = {
    'transporte': '🚗',
    'alimentação': '🍔',
    'alimentacao': '🍔',
    'comida': '🍔',
    'saúde': '🏥',
    'saude': '🏥',
    'educação': '📚',
    'educacao': '📚',
    'lazer': '🎮',
    'moradia': '🏠',
    'contas': '💡',
    'outros': '📦',
  };
  
  return emojis[categoriaLower] || '📦';
}
