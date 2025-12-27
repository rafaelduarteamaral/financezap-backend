/**
 * 🎯 Roteador de Serviços
 */

import { buscarServicoPorId, validarDadosServico, gerarPromptIdentificacaoServico } from './servicos';
import { formatarMoeda } from './formatadorMensagens';

export interface DecisaoServico {
  servicoId: string;
  confianca: number;
  dadosExtraidos: any;
}

export async function identificarServico(
  mensagem: string,
  chatIA: (prompt: string) => Promise<string>
): Promise<DecisaoServico> {
  const prompt = gerarPromptIdentificacaoServico(mensagem);
  
  try {
    const respostaIA = await chatIA(prompt);
    const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
    const decisao: DecisaoServico = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(respostaIA);

    if (!decisao.servicoId || !decisao.dadosExtraidos) {
      throw new Error('Resposta da IA inválida');
    }

    const servico = buscarServicoPorId(decisao.servicoId);
    if (!servico) {
      console.warn(`[Roteador] Serviço "${decisao.servicoId}" não encontrado, usando "consulta"`);
      return { servicoId: 'consulta', confianca: 0.5, dadosExtraidos: { tipoConsulta: 'resumo', periodo: 'mes' } };
    }

    const validacao = validarDadosServico(decisao.servicoId, decisao.dadosExtraidos);
    if (!validacao.valido && decisao.confianca < 0.7) {
      console.warn(`[Roteador] Dados inválidos para serviço "${decisao.servicoId}", usando "consulta" como fallback`);
      return { servicoId: 'consulta', confianca: 0.5, dadosExtraidos: { tipoConsulta: 'resumo', periodo: 'mes' } };
    }

    return decisao;
  } catch (error) {
    console.error('[Roteador] Erro ao identificar serviço:', error);
    return { servicoId: 'consulta', confianca: 0.3, dadosExtraidos: { tipoConsulta: 'resumo', periodo: 'mes' } };
  }
}

export async function processarMensagemComRoteamento(
  mensagem: string,
  telefone: string,
  chatIA: (prompt: string) => Promise<string>,
  processadores: {
    transacao?: (dados: any, telefone: string) => Promise<any>;
    agendamento?: (dados: any, telefone: string) => Promise<any>;
    consulta?: (dados: any, telefone: string) => Promise<any>;
  }
): Promise<{ servicoUsado: string; resultado: any }> {
  const decisao = await identificarServico(mensagem, chatIA);
  console.log(`[Roteador] Serviço identificado: ${decisao.servicoId} (confiança: ${decisao.confianca.toFixed(2)})`);

  const servico = buscarServicoPorId(decisao.servicoId);
  if (!servico) {
    throw new Error(`Serviço "${decisao.servicoId}" não encontrado`);
  }

  let resultado: any;
  switch (decisao.servicoId) {
    case 'transacao':
      resultado = processadores.transacao 
        ? await processadores.transacao(decisao.dadosExtraidos, telefone)
        : await servico.processar(decisao.dadosExtraidos, telefone);
      break;
    case 'agendamento':
      resultado = processadores.agendamento
        ? await processadores.agendamento(decisao.dadosExtraidos, telefone)
        : await servico.processar(decisao.dadosExtraidos, telefone);
      break;
    case 'consulta':
      resultado = processadores.consulta
        ? await processadores.consulta(decisao.dadosExtraidos, telefone)
        : await servico.processar(decisao.dadosExtraidos, telefone);
      break;
    default:
      throw new Error(`Processador para "${decisao.servicoId}" não implementado`);
  }

  return { servicoUsado: decisao.servicoId, resultado };
}

export function gerarMensagemResposta(servicoId: string, resultado: any): string {
  switch (servicoId) {
    case 'transacao':
      return `✅ Transação registrada com sucesso!\n\n` +
             `📋 ${resultado.descricao || 'Transação'}\n` +
             `💵 ${formatarMoeda(resultado.valor || 0)}\n` +
             `🏷️ ${resultado.categoria || 'outros'}\n` +
             `📊 ${resultado.tipo === 'entrada' ? 'Entrada' : 'Saída'} | ${resultado.metodo || 'não informado'}`;
    case 'agendamento':
      return `📅 Agendamento criado com sucesso!\n\n` +
             `📋 ${resultado.descricao || 'Agendamento'}\n` +
             `💵 ${formatarMoeda(resultado.valor || 0)}\n` +
             `📅 Data: ${resultado.dataAgendamento || 'não informada'}\n` +
             `${resultado.recorrente ? `🔄 Recorrente: ${resultado.totalParcelas || 'indefinido'} parcelas` : '📌 Único'}`;
    case 'consulta':
      return resultado.mensagem || resultado.toString();
    default:
      return `✅ Processamento concluído para serviço: ${servicoId}`;
  }
}
