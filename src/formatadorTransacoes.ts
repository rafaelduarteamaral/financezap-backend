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
  id?: number; // ID da transação para gerar identificador
}

/**
 * Gera identificador único baseado no ID da transação
 */
function gerarIdentificador(id: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let resultado = '';
  let num = id;
  for (let i = 0; i < 5; i++) {
    resultado += chars[num % chars.length];
    num = Math.floor(num / chars.length);
  }
  return resultado.split('').reverse().join('');
}

/**
 * Capitaliza primeira letra de cada palavra
 */
function capitalizar(texto: string): string {
  return texto
    .split(' ')
    .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Formata mensagem de transação registrada seguindo o padrão especificado
 */
export function formatarMensagemTransacao(transacao: DadosTransacao): string {
  const tipoEmoji = transacao.tipo === 'entrada' ? '💰' : '🔴';
  const tipoTexto = transacao.tipo === 'entrada' ? 'Receita' : 'Despesa';
  const categoriaCapitalizada = capitalizar(transacao.categoria);
  const contaNome = transacao.carteiraNome || '—';
  
  const dataFormatada = transacao.data 
    ? new Date(transacao.data + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');
  
  // Gera identificador se tiver ID
  const identificador = transacao.id ? gerarIdentificador(transacao.id) : 'N/A';
  
  let mensagem = `*Transação Registrada Com Sucesso!*\n\n`;
  mensagem += `*Identificador:* ${identificador}\n\n`;
  mensagem += `*Resumo Da Transação:*\n`;
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `📄 *Descrição:* ${transacao.descricao}\n`;
  mensagem += `💰 *Valor:* ${formatarMoeda(transacao.valor)}\n`;
  mensagem += `🔄 *Tipo:* ${tipoEmoji} ${tipoTexto}\n`;
  mensagem += `🏷️ *Categoria:* ${categoriaCapitalizada}\n`;
  mensagem += `🏦 *Conta:* ${contaNome}\n`;
  mensagem += `📅 *Data:* ${dataFormatada}\n\n`;
  mensagem += `❌ *Para Excluir Diga:* "Excluir Transação ${identificador}"\n\n`;
  mensagem += `📊 *Consulte Gráficos E Relatórios Completos Em:*\n`;
  mensagem += `usezela.com/painel\n\n`;
  mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `⚡ *Ações Rápidas*\n`;
  mensagem += `• Ver Resumo Financeiro Do Mês\n`;
  mensagem += `• Excluir Esta Transação`;
  
  return mensagem;
}

/**
 * Formata mensagem para múltiplas transações
 */
export function formatarMensagemMultiplasTransacoes(transacoes: DadosTransacao[]): string {
  let mensagem = `*${transacoes.length} Transações Registradas Com Sucesso!*\n\n`;
  
  transacoes.forEach((t, index) => {
    const tipoEmoji = t.tipo === 'entrada' ? '💰' : '🔴';
    const tipoTexto = t.tipo === 'entrada' ? 'Receita' : 'Despesa';
    const categoriaCapitalizada = capitalizar(t.categoria);
    const contaNome = t.carteiraNome || '—';
    const identificador = t.id ? gerarIdentificador(t.id) : 'N/A';
    
    const dataFormatada = t.data 
      ? new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR');
    
    mensagem += `*Transação ${index + 1}*\n`;
    mensagem += `━━━━━━━━━━━━━━━━━━━━\n`;
    mensagem += `📄 *Descrição:* ${t.descricao}\n`;
    mensagem += `💰 *Valor:* ${formatarMoeda(t.valor)}\n`;
    mensagem += `🔄 *Tipo:* ${tipoEmoji} ${tipoTexto}\n`;
    mensagem += `🏷️ *Categoria:* ${categoriaCapitalizada}\n`;
    mensagem += `🏦 *Conta:* ${contaNome}\n`;
    mensagem += `📅 *Data:* ${dataFormatada}\n`;
    mensagem += `🆔 *Identificador:* ${identificador}\n\n`;
  });
  
  mensagem += `📊 *Consulte Gráficos E Relatórios Completos Em:*\n`;
  mensagem += `usezela.com/painel`;
  
  return mensagem;
}
