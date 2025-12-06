// Gerenciamento de carteiras
import { prisma } from './database';

export interface Carteira {
  id: number;
  telefone: string;
  nome: string;
  descricao?: string | null;
  padrao: number; // 0 = false, 1 = true
  ativo: number; // 0 = false, 1 = true
  criadoEm: Date;
  atualizadoEm: Date;
}

/**
 * Busca todas as carteiras de um usuário
 */
export async function buscarCarteirasPorTelefone(telefone: string): Promise<Carteira[]> {
  return await prisma.carteira.findMany({
    where: {
      telefone,
      ativo: 1,
    },
    orderBy: [
      { padrao: 'desc' }, // Carteira padrão primeiro
      { criadoEm: 'asc' },
    ],
  });
}

/**
 * Busca uma carteira por ID
 */
export async function buscarCarteiraPorId(id: number, telefone: string): Promise<Carteira | null> {
  return await prisma.carteira.findFirst({
    where: {
      id,
      telefone, // Garante que a carteira pertence ao usuário
      ativo: 1,
    },
  });
}

/**
 * Busca a carteira padrão de um usuário
 */
export async function buscarCarteiraPadrao(telefone: string): Promise<Carteira | null> {
  // Primeiro tenta buscar pela carteira padrão do usuário
  const usuario = await prisma.usuario.findUnique({
    where: { telefone },
    select: { carteiraPadraoId: true },
  });

  if (usuario?.carteiraPadraoId) {
    const carteira = await buscarCarteiraPorId(usuario.carteiraPadraoId, telefone);
    if (carteira) return carteira;
  }

  // Se não encontrou, busca pela primeira carteira marcada como padrão
  const carteiraPadrao = await prisma.carteira.findFirst({
    where: {
      telefone,
      padrao: 1,
      ativo: 1,
    },
  });

  if (carteiraPadrao) return carteiraPadrao;

  // Se não encontrou, retorna a primeira carteira ativa
  return await prisma.carteira.findFirst({
    where: {
      telefone,
      ativo: 1,
    },
    orderBy: {
      criadoEm: 'asc',
    },
  });
}

/**
 * Cria uma nova carteira
 */
export async function criarCarteira(
  telefone: string,
  nome: string,
  descricao?: string,
  padrao: boolean = false
): Promise<Carteira> {
  // Se está marcando como padrão, remove o padrão das outras
  if (padrao) {
    await prisma.carteira.updateMany({
      where: {
        telefone,
        padrao: 1,
      },
      data: {
        padrao: 0,
      },
    });

    // Atualiza o usuário para apontar para esta carteira
    await prisma.usuario.updateMany({
      where: { telefone },
      data: { carteiraPadraoId: null }, // Será atualizado após criar a carteira
    });
  }

  const carteira = await prisma.carteira.create({
    data: {
      telefone,
      nome,
      descricao: descricao || null,
      padrao: padrao ? 1 : 0,
      ativo: 1,
    },
  });

  // Se é padrão, atualiza o usuário
  if (padrao) {
    await prisma.usuario.updateMany({
      where: { telefone },
      data: { carteiraPadraoId: carteira.id },
    });
  }

  return carteira;
}

/**
 * Atualiza uma carteira
 */
export async function atualizarCarteira(
  id: number,
  telefone: string,
  dados: {
    nome?: string;
    descricao?: string;
    padrao?: boolean;
    ativo?: boolean;
  }
): Promise<Carteira> {
  // Verifica se a carteira pertence ao usuário
  const carteiraExistente = await buscarCarteiraPorId(id, telefone);
  if (!carteiraExistente) {
    throw new Error('Carteira não encontrada');
  }

  // Se está marcando como padrão, remove o padrão das outras
  if (dados.padrao === true) {
    await prisma.carteira.updateMany({
      where: {
        telefone,
        padrao: 1,
        id: { not: id }, // Exceto a atual
      },
      data: {
        padrao: 0,
      },
    });

    // Atualiza o usuário
    await prisma.usuario.updateMany({
      where: { telefone },
      data: { carteiraPadraoId: id },
    });
  }

  const dadosAtualizacao: any = {};
  if (dados.nome !== undefined) dadosAtualizacao.nome = dados.nome;
  if (dados.descricao !== undefined) dadosAtualizacao.descricao = dados.descricao;
  if (dados.padrao !== undefined) dadosAtualizacao.padrao = dados.padrao ? 1 : 0;
  if (dados.ativo !== undefined) dadosAtualizacao.ativo = dados.ativo ? 1 : 0;

  return await prisma.carteira.update({
    where: { id },
    data: dadosAtualizacao,
  });
}

/**
 * Remove uma carteira (soft delete - marca como inativa)
 */
export async function removerCarteira(id: number, telefone: string): Promise<boolean> {
  const carteira = await buscarCarteiraPorId(id, telefone);
  if (!carteira) {
    return false;
  }

  // Não permite remover a carteira padrão se houver transações
  if (carteira.padrao === 1) {
    const transacoesCount = await prisma.transacao.count({
      where: {
        carteiraId: id,
      },
    });

    if (transacoesCount > 0) {
      throw new Error('Não é possível remover a carteira padrão que possui transações');
    }
  }

  // Marca como inativa
  await prisma.carteira.update({
    where: { id },
    data: { ativo: 0 },
  });

  // Se era a carteira padrão, remove a referência do usuário
  if (carteira.padrao === 1) {
    await prisma.usuario.updateMany({
      where: { telefone },
      data: { carteiraPadraoId: null },
    });
  }

  return true;
}

/**
 * Define uma carteira como padrão
 */
export async function definirCarteiraPadrao(id: number, telefone: string): Promise<Carteira> {
  const carteira = await buscarCarteiraPorId(id, telefone);
  if (!carteira) {
    throw new Error('Carteira não encontrada');
  }

  // Remove o padrão das outras
  await prisma.carteira.updateMany({
    where: {
      telefone,
      padrao: 1,
      id: { not: id },
    },
    data: {
      padrao: 0,
    },
  });

  // Marca esta como padrão
  const carteiraAtualizada = await prisma.carteira.update({
    where: { id },
    data: { padrao: 1 },
  });

  // Atualiza o usuário
  await prisma.usuario.updateMany({
    where: { telefone },
    data: { carteiraPadraoId: id },
  });

  return carteiraAtualizada;
}
