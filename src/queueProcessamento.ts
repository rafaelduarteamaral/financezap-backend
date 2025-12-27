// Sistema de Queue para Processamento Assíncrono
// Processa mensagens em background para melhorar tempo de resposta

import type { D1Database } from '@cloudflare/workers-types';

export interface MensagemQueue {
  id: string;
  telefone: string;
  mensagem: string;
  timestamp: Date;
  status: 'pendente' | 'processando' | 'concluido' | 'erro';
  tentativas: number;
  resultado?: string;
  erro?: string;
}

const MAX_TENTATIVAS = 3;

/**
 * Adiciona mensagem à queue
 */
export async function adicionarMensagemQueue(
  db: D1Database,
  telefone: string,
  mensagem: string
): Promise<string> {
  try {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date();

    await db
      .prepare(
        `INSERT INTO mensagens_queue 
         (id, telefone, mensagem, timestamp, status, tentativas)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'pendente', 0)`
      )
      .bind(id, telefone, mensagem)
      .run();

    return id;
  } catch (error) {
    console.error('❌ Erro ao adicionar mensagem à queue:', error);
    throw error;
  }
}

/**
 * Obtém próxima mensagem pendente da queue
 */
export async function obterProximaMensagemQueue(
  db: D1Database
): Promise<MensagemQueue | null> {
  try {
    const result = await db
      .prepare(
        `SELECT id, telefone, mensagem, timestamp, status, tentativas, resultado, erro
         FROM mensagens_queue
         WHERE status = 'pendente' AND tentativas < ?
         ORDER BY timestamp ASC
         LIMIT 1`
      )
      .bind(MAX_TENTATIVAS)
      .first<{
        id: string;
        telefone: string;
        mensagem: string;
        timestamp: string;
        status: string;
        tentativas: number;
        resultado: string | null;
        erro: string | null;
      }>();

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      telefone: result.telefone,
      mensagem: result.mensagem,
      timestamp: new Date(result.timestamp),
      status: result.status as MensagemQueue['status'],
      tentativas: result.tentativas,
      resultado: result.resultado || undefined,
      erro: result.erro || undefined,
    };
  } catch (error) {
    console.error('❌ Erro ao obter próxima mensagem da queue:', error);
    return null;
  }
}

/**
 * Marca mensagem como processando
 */
export async function marcarMensagemProcessando(
  db: D1Database,
  id: string
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE mensagens_queue 
         SET status = 'processando', tentativas = tentativas + 1
         WHERE id = ?`
      )
      .bind(id)
      .run();
  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como processando:', error);
    throw error;
  }
}

/**
 * Marca mensagem como concluída
 */
export async function marcarMensagemConcluida(
  db: D1Database,
  id: string,
  resultado?: string
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE mensagens_queue 
         SET status = 'concluido', resultado = ?
         WHERE id = ?`
      )
      .bind(resultado || null, id)
      .run();
  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como concluída:', error);
    throw error;
  }
}

/**
 * Marca mensagem como erro
 */
export async function marcarMensagemErro(
  db: D1Database,
  id: string,
  erro: string
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE mensagens_queue 
         SET status = 'erro', erro = ?
         WHERE id = ?`
      )
      .bind(erro, id)
      .run();
  } catch (error) {
    console.error('❌ Erro ao marcar mensagem como erro:', error);
    throw error;
  }
}

/**
 * Limpa mensagens antigas da queue (mais de 7 dias)
 */
export async function limparQueueAntiga(db: D1Database): Promise<number> {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 7);

    const result = await db
      .prepare(
        `DELETE FROM mensagens_queue 
         WHERE timestamp < ? AND status IN ('concluido', 'erro')`
      )
      .bind(dataLimite.toISOString())
      .run();

    return result.meta.changes || 0;
  } catch (error) {
    console.error('❌ Erro ao limpar queue antiga:', error);
    return 0;
  }
}

/**
 * Obtém estatísticas da queue
 */
export async function obterEstatisticasQueue(
  db: D1Database
): Promise<{
  pendentes: number;
  processando: number;
  concluidas: number;
  erros: number;
}> {
  try {
    const result = await db
      .prepare(
        `SELECT 
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'processando' THEN 1 ELSE 0 END) as processando,
          SUM(CASE WHEN status = 'concluido' THEN 1 ELSE 0 END) as concluidas,
          SUM(CASE WHEN status = 'erro' THEN 1 ELSE 0 END) as erros
         FROM mensagens_queue`
      )
      .first<{
        pendentes: number;
        processando: number;
        concluidas: number;
        erros: number;
      }>();

    return {
      pendentes: result?.pendentes || 0,
      processando: result?.processando || 0,
      concluidas: result?.concluidas || 0,
      erros: result?.erros || 0,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas da queue:', error);
    return {
      pendentes: 0,
      processando: 0,
      concluidas: 0,
      erros: 0,
    };
  }
}

