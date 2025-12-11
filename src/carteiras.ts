// Gerenciamento de carteiras
import { prisma } from './database';

export interface Carteira {
  id: number;
  telefone: string;
  nome: string;
  descricao?: string | null;
  tipo: string; // "debito" ou "credito"
  limiteCredito?: number | null; // Limite da conta de crédito (apenas para tipo "credito")
  diaPagamento?: number | null; // Dia do mês para pagamento da fatura (apenas para tipo "credito", 1-31)
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
  padrao: boolean = false,
  tipo: string = 'debito',
  limiteCredito?: number | null,
  diaPagamento?: number | null
): Promise<Carteira> {
  // Validações (apenas se os valores foram fornecidos explicitamente)
  if (tipo === 'credito') {
    // Se limiteCredito foi fornecido, valida
    if (limiteCredito !== undefined && limiteCredito !== null) {
      if (limiteCredito <= 0) {
        throw new Error('Limite de crédito deve ser maior que zero');
      }
    }
    // Se diaPagamento foi fornecido, valida
    if (diaPagamento !== undefined && diaPagamento !== null) {
      if (diaPagamento < 1 || diaPagamento > 31) {
        throw new Error('Dia de pagamento deve ser entre 1 e 31');
      }
    }
    // Se não foram fornecidos, usa valores padrão
    if (limiteCredito === undefined || limiteCredito === null) {
      limiteCredito = 1000; // Valor padrão
    }
    if (diaPagamento === undefined || diaPagamento === null) {
      diaPagamento = 10; // Dia padrão
    }
  }

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
      tipo: tipo || 'debito',
      limiteCredito: tipo === 'credito' ? (limiteCredito ?? 1000) : null,
      diaPagamento: tipo === 'credito' ? (diaPagamento ?? 10) : null,
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
    tipo?: string;
    limiteCredito?: number | null;
    diaPagamento?: number | null;
  }
): Promise<Carteira> {
  // Verifica se a carteira pertence ao usuário
  const carteiraExistente = await buscarCarteiraPorId(id, telefone);
  if (!carteiraExistente) {
    throw new Error('Carteira não encontrada');
  }

  // Validações para carteira de crédito
  if (dados.tipo === 'credito') {
    if (dados.limiteCredito !== undefined && (dados.limiteCredito === null || dados.limiteCredito <= 0)) {
      throw new Error('Limite de crédito é obrigatório e deve ser maior que zero para carteiras do tipo crédito');
    }
    if (dados.diaPagamento !== undefined && (dados.diaPagamento === null || dados.diaPagamento < 1 || dados.diaPagamento > 31)) {
      throw new Error('Dia de pagamento deve ser entre 1 e 31 para carteiras do tipo crédito');
    }
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
  if (dados.tipo !== undefined) dadosAtualizacao.tipo = dados.tipo;
  if (dados.limiteCredito !== undefined) dadosAtualizacao.limiteCredito = dados.limiteCredito;
  if (dados.diaPagamento !== undefined) dadosAtualizacao.diaPagamento = dados.diaPagamento;

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
 * Busca ou cria uma carteira apropriada para o tipo de transação
 * Se a carteira padrão for crédito e a transação for débito, busca/cria uma carteira débito com mesmo nome
 * Se a carteira padrão for débito e a transação for crédito, busca/cria uma carteira crédito com mesmo nome
 */
export async function buscarOuCriarCarteiraPorTipo(
  telefone: string,
  tipoTransacao: 'debito' | 'credito'
): Promise<Carteira> {
  // Busca a carteira padrão
  let carteiraPadrao = await buscarCarteiraPadrao(telefone);
  
  // Se não houver carteira padrão, cria uma do tipo correto
  if (!carteiraPadrao) {
    console.log(`📦 Nenhuma carteira encontrada. Criando carteira padrão do tipo ${tipoTransacao}...`);
    carteiraPadrao = await criarCarteira(
      telefone,
      'Carteira Principal',
      'Carteira padrão criada automaticamente',
      true, // Define como padrão
      tipoTransacao
    );
    console.log(`✅ Carteira padrão criada automaticamente: ID ${carteiraPadrao.id} (tipo: ${tipoTransacao})`);
    return carteiraPadrao;
  }
  
  // Se a carteira padrão já é do tipo correto, retorna ela
  if (carteiraPadrao.tipo === tipoTransacao) {
    return carteiraPadrao;
  }
  
  // Se a carteira padrão é de um tipo diferente, busca ou cria uma carteira com mesmo nome mas tipo correto
  const carteirasUsuario = await buscarCarteirasPorTelefone(telefone);
  const carteiraMesmoNome = carteirasUsuario.find(c => 
    c.nome === carteiraPadrao!.nome && 
    c.tipo === tipoTransacao &&
    c.ativo === 1
  );
  
  if (carteiraMesmoNome) {
    console.log(`📦 Carteira ${tipoTransacao} encontrada com mesmo nome: "${carteiraMesmoNome.nome}" (ID: ${carteiraMesmoNome.id})`);
    return carteiraMesmoNome;
  }
  
  // Cria uma nova carteira com mesmo nome mas tipo diferente
  console.log(`📦 Criando carteira ${tipoTransacao} com nome "${carteiraPadrao.nome}"...`);
  
  // Se for criar carteira de crédito, precisa de limite e dia de pagamento
  // Se a carteira padrão já tinha esses valores, usa eles, senão usa valores padrão
  const limiteCredito = tipoTransacao === 'credito' 
    ? (carteiraPadrao.limiteCredito || 1000) 
    : null;
  const diaPagamento = tipoTransacao === 'credito' 
    ? (carteiraPadrao.diaPagamento || 10) 
    : null;
  
  const novaCarteira = await criarCarteira(
    telefone,
    carteiraPadrao.nome,
    carteiraPadrao.descricao || `Carteira ${tipoTransacao === 'credito' ? 'de crédito' : 'de débito'} criada automaticamente`,
    false, // Não define como padrão (mantém a original como padrão)
    tipoTransacao,
    limiteCredito,
    diaPagamento
  );
  console.log(`✅ Carteira ${tipoTransacao} criada: ID ${novaCarteira.id} (nome: "${novaCarteira.nome}")`);
  return novaCarteira;
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
