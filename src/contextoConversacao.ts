// Gerenciamento de contexto de conversação
import type { D1Database } from '@cloudflare/workers-types';
import { prisma } from './database';

export interface MensagemContexto {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ConversaContexto {
  telefone: string;
  mensagens: MensagemContexto[];
  transacaoEmAndamento?: {
    transacoes: Array<{
      descricao: string;
      valor: number;
      categoria: string;
      tipo: 'entrada' | 'saida';
      metodo: 'credito' | 'debito';
    }>;
    timestamp: Date;
  };
  ultimaAcao?: 'extraindo_transacao' | 'confirmando' | 'editando' | 'pergunta';
  ultimaAtualizacao: Date;
}

// Cache em memória (para desenvolvimento local)
const contextoCache = new Map<string, ConversaContexto>();

// Tempo de expiração do contexto (10 minutos)
const CONTEXTO_EXPIRACAO_MS = 10 * 60 * 1000;

/**
 * Obtém contexto de conversação (Prisma)
 */
export async function obterContextoConversacao(telefone: string): Promise<ConversaContexto | null> {
  try {
    // Limpa cache expirado
    const agora = new Date();
    for (const [key, contexto] of contextoCache.entries()) {
      if (agora.getTime() - contexto.ultimaAtualizacao.getTime() > CONTEXTO_EXPIRACAO_MS) {
        contextoCache.delete(key);
      }
    }

    // Busca no cache
    const contexto = contextoCache.get(telefone);
    if (contexto) {
      // Verifica se não expirou
      const tempoDecorrido = agora.getTime() - contexto.ultimaAtualizacao.getTime();
      if (tempoDecorrido < CONTEXTO_EXPIRACAO_MS) {
        return contexto;
      } else {
        contextoCache.delete(telefone);
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Erro ao obter contexto:', error);
    return null;
  }
}

/**
 * Obtém contexto de conversação (D1)
 */
export async function obterContextoConversacaoD1(
  db: D1Database,
  telefone: string
): Promise<ConversaContexto | null> {
  try {
    // Limpa cache expirado
    const agora = new Date();
    for (const [key, contexto] of contextoCache.entries()) {
      if (agora.getTime() - contexto.ultimaAtualizacao.getTime() > CONTEXTO_EXPIRACAO_MS) {
        contextoCache.delete(key);
      }
    }

    // Busca no cache
    const contexto = contextoCache.get(telefone);
    if (contexto) {
      // Verifica se não expirou
      const tempoDecorrido = agora.getTime() - contexto.ultimaAtualizacao.getTime();
      if (tempoDecorrido < CONTEXTO_EXPIRACAO_MS) {
        return contexto;
      } else {
        contextoCache.delete(telefone);
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Erro ao obter contexto D1:', error);
    return null;
  }
}

/**
 * Salva contexto de conversação (Prisma)
 */
export async function salvarContextoConversacao(
  telefone: string,
  contexto: ConversaContexto
): Promise<void> {
  try {
    contexto.ultimaAtualizacao = new Date();
    
    // Limita histórico a últimas 10 mensagens
    if (contexto.mensagens.length > 10) {
      contexto.mensagens = contexto.mensagens.slice(-10);
    }

    contextoCache.set(telefone, contexto);
  } catch (error) {
    console.error('❌ Erro ao salvar contexto:', error);
  }
}

/**
 * Salva contexto de conversação (D1)
 */
export async function salvarContextoConversacaoD1(
  db: D1Database,
  telefone: string,
  contexto: ConversaContexto
): Promise<void> {
  try {
    contexto.ultimaAtualizacao = new Date();
    
    // Limita histórico a últimas 10 mensagens
    if (contexto.mensagens.length > 10) {
      contexto.mensagens = contexto.mensagens.slice(-10);
    }

    contextoCache.set(telefone, contexto);
  } catch (error) {
    console.error('❌ Erro ao salvar contexto D1:', error);
  }
}

/**
 * Adiciona mensagem ao contexto
 */
export async function adicionarMensagemContexto(
  telefone: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const contexto = await obterContextoConversacao(telefone) || {
    telefone,
    mensagens: [],
    ultimaAtualizacao: new Date(),
  };

  contexto.mensagens.push({
    role,
    content,
    timestamp: new Date(),
  });

  await salvarContextoConversacao(telefone, contexto);
}

/**
 * Adiciona mensagem ao contexto (D1)
 */
export async function adicionarMensagemContextoD1(
  db: D1Database,
  telefone: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const contexto = await obterContextoConversacaoD1(db, telefone) || {
    telefone,
    mensagens: [],
    ultimaAtualizacao: new Date(),
  };

  contexto.mensagens.push({
    role,
    content,
    timestamp: new Date(),
  });

  await salvarContextoConversacaoD1(db, telefone, contexto);
}

/**
 * Limpa contexto de conversação
 */
export async function limparContextoConversacao(telefone: string): Promise<void> {
  contextoCache.delete(telefone);
}

/**
 * Limpa contexto de conversação (D1)
 */
export async function limparContextoConversacaoD1(db: D1Database, telefone: string): Promise<void> {
  contextoCache.delete(telefone);
}

/**
 * Formata histórico de mensagens para prompt da IA
 */
export function formatarHistoricoParaPrompt(contexto: ConversaContexto | null): string {
  if (!contexto || contexto.mensagens.length === 0) {
    return '';
  }

  return contexto.mensagens
    .slice(-5) // Últimas 5 mensagens
    .map(msg => `${msg.role === 'user' ? 'Usuário' : 'Assistente'}: ${msg.content}`)
    .join('\n\n');
}
