// Sistema de Métricas e Monitoramento
// Coleta métricas de performance e taxa de sucesso

import type { D1Database } from '@cloudflare/workers-types';

export interface MetricaProcessamento {
  telefone: string;
  tipoMensagem: string;
  tempoProcessamento: number; // em ms
  sucesso: boolean;
  erro?: string;
  timestamp: Date;
  detalhes?: Record<string, any>;
}

/**
 * Registra uma métrica de processamento
 */
export async function registrarMetrica(
  db: D1Database,
  metrica: MetricaProcessamento
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO metricas_processamento 
         (telefone, tipoMensagem, tempoProcessamento, sucesso, erro, timestamp, detalhes)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`
      )
      .bind(
        metrica.telefone,
        metrica.tipoMensagem,
        metrica.tempoProcessamento,
        metrica.sucesso ? 1 : 0,
        metrica.erro || null,
        metrica.detalhes ? JSON.stringify(metrica.detalhes) : null
      )
      .run();
  } catch (error) {
    console.error('❌ Erro ao registrar métrica:', error);
    // Não propaga erro - métricas são opcionais
  }
}

/**
 * Obtém estatísticas de processamento
 */
export async function obterEstatisticasProcessamento(
  db: D1Database,
  telefone?: string,
  dias: number = 7
): Promise<{
  total: number;
  sucesso: number;
  falhas: number;
  taxaSucesso: number;
  tempoMedio: number;
  tiposMensagem: Record<string, number>;
}> {
  try {
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);

    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) as sucesso,
        SUM(CASE WHEN sucesso = 0 THEN 1 ELSE 0 END) as falhas,
        AVG(tempoProcessamento) as tempoMedio
      FROM metricas_processamento
      WHERE timestamp >= ?
    `;

    const params: any[] = [dataInicio.toISOString()];

    if (telefone) {
      query += ' AND telefone = ?';
      params.push(telefone);
    }

    const result = await db.prepare(query).bind(...params).first<{
      total: number;
      sucesso: number;
      falhas: number;
      tempoMedio: number;
    }>();

    const total = result?.total || 0;
    const sucesso = result?.sucesso || 0;
    const falhas = result?.falhas || 0;
    const tempoMedio = result?.tempoMedio || 0;

    // Obtém tipos de mensagem
    let queryTipos = `
      SELECT tipoMensagem, COUNT(*) as quantidade
      FROM metricas_processamento
      WHERE timestamp >= ?
    `;

    const paramsTipos: any[] = [dataInicio.toISOString()];

    if (telefone) {
      queryTipos += ' AND telefone = ?';
      paramsTipos.push(telefone);
    }

    queryTipos += ' GROUP BY tipoMensagem';

    const tiposResult = await db
      .prepare(queryTipos)
      .bind(...paramsTipos)
      .all<{ tipoMensagem: string; quantidade: number }>();

    const tiposMensagem: Record<string, number> = {};
    tiposResult.results?.forEach((row) => {
      tiposMensagem[row.tipoMensagem] = row.quantidade;
    });

    return {
      total,
      sucesso,
      falhas,
      taxaSucesso: total > 0 ? (sucesso / total) * 100 : 0,
      tempoMedio: Math.round(tempoMedio),
      tiposMensagem,
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    return {
      total: 0,
      sucesso: 0,
      falhas: 0,
      taxaSucesso: 0,
      tempoMedio: 0,
      tiposMensagem: {},
    };
  }
}

/**
 * Limpa métricas antigas (mais de 30 dias)
 */
export async function limparMetricasAntigas(db: D1Database): Promise<number> {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);

    const result = await db
      .prepare('DELETE FROM metricas_processamento WHERE timestamp < ?')
      .bind(dataLimite.toISOString())
      .run();

    return result.meta.changes || 0;
  } catch (error) {
    console.error('❌ Erro ao limpar métricas antigas:', error);
    return 0;
  }
}

/**
 * Wrapper para medir tempo de execução
 */
export async function medirTempoExecucao<T>(
  db: D1Database,
  telefone: string,
  tipoMensagem: string,
  operacao: () => Promise<T>
): Promise<T> {
  const inicio = Date.now();

  try {
    const resultado = await operacao();
    const tempo = Date.now() - inicio;

    await registrarMetrica(db, {
      telefone,
      tipoMensagem,
      tempoProcessamento: tempo,
      sucesso: true,
      timestamp: new Date(),
    });

    return resultado;
  } catch (error: any) {
    const tempo = Date.now() - inicio;

    await registrarMetrica(db, {
      telefone,
      tipoMensagem,
      tempoProcessamento: tempo,
      sucesso: false,
      erro: error?.message || String(error),
      timestamp: new Date(),
    });

    throw error;
  }
}

