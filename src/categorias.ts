import { prisma } from './database';

export interface Categoria {
  id: number;
  telefone: string | null;
  nome: string;
  descricao?: string | null;
  cor?: string | null;
  padrao: boolean;
  tipo: 'entrada' | 'saida' | 'ambos';
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface NovaCategoria {
  nome: string;
  descricao?: string;
  cor?: string;
  tipo?: 'entrada' | 'saida' | 'ambos';
}

// Categorias padrão do sistema
const CATEGORIAS_PADRAO: Array<Omit<NovaCategoria, 'tipo'> & { tipo: 'entrada' | 'saida' | 'ambos' }> = [
  // Saídas
  { nome: 'Alimentação', descricao: 'Gastos com comida e restaurantes', tipo: 'saida', cor: '#FF6B6B' },
  { nome: 'Transporte', descricao: 'Combustível, passagens, táxi', tipo: 'saida', cor: '#4ECDC4' },
  { nome: 'Moradia', descricao: 'Aluguel, condomínio, água, luz', tipo: 'saida', cor: '#45B7D1' },
  { nome: 'Saúde', descricao: 'Médicos, remédios, plano de saúde', tipo: 'saida', cor: '#FFA07A' },
  { nome: 'Educação', descricao: 'Cursos, livros, mensalidades', tipo: 'saida', cor: '#98D8C8' },
  { nome: 'Lazer', descricao: 'Cinema, viagens, entretenimento', tipo: 'saida', cor: '#F7DC6F' },
  { nome: 'Compras', descricao: 'Roupas, eletrônicos, supermercado', tipo: 'saida', cor: '#BB8FCE' },
  { nome: 'Outros', descricao: 'Outras despesas', tipo: 'saida', cor: '#95A5A6' },
  
  // Entradas
  { nome: 'Salário', descricao: 'Rendimento do trabalho', tipo: 'entrada', cor: '#52BE80' },
  { nome: 'Freelance', descricao: 'Trabalhos autônomos', tipo: 'entrada', cor: '#5DADE2' },
  { nome: 'Investimentos', descricao: 'Dividendos, juros', tipo: 'entrada', cor: '#F4D03F' },
  { nome: 'Vendas', descricao: 'Venda de produtos ou serviços', tipo: 'entrada', cor: '#85C1E2' },
  { nome: 'Outros', descricao: 'Outras receitas', tipo: 'entrada', cor: '#A9DFBF' },
];

// Inicializar categorias padrão (executar uma vez)
export async function inicializarCategoriasPadrao(): Promise<void> {
  try {
    console.log('📋 Verificando categorias padrão...');
    
    const categoriasExistentes = await prisma.categoria.count({
      where: { padrao: 1 }
    });

    if (categoriasExistentes === 0) {
      console.log('   Criando categorias padrão...');
      
      for (const cat of CATEGORIAS_PADRAO) {
        await prisma.categoria.create({
          data: {
            telefone: null, // Categorias padrão não têm telefone
            nome: cat.nome,
            descricao: cat.descricao,
            cor: cat.cor,
            padrao: 1,
            tipo: cat.tipo,
          },
        });
      }
      
      console.log(`✅ ${CATEGORIAS_PADRAO.length} categorias padrão criadas!`);
    } else {
      console.log(`   ✅ Categorias padrão já existem (${categoriasExistentes})`);
    }
  } catch (error) {
    console.error('❌ Erro ao inicializar categorias padrão:', error);
    throw error;
  }
}

// Buscar categorias de um usuário (inclui padrões)
export async function buscarCategorias(telefone: string): Promise<Categoria[]> {
  try {
    const categorias = await prisma.categoria.findMany({
      where: {
        OR: [
          { telefone: telefone },
          { padrao: 1 },
        ],
      },
      orderBy: [
        { padrao: 'desc' as any }, // Padrões primeiro
        { nome: 'asc' },
      ],
    });

    return categorias.map((cat: any) => ({
      id: cat.id,
      telefone: cat.telefone || null,
      nome: cat.nome,
      descricao: cat.descricao || null,
      cor: cat.cor || null,
      padrao: Boolean(cat.padrao),
      tipo: cat.tipo as 'entrada' | 'saida' | 'ambos',
      criadoEm: cat.criadoEm,
      atualizadoEm: cat.atualizadoEm,
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar categorias:', error);
    throw error;
  }
}

// Criar nova categoria personalizada
export async function criarCategoria(telefone: string, dados: NovaCategoria): Promise<Categoria> {
  try {
    // Verifica se já existe categoria com mesmo nome para este usuário
    const existente = await prisma.categoria.findFirst({
      where: {
        telefone: telefone,
        nome: dados.nome,
      },
    });

    if (existente) {
      throw new Error('Já existe uma categoria com este nome');
    }

    const categoria = await prisma.categoria.create({
      data: {
        telefone: telefone,
        nome: dados.nome,
        descricao: dados.descricao || null,
        cor: dados.cor || null,
        padrao: 0,
        tipo: dados.tipo || 'saida',
      },
    });

    return {
      id: categoria.id,
      telefone: categoria.telefone || null,
      nome: categoria.nome,
      descricao: categoria.descricao || null,
      cor: categoria.cor || null,
      padrao: categoria.padrao === 1,
      tipo: categoria.tipo as 'entrada' | 'saida' | 'ambos',
      criadoEm: categoria.criadoEm,
      atualizadoEm: categoria.atualizadoEm,
    };
  } catch (error: any) {
    console.error('❌ Erro ao criar categoria:', error);
    throw error;
  }
}

// Atualizar categoria
export async function atualizarCategoria(
  id: number,
  telefone: string,
  dados: Partial<NovaCategoria>
): Promise<Categoria> {
  try {
    const categoria = await prisma.categoria.findUnique({
      where: { id },
    });

    if (!categoria) {
      throw new Error('Categoria não encontrada');
    }

    // Só pode atualizar categorias próprias (não padrão)
    if (Boolean(categoria.padrao) || categoria.telefone !== telefone) {
      throw new Error('Você não tem permissão para atualizar esta categoria');
    }

    // Se mudou o nome, verifica se não existe outra com mesmo nome
    if (dados.nome && dados.nome !== categoria.nome) {
      const existente = await prisma.categoria.findFirst({
        where: {
          telefone: telefone,
          nome: dados.nome,
          id: { not: id },
        },
      });

      if (existente) {
        throw new Error('Já existe uma categoria com este nome');
      }
    }

    const atualizada = await prisma.categoria.update({
      where: { id },
      data: {
        nome: dados.nome || categoria.nome,
        descricao: dados.descricao !== undefined ? dados.descricao : categoria.descricao,
        cor: dados.cor !== undefined ? dados.cor : categoria.cor,
        tipo: dados.tipo || categoria.tipo,
      },
    });

    return {
      id: atualizada.id,
      telefone: atualizada.telefone || null,
      nome: atualizada.nome,
      descricao: atualizada.descricao || null,
      cor: atualizada.cor || null,
      padrao: atualizada.padrao === 1,
      tipo: atualizada.tipo as 'entrada' | 'saida' | 'ambos',
      criadoEm: atualizada.criadoEm,
      atualizadoEm: atualizada.atualizadoEm,
    };
  } catch (error: any) {
    console.error('❌ Erro ao atualizar categoria:', error);
    throw error;
  }
}

// Remover categoria
export async function removerCategoria(id: number, telefone: string): Promise<void> {
  try {
    const categoria = await prisma.categoria.findUnique({
      where: { id },
    });

    if (!categoria) {
      throw new Error('Categoria não encontrada');
    }

    // Não pode remover categorias padrão
    if (Boolean(categoria.padrao)) {
      throw new Error('Não é possível remover categorias padrão');
    }

    // Só pode remover categorias próprias
    if (categoria.telefone !== telefone) {
      throw new Error('Você não tem permissão para remover esta categoria');
    }

    await prisma.categoria.delete({
      where: { id },
    });
  } catch (error: any) {
    console.error('❌ Erro ao remover categoria:', error);
    throw error;
  }
}

