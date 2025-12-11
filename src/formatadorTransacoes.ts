// Formatação de mensagens de transação para WhatsApp

import { formatarMoeda } from './formatadorMensagens';

export interface DadosTransacao {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida';
  metodo: 'credito' | 'debito';
  carteiraNome?: string;
  data?: string;
}

/**
 * Formata mensagem de transação registrada de forma intuitiva
 */
export function formatarMensagemTransacao(transacao: DadosTransacao): string {
  const tipoEmoji = transacao.tipo === 'entrada' ? '💰' : '💸';
  const tipoTexto = transacao.tipo === 'entrada' ? 'Receita' : 'Despesa';
  const metodoEmoji = transacao.metodo === 'credito' ? '💳' : '💵';
  const metodoTexto = transacao.metodo === 'credito' ? 'Crédito' : 'Débito';
  
  const dataFormatada = transacao.data 
    ? new Date(transacao.data + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');
  
  let mensagem = `✅ *Transação registrada!*\n\n`;
  
  mensagem += `${tipoEmoji} *${tipoTexto}*\n`;
  mensagem += `📝 ${transacao.descricao}\n`;
  mensagem += `💰 ${formatarMoeda(transacao.valor)}\n`;
  mensagem += `🏷️ ${transacao.categoria}\n`;
  mensagem += `${metodoEmoji} ${metodoTexto}`;
  
  if (transacao.carteiraNome) {
    mensagem += `\n💳 Carteira: ${transacao.carteiraNome}`;
  }
  
  mensagem += `\n📅 ${dataFormatada}`;
  
  return mensagem;
}

/**
 * Formata mensagem para múltiplas transações
 */
export function formatarMensagemMultiplasTransacoes(transacoes: DadosTransacao[]): string {
  let mensagem = `✅ *${transacoes.length} transações registradas!*\n\n`;
  
  transacoes.forEach((t, index) => {
    const tipoEmoji = t.tipo === 'entrada' ? '💰' : '💸';
    const metodoEmoji = t.metodo === 'credito' ? '💳' : '💵';
    
    mensagem += `${index + 1}. ${tipoEmoji} ${t.descricao}\n`;
    mensagem += `   ${formatarMoeda(t.valor)} | ${t.categoria} | ${metodoEmoji} ${t.metodo === 'credito' ? 'Crédito' : 'Débito'}\n`;
    
    if (t.carteiraNome) {
      mensagem += `   💳 ${t.carteiraNome}\n`;
    }
    
    mensagem += `\n`;
  });
  
  return mensagem;
}
