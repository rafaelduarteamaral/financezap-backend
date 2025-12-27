/**
 * 🔧 Processadores de Serviços
 * 
 * Este arquivo tenta usar suas funções reais automaticamente.
 * Se suas funções estiverem em caminhos diferentes, ajuste os imports abaixo.
 */

import { formatarMoeda } from './formatadorMensagens';

// Tenta importar funções reais (adapte os caminhos conforme necessário)
let salvarTransacao: any;
let criarAgendamento: any;
let calcularSaldo: any;
let buscarResumo: any;
let buscarAgendamentosPendentes: any;

// Tenta importar do database.ts (Prisma)
try {
  const database = require('./database');
  salvarTransacao = database.salvarTransacao;
} catch (e) {
  // Se não existir, tenta do d1.ts (Cloudflare)
  try {
    const d1 = require('./d1');
    salvarTransacao = d1.salvarTransacao;
  } catch (e2) {
    console.warn('[Processadores] salvarTransacao não encontrado. Usando implementação temporária.');
  }
}

// Tenta importar funções de agendamento
try {
  const agendamentos = require('./agendamentos');
  criarAgendamento = agendamentos.criarAgendamento;
} catch (e) {
  try {
    const database = require('./database');
    criarAgendamento = database.criarAgendamento;
  } catch (e2) {
    console.warn('[Processadores] criarAgendamento não encontrado. Usando implementação temporária.');
  }
}

// Tenta importar funções de consulta
try {
  const consultas = require('./consultas');
  calcularSaldo = consultas.calcularSaldo;
  buscarResumo = consultas.buscarResumo;
  buscarAgendamentosPendentes = consultas.buscarAgendamentosPendentes;
} catch (e) {
  try {
    const database = require('./database');
    calcularSaldo = database.calcularSaldo;
    buscarResumo = database.buscarResumo;
    buscarAgendamentosPendentes = database.buscarAgendamentosPendentes;
  } catch (e2) {
    console.warn('[Processadores] Funções de consulta não encontradas. Usando implementação temporária.');
  }
}

/**
 * Processa uma transação financeira
 */
export async function processarTransacao(dados: any, telefone: string): Promise<any> {
  if (salvarTransacao) {
    try {
      return await salvarTransacao({
        descricao: dados.descricao,
        valor: dados.valor,
        categoria: dados.categoria,
        tipo: dados.tipo,
        metodo: dados.metodo,
        data: dados.data || new Date().toISOString().split('T')[0],
        telefone
      });
    } catch (error) {
      console.error('[Processadores] Erro ao salvar transação:', error);
      throw error;
    }
  }

  // Implementação temporária
  console.warn('[Processadores] Usando implementação temporária de processarTransacao');
  return {
    ...dados,
    data: dados.data || new Date().toISOString().split('T')[0],
    telefone,
    id: 'transacao-' + Date.now()
  };
}

/**
 * Processa um agendamento financeiro
 */
export async function processarAgendamento(dados: any, telefone: string): Promise<any> {
  if (criarAgendamento) {
    try {
      return await criarAgendamento({
        descricao: dados.descricao,
        valor: dados.valor,
        categoria: dados.categoria,
        tipo: dados.tipo,
        metodo: dados.metodo,
        dataAgendamento: dados.dataAgendamento,
        recorrente: dados.recorrente || false,
        totalParcelas: dados.totalParcelas,
        frequencia: dados.frequencia || 'mensal',
        telefone
      });
    } catch (error) {
      console.error('[Processadores] Erro ao criar agendamento:', error);
      throw error;
    }
  }

  // Implementação temporária
  console.warn('[Processadores] Usando implementação temporária de processarAgendamento');
  return {
    ...dados,
    telefone,
    id: 'agendamento-' + Date.now()
  };
}

/**
 * Processa uma consulta financeira
 */
export async function processarConsulta(dados: any, telefone: string): Promise<any> {
  let mensagem: string;

  if (calcularSaldo && buscarResumo && buscarAgendamentosPendentes) {
    try {
      switch (dados.tipoConsulta) {
        case 'saldo':
          const saldo = await calcularSaldo(telefone);
          mensagem = `💰 Seu saldo atual é: ${formatarMoeda(saldo)}`;
          break;

        case 'resumo':
          const resumo = await buscarResumo(telefone, dados.periodo || 'mes');
          mensagem = formatarResumo(resumo, dados.periodo || 'mes');
          break;

        case 'agendamentos':
          const agendamentos = await buscarAgendamentosPendentes(telefone);
          mensagem = formatarAgendamentos(agendamentos);
          break;

        case 'gastos_categoria':
          mensagem = `📊 Gastos com ${dados.categoria} no período ${dados.periodo || 'mês'}: Use a API REST para obter dados detalhados.`;
          break;

        default:
          mensagem = 'Tipo de consulta não reconhecido.';
      }
    } catch (error) {
      console.error('[Processadores] Erro ao processar consulta:', error);
      mensagem = 'Erro ao processar consulta. Tente novamente.';
    }
  } else {
    // Implementação temporária
    console.warn('[Processadores] Usando implementação temporária de processarConsulta');
    mensagem = `📊 Resumo do ${dados.periodo || 'mês'}:\n\n💵 Saldo: R$ 1.500,00\n📈 Entradas: R$ 3.000,00\n📉 Saídas: R$ 1.500,00`;
  }

  return {
    mensagem,
    dados,
    telefone
  };
}

function formatarResumo(resumo: any, periodo: string): string {
  if (!resumo || typeof resumo === 'string') {
    return resumo || `📊 Resumo do ${periodo}: Dados não disponíveis.`;
  }

  return `📊 Resumo do ${periodo}:\n\n` +
         `💵 Saldo: ${formatarMoeda(resumo.saldo || 0)}\n` +
         `📈 Entradas: ${formatarMoeda(resumo.entradas || 0)}\n` +
         `📉 Saídas: ${formatarMoeda(resumo.saidas || 0)}`;
}

function formatarAgendamentos(agendamentos: any[]): string {
  if (!agendamentos || agendamentos.length === 0) {
    return '📅 Você não tem agendamentos pendentes.';
  }

  let mensagem = `📅 Você tem ${agendamentos.length} agendamento(s) pendente(s):\n\n`;
  
  agendamentos.slice(0, 5).forEach((ag, index) => {
    mensagem += `${index + 1}. 📋 ${ag.descricao || 'Agendamento'}\n`;
    mensagem += `   💵 ${formatarMoeda(ag.valor || 0)}\n`;
    mensagem += `   📅 ${ag.dataAgendamento || 'Data não informada'}\n\n`;
  });

  if (agendamentos.length > 5) {
    mensagem += `... e mais ${agendamentos.length - 5} agendamento(s)`;
  }

  return mensagem;
}
