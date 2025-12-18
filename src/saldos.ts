// Cálculo de saldos por carteira e total
// NOTA: Este arquivo tem duas versões das funções:
// - Versão Prisma (para desenvolvimento local)
// - Versão D1 (para Cloudflare Workers)
// O worker.ts deve usar apenas as funções D1

import { buscarCarteirasD1 } from './d1';
import type { D1Database } from '@cloudflare/workers-types';
import { formatarMoeda } from './formatadorMensagens';
import type { Carteira } from './carteiras';

export interface SaldoCarteira {
  carteiraId: number;
  nome: string;
  tipo: 'debito' | 'credito';
  saldo: number;
  limiteCredito?: number | null;
  limiteUtilizado?: number;
  disponivel?: number;
}

export interface SaldoTotal {
  saldoTotal: number;
  saldoPorCarteira: SaldoCarteira[];
  totalEntradas: number;
  totalSaidas: number;
}

/**
 * Calcula saldo por carteira (Prisma) - APENAS PARA DESENVOLVIMENTO LOCAL
 * NÃO USE NO CLOUDFLARE WORKERS
 */
export async function calcularSaldoPorCarteira(
  telefone: string
): Promise<SaldoTotal> {
  try {
    // Importação dinâmica para evitar erro no Cloudflare Workers
    const { buscarCarteirasPorTelefone } = await import('./carteiras');
    const { buscarTransacoesComFiltros } = await import('./database');
    
    // Busca todas as carteiras do usuário
    const carteiras = await buscarCarteirasPorTelefone(telefone);
    
    if (carteiras.length === 0) {
      return {
        saldoTotal: 0,
        saldoPorCarteira: [],
        totalEntradas: 0,
        totalSaidas: 0,
      };
    }

    // Busca todas as transações do usuário
    const todasTransacoes = await buscarTransacoesComFiltros({
      telefone,
      limit: 10000, // Busca todas
    });

    // Calcula saldo por carteira
    const saldoPorCarteira: SaldoCarteira[] = [];
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const carteira of carteiras) {
      // Filtra transações desta carteira
      const transacoesCarteira = todasTransacoes.transacoes.filter(
        t => t.carteiraId === carteira.id
      );

      let saldo = 0;
      let entradas = 0;
      let saidas = 0;

      for (const transacao of transacoesCarteira) {
        if (transacao.tipo === 'entrada') {
          saldo += transacao.valor;
          entradas += transacao.valor;
        } else {
          saldo -= transacao.valor;
          saidas += transacao.valor;
        }
      }

      totalEntradas += entradas;
      totalSaidas += saidas;

      const saldoCarteira: SaldoCarteira = {
        carteiraId: carteira.id,
        nome: carteira.nome,
        tipo: carteira.tipo as 'debito' | 'credito',
        saldo,
      };

      // Para cartão de crédito, calcula limite utilizado e disponível
      if (carteira.tipo === 'credito' && carteira.limiteCredito) {
        saldoCarteira.limiteCredito = carteira.limiteCredito;
        // Limite utilizado é apenas saídas (gastos)
        saldoCarteira.limiteUtilizado = saidas;
        saldoCarteira.disponivel = carteira.limiteCredito - saidas;
      }

      saldoPorCarteira.push(saldoCarteira);
    }

    // Calcula saldo total (soma de todos os saldos)
    const saldoTotal = saldoPorCarteira.reduce((sum, c) => sum + c.saldo, 0);

    return {
      saldoTotal,
      saldoPorCarteira,
      totalEntradas,
      totalSaidas,
    };
  } catch (error) {
    console.error('❌ Erro ao calcular saldo por carteira:', error);
    return {
      saldoTotal: 0,
      saldoPorCarteira: [],
      totalEntradas: 0,
      totalSaidas: 0,
    };
  }
}

/**
 * Calcula saldo por carteira (D1)
 */
