// Gerenciamento de agendamentos de pagamentos/recebimentos

import { prisma } from './database';

export interface Agendamento {
  id: number;
  telefone: string;
  descricao: string;
  valor: number;
  dataAgendamento: string; // YYYY-MM-DD
  tipo: 'pagamento' | 'recebimento';
  status: 'pendente' | 'pago' | 'cancelado';
  categoria?: string;
  notificado: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface NovoAgendamento {
  telefone: string;
  descricao: string;
  valor: number;
  dataAgendamento: string; // YYYY-MM-DD
  tipo: 'pagamento' | 'recebimento';
  categoria?: string;
  // Campos para agendamentos recorrentes
  recorrente?: boolean;
  totalParcelas?: number;
  parcelaAtual?: number;
  agendamentoPaiId?: number;
}

// Criar novo agendamento
export async function criarAgendamento(dados: NovoAgendamento): Promise<number> {
  try {
    const resultado = await (prisma as any).agendamento.create({
      data: {
        telefone: dados.telefone,
        descricao: dados.descricao,
        valor: dados.valor,
        dataAgendamento: dados.dataAgendamento,
        tipo: dados.tipo,
        categoria: dados.categoria || 'outros',
        status: 'pendente',
        notificado: false,
        recorrente: dados.recorrente || false,
        totalParcelas: dados.totalParcelas || null,
        parcelaAtual: dados.parcelaAtual || null,
        agendamentoPaiId: dados.agendamentoPaiId || null,
      },
    });

    return resultado.id;
  } catch (error) {
    console.error('❌ Erro ao criar agendamento:', error);
    throw error;
  }
}

// Criar agendamentos recorrentes (cria todos de uma vez)
export async function criarAgendamentosRecorrentes(
  dados: NovoAgendamento & { totalParcelas: number }
): Promise<number[]> {
  const ids: number[] = [];
  const dataInicial = new Date(dados.dataAgendamento);
  
  // Cria o primeiro agendamento (pai)
  const primeiroId = await criarAgendamento({
    ...dados,
    parcelaAtual: 1,
    agendamentoPaiId: undefined,
    recorrente: true,
  });
  ids.push(primeiroId);
  
  // Cria os demais agendamentos (filhos)
  for (let i = 2; i <= dados.totalParcelas; i++) {
    const dataParcela = new Date(dataInicial);
    dataParcela.setMonth(dataParcela.getMonth() + (i - 1));
    
    const id = await criarAgendamento({
      ...dados,
      dataAgendamento: dataParcela.toISOString().split('T')[0],
      parcelaAtual: i,
      agendamentoPaiId: primeiroId,
      recorrente: true,
    });
    ids.push(id);
  }
  
  return ids;
}

// Buscar agendamentos por telefone
export async function buscarAgendamentosPorTelefone(
  telefone: string,
  filtros?: {
    status?: 'pendente' | 'pago' | 'cancelado';
    dataInicio?: string;
    dataFim?: string;
  }
): Promise<Agendamento[]> {
  try {
    const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
    const semMais = telefoneLimpo.replace(/^\+/, '');
    const comMais = `+${semMais}`;
    
    // Também tenta formatos alternativos comuns
    const apenasNumeros = telefoneLimpo.replace(/\D/g, '');
    
    // Busca por últimos dígitos também (para casos onde há diferença no DDI ou formato)
    const ultimos8 = apenasNumeros.slice(-8);
    const ultimos9 = apenasNumeros.slice(-9);
    const ultimos10 = apenasNumeros.slice(-10);
    const ultimos11 = apenasNumeros.slice(-11);
    
    const formatosTelefone = [
      telefoneLimpo,
      semMais,
      comMais,
      apenasNumeros,
      `+${apenasNumeros}`,
      `55${apenasNumeros.substring(2)}`, // Remove DDI se houver
      `+55${apenasNumeros.substring(2)}`,
      // Busca por últimos dígitos (caso o formato salvo seja diferente)
      ultimos8,
      ultimos9,
      ultimos10,
      ultimos11,
      `+${ultimos8}`,
      `+${ultimos9}`,
      `+${ultimos10}`,
      `+${ultimos11}`,
      `55${ultimos8}`,
      `55${ultimos9}`,
      `55${ultimos10}`,
      `55${ultimos11}`,
      `+55${ultimos8}`,
      `+55${ultimos9}`,
      `+55${ultimos10}`,
      `+55${ultimos11}`
    ];
    
    // Remove duplicatas e valores vazios
    const formatosUnicos = [...new Set(formatosTelefone.filter(f => f && f.length > 0))];
    
    console.log(`   🔍 Buscando agendamentos para telefone: "${telefone}"`);
    console.log(`      Formatos tentados (${formatosUnicos.length}):`, formatosUnicos);
    
    // Primeiro, tenta busca exata com os formatos principais
    let agendamentos = await (prisma as any).agendamento.findMany({
      where: {
        AND: [
          {
            OR: formatosUnicos.slice(0, 10).map(f => ({ telefone: f })) // Primeiros 10 formatos
          },
          ...(filtros?.status ? [{ status: filtros.status }] : []),
          ...(filtros?.dataInicio || filtros?.dataFim ? [{
            dataAgendamento: {
              ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}),
              ...(filtros.dataFim ? { lte: filtros.dataFim } : {})
            }
          }] : [])
        ]
      },
      orderBy: { dataAgendamento: 'asc' },
    });
    
