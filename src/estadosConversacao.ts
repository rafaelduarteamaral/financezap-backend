// Sistema de Estados de Conversação
// Controla o fluxo de conversação e estados temporários do usuário

import type { D1Database } from '@cloudflare/workers-types';

export enum EstadoConversacao {
  INICIAL = 'inicial',
  EXTRAINDO_TRANSACAO = 'extraindo_transacao',
  CONFIRMANDO_TRANSACAO = 'confirmando_transacao',
  EDITANDO_TRANSACAO = 'editando_transacao',
  AGUARDANDO_DADOS = 'aguardando_dados',
  PROCESSANDO_AGENDAMENTO = 'processando_agendamento',
  EDITANDO_AGENDAMENTO = 'editando_agendamento',
  AGUARDANDO_CONFIRMACAO = 'aguardando_confirmacao',
}

export interface EstadoUsuario {
  telefone: string;
  estado: EstadoConversacao;
  dadosTemporarios?: any; // Dados temporários do estado atual
  timestamp: Date;
  expiraEm: Date; // Expiração do estado (padrão: 10 minutos)
}

const ESTADO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Obtém o estado atual do usuário
 */
export async function obterEstadoUsuario(
  db: D1Database,
  telefone: string
): Promise<EstadoUsuario | null> {
  try {
    const result = await db
      .prepare(
        `SELECT telefone, estado, dadosTemporarios, timestamp, expiraEm 
         FROM estados_conversacao 
         WHERE telefone = ? AND expiraEm > CURRENT_TIMESTAMP`
      )
      .bind(telefone)
      .first<{
        telefone: string;
        estado: string;
        dadosTemporarios: string | null;
        timestamp: string;
        expiraEm: string;
      }>();

    if (!result) {
      return null;
    }

    return {
      telefone: result.telefone,
      estado: result.estado as EstadoConversacao,
      dadosTemporarios: result.dadosTemporarios
        ? JSON.parse(result.dadosTemporarios)
        : undefined,
      timestamp: new Date(result.timestamp),
      expiraEm: new Date(result.expiraEm),
    };
  } catch (error) {
    console.error('❌ Erro ao obter estado do usuário:', error);
    return null;
  }
}

/**
 * Define o estado do usuário
 */
export async function definirEstadoUsuario(
  db: D1Database,
  telefone: string,
  estado: EstadoConversacao,
  dadosTemporarios?: any,
  expiracaoMs: number = ESTADO_EXPIRACAO_MS
): Promise<void> {
  try {
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + expiracaoMs);

    await db
      .prepare(
        `INSERT INTO estados_conversacao (telefone, estado, dadosTemporarios, timestamp, expiraEm)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(telefone) DO UPDATE SET
           estado = ?,
           dadosTemporarios = ?,
           timestamp = CURRENT_TIMESTAMP,
           expiraEm = ?`
      )
      .bind(
        telefone,
        estado,
        dadosTemporarios ? JSON.stringify(dadosTemporarios) : null,
        expiraEm.toISOString(),
        estado,
        dadosTemporarios ? JSON.stringify(dadosTemporarios) : null,
        expiraEm.toISOString()
      )
      .run();
  } catch (error) {
    console.error('❌ Erro ao definir estado do usuário:', error);
    throw error;
  }
}

/**
 * Limpa o estado do usuário (volta para INICIAL)
 */
export async function limparEstadoUsuario(
  db: D1Database,
  telefone: string
): Promise<void> {
  try {
    await db
      .prepare('DELETE FROM estados_conversacao WHERE telefone = ?')
      .bind(telefone)
      .run();
  } catch (error) {
    console.error('❌ Erro ao limpar estado do usuário:', error);
    throw error;
  }
}

/**
 * Verifica se o estado expirou e limpa se necessário
 */
export async function verificarElimparEstadosExpirados(
  db: D1Database
): Promise<number> {
  try {
    const result = await db
      .prepare('DELETE FROM estados_conversacao WHERE expiraEm < CURRENT_TIMESTAMP')
      .run();

    return result.meta.changes || 0;
  } catch (error) {
    console.error('❌ Erro ao limpar estados expirados:', error);
    return 0;
  }
}

/**
 * Obtém dados temporários do estado atual
 */
export async function obterDadosTemporarios(
  db: D1Database,
  telefone: string
): Promise<any | null> {
  const estado = await obterEstadoUsuario(db, telefone);
  return estado?.dadosTemporarios || null;
}

/**
 * Atualiza apenas os dados temporários sem mudar o estado
 */
export async function atualizarDadosTemporarios(
  db: D1Database,
  telefone: string,
  dadosTemporarios: any
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE estados_conversacao 
         SET dadosTemporarios = ?, timestamp = CURRENT_TIMESTAMP
         WHERE telefone = ?`
      )
      .bind(JSON.stringify(dadosTemporarios), telefone)
      .run();
  } catch (error) {
    console.error('❌ Erro ao atualizar dados temporários:', error);
    throw error;
  }
}

