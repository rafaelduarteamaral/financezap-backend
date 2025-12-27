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
 * Obtém contexto de conversação (D1) - PERSISTENTE
 */
export async function obterContextoConversacaoD1(
  db: D1Database,
  telefone: string
): Promise<ConversaContexto | null> {
  try {
    // Busca no banco de dados (persistente)
    const mensagens = await db
      .prepare(
        `SELECT role, content, criadoEm 
         FROM conversacao_contexto 
         WHERE telefone = ? 
         ORDER BY criadoEm DESC 
         LIMIT 20`
      )
      .bind(telefone)
      .all<{
        role: string;
        content: string;
        criadoEm: string;
      }>();

    if (!mensagens.results || mensagens.results.length === 0) {
      return null;
    }

    // Converte para formato ConversaContexto
    const contexto: ConversaContexto = {
      telefone,
      mensagens: mensagens.results
        .reverse() // Inverte para ordem cronológica
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.criadoEm),
        })),
      ultimaAtualizacao: new Date(),
    };

    return contexto;
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
 * Adiciona mensagem ao contexto (D1) - PERSISTENTE
 */
export async function adicionarMensagemContextoD1(
  db: D1Database,
  telefone: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  try {
    // Salva mensagem no banco de dados
    await db
      .prepare(
        `INSERT INTO conversacao_contexto (telefone, role, content, criadoEm)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(telefone, role, content)
      .run();

    // Limita histórico a últimas 50 mensagens por telefone
    await db
      .prepare(
        `DELETE FROM conversacao_contexto 
         WHERE telefone = ? 
         AND id NOT IN (
           SELECT id FROM conversacao_contexto 
           WHERE telefone = ? 
           ORDER BY criadoEm DESC 
           LIMIT 50
         )`
      )
      .bind(telefone, telefone)
      .run();
  } catch (error) {
    console.error('❌ Erro ao adicionar mensagem ao contexto D1:', error);
    throw error;
  }
}

/**
 * Limpa contexto de conversação
 */
export async function limparContextoConversacao(telefone: string): Promise<void> {
  contextoCache.delete(telefone);
}

/**
 * Limpa contexto de conversação (D1) - PERSISTENTE
 */
export async function limparContextoConversacaoD1(db: D1Database, telefone: string): Promise<void> {
  try {
    await db
      .prepare('DELETE FROM conversacao_contexto WHERE telefone = ?')
      .bind(telefone)
      .run();
  } catch (error) {
    console.error('❌ Erro ao limpar contexto D1:', error);
    throw error;
  }
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
