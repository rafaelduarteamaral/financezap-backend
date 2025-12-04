/**
 * Módulo de Segurança
 * 
 * Este módulo contém funções e middlewares para garantir a segurança da aplicação:
 * - Validação e sanitização de entrada
 * - Verificação de permissões
 * - Rate limiting
 * - Proteção contra ataques comuns
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Sanitiza uma string removendo caracteres perigosos
 */
export function sanitizarString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < e >
    .replace(/javascript:/gi, '') // Remove javascript:
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 500); // Limita tamanho
}

/**
 * Valida e sanitiza um telefone
 */
export function validarTelefone(telefone: string): string | null {
  if (!telefone || typeof telefone !== 'string') return null;
  
  // Remove caracteres não numéricos exceto + no início
  const limpo = telefone.replace(/^whatsapp:/i, '').trim();
  const apenasNumeros = limpo.replace(/[^\d+]/g, '');
  
  // Valida formato básico (deve ter pelo menos 10 dígitos)
  const numeros = apenasNumeros.replace(/\+/g, '');
  if (numeros.length < 10 || numeros.length > 15) {
    return null;
  }
  
  return limpo;
}

/**
 * Valida se um telefone pertence ao usuário autenticado
 */
export function validarPermissaoTelefone(
  telefoneRequisicao: string,
  telefoneAutenticado: string
): boolean {
  if (!telefoneRequisicao || !telefoneAutenticado) return false;
  
  // Normaliza ambos os telefones
  const tel1 = telefoneRequisicao.replace(/^whatsapp:/i, '').replace(/\D/g, '');
  const tel2 = telefoneAutenticado.replace(/^whatsapp:/i, '').replace(/\D/g, '');
  
  // Comparação exata
  if (tel1 === tel2) return true;
  
  // Comparação pelos últimos dígitos (para casos de formatação diferente)
  if (tel1.length >= 8 && tel2.length >= 8) {
    const ultimos1 = tel1.slice(-8);
    const ultimos2 = tel2.slice(-8);
    if (ultimos1 === ultimos2) return true;
  }
  
  return false;
}

/**
 * Middleware para validar que o usuário só acessa seus próprios dados
 */
export function validarPermissaoDados(req: any, res: Response, next: NextFunction) {
  const telefoneAutenticado = req.telefone;
  
  if (!telefoneAutenticado) {
    return res.status(401).json({
      success: false,
      error: 'Usuário não autenticado'
    });
  }
  
  // Verifica se há telefone na query/params e valida permissão
  const telefoneRequisicao = req.params.telefone || req.query.telefone;
  
  if (telefoneRequisicao && !validarPermissaoTelefone(telefoneRequisicao, telefoneAutenticado)) {
    console.warn(`⚠️  Tentativa de acesso não autorizado: ${telefoneAutenticado} tentou acessar ${telefoneRequisicao}`);
    return res.status(403).json({
      success: false,
      error: 'Você não tem permissão para acessar estes dados'
    });
  }
  
  // Garante que o telefone usado é sempre o do usuário autenticado
  req.telefone = telefoneAutenticado;
  next();
}

/**
 * Middleware para sanitizar dados de entrada
 */
export function sanitizarEntrada(req: Request, res: Response, next: NextFunction) {
  // Sanitiza query params
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizarString(req.query[key] as string);
      }
    }
  }
  
  // Sanitiza body
  if (req.body && typeof req.body === 'object') {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizarString(req.body[key]);
      }
    }
  }
  
  // Sanitiza params
  if (req.params) {
    for (const key in req.params) {
      if (typeof req.params[key] === 'string') {
        req.params[key] = sanitizarString(req.params[key]);
      }
    }
  }
  
  next();
}

/**
 * Valida formato de email
 */
export function validarEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida número (valor monetário)
 */
export function validarValor(valor: any): number | null {
  if (typeof valor === 'number') {
    if (valor < 0 || valor > 999999999) return null; // Limites razoáveis
    return Math.round(valor * 100) / 100; // Arredonda para 2 casas decimais
  }
  
  if (typeof valor === 'string') {
    const num = parseFloat(valor.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 999999999) return null;
    return Math.round(num * 100) / 100;
  }
  
  return null;
}

/**
 * Valida data no formato YYYY-MM-DD
 */
export function validarData(data: string): string | null {
  if (!data || typeof data !== 'string') return null;
  
  const dataLimpa = data.trim().substring(0, 10);
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!regex.test(dataLimpa)) return null;
  
  const date = new Date(dataLimpa + 'T00:00:00');
  if (isNaN(date.getTime())) return null;
  
  return dataLimpa;
}

/**
 * Remove dados sensíveis de objetos antes de logar
 */
export function sanitizarParaLog(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitizado = { ...obj };
  const camposSensiveis = ['senha', 'password', 'token', 'auth', 'authorization', 'secret', 'key'];
  
  for (const key in sanitizado) {
    const keyLower = key.toLowerCase();
    if (camposSensiveis.some(campo => keyLower.includes(campo))) {
      sanitizado[key] = '***REDACTED***';
    }
    
    if (typeof sanitizado[key] === 'object' && sanitizado[key] !== null) {
      sanitizado[key] = sanitizarParaLog(sanitizado[key]);
    }
  }
  
  return sanitizado;
}