    // Se não encontrou, tenta busca por últimos dígitos usando LIKE
    if (agendamentos.length === 0 && apenasNumeros.length >= 8) {
      console.log(`   🔍 Tentando busca por últimos dígitos (LIKE)...`);
      const todosAgendamentos = await (prisma as any).agendamento.findMany({
        orderBy: { dataAgendamento: 'asc' },
      });
      
      // Filtra manualmente por telefones que terminam com os mesmos dígitos
      agendamentos = todosAgendamentos.filter((a: any) => {
        const telAgendamento = String(a.telefone).replace(/\D/g, '');
        return telAgendamento.endsWith(ultimos8) || 
               telAgendamento.endsWith(ultimos9) || 
               telAgendamento.endsWith(ultimos10) ||
               telAgendamento.endsWith(ultimos11);
      });
      
      // Aplica filtros manualmente
      if (filtros?.status) {
        agendamentos = agendamentos.filter((a: any) => a.status === filtros.status);
      }
      if (filtros?.dataInicio) {
        agendamentos = agendamentos.filter((a: any) => a.dataAgendamento >= filtros.dataInicio!);
      }
      if (filtros?.dataFim) {
        agendamentos = agendamentos.filter((a: any) => a.dataAgendamento <= filtros.dataFim!);
      }
      
      console.log(`   ✅ Busca por últimos dígitos encontrou ${agendamentos.length} agendamentos`);
    }
    
    return agendamentos.map((a: any) => ({
      ...a,
      criadoEm: a.criadoEm,
      atualizadoEm: a.atualizadoEm,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar agendamentos:', error);
    throw error;
  }
}

// Buscar agendamento por ID
export async function buscarAgendamentoPorId(id: number): Promise<Agendamento | null> {
  try {
    const agendamento = await (prisma as any).agendamento.findUnique({
      where: { id },
    });

    if (!agendamento) return null;

    return {
      ...agendamento,
      criadoEm: agendamento.criadoEm,
      atualizadoEm: agendamento.atualizadoEm,
    };
  } catch (error) {
    console.error('❌ Erro ao buscar agendamento:', error);
    throw error;
  }
}

// Atualizar status do agendamento
export async function atualizarStatusAgendamento(
  id: number,
  status: 'pendente' | 'pago' | 'cancelado'
): Promise<boolean> {
  try {
    await (prisma as any).agendamento.update({
      where: { id },
      data: { status },
    });

    return true;
  } catch (error) {
    console.error('❌ Erro ao atualizar status do agendamento:', error);
    throw error;
  }
}

// Atualizar agendamento completo
export async function atualizarAgendamento(
  id: number,
  dados: {
    descricao?: string;
    valor?: number;
    dataAgendamento?: string;
    tipo?: 'pagamento' | 'recebimento';
    categoria?: string;
    status?: 'pendente' | 'pago' | 'cancelado';
  }
): Promise<boolean> {
  try {
    const dataAtualizacao: any = {};
    
    if (dados.descricao !== undefined) dataAtualizacao.descricao = dados.descricao;
    if (dados.valor !== undefined) dataAtualizacao.valor = dados.valor;
    if (dados.dataAgendamento !== undefined) dataAtualizacao.dataAgendamento = dados.dataAgendamento;
    if (dados.tipo !== undefined) dataAtualizacao.tipo = dados.tipo;
    if (dados.categoria !== undefined) dataAtualizacao.categoria = dados.categoria;
    if (dados.status !== undefined) dataAtualizacao.status = dados.status;

    await (prisma as any).agendamento.update({
      where: { id },
      data: dataAtualizacao,
    });

    return true;
  } catch (error) {
    console.error('❌ Erro ao atualizar agendamento:', error);
    throw error;
  }
}

// Marcar agendamento como notificado
export async function marcarComoNotificado(id: number): Promise<boolean> {
  try {
    await (prisma as any).agendamento.update({
      where: { id },
      data: { notificado: true },
    });

    return true;
  } catch (error) {
    console.error('❌ Erro ao marcar agendamento como notificado:', error);
    throw error;
  }
}

// Buscar agendamentos do dia (para notificações)
export async function buscarAgendamentosDoDia(data: string): Promise<Agendamento[]> {
  try {
    const agendamentos = await (prisma as any).agendamento.findMany({
      where: {
        dataAgendamento: data,
        status: 'pendente',
        notificado: false,
      },
    });

    return agendamentos.map((a: any) => ({
      ...a,
      criadoEm: a.criadoEm,
      atualizadoEm: a.atualizadoEm,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar agendamentos do dia:', error);
    throw error;
  }
}

// Remover agendamento
export async function removerAgendamento(id: number): Promise<boolean> {
  try {
    await (prisma as any).agendamento.delete({
      where: { id },
    });

    return true;
  } catch (error) {
    console.error('❌ Erro ao remover agendamento:', error);
    throw error;
  }
}

