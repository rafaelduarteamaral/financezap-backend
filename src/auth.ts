// Sistema de autenticação JWT
import jwt from 'jsonwebtoken';

// Validação de JWT_SECRET em produção
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 dias por padrão

if (!JWT_SECRET) {
  console.error('❌ ERRO CRÍTICO: JWT_SECRET não configurado!');
  console.error('   Configure a variável JWT_SECRET no arquivo .env');
  console.error('   Use uma chave forte (mínimo 32 caracteres aleatórios)');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
  console.warn('   ⚠️  Usando chave padrão insegura (APENAS PARA DESENVOLVIMENTO)');
}

// Valida força da chave em produção
if (process.env.NODE_ENV === 'production' && JWT_SECRET && JWT_SECRET.length < 32) {
  console.error('❌ ERRO: JWT_SECRET muito curto! Use pelo menos 32 caracteres.');
  process.exit(1);
}

export interface JWTPayload {
  telefone: string;
  iat?: number;
  exp?: number;
}

/**
 * Gera um token JWT para o telefone
 */
export function gerarToken(telefone: string): string {
  const payload: JWTPayload = {
    telefone,
  };

  const secret: string = JWT_SECRET || 'default-secret-for-development-only';
  const expiresIn: string = JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn,
  } as jwt.SignOptions);
}

/**
 * Verifica e decodifica um token JWT
 */
export function verificarToken(token: string): JWTPayload {
  try {
    const secret: string = JWT_SECRET || 'default-secret-for-development-only';
    const decoded = jwt.verify(token, secret as string) as unknown as JWTPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expirado');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Token inválido');
    }
    throw new Error('Erro ao verificar token');
  }
}

/**
 * Middleware de autenticação para Express
 */
export function autenticarMiddleware(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token não fornecido',
      });
    }

    const token = authHeader.substring(7);
    const decoded = verificarToken(token);

    // Adiciona o telefone decodificado à requisição
    req.telefone = decoded.telefone;
    next();
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      error: error.message || 'Token inválido',
    });
  }
}

