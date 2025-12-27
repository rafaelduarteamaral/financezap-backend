// Sistema de Retry e Resiliência
// Implementa retry com backoff exponencial e tratamento de erros

export interface RetryOptions {
  maxTentativas?: number;
  delayInicial?: number;
  multiplicador?: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxTentativas: 3,
  delayInicial: 1000, // 1 segundo
  multiplicador: 2,
  maxDelay: 10000, // 10 segundos
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'timeout',
    'network',
    'fetch failed',
    '500',
    '502',
    '503',
    '504',
  ],
};

/**
 * Verifica se um erro é recuperável (deve tentar novamente)
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorMessage = (error?.message || error?.toString() || '').toLowerCase();
  const errorCode = error?.code || error?.status || '';

  return retryableErrors.some(
    (retryable) =>
      errorMessage.includes(retryable.toLowerCase()) ||
      errorCode.toString().includes(retryable)
  );
}

/**
 * Calcula o delay para a próxima tentativa (backoff exponencial)
 */
function calcularDelay(
  tentativa: number,
  delayInicial: number,
  multiplicador: number,
  maxDelay: number
): number {
  const delay = delayInicial * Math.pow(multiplicador, tentativa - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Executa uma operação com retry automático
 */
export async function processarComRetry<T>(
  operacao: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let ultimoErro: Error | null = null;

  for (let tentativa = 1; tentativa <= config.maxTentativas; tentativa++) {
    try {
      return await operacao();
    } catch (error: any) {
      ultimoErro = error instanceof Error ? error : new Error(String(error));

      // Se não é o último tentativa e o erro é recuperável, tenta novamente
      if (tentativa < config.maxTentativas && isRetryableError(error, config.retryableErrors)) {
        const delay = calcularDelay(
          tentativa,
          config.delayInicial,
          config.multiplicador,
          config.maxDelay
        );

        console.log(
          `⚠️ Tentativa ${tentativa}/${config.maxTentativas} falhou. Tentando novamente em ${delay}ms...`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Se não é recuperável ou é a última tentativa, propaga o erro
      throw ultimoErro;
    }
  }

  // Nunca deve chegar aqui, mas TypeScript exige
  throw ultimoErro || new Error('Erro desconhecido após todas as tentativas');
}

/**
 * Wrapper para chamadas de API com retry
 */
export async function chamarAPIComRetry<T>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  return processarComRetry(async () => {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erro desconhecido');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }, retryOptions);
}

/**
 * Wrapper para operações de banco de dados com retry
 */
export async function executarDBComRetry<T>(
  operacao: () => Promise<T>,
  retryOptions: RetryOptions = {}
): Promise<T> {
  return processarComRetry(operacao, {
    ...retryOptions,
    retryableErrors: [
      ...(retryOptions.retryableErrors || []),
      'database',
      'sqlite',
      'locked',
      'busy',
    ],
  });
}

/**
 * Executa múltiplas operações em paralelo com retry individual
 */
export async function processarParaleloComRetry<T>(
  operacoes: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T[]> {
  const resultados = await Promise.allSettled(
    operacoes.map((op) => processarComRetry(op, options))
  );

  const sucessos: T[] = [];
  const erros: Error[] = [];

  resultados.forEach((resultado, index) => {
    if (resultado.status === 'fulfilled') {
      sucessos.push(resultado.value);
    } else {
      erros.push(
        resultado.reason instanceof Error
          ? resultado.reason
          : new Error(`Operação ${index} falhou`)
      );
    }
  });

  // Se todas falharam, lança o primeiro erro
  if (erros.length === operacoes.length && erros.length > 0) {
    throw erros[0];
  }

  // Se algumas falharam, loga mas retorna as que deram certo
  if (erros.length > 0) {
    console.warn(`⚠️ ${erros.length} de ${operacoes.length} operações falharam:`, erros);
  }

  return sucessos;
}

