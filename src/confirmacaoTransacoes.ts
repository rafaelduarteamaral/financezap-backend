// Sistema de confirmação de transações antes de salvar

import { formatarMoeda } from './formatadorMensagens';

export interface TransacaoParaConfirmar {
  descricao: string;
  valor: number;
  categoria: string;
  tipo: 'entrada' | 'saida';
  metodo: 'credito' | 'debito';
  carteiraNome?: string;
}

export interface ConfirmacaoPendente {
  telefone: string;
  transacoes: TransacaoParaConfirmar[];
  timestamp: Date;
  messageId?: string;
}

// Cache de confirmações pendentes
const confirmacoesPendentes = new Map<string, ConfirmacaoPendente>();

// Tempo de expiração (5 minutos)
const CONFIRMACAO_EXPIRACAO_MS = 5 * 60 * 1000;

/**
 * Cria confirmação pendente
 */
export function criarConfirmacaoPendente(
  telefone: string,
  transacoes: TransacaoParaConfirmar[],
  messageId?: string
): string {
  const confirmacao: ConfirmacaoPendente = {
    telefone,
    transacoes,
    timestamp: new Date(),
    messageId,
  };

  confirmacoesPendentes.set(telefone, confirmacao);

  // Limpa confirmações expiradas
  limparConfirmacoesExpiradas();

  return telefone; // Retorna chave para buscar depois
}

/**
 * Obtém confirmação pendente
 */
export function obterConfirmacaoPendente(telefone: string): ConfirmacaoPendente | null {
  limparConfirmacoesExpiradas();
  return confirmacoesPendentes.get(telefone) || null;
}

/**
 * Remove confirmação pendente
 */
export function removerConfirmacaoPendente(telefone: string): void {
  confirmacoesPendentes.delete(telefone);
}

/**
 * Limpa confirmações expiradas
 */
function limparConfirmacoesExpiradas(): void {
  const agora = new Date();
  for (const [telefone, confirmacao] of confirmacoesPendentes.entries()) {
    const tempoDecorrido = agora.getTime() - confirmacao.timestamp.getTime();
    if (tempoDecorrido > CONFIRMACAO_EXPIRACAO_MS) {
      confirmacoesPendentes.delete(telefone);
    }
  }
}

/**
 * Formata mensagem de confirmação
 */
export function formatarMensagemConfirmacao(transacoes: TransacaoParaConfirmar[]): string {
  if (transacoes.length === 0) {
    return '❌ Nenhuma transação para confirmar.';
  }

  let mensagem = `📋 *Confirme as transações encontradas:*\n\n`;

  transacoes.forEach((t, index) => {
    const emoji = t.tipo === 'entrada' ? '💰' : '💸';
    const tipoTexto = t.tipo === 'entrada' ? 'Entrada' : 'Saída';
    const metodoTexto = t.metodo === 'credito' ? 'Crédito' : 'Débito';

    mensagem += `${index + 1}. ${emoji} *${t.descricao}*\n`;
    mensagem += `   💵 ${formatarMoeda(t.valor)}\n`;
    mensagem += `   🏷️ ${t.categoria}\n`;
    mensagem += `   📊 ${tipoTexto} | ${metodoTexto}\n`;
    if (t.carteiraNome) {
      mensagem += `   💳 Carteira: ${t.carteiraNome}\n`;
    }
    mensagem += `\n`;
  });

  mensagem += `\n✅ *Confirmar todas*\n`;
  mensagem += `❌ *Cancelar*\n`;
  mensagem += `✏️ *Editar*`;

  return mensagem;
}

/**
 * Verifica se mensagem é confirmação
 */
export function isConfirmacao(mensagem: string): boolean {
  const mensagemLower = mensagem.toLowerCase().trim();
  return (
    mensagemLower === 'confirmar' ||
    mensagemLower === 'confirmar todas' ||
    mensagemLower === 'sim' ||
    mensagemLower === 'ok' ||
    mensagemLower === '✅' ||
    mensagemLower.startsWith('confirmar')
  );
}

/**
 * Verifica se mensagem é cancelamento
 */
export function isCancelamento(mensagem: string): boolean {
  const mensagemLower = mensagem.toLowerCase().trim();
  return (
    mensagemLower === 'cancelar' ||
    mensagemLower === 'não' ||
    mensagemLower === 'nao' ||
    mensagemLower === 'n' ||
    mensagemLower === '❌' ||
    mensagemLower.startsWith('cancelar')
  );
}

/**
 * Verifica se mensagem é edição
 */
export function isEdicao(mensagem: string): boolean {
  const mensagemLower = mensagem.toLowerCase().trim();
  return (
    mensagemLower === 'editar' ||
    mensagemLower === '✏️' ||
    mensagemLower.startsWith('editar') ||
    mensagemLower.startsWith('corrigir') ||
    mensagemLower.startsWith('alterar')
  );
}