export async function calcularSaldoPorCarteiraD1(
  db: D1Database,
  telefone: string
): Promise<SaldoTotal> {
  try {
    // Busca todas as carteiras do usuário
    const carteiras = await buscarCarteirasD1(db, telefone);
    
    if (carteiras.length === 0) {
      return {
        saldoTotal: 0,
        saldoPorCarteira: [],
        totalEntradas: 0,
        totalSaidas: 0,
      };
    }

    // Busca todas as transações do usuário
    const { buscarTransacoes } = await import('./d1');
    const todasTransacoes = await buscarTransacoes(db, {
      telefone,
      limit: 10000,
    });

    // Calcula saldo por carteira
    const saldoPorCarteira: SaldoCarteira[] = [];
    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const carteira of carteiras) {
      // Filtra transações desta carteira
      const transacoesCarteira = todasTransacoes.transacoes.filter(
        t => t.carteiraId === carteira.id
      );

      let saldo = 0;
      let entradas = 0;
      let saidas = 0;

      for (const transacao of transacoesCarteira) {
        if (transacao.tipo === 'entrada') {
          saldo += transacao.valor;
          entradas += transacao.valor;
        } else {
          saldo -= transacao.valor;
          saidas += transacao.valor;
        }
      }

      totalEntradas += entradas;
      totalSaidas += saidas;

      // Determina tipo da carteira (padrão: débito)
      const tipoCarteira = (carteira.tipo || 'debito') as 'debito' | 'credito';
      
      const saldoCarteira: SaldoCarteira = {
        carteiraId: carteira.id || 0,
        nome: carteira.nome,
        tipo: tipoCarteira,
        saldo,
      };

      // Para cartão de crédito, calcula limite utilizado e disponível
      if (tipoCarteira === 'credito' && carteira.limiteCredito) {
        saldoCarteira.limiteCredito = carteira.limiteCredito;
        // Limite utilizado é apenas saídas (gastos)
        saldoCarteira.limiteUtilizado = saidas;
        saldoCarteira.disponivel = carteira.limiteCredito - saidas;
      }

      saldoPorCarteira.push(saldoCarteira);
    }

    // Calcula saldo total (soma de todos os saldos)
    const saldoTotal = saldoPorCarteira.reduce((sum, c) => sum + c.saldo, 0);

    return {
      saldoTotal,
      saldoPorCarteira,
      totalEntradas,
      totalSaidas,
    };
  } catch (error) {
    console.error('❌ Erro ao calcular saldo por carteira D1:', error);
    return {
      saldoTotal: 0,
      saldoPorCarteira: [],
      totalEntradas: 0,
      totalSaidas: 0,
    };
  }
}

/**
 * Formata mensagem de saldo para WhatsApp
 */
export function formatarMensagemSaldo(saldoTotal: SaldoTotal): string {
  const emojiTotal = saldoTotal.saldoTotal >= 0 ? '✅' : '⚠️';
  
  let mensagem = `${emojiTotal} *Saldo Total: ${formatarMoeda(saldoTotal.saldoTotal)}*\n\n`;
  
  if (saldoTotal.saldoPorCarteira.length === 0) {
    mensagem += '📭 Você ainda não possui carteiras cadastradas.\n\n';
    mensagem += '💡 Crie uma carteira no painel web: usezela.com/painel';
    return mensagem;
  }

  mensagem += `📊 *Saldo por Carteira:*\n\n`;

  saldoTotal.saldoPorCarteira.forEach((carteira, index) => {
    const emoji = carteira.saldo >= 0 ? '💰' : '🔴';
    const tipoEmoji = carteira.tipo === 'credito' ? '💳' : '💵';
    
    mensagem += `${index + 1}. ${tipoEmoji} *${carteira.nome}*\n`;
    mensagem += `   ${emoji} Saldo: ${formatarMoeda(carteira.saldo)}\n`;
    
    // Para cartão de crédito, mostra limite
    if (carteira.tipo === 'credito' && carteira.limiteCredito) {
      const percentualUtilizado = carteira.limiteUtilizado 
        ? ((carteira.limiteUtilizado / carteira.limiteCredito) * 100).toFixed(1)
        : '0.0';
      
      mensagem += `   📊 Limite: ${formatarMoeda(carteira.limiteCredito)}\n`;
      mensagem += `   💸 Utilizado: ${formatarMoeda(carteira.limiteUtilizado || 0)} (${percentualUtilizado}%)\n`;
      mensagem += `   ✅ Disponível: ${formatarMoeda(carteira.disponivel || 0)}\n`;
    }
    
    mensagem += `\n`;
  });

  mensagem += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `📈 Total Entradas: ${formatarMoeda(saldoTotal.totalEntradas)}\n`;
  mensagem += `📉 Total Saídas: ${formatarMoeda(saldoTotal.totalSaidas)}\n`;

  return mensagem;
}
