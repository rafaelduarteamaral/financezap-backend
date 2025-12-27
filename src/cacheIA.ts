// Sistema de Cache Inteligente para IA
// Reduz chamadas à IA cacheando resultados similares

import type { D1Database } from '@cloudflare/workers-types';

export interface CacheEntry {
  chave: string;
  resultado: any;
  timestamp: number;
  ttl: number; // Time to live em ms
  tipo: 'extracao_transacao' | 'extracao_agendamento' | 'decisao_endpoint' | 'outro';
}

const CACHE_TTL_PADRAO = 5 * 60 * 1000; // 5 minutos

/**
 * Gera uma chave de cache baseada na mensagem e tipo
 */
function gerarChaveCache(mensagem: string, tipo: string): string {
  // Normaliza a mensagem (remove espaços extras, converte para lowercase)
  const normalizada = mensagem
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 200); // Limita tamanho

  // Cria hash simples (em produção, usar crypto.subtle)
  let hash = 0;
  for (let i = 0; i < normalizada.length; i++) {
    const char = normalizada.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `${tipo}_${Math.abs(hash)}`;
}

/**
 * Verifica se há cache válido
 */
export async function obterCache(
  db: D1Database,
  mensagem: string,
  tipo: string
): Promise<any | null> {
  try {
    const chave = gerarChaveCache(mensagem, tipo);

    const result = await db
      .prepare(
        `SELECT resultado, timestamp, ttl 
         FROM cache_ia 
         WHERE chave = ? AND (timestamp + ttl) > (strftime('%s', 'now') * 1000)`
      )
      .bind(chave)
      .first<{
        resultado: string;
        timestamp: number;
        ttl: number;
      }>();

    if (!result) {
      return null;
    }

    return JSON.parse(result.resultado);
  } catch (error) {
    console.error('❌ Erro ao obter cache:', error);
    return null;
  }
}

/**
 * Armazena resultado no cache
 */
export async function armazenarCache(
  db: D1Database,
  mensagem: string,
  tipo: string,
  resultado: any,
  ttl: number = CACHE_TTL_PADRAO
): Promise<void> {
  try {
    const chave = gerarChaveCache(mensagem, tipo);
    const timestamp = Date.now();

    await db
      .prepare(
        `INSERT INTO cache_ia (chave, tipo, resultado, timestamp, ttl)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(chave) DO UPDATE SET
           resultado = ?,
           timestamp = ?,
           ttl = ?`
      )
      .bind(
        chave,
        tipo,
        JSON.stringify(resultado),
        timestamp,
        ttl,
        JSON.stringify(resultado),
        timestamp,
        ttl
      )
      .run();
  } catch (error) {
    console.error('❌ Erro ao armazenar cache:', error);
    // Não propaga erro - cache é opcional
  }
}

/**
 * Limpa cache expirado
 */
export async function limparCacheExpirado(db: D1Database): Promise<number> {
  try {
    const agora = Date.now();
    const result = await db
      .prepare(
        `DELETE FROM cache_ia 
         WHERE (timestamp + ttl) < ?`
      )
      .bind(agora)
      .run();

    return result.meta.changes || 0;
  } catch (error) {
    console.error('❌ Erro ao limpar cache expirado:', error);
    return 0;
  }
}

/**
 * Limpa todo o cache de um tipo específico
 */
export async function limparCachePorTipo(
  db: D1Database,
  tipo: string
): Promise<number> {
  try {
    const result = await db
      .prepare('DELETE FROM cache_ia WHERE tipo = ?')
      .bind(tipo)
      .run();

    return result.meta.changes || 0;
  } catch (error) {
    console.error('❌ Erro ao limpar cache por tipo:', error);
    return 0;
  }
}

/**
 * Wrapper para operações com cache
 */
export async function processarComCache<T>(
  db: D1Database,
  mensagem: string,
  tipo: string,
  operacao: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Tenta obter do cache
  const cacheado = await obterCache(db, mensagem, tipo);
  if (cacheado !== null) {
    console.log(`✅ Cache hit para tipo: ${tipo}`);
    return cacheado as T;
  }

  // Se não está no cache, executa a operação
  console.log(`❌ Cache miss para tipo: ${tipo}`);
  const resultado = await operacao();

  // Armazena no cache
  await armazenarCache(db, mensagem, tipo, resultado, ttl);

  return resultado;
}

