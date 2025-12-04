// Sistema de rate limiting e proteção contra spam

interface RateLimitInfo {
  telefone: string;
  mensagens: Array<{ timestamp: number; messageSid: string }>;
  bloqueadoAte?: number; // Timestamp até quando está bloqueado
}

// Armazena informações de rate limiting por telefone
const rateLimitMap = new Map<string, RateLimitInfo>();

// Configurações (podem ser movidas para .env)
const RATE_LIMIT = {
  MAX_MENSAGENS_POR_MINUTO: 5, // Máximo de 5 mensagens por minuto
  MAX_MENSAGENS_POR_HORA: 30,   // Máximo de 30 mensagens por hora
  TEMPO_BLOQUEIO_MINUTOS: 15,   // Bloqueia por 15 minutos se exceder
  TEMPO_DUPLICATA_SEGUNDOS: 10, // Ignora mensagens duplicadas em 10 segundos
};

/**
 * Verifica se uma mensagem pode ser processada
 * Retorna { permitido: boolean, motivo?: string }
 */
export function verificarRateLimit(
  telefone: string,
  messageSid: string,
  mensagem: string
): { permitido: boolean; motivo?: string; tempoEspera?: number } {
  const agora = Date.now();
  const telefoneLimpo = telefone.replace('whatsapp:', '').trim();
  
  // Calcula o hash da mensagem logo no início (antes de qualquer return)
  // Garante que sempre terá um valor válido - FORÇA inicialização com const
  const mensagemHash: string = 
    (messageSid && typeof messageSid === 'string' && messageSid.trim().length > 0) 
      ? messageSid.trim()
      : (mensagem && typeof mensagem === 'string' && mensagem.trim().length > 0)
        ? mensagem.substring(0, 50).trim()
        : `msg_${agora}_${Math.random().toString(36).substring(7)}`;
  
  // Validação final - nunca deve falhar, mas garante segurança absoluta
  const hashFinal: string = (mensagemHash && typeof mensagemHash === 'string' && mensagemHash.length > 0)
    ? mensagemHash
    : `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // Busca ou cria registro de rate limiting
  let rateLimitInfo = rateLimitMap.get(telefoneLimpo);
  
  if (!rateLimitInfo) {
    rateLimitInfo = {
      telefone: telefoneLimpo,
      mensagens: [],
    };
    rateLimitMap.set(telefoneLimpo, rateLimitInfo);
  }
  
  // Verifica se está bloqueado
  if (rateLimitInfo.bloqueadoAte && agora < rateLimitInfo.bloqueadoAte) {
    const minutosRestantes = Math.ceil((rateLimitInfo.bloqueadoAte - agora) / 60000);
    return {
      permitido: false,
      motivo: `Você foi temporariamente bloqueado por enviar muitas mensagens. Tente novamente em ${minutosRestantes} minuto(s).`,
      tempoEspera: rateLimitInfo.bloqueadoAte - agora,
    };
  }
  
  // Remove bloqueio se já passou
  if (rateLimitInfo.bloqueadoAte && agora >= rateLimitInfo.bloqueadoAte) {
    rateLimitInfo.bloqueadoAte = undefined;
  }
  
  // Remove mensagens antigas (mais de 1 hora)
  const umaHoraAtras = agora - (60 * 60 * 1000);
  rateLimitInfo.mensagens = rateLimitInfo.mensagens.filter(
    m => m.timestamp > umaHoraAtras
  );
  
  // Verifica duplicatas (mesma mensagem em pouco tempo)
  const dezSegundosAtras = agora - (RATE_LIMIT.TEMPO_DUPLICATA_SEGUNDOS * 1000);
  
  const duplicata = rateLimitInfo.mensagens.find(
    m => m.messageSid === hashFinal && m.timestamp > dezSegundosAtras
  );
  
  if (duplicata) {
    console.log(`⚠️  Mensagem duplicada ignorada: ${telefoneLimpo} (últimos ${RATE_LIMIT.TEMPO_DUPLICATA_SEGUNDOS}s)`);
    return {
      permitido: false,
      motivo: 'Mensagem duplicada. Aguarde alguns segundos antes de enviar novamente.',
    };
  }
  
  // Verifica limite por minuto
  const umMinutoAtras = agora - (60 * 1000);
  const mensagensUltimoMinuto = rateLimitInfo.mensagens.filter(
    m => m.timestamp > umMinutoAtras
  ).length;
  
  if (mensagensUltimoMinuto >= RATE_LIMIT.MAX_MENSAGENS_POR_MINUTO) {
    // Bloqueia por 15 minutos
    rateLimitInfo.bloqueadoAte = agora + (RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS * 60 * 1000);
    console.log(`🚫 Rate limit excedido: ${telefoneLimpo} - ${mensagensUltimoMinuto} mensagens no último minuto`);
    return {
      permitido: false,
      motivo: `Você excedeu o limite de ${RATE_LIMIT.MAX_MENSAGENS_POR_MINUTO} mensagens por minuto. Você foi bloqueado por ${RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS} minutos.`,
      tempoEspera: RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS * 60 * 1000,
    };
  }
  
  // Verifica limite por hora
  const mensagensUltimaHora = rateLimitInfo.mensagens.length;
  if (mensagensUltimaHora >= RATE_LIMIT.MAX_MENSAGENS_POR_HORA) {
    // Bloqueia por 15 minutos
    rateLimitInfo.bloqueadoAte = agora + (RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS * 60 * 1000);
    console.log(`🚫 Rate limit excedido: ${telefoneLimpo} - ${mensagensUltimaHora} mensagens na última hora`);
    return {
      permitido: false,
      motivo: `Você excedeu o limite de ${RATE_LIMIT.MAX_MENSAGENS_POR_HORA} mensagens por hora. Você foi bloqueado por ${RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS} minutos.`,
      tempoEspera: RATE_LIMIT.TEMPO_BLOQUEIO_MINUTOS * 60 * 1000,
    };
  }
  
  // Registra a mensagem
  rateLimitInfo.mensagens.push({
    timestamp: agora,
    messageSid: hashFinal,
  });
  
  // Limita o array a 100 mensagens (para não crescer indefinidamente)
  if (rateLimitInfo.mensagens.length > 100) {
    rateLimitInfo.mensagens = rateLimitInfo.mensagens.slice(-100);
  }
  
  console.log(`✅ Rate limit OK: ${telefoneLimpo} - ${mensagensUltimoMinuto + 1}/${RATE_LIMIT.MAX_MENSAGENS_POR_MINUTO} no minuto, ${mensagensUltimaHora + 1}/${RATE_LIMIT.MAX_MENSAGENS_POR_HORA} na hora`);
  
  return { permitido: true };
}

/**
 * Limpa registros antigos (mais de 24 horas)
 */
export function limparRateLimitAntigo(): void {
  const vinteQuatroHorasAtras = Date.now() - (24 * 60 * 60 * 1000);
  
  for (const [telefone, info] of rateLimitMap.entries()) {
    // Remove mensagens antigas
    info.mensagens = info.mensagens.filter(m => m.timestamp > vinteQuatroHorasAtras);
    
    // Remove bloqueios expirados
    if (info.bloqueadoAte && info.bloqueadoAte < Date.now()) {
      info.bloqueadoAte = undefined;
    }
    
    // Remove entrada se não tem mais mensagens e não está bloqueado
    if (info.mensagens.length === 0 && !info.bloqueadoAte) {
      rateLimitMap.delete(telefone);
    }
  }
}

// Limpa registros antigos a cada hora
setInterval(limparRateLimitAntigo, 60 * 60 * 1000);

