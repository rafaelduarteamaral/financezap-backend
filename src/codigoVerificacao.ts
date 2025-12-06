// Gerenciamento de códigos de verificação para login via WhatsApp

// Importa funções do D1 (usado quando D1 está disponível)
import {
  salvarCodigoVerificacaoD1,
  verificarCodigoD1
} from './d1';

interface CodigoVerificacao {
  telefone: string;
  codigo: string;
  criadoEm: Date;
  expiraEm: Date;
}

// Importa a interface D1Database de d1.ts para manter consistência
import type { D1Database } from './d1';

// Armazena códigos em memória (fallback para desenvolvimento local)
const codigosVerificacao = new Map<string, CodigoVerificacao>();

// Tempo de expiração do código (5 minutos)
const TEMPO_EXPIRACAO_MS = 5 * 60 * 1000;

/**
 * Gera um código de verificação de 6 dígitos
 */
export function gerarCodigoVerificacao(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Salva um código de verificação para um telefone
 * Se db (D1) for fornecido, salva no banco de dados; caso contrário, usa memória
 */
export async function salvarCodigoVerificacao(
  telefone: string, 
  codigo: string, 
  db?: D1Database
): Promise<void> {
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + TEMPO_EXPIRACAO_MS);
  
  // Se D1 está disponível, usa D1
  if (db) {
    try {
      await salvarCodigoVerificacaoD1(db, telefone, codigo, expiraEm);
      return;
    } catch (error: any) {
      console.error('❌ Erro ao salvar código no D1, usando memória como fallback:', error.message);
      // Continua com memória como fallback
    }
  }
  
  // Fallback: usa memória
  codigosVerificacao.set(telefone, {
    telefone,
    codigo,
    criadoEm: agora,
    expiraEm
  });
  
  console.log(`✅ Código de verificação salvo para ${telefone}: ${codigo} (expira em 5 minutos)`);
}

/**
 * Verifica se um código é válido para um telefone
 * Se db (D1) for fornecido, verifica no banco de dados; caso contrário, usa memória
 */
export async function verificarCodigo(
  telefone: string, 
  codigo: string, 
  db?: D1Database
): Promise<boolean> {
  // Normaliza o código (remove espaços e converte para string)
  const codigoNormalizado = String(codigo).trim().replace(/\s/g, '');
  
  // Debug: mostra todos os códigos salvos
  console.log(`\n🔍 DEBUG - Verificando código:`);
  console.log(`   Telefone recebido: "${telefone}"`);
  console.log(`   Código recebido: "${codigo}" (normalizado: "${codigoNormalizado}")`);
  
  // Se D1 está disponível, usa D1
  if (db) {
    try {
      const resultado = await verificarCodigoD1(db, telefone, codigo);
      return resultado;
    } catch (error: any) {
      console.error('❌ Erro ao verificar código no D1, usando memória como fallback:', error.message);
      // Continua com memória como fallback
    }
  }
  
  // Fallback: usa memória
  console.log(`   Total de códigos salvos em memória: ${codigosVerificacao.size}`);
  
  // Lista todos os telefones com códigos salvos
  if (codigosVerificacao.size > 0) {
    console.log(`   Telefones com códigos salvos:`);
    for (const [tel, cod] of codigosVerificacao.entries()) {
      console.log(`     - "${tel}": código "${cod.codigo}" (expira em ${cod.expiraEm.toLocaleString('pt-BR')})`);
    }
  }
  
  const codigoSalvo = codigosVerificacao.get(telefone);
  
  if (!codigoSalvo) {
    console.log(`❌ Nenhum código encontrado para "${telefone}"`);
    // Tenta buscar com variações do telefone
    const telefoneSemWhatsapp = telefone.replace('whatsapp:', '');
    const telefoneComWhatsapp = telefone.startsWith('whatsapp:') ? telefone : `whatsapp:${telefone}`;
    const telefoneSemMais = telefone.replace(/\+/g, '');
    
    const variacoes = [telefoneSemWhatsapp, telefoneComWhatsapp, telefoneSemMais];
    for (const variacao of variacoes) {
      const codigoVariacao = codigosVerificacao.get(variacao);
      if (codigoVariacao) {
        console.log(`   💡 Encontrado código com variação do telefone: "${variacao}"`);
        codigosVerificacao.delete(variacao);
        codigosVerificacao.set(telefone, codigoVariacao);
        // Continua a verificação com o código encontrado
        const codigoSalvoCorrigido = codigoVariacao;
        
        // Verifica se expirou
        if (new Date() > codigoSalvoCorrigido.expiraEm) {
          console.log(`❌ Código expirado para ${telefone}`);
          codigosVerificacao.delete(telefone);
          return false;
        }
        
        // Verifica se o código está correto
        if (codigoSalvoCorrigido.codigo !== codigoNormalizado) {
          console.log(`❌ Código incorreto para ${telefone}. Esperado: "${codigoSalvoCorrigido.codigo}", Recebido: "${codigoNormalizado}"`);
          return false;
        }
        
        // Código válido
        codigosVerificacao.delete(telefone);
        console.log(`✅ Código verificado com sucesso para ${telefone}`);
        return true;
      }
    }
    return false;
  }
  
  // Verifica se expirou
  if (new Date() > codigoSalvo.expiraEm) {
    console.log(`❌ Código expirado para ${telefone}`);
    codigosVerificacao.delete(telefone);
    return false;
  }
  
  // Verifica se o código está correto (comparação normalizada)
  if (codigoSalvo.codigo !== codigoNormalizado) {
    console.log(`❌ Código incorreto para ${telefone}.`);
    console.log(`   Esperado: "${codigoSalvo.codigo}" (tipo: ${typeof codigoSalvo.codigo})`);
    console.log(`   Recebido: "${codigoNormalizado}" (tipo: ${typeof codigoNormalizado})`);
    console.log(`   Comparação: ${codigoSalvo.codigo === codigoNormalizado ? 'IGUAL' : 'DIFERENTE'}`);
    return false;
  }
  
  // Código válido - remove para não ser reutilizado
  codigosVerificacao.delete(telefone);
  console.log(`✅ Código verificado com sucesso para ${telefone}`);
  return true;
}

/**
 * Remove códigos expirados (limpeza periódica)
 */
export function limparCodigosExpirados(): void {
  const agora = new Date();
  let removidos = 0;
  
  for (const [telefone, codigo] of codigosVerificacao.entries()) {
    if (agora > codigo.expiraEm) {
      codigosVerificacao.delete(telefone);
      removidos++;
    }
  }
  
  if (removidos > 0) {
    console.log(`🧹 ${removidos} código(s) expirado(s) removido(s)`);
  }
}

// Limpa códigos expirados quando necessário (chamado manualmente)
// Nota: setInterval não funciona no Cloudflare Workers, então limpamos sob demanda
// A limpeza acontece automaticamente quando verificamos códigos

